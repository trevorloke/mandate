// Daily Brief — buildBrief section synthesis + the /api/brief route.
// Tests seed cumulatively into one workspace; the empty-workspace test runs
// first, then each seeding test checks its own section (and ordering).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb } from './helpers.js';

const { db, schema } = await setupDb();
const briefApp = (await import('../routes/brief.js')).default;
const { buildBrief } = await import('../lib/brief.js');

const SID = 'sess_viewer';
await db.insert(schema.workspaces).values({ id: 'ws_br', name: 'W', tz: 'PT', plan: 'enterprise' });
await db.insert(schema.users).values({
  id: 'u_vw', email: 'vw@t.com', passwordHash: 'x', name: 'Vw', role: 'viewer', workspaceId: 'ws_br',
});
await db.insert(schema.sessions).values({ id: SID, userId: 'u_vw', expiresAt: new Date(Date.now() + 3600e3) });

let seq = 0;
const seed = (module, kind, data, createdAt = new Date()) => db.insert(schema.moduleData).values({
  id: `md_${++seq}`, workspaceId: 'ws_br', module, kind, data: JSON.stringify(data), createdAt,
});
const DAY = 86400000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const find = (sections, key) => sections.find((s) => s.key === key);

test('empty workspace: 9 zeroed sections, none needing attention, no throw', async () => {
  const sections = await buildBrief('ws_br');
  assert.equal(sections.length, 9);
  assert.ok(sections.every((s) => s.attention === false), 'nothing flags attention');
  assert.deepEqual(
    sections.map((s) => s.key),
    ['money', 'compliance', 'approvals', 'field', 'asks', 'events', 'attention', 'forecast', 'directory'],
    'fixed order holds when nothing needs attention',
  );
  for (const s of sections) {
    assert.equal(typeof s.headline, 'string');
    assert.equal(typeof s.detail, 'string');
    assert.equal(typeof s.route, 'string');
    assert.equal(typeof s.label, 'string');
    assert.equal(typeof s.module, 'string');
  }
  assert.equal(find(sections, 'money').headline, '$0');
  assert.equal(find(sections, 'compliance').headline, 'No filings due');
  assert.equal(find(sections, 'events').headline, 'Nothing scheduled');
  assert.equal(find(sections, 'attention').headline, 'Attention steady');
  assert.equal(find(sections, 'forecast').headline, 'Not configured');
});

test('filing due in 5 days: compliance flags and sorts first', async () => {
  await seed('ledger', 'filing', {
    regulator: 'Elections BC', period: 'Q3', due: isoDay(Date.now() + 5 * DAY), daysToFile: 5, status: 'open',
  });
  const sections = await buildBrief('ws_br');
  const comp = find(sections, 'compliance');
  assert.equal(comp.attention, true);
  assert.equal(comp.headline, 'due in 5d');
  assert.equal(sections[0].key, 'compliance', 'attention sections sort ahead of the rest');
});

test('gifts reflect in the money section (YTD + this week)', async () => {
  await seed('raise', 'gift', { donor: 'Ada', amt: 500, status: 'cleared' });                       // now → in week window
  await seed('raise', 'gift', { donor: 'Old', amt: 250, status: 'cleared' }, new Date(Date.now() - 30 * DAY));
  const sections = await buildBrief('ws_br');
  const money = find(sections, 'money');
  assert.equal(money.headline, '$750', 'YTD covers all gifts');
  assert.ok(money.detail.startsWith('$500 this week'), `week window counts only fresh gifts: ${money.detail}`);
  assert.equal(money.attention, false, 'no bills due — money stays calm');
});

test('ask at stage 1 due yesterday: asks flags with nearest org', async () => {
  await seed('coalition', 'ask', { org: 'Local 123', text: 'Endorse us', stage: 1, due: isoDay(Date.now() - DAY) });
  await seed('coalition', 'ask', { org: 'Done Org', text: 'Delivered', stage: 3, due: isoDay(Date.now() - DAY) });
  const sections = await buildBrief('ws_br');
  const asks = find(sections, 'asks');
  assert.equal(asks.attention, true);
  assert.equal(asks.headline, '1 ask stalled or due', 'delivered asks do not count');
  assert.ok(asks.detail.includes('Local 123'), `nearest org named: ${asks.detail}`);
});

test('post with signoff "needs legal": approvals flags with count 1', async () => {
  await seed('beacon', 'post', { status: 'DRAFT', signoff: 'needs legal', headline: 'Launch day' });
  await seed('beacon', 'post', { status: 'LIVE', headline: 'Old news' });
  const sections = await buildBrief('ws_br');
  const ap = find(sections, 'approvals');
  assert.equal(ap.attention, true);
  assert.equal(ap.headline, '1 post awaiting sign-off');
  assert.equal(ap.detail, 'Launch day', 'detail is the awaiting post headline');
});

test('viewer role can GET /api/brief (200)', async () => {
  const r = await briefApp.request('/', { headers: { Cookie: `mdt_session=${SID}` } });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.ok(Array.isArray(body.sections));
  assert.equal(body.sections.length, 9);
  assert.equal(typeof body.generatedAt, 'number');
});

test('unauthenticated request gets 401', async () => {
  const r = await briefApp.request('/');
  assert.equal(r.status, 401);
});
