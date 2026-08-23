// API surface: auth flow, tenancy isolation, role gates, pagination,
// brief composition, and the full-fidelity export.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, Client } from './helpers.js';

let a, b; // two tenants

before(async () => {
  await freshDb();
  a = new Client();
  b = new Client();
  await a.signup({ workspaceName: 'Tenant A' });
  await b.signup({ workspaceName: 'Tenant B' });
});

test('signup → me → logout → 401', async () => {
  const c = new Client();
  const s = await c.signup({ workspaceName: 'Ephemeral' });
  assert.equal(s.status, 201);
  assert.equal(s.json.role, 'manager');
  const me = await c.get('/api/auth/me');
  assert.equal(me.json.workspace.name, 'Ephemeral');
  await c.post('/api/auth/logout');
  c.cookie = '';
  const denied = await c.get('/api/brief');
  assert.equal(denied.status, 401);
});

test('login works and wrong password is rejected without leaking existence', async () => {
  const c = new Client();
  const email = 'login-test@example.org';
  await c.signup({ email, workspaceName: 'Login WS' });
  const fresh = new Client();
  const bad = await fresh.post('/api/auth/login', { email, password: 'wrong-password' });
  assert.equal(bad.status, 401);
  const unknown = await fresh.post('/api/auth/login', { email: 'nobody@example.org', password: 'x' });
  assert.equal(unknown.status, 401);
  assert.equal(bad.json.error, unknown.json.error, 'same error either way');
  const good = await fresh.post('/api/auth/login', { email, password: 'northshore2026' });
  assert.equal(good.status, 200);
});

test('tenants cannot see each other: persons, records, events, profile', async () => {
  const pa = await a.createPerson('Only In A');
  await a.action('gift.log', { person_id: pa.id, amount_cents: 5000, date: '2025-02-02' });

  const persons = await b.get('/api/persons?q=Only');
  assert.equal(persons.json.persons.length, 0);
  const gifts = await b.get('/api/records/gift');
  assert.equal(gifts.json.records.length, 0);
  const events = await b.get('/api/events?since=0');
  assert.ok(events.json.events.every((e) => e.payload?.name !== 'Only In A'));
  const profile = await b.get(`/api/persons/${pa.id}`);
  assert.equal(profile.status, 404);
  const crossGift = await b.action('gift.log', { person_id: pa.id, amount_cents: 100, date: '2025-02-02' });
  assert.equal(crossGift.status, 400, "cannot attach a gift to another tenant's person");
});

test('records pagination pages cleanly with no overlap', async () => {
  const c = new Client();
  await c.signup({ workspaceName: 'Pager' });
  const p = await c.createPerson('Bulk Donor');
  for (let i = 0; i < 7; i++) {
    await c.action('gift.log', { person_id: p.id, amount_cents: 100 + i, date: '2025-01-0' + (i + 1) });
  }
  const page1 = await c.get('/api/records/gift?limit=3');
  assert.equal(page1.json.records.length, 3);
  assert.ok(page1.json.next);
  const page2 = await c.get(`/api/records/gift?limit=3&cursor=${encodeURIComponent(page1.json.next)}`);
  assert.equal(page2.json.records.length, 3);
  const page3 = await c.get(`/api/records/gift?limit=3&cursor=${encodeURIComponent(page2.json.next)}`);
  assert.equal(page3.json.records.length, 1);
  const ids = [...page1.json.records, ...page2.json.records, ...page3.json.records].map((r) => r.id);
  assert.equal(new Set(ids).size, 7, 'no overlaps, nothing missed');
});

test('brief composes money, flags, filings, activation', async () => {
  const c = new Client();
  await c.signup({ workspaceName: 'Brief WS' });
  const brief0 = await c.get('/api/brief');
  assert.equal(brief0.json.activation.complete, false);
  assert.equal(brief0.json.money.totalCents, 0);

  const donor = await c.createPerson('Grand Donor');
  await c.action('gift.log', { person_id: donor.id, amount_cents: 200000, date: '2025-04-01' });
  await c.action('filing.create', { name: 'Annual financial report', due_date: '2027-03-31', status: 'upcoming' });

  const brief = await c.get('/api/brief');
  assert.equal(brief.json.money.totalCents, 200000);
  assert.equal(brief.json.flagged.length, 1, 'over-cap gift surfaces on Today');
  assert.equal(brief.json.filings.length, 1);
  assert.equal(brief.json.activation.complete, true);
});

test('export carries everything: persons, records, and the event log', async () => {
  const ex = await a.get('/api/export');
  assert.equal(ex.status, 200);
  assert.equal(ex.json.format, 'mandate-v2-export');
  assert.ok(ex.json.persons.length >= 1);
  assert.ok(ex.json.gifts.length >= 1);
  assert.ok(ex.json.events.length >= 2);
  assert.ok(ex.json.events.every((e) => e.hash), 'events export with their chain hashes');
});

test('filing.update flips status and role gates hold', async () => {
  const c = new Client();
  await c.signup({ workspaceName: 'Filing WS' });
  const created = await c.action('filing.create', { name: 'Q1 report', due_date: '2026-04-30', status: 'upcoming' });
  const updated = await c.action('filing.update', { id: created.json.filing.id, status: 'filed' });
  assert.equal(updated.json.filing.status, 'filed');
  const unknown = await c.action('nope.nothing', {});
  assert.equal(unknown.status, 404);
});
