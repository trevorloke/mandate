// Live entity resolution — records written through the data routes resolve
// into the cross-module directory automatically (no manual rebuild).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb } from './helpers.js';
import { and, eq, isNull } from 'drizzle-orm';

const { db, schema } = await setupDb();
const dataApp = (await import('../routes/data.js')).default;

const SID = 'sess_lr';
await db.insert(schema.workspaces).values({ id: 'ws_lr', name: 'W', tz: 'PT', plan: 'enterprise' });
await db.insert(schema.users).values({ id: 'u_lr', email: 'lr@t.com', passwordHash: 'x', name: 'LR', role: 'editor', workspaceId: 'ws_lr' });
await db.insert(schema.sessions).values({ id: SID, userId: 'u_lr', expiresAt: new Date(Date.now() + 3600e3) });

const rq = (method, path, body) => dataApp.request(path, {
  method,
  headers: { Cookie: `mdt_session=${SID}`, 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const allEntities = () => db.select().from(schema.entities)
  .where(and(eq(schema.entities.workspaceId, 'ws_lr'), isNull(schema.entities.deletedAt)));
const allLinks = () => db.select().from(schema.entityLinks)
  .where(eq(schema.entityLinks.workspaceId, 'ws_lr'));

test('creating a donor resolves it into the directory', async () => {
  const r = await rq('POST', '/raise/donor', { name: 'Nadia Osei', email: 'nadia@x.ca', amount: 250 });
  assert.equal(r.status, 200);
  const ents = await allEntities();
  assert.equal(ents.length, 1);
  assert.equal(ents[0].name, 'Nadia Osei');
  assert.equal(ents[0].email, 'nadia@x.ca');
  const links = await allLinks();
  assert.equal(links.length, 1);
  assert.equal(links[0].module, 'raise');
  assert.equal(links[0].role, 'donor');
});

test('same email in another module links to the SAME entity (cross-module)', async () => {
  const r = await rq('POST', '/events/host', { name: 'N. Osei', email: 'nadia@x.ca', city: 'Vancouver' });
  assert.equal(r.status, 200);
  const ents = await allEntities();
  assert.equal(ents.length, 1, 'no duplicate entity — matched by email');
  const links = await allLinks();
  assert.equal(links.length, 2);
  assert.deepEqual(links.map((l) => l.module).sort(), ['events', 'raise']);
  assert.ok(links.every((l) => l.entityId === ents[0].id));
});

test('editing a record to a different identity MOVES its link', async () => {
  const create = await rq('POST', '/raise/donor', { name: 'Piotr Nowak', email: 'piotr@x.ca' });
  const rec = (await create.json()).record;
  const upd = await rq('PUT', `/raise/donor/${rec.id}`, { name: 'Sana Iqbal', email: 'sana@x.ca' });
  assert.equal(upd.status, 200);
  const ents = await allEntities();
  const sana = ents.find((e) => e.email === 'sana@x.ca');
  assert.ok(sana, 'new identity has an entity');
  const links = await allLinks();
  const link = links.find((l) => l.recordId === rec.id);
  assert.equal(link.entityId, sana.id, 'link moved to the new identity');
  const piotr = ents.find((e) => e.email === 'piotr@x.ca');
  assert.equal(links.filter((l) => l.entityId === piotr?.id).length, 0, 'old entity keeps no link to this record');
});

test('bulk append resolves every imported row', async () => {
  const r = await rq('PUT', '/ground/voter/_bulk', {
    records: [
      { first: 'Ada', last: 'Wong', email: 'ada@x.ca' },
      { first: 'Bo', last: 'Lindqvist' },
    ],
    mode: 'append',
  });
  assert.equal(r.status, 200);
  const ents = await allEntities();
  assert.ok(ents.find((e) => e.name === 'Ada Wong'));
  assert.ok(ents.find((e) => e.name === 'Bo Lindqvist'));
  const links = await allLinks();
  assert.equal(links.filter((l) => l.kind === 'voter').length, 2);
});

test('bulk replace drops the bucket links and relinks the new rows', async () => {
  const r = await rq('PUT', '/ground/voter/_bulk', [{ first: 'Cy', last: 'Okon', email: 'cy@x.ca' }]);
  assert.equal(r.status, 200);
  const links = await allLinks();
  const voterLinks = links.filter((l) => l.kind === 'voter');
  assert.equal(voterLinks.length, 1, 'old voter links gone, one new link');
  const ents = await allEntities();
  assert.equal((await db.select().from(schema.moduleData)
    .where(and(eq(schema.moduleData.workspaceId, 'ws_lr'), eq(schema.moduleData.kind, 'voter')))).length, 1);
  assert.ok(ents.find((e) => e.name === 'Cy Okon'));
});

test('non-entity kinds do not create directory entries', async () => {
  const before = (await allEntities()).length;
  const r = await rq('POST', '/ledger/journal', { memo: 'Office rent', debit: 2200, account: '6230 Office' });
  assert.equal(r.status, 200);
  assert.equal((await allEntities()).length, before);
});
