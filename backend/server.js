require('dotenv').config();
const connectDB = require('./config/db');
const { createApp } = require('./app');

const PORT = process.env.PORT || 5000;

const start = async () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
  await connectDB();
  const server = createApp().listen(PORT, () =>
    console.log(JSON.stringify({ msg: 'server started', port: Number(PORT) })));

  const shutdown = (signal) => {
    console.log(JSON.stringify({ msg: 'shutting down', signal }));
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
