// Daily Brief v2 — persona-shaped, visual sections + the /api/brief route.
// Empty-workspace tests run against ws_empty; seeded tests build up ws_main.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb } from './helpers.js';

const { db, schema } = await setupDb();
const briefApp = (await import('../routes/brief.js')).default;
const { buildBrief } = await import('../lib/brief.js');

const DAY = 86400000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const find = (sections, key) => sections.find((s) => s.key === key);
const keys = (sections) => sections.map((s) => s.key);

await db.insert(schema.workspaces).values([
  { id: 'ws_empty', name: 'Empty', tz: 'PT', plan: 'enterprise' },
  { id: 'ws_main', name: 'Main', tz: 'PT', plan: 'enterprise' },
]);
await db.insert(schema.users).values([
  { id: 'u_ad', email: 'ad@t.com', passwordHash: 'x', name: 'Ad', role: 'admin', workspaceId: 'ws_main' },
  { id: 'u_ed', email: 'ed@t.com', passwordHash: 'x', name: 'Ed', role: 'editor', workspaceId: 'ws_main' },
  { id: 'u_vw', email: 'vw@t.com', passwordHash: 'x', name: 'Vw', role: 'viewer', workspaceId: 'ws_main' },
]);
await db.insert(schema.sessions).values([
  { id: 'sess_ad', userId: 'u_ad', expiresAt: new Date(Date.now() + 3600e3) },
  { id: 'sess_ed', userId: 'u_ed', expiresAt: new Date(Date.now() + 3600e3) },
  { id: 'sess_vw', userId: 'u_vw', expiresAt: new Date(Date.now() + 3600e3) },
]);

let seq = 0;
const seed = (module, kind, data, createdAt = new Date()) => db.insert(schema.moduleData).values({
  id: `md_${++seq}`, workspaceId: 'ws_main', module, kind, data: JSON.stringify(data), createdAt,
});

const MANAGER_KEYS = ['money', 'compliance', 'approvals', 'field', 'asks', 'events', 'attention', 'forecast', 'directory'];

// ── empty-workspace safety ──────────────────────────────────────────────

test('empty workspace, manager: 9 sections in fixed order, zeroed, no throw', async () => {
  const sections = await buildBrief('ws_empty', 'manager');
  assert.deepEqual(keys(sections), MANAGER_KEYS);
  assert.ok(sections.every((s) => s.attention === false), 'nothing flags attention');
  for (const s of sections) {
    assert.equal(typeof s.route, 'string');
    assert.equal(typeof s.label, 'string');
    assert.equal(typeof s.module, 'string');
    assert.ok(['stat', 'meter', 'list'].includes(s.kind), `typed kind: ${s.key}`);
    if (s.kind === 'stat') {
      assert.equal(typeof s.value, 'string');
      assert.equal(typeof s.raw, 'number');
    } else if (s.kind === 'meter') {
      assert.equal(typeof s.value, 'string');
      assert.equal(typeof s.num, 'number');
      assert.equal(typeof s.den, 'number');
      assert.ok(['ok', 'warn', 'danger'].includes(s.severity));
    } else {
      assert.ok(Array.isArray(s.items));
    }
  }
  assert.equal(find(sections, 'money').value, '$0');
  assert.equal(find(sections, 'money').raw, 0);
  const comp = find(sections, 'compliance');
  assert.equal(comp.kind, 'meter');
  assert.equal(comp.severity, 'ok');
  assert.deepEqual(find(sections, 'events').items, []);
  assert.equal(find(sections, 'forecast').value, '—');
});

test('staff shape: manager minus forecast', async () => {
  const sections = await buildBrief('ws_empty', 'staff');
  assert.deepEqual(keys(sections), MANAGER_KEYS.filter((k) => k !== 'forecast'));
});

test('candidate shape: leads with events, no compliance/asks/directory/forecast', async () => {
  const sections = await buildBrief('ws_empty', 'candidate');
  assert.deepEqual(keys(sections), ['events', 'money', 'field', 'attention', 'approvals']);
  assert.equal(sections[0].kind, 'list');
});

test('volunteer shape: events first, field is a meter, no money section', async () => {
  const sections = await buildBrief('ws_empty', 'volunteer');
  assert.deepEqual(keys(sections), ['events', 'field', 'academy', 'directory']);
  assert.equal(find(sections, 'money'), undefined, 'volunteers see no money');
  const field = find(sections, 'field');
  assert.equal(field.kind, 'meter');
  assert.equal(field.severity, 'ok', 'empty workspace: no shifts is not an alarm');
  assert.equal(find(sections, 'directory').sub, 'people in the campaign');
  assert.equal(find(sections, 'academy').sub, 'keep training');
});

// ── seeded sections ─────────────────────────────────────────────────────

test('filing due in 5 days: compliance meter goes danger + attention', async () => {
  await seed('ledger', 'filing', {
    regulator: 'Elections BC', period: 'Q3', due: isoDay(Date.now() + 5 * DAY), daysToFile: 5, status: 'open',
  });
  const comp = find(await buildBrief('ws_main', 'manager'), 'compliance');
  assert.equal(comp.kind, 'meter');
  assert.equal(comp.severity, 'danger');
  assert.equal(comp.attention, true);
  assert.equal(comp.value, '5d');
  assert.equal(comp.num, 5);
  assert.equal(comp.den, 30);
});

