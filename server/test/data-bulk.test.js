// Bulk data writes: PUT /:module/:kind/_bulk — replace (default) vs append
// mode (used by CSV import so a file lands in one request, not one per row).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb } from './helpers.js';

const { db, schema } = await setupDb();
const dataApp = (await import('../routes/data.js')).default;

const SID = 'sess_editor';
const VID = 'sess_viewer';
await db.insert(schema.workspaces).values({ id: 'ws_b', name: 'W', tz: 'PT', plan: 'enterprise' });
await db.insert(schema.users).values([
  { id: 'u_ed', email: 'ed@t.com', passwordHash: 'x', name: 'Ed', role: 'editor', workspaceId: 'ws_b' },
  { id: 'u_vw', email: 'vw@t.com', passwordHash: 'x', name: 'Vw', role: 'viewer', workspaceId: 'ws_b' },
]);
await db.insert(schema.sessions).values([
  { id: SID, userId: 'u_ed', expiresAt: new Date(Date.now() + 3600e3) },
  { id: VID, userId: 'u_vw', expiresAt: new Date(Date.now() + 3600e3) },
]);

const rq = (method, path, body, sid = SID) => dataApp.request(path, {
  method,
  headers: { Cookie: `mdt_session=${sid}`, 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const listNames = async () => {
  const r = await rq('GET', '/raise/donor');
  const { records } = await r.json();
  return records.map((x) => x.data.name).sort();
};

test('bulk replace swaps out the whole bucket', async () => {
  await rq('POST', '/raise/donor', { name: 'Old A' });
  await rq('POST', '/raise/donor', { name: 'Old B' });
  const r = await rq('PUT', '/raise/donor/_bulk', [{ name: 'New 1' }, { name: 'New 2' }, { name: 'New 3' }]);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).count, 3);
  assert.deepEqual(await listNames(), ['New 1', 'New 2', 'New 3']);
});

test('bulk append adds on top without deleting', async () => {
  const r = await rq('PUT', '/raise/donor/_bulk', { records: [{ name: 'Added 4' }, { name: 'Added 5' }], mode: 'append' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).count, 2);
  assert.deepEqual(await listNames(), ['Added 4', 'Added 5', 'New 1', 'New 2', 'New 3']);
});

test('object body without append mode still replaces', async () => {
  const r = await rq('PUT', '/raise/donor/_bulk', { records: [{ name: 'Only' }] });
  assert.equal(r.status, 200);
  assert.deepEqual(await listNames(), ['Only']);
});

test('viewer cannot bulk write (403)', async () => {
  const r = await rq('PUT', '/raise/donor/_bulk', { records: [{ name: 'Nope' }], mode: 'append' }, VID);
  assert.equal(r.status, 403);
  assert.deepEqual(await listNames(), ['Only']);
});
