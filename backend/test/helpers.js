const mongoose = require('mongoose');
const { createApp } = require('../app');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.LEAD_API_KEY = process.env.LEAD_API_KEY || 'test-api-key';
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || require('path').join(require('os').tmpdir(), 'lead-mgmt-test-uploads');

const MONGO = process.env.MONGODB_URI_TEST;

/** Start the app on an ephemeral port; returns { base, close }. */
const startServer = async () => {
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((r) => server.close(r)),
  };
};

const api = (base) => async (method, path, { body, token, headers = {} } = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
  return { status: res.status, body: json, headers: res.headers, text };
};

const connect = async () => {
  await mongoose.connect(MONGO);
  await mongoose.connection.db.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
};

const disconnect = async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
};

module.exports = { MONGO, startServer, api, connect, disconnect };
