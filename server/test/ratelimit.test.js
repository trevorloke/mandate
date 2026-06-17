import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, mockFetch, jsonResponse } from './helpers.js';

const { db, sqlite, schema } = await setupDb();
const rl = await import('../lib/social/ratelimit.js');
const { publishPost } = await import('../lib/social/publish.js');
const { encryptJson } = await import('../lib/crypto.js');

test('token bucket: capacity then refill over time', () => {
  rl.resetBuckets();
  const cfg = { capacity: 2, refillPerMin: 60 }; // 1 token/sec
  const t0 = 1_000_000;
  assert.equal(rl.take('k', cfg, t0).ok, true);
  assert.equal(rl.take('k', cfg, t0).ok, true);
  const denied = rl.take('k', cfg, t0);
  assert.equal(denied.ok, false);
  assert.ok(denied.retryAfterMs > 0 && denied.retryAfterMs <= 1000, 'retry within ~1s at 60/min');
  // 1 second later → one token refilled
  assert.equal(rl.take('k', cfg, t0 + 1000).ok, true);
});

test('refillPerMin 0 gives a flat retry window', () => {
  rl.resetBuckets();
  const cfg = { capacity: 1, refillPerMin: 0 };
  assert.equal(rl.take('z', cfg, 0).ok, true);
  const d = rl.take('z', cfg, 0);
  assert.equal(d.ok, false);
  assert.equal(d.retryAfterMs, 60_000);
});

test('publishPost defers when the platform budget is spent, then publishes', async () => {
  rl.resetBuckets();
  rl.setPlatformLimit('mastodon', { capacity: 1, refillPerMin: 0 }); // 1 publish, no refill
  await db.insert(schema.workspaces).values({ id: 'ws_rl', name: 'W' });
  await db.insert(schema.socialAccounts).values({
    id: 'sa_m', workspaceId: 'ws_rl', platform: 'mastodon', handle: '@m', status: 'connected',
    credentials: encryptJson({ instanceUrl: 'https://inst', accessToken: 't' }),
  });
  await db.insert(schema.socialPosts).values([
    { id: 'p1', workspaceId: 'ws_rl', groupId: 'g1', accountId: 'sa_m', platform: 'mastodon', body: 'a', status: 'scheduled', scheduledAt: new Date() },
    { id: 'p2', workspaceId: 'ws_rl', groupId: 'g2', accountId: 'sa_m', platform: 'mastodon', body: 'b', status: 'scheduled', scheduledAt: new Date() },
  ]);
  const restore = mockFetch((url) => url.includes('/api/v1/statuses') ? jsonResponse({ id: '1', url: 'https://inst/1' }) : jsonResponse({}));
  try {
    const r1 = await publishPost('p1');
    assert.equal(r1.ok, true, 'first publish consumes the single token');

    const r2 = await publishPost('p2');
    assert.equal(r2.deferred, true, 'second is deferred (budget spent)');
    const p2 = sqlite.prepare('SELECT status, attempts FROM social_posts WHERE id=?').get('p2');
    assert.equal(p2.status, 'scheduled', 'deferred → re-queued, not failed');
    assert.equal(p2.attempts, 0, 'deferral is not a failed attempt');

    // Budget restored → it publishes.
    rl.setPlatformLimit('mastodon', { capacity: 5, refillPerMin: 30 });
    rl.resetBuckets();
    const r3 = await publishPost('p2');
    assert.equal(r3.ok, true);
    assert.equal(sqlite.prepare('SELECT status FROM social_posts WHERE id=?').get('p2').status, 'published');
  } finally { restore(); }
});
