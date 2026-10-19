require('express-async-errors');
const express = require('express');
const cors = require('cors');

const parseOrigins = (value) =>
  (value || 'http://localhost:5173,https://lead-mgmt-system.vercel.app')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

const createApp = () => {
  const app = express();

  // Single, explicit CORS policy (previously cors() allowed every origin).
  app.use(cors({ origin: parseOrigins(process.env.CORS_ORIGINS) }));
  app.use(express.json({ limit: '100kb' }));

  // NOTE: /uploads is intentionally NOT served statically. Payment proofs are
  // only reachable through GET /api/payments/:id/proof, which checks auth.

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/leads', require('./routes/leads'));
  app.use('/api/follow-ups', require('./routes/followUps'));
  app.use('/api/payments', require('./routes/payments'));
  app.use('/api/dashboard', require('./routes/dashboard'));

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid id' });
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
    console.error(err);
    // Don't leak internal error details to clients.
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
};

module.exports = { createApp, parseOrigins };
