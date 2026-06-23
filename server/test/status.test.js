// Observability endpoint + rate-limit peek. In-process via app.request().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb } from './helpers.js';

const { db, schema } = await setupDb();
const { encryptJson } = await import('../lib/crypto.js');
const rl = await import('../lib/social/ratelimit.js');
const socialApp = (await import('../routes/social.js')).default;

const SID = 'sess_s';
await db.insert(schema.workspaces).values({ id: 'ws_s', name: 'W', tz: 'PT' });
await db.insert(schema.users).values({ id: 'u_s', email: 's@t.com', passwordHash: 'x', name: 'S', role: 'admin', workspaceId: 'ws_s' });
await db.insert(schema.sessions).values({ id: SID, userId: 'u_s', expiresAt: new Date(Date.now() + 3600e3) });
await db.insert(schema.socialAccounts).values([
  { id: 'sa_ok', workspaceId: 'ws_s', platform: 'mastodon', handle: '@m', status: 'connected', credentials: encryptJson({ instanceUrl: 'https://i', accessToken: 't' }) },
  { id: 'sa_bad', workspaceId: 'ws_s', platform: 'bluesky', handle: '@b', status: 'error', lastError: 'token expired', credentials: encryptJson({}) },
]);
const past = new Date(Date.now() - 600_000);
const future = new Date(Date.now() + 3600_000);
await db.insert(schema.socialPosts).values([
  { id: 'q1', workspaceId: 'ws_s', groupId: 'g', accountId: 'sa_ok', platform: 'mastodon', body: 'a', status: 'scheduled', scheduledAt: past },     // overdue + dueNow
  { id: 'q2', workspaceId: 'ws_s', groupId: 'g', accountId: 'sa_ok', platform: 'mastodon', body: 'b', status: 'scheduled', scheduledAt: future },   // future
  { id: 'q3', workspaceId: 'ws_s', groupId: 'g', accountId: 'sa_ok', platform: 'mastodon', body: 'c', status: 'published', publishedAt: past },
  { id: 'q4', workspaceId: 'ws_s', groupId: 'g', accountId: 'sa_ok', platform: 'mastodon', body: 'd', status: 'failed', nextRetryAt: future },       // retrying
  { id: 'q5', workspaceId: 'ws_s', groupId: 'g', accountId: 'sa_ok', platform: 'mastodon', body: 'e', status: 'failed' },                            // terminal
]);

const getStatus = () => socialApp.request('/status', { headers: { Cookie: `mdt_session=${SID}` } });

test('/status reports worker, queue depth, accounts and budgets', async () => {
  const r = await getStatus();
  assert.equal(r.status, 200);
  const j = await r.json();

  // Worker snapshot shape (not started in this process → running false, passes present).
  assert.ok(j.worker && typeof j.worker.id === 'string');
  assert.equal(j.worker.running, false);
  assert.ok(j.worker.passes.publish && 'intervalMs' in j.worker.passes.publish);

  // Queue depth.
  assert.equal(j.queue.byStatus.scheduled, 2);
  assert.equal(j.queue.byStatus.published, 1);
  assert.equal(j.queue.byStatus.failed, 2);
  assert.equal(j.queue.dueNow, 1, 'one scheduled post is due now');
  assert.equal(j.queue.overdue, 1, 'one scheduled post is >2min overdue');
  assert.equal(j.queue.retrying, 1, 'one failed post has a pending retry');
  assert.equal(j.queue.failedTerminal, 1, 'one failed post is terminal');
  assert.ok(j.queue.nextScheduledAt, 'a future scheduled post is reported');

  // Account health.
  assert.equal(j.accounts.summary.total, 2);
  assert.equal(j.accounts.summary.connected, 1);
  assert.equal(j.accounts.summary.error, 1);

  // Budgets only for connected platforms (mastodon), not the errored bluesky.
  assert.deepEqual(j.budgets.map((b) => b.platform), ['mastodon']);
  assert.ok(j.budgets[0].capacity >= 1 && j.budgets[0].tokens >= 0);

  // Failures listed (terminal + retrying), capped/sorted.
  assert.equal(j.failures.length, 2);
});

test('rate-limit peek() reports budget without consuming a token', () => {
  rl.resetBuckets();
  const cfg = { capacity: 3, refillPerMin: 0 };
  assert.equal(rl.peek('pk', cfg).tokens, 3, 'fresh bucket reads full capacity');
  rl.take('pk', cfg); // consume one
  const p = rl.peek('pk', cfg);
  assert.equal(p.tokens, 2, 'peek reflects the consumed token');
  // peeking again must NOT decrement further.
  assert.equal(rl.peek('pk', cfg).tokens, 2, 'peek is non-destructive');
  assert.equal(rl.take('pk', cfg).ok, true, 'token still available after peeks');
});
