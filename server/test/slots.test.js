import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb } from './helpers.js';

const { db, sqlite, schema } = await setupDb();
const slots = await import('../lib/social/slots.js');

test('upcomingSlotTimes is DST-aware (PT spring-forward 2026-03-08)', () => {
  const weekly = [{ day: 1, time: '09:00' }]; // Monday 09:00 local
  const pst = slots.upcomingSlotTimes(weekly, 'PT', new Date('2026-03-01T00:00:00Z'), 1)[0];
  const pdt = slots.upcomingSlotTimes(weekly, 'PT', new Date('2026-03-08T20:00:00Z'), 1)[0];
  // 09:00 PST = 17:00Z; after DST, 09:00 PDT = 16:00Z
  assert.equal(pst.toISOString(), '2026-03-02T17:00:00.000Z');
  assert.equal(pdt.toISOString(), '2026-03-09T16:00:00.000Z');
});

test('upcomingSlotTimes returns multiple slots in order', () => {
  const weekly = [{ day: 1, time: '09:00' }, { day: 3, time: '17:00' }];
  const times = slots.upcomingSlotTimes(weekly, 'ET', new Date('2026-06-01T00:00:00Z'), 4);
  assert.equal(times.length, 4);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1], 'strictly increasing');
});

test('setWorkspaceSlots validates and filters bad entries', async () => {
  await db.insert(schema.workspaces).values({ id: 'ws_slots', name: 'W', tz: 'PT' });
  const saved = await slots.setWorkspaceSlots('ws_slots', [
    { day: 1, time: '09:00' },
    { day: 7, time: '10:00' },   // invalid day
    { day: 2, time: '25:99' },   // invalid time
    { day: 4, time: '17:30' },
  ]);
  assert.equal(saved.length, 2);
  assert.deepEqual(saved.map((s) => `${s.day}@${s.time}`), ['1@09:00', '4@17:30']);
});

test('nextQueueTime stacks onto the latest scheduled post', async () => {
  await db.insert(schema.workspaces).values({ id: 'ws_q', name: 'W', tz: 'PT' });
  await slots.setWorkspaceSlots('ws_q', [{ day: 1, time: '09:00' }, { day: 4, time: '17:30' }]);
  const q1 = await slots.nextQueueTime('ws_q', { sqlite });
  assert.ok(q1.time instanceof Date, 'returns a time');
  await db.insert(schema.socialPosts).values({
    id: 'sp_q1', workspaceId: 'ws_q', groupId: 'g', platform: 'mastodon', body: 'x',
    status: 'scheduled', scheduledAt: q1.time,
  });
  const q2 = await slots.nextQueueTime('ws_q', { sqlite });
  assert.ok(q2.time > q1.time, 'second queue slot is after the first');
});

test('nextQueueTime errors with no slots configured', async () => {
  await db.insert(schema.workspaces).values({ id: 'ws_empty', name: 'W', tz: 'PT' });
  const r = await slots.nextQueueTime('ws_empty', { sqlite });
  assert.ok(r.error, 'returns an error when unconfigured');
});
