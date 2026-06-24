// Cross-module entity database — one record surfaces across every module, a
// single 360° profile, and edit-once propagation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb } from './helpers.js';

const { db, schema } = await setupDb();
const entitiesApp = (await import('../routes/entities.js')).default;
const { rebuildFromModuleData, entityProfile, syncEntityToLinks, extractIdentity } = await import('../lib/entities.js');

const WS = 'ws_ent';
const ADMIN = 'sess_ea', VIEWER = 'sess_ev';
await db.insert(schema.workspaces).values({ id: WS, name: 'W', tz: 'PT', plan: 'enterprise' });
await db.insert(schema.users).values([
  { id: 'u_ea', email: 'a@e.com', passwordHash: 'x', name: 'A', role: 'admin', workspaceId: WS },
  { id: 'u_ev', email: 'v@e.com', passwordHash: 'x', name: 'V', role: 'viewer', workspaceId: WS },
]);
await db.insert(schema.sessions).values([
  { id: ADMIN, userId: 'u_ea', expiresAt: new Date(Date.now() + 3600e3) },
  { id: VIEWER, userId: 'u_ev', expiresAt: new Date(Date.now() + 3600e3) },
]);
const rq = (m, p, b, sid = ADMIN) => entitiesApp.request(p, { method: m, headers: { Cookie: `mdt_session=${sid}`, 'Content-Type': 'application/json' }, body: b != null ? JSON.stringify(b) : undefined });
const md = (id, module, kind, data) => db.insert(schema.moduleData).values({ id, workspaceId: WS, module, kind, data: JSON.stringify(data) });

// Jane appears in three modules under the same email; Sam only in Ground.
await md('v1', 'ground', 'voter', { id: 'v1', first: 'Jane', last: 'Doe', email: 'JANE@x.com', support: 0.8 });
await md('d1', 'raise', 'donor', { id: 'd1', name: 'Jane Doe', email: 'jane@x.com', amount: 500 });
await md('h1', 'events', 'host', { id: 'h1', name: 'Jane Doe', email: 'jane@x.com', phone: '555-1212' });
await md('v2', 'ground', 'voter', { id: 'v2', first: 'Sam', last: 'Lee', support: 0.3 });
await md('o1', 'coalition', 'org', { id: 'o1', name: 'Riverside Labour Council' });
await md('s1', 'ground', 'script', { id: 's1', name: 'Persuasion script' }); // not an entity kind

test('extractIdentity reads people and skips non-entity kinds', () => {
  assert.equal(extractIdentity('voter', { first: 'A', last: 'B' }).name, 'A B');
  assert.equal(extractIdentity('donor', { name: 'C D', email: 'C@D.com' }).email, 'c@d.com');
  assert.equal(extractIdentity('script', { name: 'x' }), null, 'scripts are not entities');
});

test('rebuild resolves records across modules into one entity (by email)', async () => {
  const res = await rebuildFromModuleData(WS, 'u_ea');
  // Jane (1) + Sam (1) + the org (1) = 3 entities; the script is ignored.
  assert.equal(res.totalEntities, 3);
  assert.equal(res.multiModule, 1, 'exactly Jane spans more than one module');

  // Re-running is idempotent (no duplicate entities or links).
  const again = await rebuildFromModuleData(WS, 'u_ea');
  assert.equal(again.created, 0);
  assert.equal(again.linked, 0);
});

test('the 360 profile aggregates Jane across ground, raise and events', async () => {
  const ents = await db.select().from(schema.entities);
  const jane = ents.find((e) => e.name === 'Jane Doe');
  assert.ok(jane);
  assert.equal(jane.email, 'jane@x.com', 'email normalized + canonical');
  const profile = await entityProfile(WS, jane.id);
  assert.equal(profile.moduleCount, 3);
  assert.equal(profile.touchpointCount, 3);
  assert.ok(profile.modules.ground && profile.modules.raise && profile.modules.events);
  assert.equal(profile.modules.raise[0].record.amount, 500, 'linked record data resolved');
});

test('editing the entity propagates to every linked record (edit once)', async () => {
  const jane = (await db.select().from(schema.entities)).find((e) => e.name === 'Jane Doe');
  const { updateEntity } = await import('../lib/entities.js');
  await updateEntity(WS, jane.id, { name: 'Jane Okafor', email: 'jane.okafor@x.com' });
  const n = await syncEntityToLinks(WS, jane.id);
  assert.equal(n, 3, 'all three linked records updated');

  const all = await db.select().from(schema.moduleData);
  const vdata = JSON.parse(all.find((r) => r.id === 'v1').data);
  assert.equal(vdata.first, 'Jane'); assert.equal(vdata.last, 'Okafor', 'name split back into first/last');
  assert.equal(vdata.email, 'jane.okafor@x.com');
  assert.equal(JSON.parse(all.find((r) => r.id === 'd1').data).name, 'Jane Okafor', 'donor name field updated');
});

test('API: rebuild gated to editors; profile readable; reverse lookup works', async () => {
  assert.equal((await rq('POST', '/rebuild', {}, VIEWER)).status, 403);
  const list = await (await rq('GET', '/?q=okafor')).json();
  assert.ok(list.entities.length >= 1);
  const id = list.entities[0].id;
  const prof = await (await rq('GET', `/${id}`)).json();
  assert.ok(prof.profile.touchpointCount >= 1);
  const rev = await (await rq('GET', '/by-record/raise/donor/d1')).json();
  assert.equal(rev.profile.entity.name, 'Jane Okafor', 'reverse lookup finds the canonical entity');
});
