// Regression tests for the inline-vs-worker double-publish race.
// The interactive routes publish via publishInline(), which atomically claims a
// row (flips it to 'publishing' with a lease) before publishing. The background
// worker claims due rows the same way. These guard that the two paths can never
// both publish the same post.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, mockFetch, jsonResponse } from './helpers.js';

const { db, sqlite, schema } = await setupDb();
const { publishInline } = await import('../lib/social/publish.js');
const { runPublishTickOnce } = await import('../lib/social-worker.js');
const { encryptJson } = await import('../lib/crypto.js');

const row = (id) => sqlite.prepare('SELECT status, attempts, remote_url AS url FROM social_posts WHERE id=?').get(id);

await db.insert(schema.workspaces).values({ id: 'ws_i', name: 'W' });
await db.insert(schema.users).values({ id: 'u_i', email: 'i@t.com', passwordHash: 'x', name: 'I', workspaceId: 'ws_i' });
await db.insert(schema.socialAccounts).values({
  id: 'sa_i', workspaceId: 'ws_i', platform: 'mastodon', handle: '@m', status: 'connected',
  credentials: encryptJson({ instanceUrl: 'https://inst', accessToken: 't' }),
});

// Count how many times the publish endpoint is actually hit on the wire.
let posted = 0;
function countingFetch() {
  return mockFetch((url) => {
    if (url.includes('/api/v1/statuses')) { posted += 1; return jsonResponse({ id: String(posted), url: `https://inst/${posted}` }); }
    return jsonResponse({});
  });
}

test('the worker does NOT claim a row that inline is publishing (future lease)', async () => {
  posted = 0;
  const restore = countingFetch();
  try {
    await db.insert(schema.socialPosts).values({
      id: 'sp_lease', workspaceId: 'ws_i', groupId: 'g_l', accountId: 'sa_i', platform: 'mastodon',
      body: 'once', status: 'publishing', createdById: 'u_i',
      // a healthy, unexpired lease held by some other worker/inline call
      workerId: 'inline', leaseExpiresAt: new Date(Date.now() + 120_000),
    });
    await runPublishTickOnce();
    assert.equal(posted, 0, 'worker must not touch a leased in-flight row');
    assert.equal(row('sp_lease').status, 'publishing', 'still owned by the in-flight publisher');
  } finally { restore(); }
});

test('publishInline is idempotent under a race — the second caller no-ops', async () => {
  posted = 0;
  const restore = countingFetch();
  try {
    await db.insert(schema.socialPosts).values({
      id: 'sp_race', workspaceId: 'ws_i', groupId: 'g_r', accountId: 'sa_i', platform: 'mastodon',
      body: 'go', status: 'draft', createdById: 'u_i',
    });
    const r1 = await publishInline('sp_race');
    assert.equal(r1.ok, true, 'first inline publish succeeds');
    assert.equal(row('sp_race').status, 'published');

    // A second call (e.g. a double-clicked button) must not re-publish.
    const r2 = await publishInline('sp_race');
    assert.equal(r2.ok, true, 'second call reports the already-published result');
    assert.equal(posted, 1, 'published to the platform exactly once');
  } finally { restore(); }
});

test('once inline has claimed a draft, the worker skips it', async () => {
  posted = 0;
  const restore = countingFetch();
  try {
    await db.insert(schema.socialPosts).values({
      id: 'sp_claim', workspaceId: 'ws_i', groupId: 'g_c', accountId: 'sa_i', platform: 'mastodon',
      body: 'claim me', status: 'draft', createdById: 'u_i',
    });
    // Simulate the inline claim winning first (flip to publishing with a lease),
    // then a worker tick racing in before the publish completes.
    const lease = Math.floor(Date.now() / 1000) + 120;
    sqlite.prepare("UPDATE social_posts SET status='publishing', worker_id='inline', lease_expires_at=? WHERE id=?").run(lease, 'sp_claim');
    await runPublishTickOnce();
    assert.equal(posted, 0, 'worker skipped the inline-claimed row');
  } finally { restore(); }
});
