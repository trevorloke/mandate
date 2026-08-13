// Contribution-cap guardrail: raise.gift writes total the donor's cycle giving
// and flag the gift that pushes the donor over the workspace cap (default
// $1400, overridable via workspace settings.contributionCap). Admins get an
// in-app notification; POST responses carry compliance + directory feedback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb } from './helpers.js';
import { and, eq } from 'drizzle-orm';

const { db, schema } = await setupDb();
const dataApp = (await import('../routes/data.js')).default;

const SID = 'sess_cap_ed';    // editor in ws_cap (default cap)
const SID5 = 'sess_cap5_ed';  // editor in ws_cap5 (cap raised to 5000)
await db.insert(schema.workspaces).values([
  { id: 'ws_cap', name: 'W', tz: 'PT', plan: 'enterprise' },
  { id: 'ws_cap5', name: 'W5', tz: 'PT', plan: 'enterprise', settings: JSON.stringify({ contributionCap: 5000 }) },
]);
await db.insert(schema.users).values([
  { id: 'u_ce', email: 'ce@t.com', passwordHash: 'x', name: 'Ed', role: 'editor', workspaceId: 'ws_cap' },
  { id: 'u_ca', email: 'ca@t.com', passwordHash: 'x', name: 'Adm', role: 'admin', workspaceId: 'ws_cap' },
  { id: 'u_c5', email: 'c5@t.com', passwordHash: 'x', name: 'Ed5', role: 'editor', workspaceId: 'ws_cap5' },
]);
await db.insert(schema.sessions).values([
  { id: SID, userId: 'u_ce', expiresAt: new Date(Date.now() + 3600e3) },
  { id: SID5, userId: 'u_c5', expiresAt: new Date(Date.now() + 3600e3) },
]);

const rq = (method, path, body, sid = SID) => dataApp.request(path, {
  method,
  headers: { Cookie: `mdt_session=${sid}`, 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const giftRows = async (workspaceId) => {
  const rows = await db.select().from(schema.moduleData).where(and(
    eq(schema.moduleData.workspaceId, workspaceId),
    eq(schema.moduleData.module, 'raise'),
    eq(schema.moduleData.kind, 'gift'),
  ));
  return rows.map((r) => ({ id: r.id, data: JSON.parse(r.data) }));
};

test('second gift crossing the default $1400 cap is flagged; first stays clean', async () => {
  const r1 = await rq('POST', '/raise/gift', { donor: 'Dana Larch', amt: 800 });
  assert.equal(r1.status, 200);
  const j1 = await r1.json();
  assert.ok(!('compliance' in j1), 'under-cap gift carries no compliance key');

  const r2 = await rq('POST', '/raise/gift', { donor: 'Dana Larch', amt: 800 });
  assert.equal(r2.status, 200);
  const j2 = await r2.json();
  assert.equal(j2.compliance?.flagged, true);
  assert.equal(j2.compliance.reason, 'Contribution total $1600 exceeds the $1400 individual cap');
  assert.equal(j2.record.data.status, 'flagged', 'response record reflects the in-place flag');

  const rows = await giftRows('ws_cap');
  const d1 = rows.find((r) => r.id === j1.record.id).data;
  const d2 = rows.find((r) => r.id === j2.record.id).data;
  assert.notEqual(d1.status, 'flagged');
  assert.ok(!d1.flagged, 'first gift unflagged');
  assert.equal(d2.status, 'flagged');
  assert.equal(d2.flagged, true);
  assert.equal(d2.flagReason, 'Contribution total $1600 exceeds the $1400 individual cap');
});

test('admin user received an in-app notification about the flag', async () => {
  const notes = await db.select().from(schema.notifications)
    .where(eq(schema.notifications.userId, 'u_ca'));
  const capNotes = notes.filter((n) => n.kind === 'compliance.cap');
  assert.equal(capNotes.length, 1);
  assert.equal(capNotes[0].title, 'Contribution over cap flagged');
  assert.match(capNotes[0].body, /Dana Larch: Contribution total \$1600 exceeds the \$1400 individual cap/);
});

test('workspace contributionCap setting overrides the default', async () => {
  const r1 = await rq('POST', '/raise/gift', { donor: 'Grand Donor', amt: 2000 }, SID5);
  assert.ok(!('compliance' in await r1.json()));
  const r2 = await rq('POST', '/raise/gift', { donor: 'Grand Donor', amt: 2000 }, SID5);
  assert.ok(!('compliance' in await r2.json()), '$4000 sits under the $5000 cap');

  const r3 = await rq('POST', '/raise/gift', { donor: 'Grand Donor', amt: 1500 }, SID5);
  const j3 = await r3.json();
  assert.equal(j3.compliance?.flagged, true);
  assert.equal(j3.compliance.reason, 'Contribution total $5500 exceeds the $5000 individual cap');
});

test('bulk append flags exactly the gift that crosses the cap', async () => {
  const r = await rq('PUT', '/raise/gift/_bulk', {
    records: [
      { donor: 'Bulk Benefactor', amt: 900 },
      { donor: 'Bulk Benefactor', amt: 900 },
      { donor: 'Small Fry', amt: 50 },
    ],
    mode: 'append',
  });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.count, 3);
  assert.equal(j.flaggedCount, 1);

  const rows = await giftRows('ws_cap');
  const bulk = rows.map((x) => x.data).filter((d) => (d.donor || '').toLowerCase() === 'bulk benefactor');
  assert.equal(bulk.length, 2);
  assert.equal(bulk.filter((d) => d.flagged === true && d.status === 'flagged').length, 1, 'only the crossing gift is flagged');
  const fry = rows.map((x) => x.data).find((d) => d.donor === 'Small Fry');
  assert.ok(!fry.flagged, 'under-cap donor untouched');
});

test('non-gift kinds are unaffected by the cap check', async () => {
  const r = await rq('POST', '/raise/donor', { name: 'Money Bags', amount: 999999 });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(!('compliance' in j));
});

test('POST response reports directory resolution: new profile, then existing match', async () => {
  const r1 = await rq('POST', '/raise/gift', { name: 'Erin Yao', email: 'erin@x.ca', amt: 100 });
  const j1 = await r1.json();
  assert.ok(j1.directory, 'entity kind resolves into the directory');
  assert.equal(j1.directory.entityName, 'Erin Yao');
  assert.equal(j1.directory.matchedExisting, false, 'first touchpoint creates the profile');

  const r2 = await rq('POST', '/raise/gift', { name: 'Erin Yao', email: 'erin@x.ca', amt: 120 });
  const j2 = await r2.json();
  assert.equal(j2.directory.matchedExisting, true, 'same email matches the existing profile');
  assert.equal(j2.directory.entityId, j1.directory.entityId);
  assert.equal(j2.directory.entityName, 'Erin Yao');
});