test('money stat carries compact value, delta and spark from seeded metrics', async () => {
  // Yesterday's snapshot gives trendFor a prior to delta against.
  await db.insert(schema.metricSnapshots).values({
    id: 'ms_prior', workspaceId: 'ws_main', metricKey: 'raise.ytd', value: 500, day: isoDay(Date.now() - DAY),
  });
  await seed('raise', 'gift', { donor: 'Ada', amt: 500, status: 'cleared' });
  await seed('raise', 'gift', { donor: 'Old', amt: 250, status: 'cleared' }, new Date(Date.now() - 30 * DAY));
  const money = find(await buildBrief('ws_main', 'manager'), 'money');
  assert.equal(money.kind, 'stat');
  assert.equal(money.value, '$750', 'compact YTD covers all gifts');
  assert.equal(money.raw, 750);
  assert.ok(money.delta, 'delta present with a prior snapshot');
  assert.equal(money.delta.dir, 'up');
  assert.equal(money.delta.good, true);
  assert.match(money.delta.text, /^\+50\.0%$/);
  assert.ok(Array.isArray(money.spark) && money.spark.length >= 2, 'sparkline has history');
  assert.ok(money.spark.length <= 12, 'spark capped at 12 points');
  assert.equal(money.sub, '$500 this week', 'week window counts only fresh gifts');
  assert.equal(money.attention, false, 'no bills due — money stays calm');
});

test('events list: at most 4 upcoming items with when, gaps flag attention', async () => {
  for (let i = 2; i <= 6; i++) {
    await seed('events', 'event', {
      title: `Rally ${i}`, date: isoDay(Date.now() + i * DAY), venue: 'Hall',
      shifts: i === 2 ? 3 : 0, shiftsFilled: i === 2 ? 1 : 0,
    });
  }
  const ev = find(await buildBrief('ws_main', 'manager'), 'events');
  assert.equal(ev.kind, 'list');
  assert.equal(ev.items.length, 4, 'capped at 4 of the 5 upcoming');
  assert.equal(ev.items[0].label, 'Rally 2');
  assert.equal(ev.items[0].when, isoDay(Date.now() + 2 * DAY));
  assert.equal(ev.items[0].sub, 'Hall');
  assert.equal(ev.sub, '2 shift gaps');
  assert.equal(ev.attention, true);
});

test('shifts: manager sees an unfilled-shift stat, volunteer a fill meter with severity', async () => {
  await seed('ground', 'shift', { where: 'Downtown', filled: 1, cap: 4 });
  const manager = await buildBrief('ws_main', 'manager');
  const fieldStat = find(manager, 'field');
  assert.equal(fieldStat.kind, 'stat');
  assert.equal(fieldStat.sub, '1 shift unfilled');
  assert.equal(fieldStat.attention, true);

  const volunteer = await buildBrief('ws_main', 'volunteer');
  const meter = find(volunteer, 'field');
  assert.equal(meter.kind, 'meter');
  assert.equal(meter.value, '1/4');
  assert.equal(meter.num, 1);
  assert.equal(meter.den, 4);
  assert.equal(meter.severity, 'danger', 'fill ratio 25% is danger');
  assert.equal(meter.attention, true);
});

test('academy courses roll into the volunteer academy stat', async () => {
  await seed('academy', 'course', { title: 'Doorknocking 101' });
  await seed('academy', 'course', { title: 'Persuasion' });
  const academy = find(await buildBrief('ws_main', 'volunteer'), 'academy');
  assert.equal(academy.value, '2');
  assert.equal(academy.raw, 2);
});

test('manager order stays fixed even with attention flags set', async () => {
  const sections = await buildBrief('ws_main', 'manager');
  assert.deepEqual(keys(sections), MANAGER_KEYS);
});

// ── route: persona resolution + viewAs ──────────────────────────────────

test('viewer GET /api/brief → volunteer persona payload', async () => {
  const r = await briefApp.request('/', { headers: { Cookie: 'mdt_session=sess_vw' } });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.persona, 'volunteer');
  assert.deepEqual(keys(body.sections), ['events', 'field', 'academy', 'directory']);
  assert.equal(typeof body.generatedAt, 'number');
});

test('admin GET /api/brief → manager; ?viewAs=candidate honored for preview', async () => {
  const plain = await (await briefApp.request('/', { headers: { Cookie: 'mdt_session=sess_ad' } })).json();
  assert.equal(plain.persona, 'manager');

  const r = await briefApp.request('/?viewAs=candidate', { headers: { Cookie: 'mdt_session=sess_ad' } });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.persona, 'candidate');
  assert.equal(body.sections[0].key, 'events', 'candidate leads with events');
});

test('admin ?viewAs=<garbage> is ignored', async () => {
  const body = await (await briefApp.request('/?viewAs=wizard', { headers: { Cookie: 'mdt_session=sess_ad' } })).json();
  assert.equal(body.persona, 'manager');
});

test('editor ?viewAs=candidate is IGNORED — persona stays staff', async () => {
  const r = await briefApp.request('/?viewAs=candidate', { headers: { Cookie: 'mdt_session=sess_ed' } });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.persona, 'staff');
  assert.deepEqual(keys(body.sections), MANAGER_KEYS.filter((k) => k !== 'forecast'));
});

test('unauthenticated request gets 401', async () => {
  const r = await briefApp.request('/');
  assert.equal(r.status, 401);
});
