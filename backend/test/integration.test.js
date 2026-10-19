// Integration tests against a real MongoDB.
// Run locally:  docker run -d -p 27017:27017 mongo:7
//               MONGODB_URI_TEST=mongodb://localhost:27017/lead_mgmt_test npm test
// In CI a MongoDB service container provides MONGODB_URI_TEST.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { MONGO, startServer, api, connect, disconnect } = require('./helpers');

const User = require('../models/User');
const Lead = require('../models/Lead');
const Student = require('../models/Student');

describe('lead management API (MongoDB)', { skip: !MONGO && 'MONGODB_URI_TEST not set' }, () => {
  let server;
  let call;
  const tokens = {};
  const ids = {};

  const login = async (email) => {
    const res = await call('POST', '/api/auth/login', { body: { email, password: 'password123' } });
    assert.equal(res.status, 200, `login ${email}: ${res.text}`);
    return res.body.token;
  };

  const signupAndActivate = async (name, email, role) => {
    const res = await call('POST', '/api/auth/register', { body: { name, email, password: 'password123', role } });
    assert.equal(res.status, 202, res.text);
    const act = await call('PATCH', `/api/users/${res.body.user.id}/active`, { token: tokens.admin, body: { isActive: true } });
    assert.equal(act.status, 200, act.text);
    ids[name] = res.body.user.id;
    tokens[name] = await login(email);
  };

  const createLead = (token, body = {}) =>
    call('POST', '/api/leads', { token, body: { name: 'Lead', phone: '9999999999', source: 'manual', ...body } });

  before(async () => {
    await connect();
    server = await startServer();
    call = api(server.base);

    // First account bootstraps as admin, even if it asks for another role.
    const first = await call('POST', '/api/auth/register', {
      body: { name: 'admin', email: 'admin@test.io', password: 'password123', role: 'telecaller' },
    });
    assert.equal(first.status, 201, first.text);
    assert.equal(first.body.user.role, 'admin');
    tokens.admin = first.body.token;
    ids.admin = first.body.user.id;

    await signupAndActivate('tc1', 'tc1@test.io', 'telecaller');
    await signupAndActivate('tc2', 'tc2@test.io', 'telecaller');
    await signupAndActivate('c1', 'c1@test.io', 'counsellor');
  });

  after(async () => {
    await server?.close();
    await disconnect();
  });

  describe('registration', () => {
    test('nobody can self-register as admin after bootstrap', async () => {
      const res = await call('POST', '/api/auth/register', {
        body: { name: 'evil', email: 'evil@test.io', password: 'password123', role: 'admin' },
      });
      assert.equal(res.status, 202);
      assert.equal(res.body.user.role, 'telecaller');
      assert.equal(res.body.user.isActive, false);
    });

    test('inactive accounts cannot log in', async () => {
      const res = await call('POST', '/api/auth/login', { body: { email: 'evil@test.io', password: 'password123' } });
      assert.equal(res.status, 403);
    });

    test('short passwords are rejected', async () => {
      const res = await call('POST', '/api/auth/register', { body: { name: 'x', email: 'x@test.io', password: 'short' } });
      assert.equal(res.status, 400);
    });
  });

  describe('lead creation', () => {
    test('server-owned fields cannot be mass-assigned', async () => {
      const res = await createLead(tokens.admin, { status: 'converted', isLocked: true, version: 42, assignedTo: ids.admin });
      assert.equal(res.status, 201, res.text);
      assert.equal(res.body.status, 'new');
      assert.equal(res.body.isLocked, false);
      assert.equal(res.body.version, 0);
      assert.notEqual(String(res.body.assignedTo), ids.admin);
    });

    test('api-source requires the API key', async () => {
      const body = { name: 'From API', phone: '1' };
      assert.equal((await call('POST', '/api/leads/api-source', { body })).status, 401);
      const ok = await call('POST', '/api/leads/api-source', { body, headers: { 'X-API-Key': process.env.LEAD_API_KEY } });
      assert.equal(ok.status, 201, ok.text);
      assert.equal(ok.body.source, 'api');
    });

    test('concurrent creation spreads leads evenly (atomic least-loaded assignment)', async () => {
      await User.updateMany({ role: 'telecaller' }, { currentLeadCount: 0 });
      const results = await Promise.all(Array.from({ length: 20 }, (_, i) => createLead(tokens.admin, { name: `L${i}` })));
      assert.ok(results.every((r) => r.status === 201));
      const counts = {};
      for (const r of results) counts[r.body.assignedTo] = (counts[r.body.assignedTo] || 0) + 1;
      assert.deepEqual(Object.values(counts).sort(), [10, 10], `uneven split: ${JSON.stringify(counts)}`);
    });
  });

  describe('object-level authorization (IDOR)', () => {
    let leadOfTc1;

    before(async () => {
      const lead = await Lead.create({ name: 'Owned', phone: '1', source: 'manual', assignedTo: ids.tc1 });
      leadOfTc1 = String(lead._id);
    });

    test('assignee can read their lead', async () => {
      assert.equal((await call('GET', `/api/leads/${leadOfTc1}`, { token: tokens.tc1 })).status, 200);
    });

    test("another telecaller gets 404 on read, notes, activity and payments", async () => {
      const t = tokens.tc2;
      assert.equal((await call('GET', `/api/leads/${leadOfTc1}`, { token: t })).status, 404);
      assert.equal((await call('POST', `/api/leads/${leadOfTc1}/notes`, { token: t, body: { text: 'hi' } })).status, 404);
      assert.equal((await call('GET', `/api/leads/${leadOfTc1}/activity`, { token: t })).status, 404);
      assert.equal((await call('GET', `/api/payments/lead/${leadOfTc1}`, { token: t })).status, 404);
      assert.equal((await call('POST', '/api/follow-ups', { token: t, body: { leadId: leadOfTc1, scheduledDate: new Date() } })).status, 404);
    });

    test('list endpoint only returns own leads for non-admins', async () => {
      const res = await call('GET', '/api/leads?limit=100', { token: tokens.tc2 });
      assert.equal(res.status, 200);
      assert.ok(res.body.leads.every((l) => String(l.assignedTo._id) === ids.tc2));
    });

    test('invalid ids return 400, not 500', async () => {
      assert.equal((await call('GET', '/api/leads/not-an-id', { token: tokens.admin })).status, 400);
    });

    test('deactivated users lose access immediately', async () => {
      await User.updateOne({ _id: ids.tc2 }, { isActive: false });
      assert.equal((await call('GET', '/api/leads', { token: tokens.tc2 })).status, 403);
      await User.updateOne({ _id: ids.tc2 }, { isActive: true });
    });
  });

  describe('optimistic concurrency', () => {
    test('stale version gets 409', async () => {
      const lead = await Lead.create({ name: 'V', phone: '1', source: 'manual', assignedTo: ids.tc1 });
      const ok = await call('PATCH', `/api/leads/${lead._id}/status`, { token: tokens.tc1, body: { status: 'contacted', version: 0 } });
      assert.equal(ok.status, 200, ok.text);
      assert.equal(ok.body.version, 1);
      const stale = await call('PATCH', `/api/leads/${lead._id}/status`, { token: tokens.tc1, body: { status: 'interested', version: 0 } });
      assert.equal(stale.status, 409);
    });

    test('of N concurrent updates with the same version, exactly one wins', async () => {
      const lead = await Lead.create({ name: 'Race', phone: '1', source: 'manual', assignedTo: ids.tc1 });
      const attempts = await Promise.all(Array.from({ length: 10 }, () =>
        call('PATCH', `/api/leads/${lead._id}/status`, { token: tokens.tc1, body: { status: 'contacted', version: 0 } })));
      const statuses = attempts.map((a) => a.status).sort();
      assert.equal(statuses.filter((s) => s === 200).length, 1, `got ${statuses}`);
      assert.ok(statuses.filter((s) => s !== 200).every((s) => s === 409 || s === 400));
      const fresh = await Lead.findById(lead._id);
      assert.equal(fresh.version, 1);
    });

    test('invalid transitions are rejected', async () => {
      const lead = await Lead.create({ name: 'T', phone: '1', source: 'manual', assignedTo: ids.tc1 });
      const res = await call('PATCH', `/api/leads/${lead._id}/status`, { token: tokens.tc1, body: { status: 'qualified', version: 0 } });
      assert.equal(res.status, 400);
    });

    test('status route cannot bypass conversion', async () => {
      const lead = await Lead.create({ name: 'B', phone: '1', source: 'manual', assignedTo: ids.c1, status: 'counsellor_assigned' });
      const res = await call('PATCH', `/api/leads/${lead._id}/status`, { token: tokens.c1, body: { status: 'converted', version: 0 } });
      assert.equal(res.status, 400);
    });
  });

  describe('payments and conversion', () => {
    test('proof files are only reachable through the authenticated endpoint', async () => {
      const lead = await Lead.create({ name: 'P', phone: '1', source: 'manual', assignedTo: ids.c1, status: 'counsellor_assigned' });
      const form = new FormData();
      form.append('leadId', String(lead._id));
      form.append('amount', '500');
      form.append('proof', new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' }), 'proof.pdf');
      const created = await call('POST', '/api/payments', { token: tokens.c1, body: form });
      assert.equal(created.status, 201, created.text);
      assert.equal(created.body.proofUrl, `/api/payments/${created.body._id}/proof`);

      assert.equal((await call('GET', created.body.proofUrl)).status, 401);
      assert.equal((await call('GET', created.body.proofUrl, { token: tokens.tc2 })).status, 404);
      const own = await call('GET', created.body.proofUrl, { token: tokens.c1 });
      assert.equal(own.status, 200);
      assert.equal(own.headers.get('content-type'), 'application/pdf');
    });

    test('disallowed file types are rejected', async () => {
      const lead = await Lead.create({ name: 'F', phone: '1', source: 'manual', assignedTo: ids.c1 });
      const form = new FormData();
      form.append('leadId', String(lead._id));
      form.append('amount', '1');
      form.append('proof', new Blob(['<script>'], { type: 'text/html' }), 'x.html');
      assert.equal((await call('POST', '/api/payments', { token: tokens.c1, body: form })).status, 400);
    });

    test('conversion requires a verified payment and happens exactly once under concurrency', async () => {
      const lead = await Lead.create({ name: 'C', phone: '1', source: 'manual', assignedTo: ids.c1, status: 'counsellor_assigned' });
      const form = new FormData();
      form.append('leadId', String(lead._id));
      form.append('amount', '1000');
      const pay = await call('POST', '/api/payments', { token: tokens.c1, body: form });
      assert.equal(pay.status, 201, pay.text);

      const early = await call('POST', `/api/leads/${lead._id}/convert`, { token: tokens.c1, body: { paymentId: pay.body._id } });
      assert.equal(early.status, 400, 'unverified payment must not convert');

      const verify = await call('PATCH', `/api/payments/${pay.body._id}/verify`, { token: tokens.c1, body: { status: 'verified' } });
      assert.equal(verify.status, 200, verify.text);
      const again = await call('PATCH', `/api/payments/${pay.body._id}/verify`, { token: tokens.c1, body: { status: 'rejected', rejectionReason: 'x' } });
      assert.equal(again.status, 409, 'a decided payment cannot be decided again');

      const results = await Promise.all(Array.from({ length: 5 }, () =>
        call('POST', `/api/leads/${lead._id}/convert`, { token: tokens.c1, body: { paymentId: pay.body._id } })));
      assert.equal(results.filter((r) => r.status === 201).length, 1, results.map((r) => r.status).join(','));
      assert.equal(await Student.countDocuments({ leadId: lead._id }), 1);

      const locked = await call('POST', `/api/leads/${lead._id}/notes`, { token: tokens.c1, body: { text: 'late' } });
      assert.equal(locked.status, 423);
    });
  });

  describe('escalation', () => {
    test('telecallers can list counsellors and escalate their own lead', async () => {
      const list = await call('GET', '/api/users/counsellors', { token: tokens.tc1 });
      assert.equal(list.status, 200);
      assert.ok(list.body.some((u) => u._id === ids.c1));

      const lead = await Lead.create({ name: 'E', phone: '1', source: 'manual', assignedTo: ids.tc1 });
      const res = await call('PATCH', `/api/leads/${lead._id}/escalate`, {
        token: tokens.tc1, body: { counsellorId: ids.c1, reason: 'needs counselling' },
      });
      assert.equal(res.status, 200, res.text);
      assert.equal(res.body.status, 'escalated');
      assert.equal(String(res.body.assignedTo), ids.c1);
    });

    test('cannot escalate to a non-counsellor', async () => {
      const lead = await Lead.create({ name: 'E2', phone: '1', source: 'manual', assignedTo: ids.tc1 });
      const res = await call('PATCH', `/api/leads/${lead._id}/escalate`, { token: tokens.tc1, body: { counsellorId: ids.tc2, reason: 'x' } });
      assert.equal(res.status, 400);
    });
  });
});
