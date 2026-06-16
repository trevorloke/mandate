import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, mockFetch, jsonResponse } from './helpers.js';

const { db, sqlite, schema } = await setupDb();
const { refreshMetrics } = await import('../lib/social/metrics.js');
const { checkAccountHealth } = await import('../lib/social/health.js');
const { encryptJson } = await import('../lib/crypto.js');

await db.insert(schema.workspaces).values({ id: 'ws_m', name: 'W' });
await db.insert(schema.socialAccounts).values({
  id: 'sa_m', workspaceId: 'ws_m', platform: 'mastodon', handle: '@m', status: 'connected',
  credentials: encryptJson({ instanceUrl: 'https://inst', accessToken: 't' }),
});
await db.insert(schema.socialPosts).values({
  id: 'sp_1', workspaceId: 'ws_m', groupId: 'g', accountId: 'sa_m', platform: 'mastodon',
  body: 'hi', status: 'published', remoteId: '111', publishedAt: new Date(),
});

test('metrics history appends only when numbers change', async () => {
  let likes = 5;
  const restore = mockFetch((url) => {
    if (url.includes('/statuses/111')) return jsonResponse({ favourites_count: likes, reblogs_count: 1, replies_count: 0 });
    return jsonResponse({});
  });
  try {
    await refreshMetrics('sp_1');         // baseline snapshot
    await refreshMetrics('sp_1');         // unchanged → no new row
    likes = 9;
    await refreshMetrics('sp_1');         // changed → new row
    const hist = sqlite.prepare('SELECT metrics_json AS m FROM social_metrics_history WHERE post_id=? ORDER BY captured_at').all('sp_1');
    assert.equal(hist.length, 2, 'baseline + one change');
    assert.deepEqual(hist.map((h) => JSON.parse(h.m).likes), [5, 9]);
  } finally { restore(); }
});

test('health check records one audience snapshot per account per day', async () => {
  const restore = mockFetch((url) => {
    if (url.includes('verify_credentials')) return jsonResponse({ username: 'm', followers_count: 1234 });
    return jsonResponse({});
  });
  try {
    await checkAccountHealth('sa_m');
    await checkAccountHealth('sa_m');      // same day → still one row
    const aud = sqlite.prepare('SELECT followers, day FROM social_audience WHERE account_id=?').all('sa_m');
    assert.equal(aud.length, 1);
    assert.equal(aud[0].followers, 1234);
    assert.match(aud[0].day, /^\d{4}-\d{2}-\d{2}$/);
  } finally { restore(); }
});
