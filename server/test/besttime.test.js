// Best-time-to-post: engagement bucketing + next-best-time scheduling + compose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb } from './helpers.js';

const { db, schema } = await setupDb();
const { encryptJson } = await import('../lib/crypto.js');
const bt = await import('../lib/social/besttime.js');
const socialApp = (await import('../routes/social.js')).default;

test('engagementGrid buckets by weekday+hour and averages engagement', () => {
  const posts = [
    { publishedAt: new Date('2026-06-01T10:00:00Z'), metricsJson: JSON.stringify({ likes: 10 }) }, // Mon 10:00
    { publishedAt: new Date('2026-06-08T10:00:00Z'), metricsJson: JSON.stringify({ likes: 20 }) }, // Mon 10:00
    { publishedAt: new Date('2026-06-02T15:00:00Z'), metricsJson: JSON.stringify({ reposts: 2 }) }, // Tue 15:00
    { publishedAt: new Date('2026-06-03T09:00:00Z'), metricsJson: null }, // ignored (no metrics)
  ];
  const { grid, samples } = bt.engagementGrid(posts, 'GMT');
  assert.equal(samples, 3);
  const mon = grid.find((b) => b.day === 1 && b.hour === 10);
  assert.equal(mon.n, 2);
  assert.equal(mon.avg, 15); // (10 + 20) / 2
  assert.ok(grid.find((b) => b.day === 2 && b.hour === 15));
});

test('nextBestTime returns the soonest upcoming top window', async () => {
  await db.insert(schema.workspaces).values({ id: 'ws_bt', name: 'W', tz: 'GMT' });
  await db.insert(schema.socialPosts).values([
    { id: 'b1', workspaceId: 'ws_bt', groupId: 'g', platform: 'mastodon', body: 'x', status: 'published', publishedAt: new Date('2026-06-01T10:00:00Z'), metricsJson: JSON.stringify({ likes: 50 }) }, // Mon 10:00 (top)
    { id: 'b2', workspaceId: 'ws_bt', groupId: 'g', platform: 'mastodon', body: 'y', status: 'published', publishedAt: new Date('2026-06-02T15:00:00Z'), metricsJson: JSON.stringify({ likes: 1 }) },
  ]);
  // Pin the reference instant so "soonest upcoming" is deterministic regardless
  // of which weekday CI runs on. `after` is a Monday 00:00 UTC, so among the two
  // seeded windows (Mon 10:00 avg 50, Tue 15:00 avg 1) the soonest upcoming is
  // Mon 10:00. (Without this, on a Tuesday the soonest window is Tue 15:00.)
  const after = new Date('2026-06-01T00:00:00Z'); // Monday
  const r = await bt.nextBestTime('ws_bt', { after });
  assert.ok(r.time instanceof Date, 'returns a Date');
  assert.ok(r.time.getTime() > after.getTime(), 'after the reference time');
  const dh = bt.dayHourInTz(r.time, 'GMT');
  assert.deepEqual(dh, { day: 1, hour: 10 }, 'lands on the top engagement window (Mon 10:00 UTC)');
});

test('nextBestTime errors when there is no engagement history', async () => {
  await db.insert(schema.workspaces).values({ id: 'ws_empty', name: 'E', tz: 'GMT' });
  const r = await bt.nextBestTime('ws_empty', {});
  assert.ok(r.error && /history/i.test(r.error));
});

test('compose with bestTime schedules at a computed best window', async () => {
  await db.insert(schema.workspaces).values({ id: 'ws_c', name: 'C', tz: 'GMT' });
  await db.insert(schema.users).values({ id: 'u_c', email: 'c@t.com', passwordHash: 'x', name: 'C', role: 'admin', workspaceId: 'ws_c' });
  await db.insert(schema.sessions).values({ id: 'sess_c', userId: 'u_c', expiresAt: new Date(Date.now() + 3600e3) });
  await db.insert(schema.socialAccounts).values({ id: 'sa_c', workspaceId: 'ws_c', platform: 'mastodon', handle: '@m', status: 'connected', credentials: encryptJson({ instanceUrl: 'https://i', accessToken: 't' }) });
  await db.insert(schema.socialPosts).values({ id: 'h1', workspaceId: 'ws_c', groupId: 'g0', platform: 'mastodon', body: 'past', status: 'published', publishedAt: new Date('2026-06-01T10:00:00Z'), metricsJson: JSON.stringify({ likes: 40 }) });

  const r = await socialApp.request('/posts', {
    method: 'POST', headers: { Cookie: 'mdt_session=sess_c', 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'schedule me smartly', targets: ['sa_c'], bestTime: true }),
  });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.posts[0].status, 'scheduled');
  assert.ok(new Date(j.posts[0].scheduledAt).getTime() > Date.now(), 'scheduled in the future');
  assert.deepEqual(bt.dayHourInTz(new Date(j.posts[0].scheduledAt), 'GMT'), { day: 1, hour: 10 });
});

test('compose with bestTime errors gracefully when there is no history', async () => {
  await db.insert(schema.workspaces).values({ id: 'ws_nh', name: 'NH', tz: 'GMT' });
  await db.insert(schema.users).values({ id: 'u_nh', email: 'nh@t.com', passwordHash: 'x', name: 'NH', role: 'admin', workspaceId: 'ws_nh' });
  await db.insert(schema.sessions).values({ id: 'sess_nh', userId: 'u_nh', expiresAt: new Date(Date.now() + 3600e3) });
  await db.insert(schema.socialAccounts).values({ id: 'sa_nh', workspaceId: 'ws_nh', platform: 'mastodon', handle: '@m', status: 'connected', credentials: encryptJson({ instanceUrl: 'https://i', accessToken: 't' }) });

  const r = await socialApp.request('/posts', {
    method: 'POST', headers: { Cookie: 'mdt_session=sess_nh', 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'no history yet', targets: ['sa_nh'], bestTime: true }),
  });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /history/i);
});
