const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { pick } = require('../utils/pick');
const { canAccessLead } = require('../middleware/leadAccess');
const { safeEqual, requireApiKey } = require('../utils/apiKey');
const { parseOrigins } = require('../app');
const { startServer, api } = require('./helpers');

describe('pick', () => {
  test('keeps only allow-listed keys', () => {
    assert.deepEqual(pick({ name: 'a', status: 'converted', version: 9 }, ['name']), { name: 'a' });
  });
  test('ignores undefined values and missing input', () => {
    assert.deepEqual(pick({ a: undefined }, ['a']), {});
    assert.deepEqual(pick(undefined, ['a']), {});
  });
});

describe('canAccessLead', () => {
  const me = { _id: 'u1', role: 'telecaller' };
  test('admin can access any lead', () => {
    assert.equal(canAccessLead({ _id: 'x', role: 'admin' }, { assignedTo: 'other' }), true);
  });
  test('assignee can access', () => {
    assert.equal(canAccessLead(me, { assignedTo: 'u1' }), true);
    assert.equal(canAccessLead(me, { assignedTo: { _id: 'u1', name: 'populated' } }), true);
  });
  test('escalation target can access', () => {
    assert.equal(canAccessLead(me, { assignedTo: 'u2', escalation: { escalatedTo: 'u1' } }), true);
  });
  test('anyone else cannot', () => {
    assert.equal(canAccessLead(me, { assignedTo: 'u2' }), false);
    assert.equal(canAccessLead(me, { assignedTo: null }), false);
    assert.equal(canAccessLead(null, { assignedTo: 'u1' }), false);
  });
});

describe('API key', () => {
  test('safeEqual compares values, not lengths', () => {
    assert.equal(safeEqual('abc', 'abc'), true);
    assert.equal(safeEqual('abc', 'abd'), false);
    assert.equal(safeEqual('abc', 'abcd'), false);
  });

  const run = (header, envKey) => {
    const prev = process.env.LEAD_API_KEY;
    process.env.LEAD_API_KEY = envKey;
    let status = 200;
    const res = { status: (s) => { status = s; return { json: () => {} }; } };
    let called = false;
    requireApiKey({ header: () => header }, res, () => { called = true; });
    process.env.LEAD_API_KEY = prev;
    return { status, called };
  };
  test('accepts the right key', () => assert.deepEqual(run('k1', 'k1'), { status: 200, called: true }));
  test('rejects a wrong or missing key', () => {
    assert.equal(run('nope', 'k1').status, 401);
    assert.equal(run(undefined, 'k1').status, 401);
  });
  test('refuses when no key is configured', () => assert.equal(run('k1', '').status, 503));
});

describe('parseOrigins', () => {
  test('splits and trims', () => {
    assert.deepEqual(parseOrigins(' https://a.com , https://b.com,'), ['https://a.com', 'https://b.com']);
  });
});

describe('HTTP without a database', () => {
  test('health, 404, auth required, uploads not public', async () => {
    const { base, close } = await startServer();
    const call = api(base);
    try {
      assert.equal((await call('GET', '/health')).status, 200);
      assert.equal((await call('GET', '/nope')).status, 404);
      assert.equal((await call('GET', '/api/leads')).status, 401);
      assert.equal((await call('GET', '/api/leads', { token: 'garbage' })).status, 401);
      assert.equal((await call('GET', '/uploads/anything.png')).status, 404);
      const lead = await call('POST', '/api/leads/api-source', { body: {}, headers: { 'X-API-Key': 'wrong' } });
      assert.equal(lead.status, 401);
    } finally {
      await close();
    }
  });
});
