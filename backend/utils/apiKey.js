const crypto = require('crypto');

/** Constant-time comparison so the key can't be recovered via timing. */
const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

const requireApiKey = (req, res, next) => {
  const expected = process.env.LEAD_API_KEY;
  if (!expected) return res.status(503).json({ error: 'API source is not configured' });
  const provided = req.header('X-API-Key');
  if (!provided || !safeEqual(provided, expected)) return res.status(401).json({ error: 'Invalid API key' });
  return next();
};

module.exports = { requireApiKey, safeEqual };
