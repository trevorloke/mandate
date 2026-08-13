// Universal search: GET /api/search — entities + module records in one query.
// Guards the workspace boundary and the LIKE-wildcard escaping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb } from './helpers.js';

const { db, schema } = await setupDb();
const searchApp = (await import('../routes/search.js')).default;

const SID = 'sess_search';
await db.insert(schema.workspaces).values([
  { id: 'ws_a', name: 'Workspace A', tz: 'PT', plan: 'enterprise' },
  { id: 'ws_b', name: 'Workspace B', tz: 'PT', plan: 'enterprise' },
]);
await db.insert(schema.users).values([
  { id: 'u_a', email: 'a@t.com', passwordHash: 'x', name: 'Ana', role: 'viewer', workspaceId: 'ws_a' },
]);
await db.insert(schema.sessions).values([
  { id: SID, userId: 'u_a', expiresAt: new Date(Date.now() + 3600e3) },
]);

// Directory entities: one 'nadia' in each workspace — only A's may surface.
await db.insert(schema.entities).values([
  { id: 'ent_nadia', workspaceId: 'ws_a', type: 'person', name: 'Nadia Rahim', email: 'nadia@example.org' },
  { id: 'ent_leak', workspaceId: 'ws_b', type: 'person', name: 'Nadia Boulanger' },
]);

await db.insert(schema.moduleData).values([
  { id: 'd_nadia', workspaceId: 'ws_a', module: 'ground', kind: 'voter', data: JSON.stringify({ first: 'Nadia', last: 'Rahim', email: 'nadia@example.org' }) },
  { id: 'd_other', workspaceId: 'ws_a', module: 'raise', kind: 'donor', data: JSON.stringify({ name: 'Sam Ortiz' }) },
  { id: 'd_pct',   workspaceId: 'ws_a', module: 'ledger', kind: 'je', data: JSON.stringify({ memo: 'Deposit 50% of print run' }) },
  { id: 'd_leak',  workspaceId: 'ws_b', module: 'ground', kind: 'voter', data: JSON.stringify({ name: 'Nadia Boulanger' }) },
  // Bucket-cap fodder: five matching donors, only three may be returned.
  ...Array.from({ length: 5 }, (_, i) => ({
    id: 'd_z' + i, workspaceId: 'ws_a', module: 'raise', kind: 'donor',
    data: JSON.stringify({ name: 'Zebra Fund ' + i }),
  })),
]);

const search = (q, sid = SID) => searchApp.request('/?q=' + encodeURIComponent(q), {
  headers: sid ? { Cookie: `mdt_session=${sid}` } : {},
});

test('finds the matching entity and record, never workspace B\'s', async () => {
  const r = await search('nadia');
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.deepEqual(body.entities.map((e) => e.id), ['ent_nadia']);
  assert.equal(body.entities[0].name, 'Nadia Rahim');
  const rec = body.records.find((x) => x.id === 'd_nadia');
  assert.ok(rec, 'record matching "nadia" is returned');
  assert.equal(rec.label, 'Nadia Rahim');           // derived from first + last
  assert.equal(rec.sub, 'ground · voter');
  assert.ok(!body.records.some((x) => x.id === 'd_leak'), 'workspace B record must not leak');
  assert.ok(!body.entities.some((e) => e.id === 'ent_leak'), 'workspace B entity must not leak');
});

test('workspace B content is invisible even when it is the only match', async () => {
  const body = await (await search('boulanger')).json();
  assert.deepEqual(body, { entities: [], records: [] });
});

test('query shorter than 2 chars (after trim) returns empty', async () => {
  const body = await (await search('  n ')).json();
  assert.deepEqual(body, { entities: [], records: [] });
});

test('unauthenticated request is rejected with 401', async () => {
  const r = await search('nadia', null);
  assert.equal(r.status, 401);
});

test('LIKE wildcards in q are treated literally', async () => {
  // '%%' would match EVERY row if unescaped; nothing contains a literal '%%'.
  const wild = await (await search('%%')).json();
  assert.deepEqual(wild, { entities: [], records: [] });
  // …while a literal '%' in the data IS findable — proves the escape syntax works.
  const pct = await (await search('50%')).json();
  assert.deepEqual(pct.records.map((x) => x.id), ['d_pct']);
  assert.equal(pct.records[0].label, 'Deposit 50% of print run');
});

test('at most 3 records per (module, kind) bucket', async () => {
  const body = await (await search('zebra')).json();
  const donors = body.records.filter((x) => x.sub === 'raise · donor');
  assert.equal(donors.length, 3);
});
