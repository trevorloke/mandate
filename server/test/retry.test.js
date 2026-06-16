import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, mockFetch, jsonResponse } from './helpers.js';

const { db, sqlite, schema } = await setupDb();
const { runPublishTickOnce } = await import('../lib/social-worker.js');
const { encryptJson } = await import('../lib/crypto.js');

const row = (id) => sqlite.prepare('SELECT status, attempts, next_retry_at AS r, remote_url AS url FROM social_posts WHERE id=?').get(id);
const makeDue = (id) => sqlite.prepare('UPDATE social_posts SET next_retry_at = ? WHERE id = ?').run(Math.floor(Date.now() / 1000) - 5, id);

await db.insert(schema.workspaces).values({ id: 'ws_r', name: 'W' });
await db.insert(schema.users).values({ id: 'u_1', email: 'r@t.com', passwordHash: 'x', name: 'R', workspaceId: 'ws_r' });
await db.insert(schema.socialAccounts).values({
  id: 'sa_m', workspaceId: 'ws_r', platform: 'mastodon', handle: '@m', status: 'connected',
  credentials: encryptJson({ instanceUrl: 'https://inst', accessToken: 't' }),
});
await db.insert(schema.socialAccounts).values({
  id: 'sa_b', workspaceId: 'ws_r', platform: 'bluesky', handle: '@b', status: 'connected',
  credentials: encryptJson({ service: 'https://pds', did: 'd', handle: 'b', accessJwt: 'a', refreshJwt: 'r' }),
});

test('transient failure → backoff → reclaim → heals to published', async () => {
  const past = new Date(Date.now() - 60_000);
  await db.insert(schema.socialPosts).values({ id: 'sp_t', workspaceId: 'ws_r', groupId: 'g1', accountId: 'sa_m', platform: 'mastodon', body: 'hi', status: 'scheduled', scheduledAt: past, createdById: 'u_1' });

  let restore = mockFetch(() => jsonResponse({ error: 'rate limited' }, 500));
  await runPublishTickOnce();
  let t = row('sp_t');
  assert.equal(t.status, 'failed');
  assert.equal(t.attempts, 1);
  assert.ok(t.r, 'retry queued');

  makeDue('sp_t');
  await runPublishTickOnce();
  t = row('sp_t');
  assert.equal(t.attempts, 2, 'reclaimed due retry');
  restore();

  restore = mockFetch(() => jsonResponse({ id: '777', url: 'https://inst/@m/777' }, 200));
  makeDue('sp_t');
  await runPublishTickOnce();
  t = row('sp_t');
  assert.equal(t.status, 'published');
  assert.equal(t.url, 'https://inst/@m/777');
  assert.equal(t.r, null, 'retry cleared on success');
  restore();
});

test('permanent failure (char limit) never queues a retry', async () => {
  const past = new Date(Date.now() - 60_000);
  await db.insert(schema.socialPosts).values({ id: 'sp_p', workspaceId: 'ws_r', groupId: 'g2', accountId: 'sa_b', platform: 'bluesky', body: 'x'.repeat(301), status: 'scheduled', scheduledAt: past, createdById: 'u_1' });
  const restore = mockFetch(() => jsonResponse({}, 200));
  try {
    await runPublishTickOnce();
    const p = row('sp_p');
    assert.equal(p.status, 'failed');
    assert.equal(p.r, null, 'no retry for a permanent error');
    // Author is notified on a permanent failure...
    const notif = sqlite.prepare("SELECT title FROM notifications WHERE user_id='u_1' AND kind='social.failed'").all();
    assert.equal(notif.length, 1, 'one failure notification for the author');
    // ...but the transient post that eventually recovered produced none.
    const all = sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id='u_1' AND kind='social.failed'").get();
    assert.equal(all.n, 1, 'only the permanent failure notified');
  } finally { restore(); }
});
