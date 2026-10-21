// Role privacy and input hygiene: volunteers canvass without seeing money or
// supporter lists; malformed ids are 404s; shift messages use campaign time;
// re-activating an assignment respects capacity.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, Client } from './helpers.js';
import { getDb } from '../db/client.js';
import { shiftMessage } from '../lib/notify.js';

let desk, vol, donor;

before(async () => {
  await freshDb();
  desk = new Client();
  const r = await desk.signup({ workspaceName: 'Privacy WS', jurisdiction: 'bc-municipal' });
  const ws = r.json.workspace.id;

  // A volunteer: sign up elsewhere, then move their membership + session here.
  vol = new Client();
  const v = await vol.signup({ workspaceName: 'Temp' });
  const db = await getDb();
  await db.query('update memberships set workspace_id = $2, role = $3 where user_id = $1', [v.json.user.id, ws, 'volunteer']);
  await db.query('update sessions set workspace_id = $2 where user_id = $1', [v.json.user.id, ws]);

  donor = await desk.createPerson('Big Donor', { phone: '604-555-0142', email: 'donor@example.org' });
  await desk.action('gift.log', { person_id: donor.id, amount_cents: 120000, date: '2026-03-01' });
  await desk.action('petition.create', { slug: 'p1', title: 'P1' });
  await desk.action('subscription.add', { email: 'sub@example.org' });
});

test('volunteer sees the profile for canvassing but no gifts, totals, or donor tier', async () => {
  const me = await vol.get('/api/auth/me');
  assert.equal(me.json.role, 'volunteer');
  const p = await vol.get(`/api/persons/${donor.id}`);
  assert.equal(p.status, 200);
  assert.equal(p.json.person.phone, '604-555-0142', 'contact details stay — they are needed to call');
  assert.deepEqual(p.json.gifts, []);
  assert.deepEqual(p.json.totals, []);
  assert.equal(p.json.donor, null);
  const deskView = await desk.get(`/api/persons/${donor.id}`);
  assert.equal(deskView.json.gifts.length, 1, 'desk roles still see gifts');
  assert.equal(deskView.json.donor.tier, 'star');
});

test('volunteer brief carries field stats but no money, flags, or filings', async () => {
  const b = await vol.get('/api/brief');
  assert.equal(b.status, 200);
  assert.equal(b.json.money, null);
  assert.deepEqual(b.json.flagged, []);
  assert.deepEqual(b.json.filings, []);
  assert.ok(b.json.field, 'field stats still present');
  assert.deepEqual(Object.keys(b.json.field.mine).sort(), ['calls', 'doors', 'texts'], 'their own counts, numbers only');
  const d = await desk.get('/api/brief');
  assert.equal(d.json.money.totalCents, 120000);
  assert.equal(d.json.flagged.length, 0, 'under the cap: nothing flagged');
});

test('volunteer person list: their own note rides along — the row shape is otherwise unchanged', async () => {
  const db = await getDb();
  await db.query(
    `update persons set attrs = jsonb_set(coalesce(attrs, '{}'::jsonb), '{note}', to_jsonb('Call after 6'::text)) where id = $1`,
    [donor.id],
  );
  const row = (await vol.get('/api/persons?has=phone')).json.persons.find((p) => p.id === donor.id);
  assert.equal(row.note, 'Call after 6');
  assert.deepEqual(Object.keys(row).sort(), [
    'address', 'city', 'email', 'id', 'kind', 'lat', 'lng', 'name', 'note', 'phone', 'postal', 'rated_at', 'rating', 'socials', 'tags', 'unit',
  ], 'no gifts, totals, tiers or other attrs in the list');
});

test('volunteer brief never carries flagged gifts or their numbers', async () => {
  // Push the donor over the cap: the desk sees the numbers, the volunteer sees nothing.
  await desk.action('gift.log', { person_id: donor.id, amount_cents: 20000, date: '2026-04-01' });
  const d = (await desk.get('/api/brief')).json;
  assert.equal(d.flagged.length, 1);
  assert.equal(typeof d.flagged[0].total_cents, 'number');
  const v = (await vol.get('/api/brief')).json;
  assert.deepEqual(v.flagged, []);
  assert.equal(v.money, null);
  assert.ok(!JSON.stringify(v).includes('total_cents') && !JSON.stringify(v).includes('cap_cents'));
});

test('volunteer is refused the money ledger, exports, event log, audit, and supporter lists', async () => {
  const pet = (await desk.get('/api/petitions')).json.petitions[0];
  for (const path of [
    '/api/records/gift', '/api/records/filing', '/api/export', '/api/events?since=0',
    '/api/audit/verify', '/api/subscriptions', '/api/blasts', `/api/petitions/${pet.id}/signatures`,
  ]) {
    const r = await vol.get(path);
    assert.equal(r.status, 403, path);
  }
  for (const path of ['/api/records/gift', '/api/export', '/api/subscriptions']) {
    assert.equal((await desk.get(path)).status, 200, `desk ${path}`);
  }
});

test('volunteer field reads still work', async () => {
  for (const path of ['/api/map/doors', '/api/persons?has=phone', '/api/shifts', '/api/contacts', '/api/signs', '/api/petitions']) {
    assert.equal((await vol.get(path)).status, 200, path);
  }
});

test('malformed ids are 404, not 500', async () => {
  for (const path of ['/api/persons/not-a-uuid', '/api/shifts/123', '/api/petitions/zzz/signatures']) {
    const r = await desk.get(path);
    assert.equal(r.status, 404, path);
  }
});

test('shift messages render in campaign time regardless of server zone', () => {
  // July: Pacific time is UTC−7 under both the old rules and BC's year-round
  // time, so this stays true whichever tz database the host ships.
  const msg = shiftMessage({
    title: 'Saturday canvass', starts_at: '2026-07-11T17:00:00Z', ends_at: '2026-07-11T20:00:00Z',
    location: 'Newton Rec', instructions: 'Meet north entrance', link: 'https://imaginesurrey.ca/canvass',
  }, 'Imagine Surrey');
  assert.match(msg, /Saturday, July 11/);
  assert.match(msg, /10:00/, '17:00 UTC is 10:00 in Vancouver');
  assert.doesNotMatch(msg, /17:00|5:00/, 'not rendered in UTC');
  assert.match(msg, /1:00/, 'end time 20:00 UTC is 1:00 p.m.');
  assert.match(msg, /Where: Newton Rec/);
  assert.match(msg, /Details: https:\/\/imaginesurrey\.ca\/canvass/);
  assert.match(msg, /— Imagine Surrey$/);
});

test('re-activating a declined assignment cannot overfill a shift', async () => {
  const s = (await desk.action('shift.create', { title: 'Tiny', starts_at: '2026-11-08T10:00:00-08:00', capacity: 1 })).json.shift;
  const a = await desk.createPerson('First');
  const b = await desk.createPerson('Second');
  const asgA = (await desk.action('shift.assign', { shift_id: s.id, person_id: a.id })).json.assignment;
  assert.equal((await desk.action('shift.setStatus', { id: asgA.id, status: 'declined' })).status, 200);
  assert.equal((await desk.action('shift.assign', { shift_id: s.id, person_id: b.id })).status, 200);
  const back = await desk.action('shift.setStatus', { id: asgA.id, status: 'assigned' });
  assert.equal(back.status, 409);
  assert.match(back.json.error, /capacity/);
  assert.equal((await desk.action('shift.setStatus', { id: asgA.id, status: 'no_show' })).status, 200, 'inactive → inactive is fine');
});
