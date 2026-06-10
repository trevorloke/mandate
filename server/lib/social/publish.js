// Shared post-publishing executor. Used by BOTH the inline "publish now" route
// and the scheduled-post worker, so the publish path is identical either way.
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { socialAccounts, socialPosts, auditLog } from '../../db/schema.js';
import { randomBytes } from 'crypto';
import { getProvider } from './index.js';
import { getApp } from './oauth.js';
import { loadMediaForPost } from './media.js';
import { encryptJson, decryptJson } from '../crypto.js';
import { broadcast } from '../realtime.js';
import { emitWebhook } from '../webhooks.js';

const newId = (p) => p + randomBytes(12).toString('hex');

const MAX_ATTEMPTS = 5;
// Errors that retrying cannot fix — bad input or a dead/missing account.
const PERMANENT_RE = /characters|not connected|was removed|reconnect|requires an image|not supported|needs developer-app|invalid value/i;

async function markFailed(post, message) {
  const error = String(message || 'publish failed').slice(0, 500);
  const attempts = (post.attempts || 0) + 1;
  // Transient failures get an exponential-backoff retry (2,4,8,16 min).
  const retryable = attempts < MAX_ATTEMPTS && !PERMANENT_RE.test(error);
  const nextRetryAt = retryable ? new Date(Date.now() + Math.pow(2, attempts) * 60_000) : null;
  await db.update(socialPosts).set({
    status: 'failed', error, attempts, nextRetryAt, workerId: null, leaseExpiresAt: null, updatedAt: new Date(),
  }).where(eq(socialPosts.id, post.id));
  try { broadcast(post.workspaceId, 'social.failed', { id: post.id, error, willRetry: retryable }); } catch {}
  return { ok: false, error, willRetry: retryable };
}

// Publish a single social_posts row. Idempotent enough to be called from a
// claim loop; resolves account, decrypts creds, calls the adapter, persists the
// result (and any refreshed tokens), and broadcasts.
export async function publishPost(postId) {
  const post = (await db.select().from(socialPosts).where(eq(socialPosts.id, postId)).limit(1))[0];
  if (!post) return { ok: false, error: 'post not found' };
  if (post.status === 'published') return { ok: true, url: post.remoteUrl };

  const account = post.accountId
    ? (await db.select().from(socialAccounts).where(eq(socialAccounts.id, post.accountId)).limit(1))[0]
    : null;
  if (!account) return markFailed(post, 'connected account was removed');

  const prov = getProvider(post.platform);
  if (!prov?.adapter?.publish) return markFailed(post, `platform "${post.platform}" is not supported`);

  try {
    const creds = decryptJson(account.credentials);
    // OAuth providers may need the developer-app client creds to refresh tokens.
    const app = prov.connect === 'oauth' ? await getApp(account.workspaceId, post.platform).catch(() => null) : null;
    // Resolve any attached media to bytes (+ a public URL for URL-fetch platforms).
    const media = post.mediaJson ? loadMediaForPost(post.mediaJson) : [];
    // Thread? Post the chain when the platform supports it; else just the head.
    let segments = null;
    try { segments = post.threadJson ? JSON.parse(post.threadJson) : null; } catch { segments = null; }
    const acctCtx = { ...account, credentials: creds, _app: app };
    const res = (Array.isArray(segments) && segments.length > 1 && prov.adapter.publishThread)
      ? await prov.adapter.publishThread(acctCtx, segments, { media })
      : await prov.adapter.publish(acctCtx, { id: post.id, body: Array.isArray(segments) && segments.length ? segments[0] : post.body, media });

    // Persist refreshed credentials if the adapter rotated them.
    if (res.credentials) {
      await db.update(socialAccounts)
        .set({ credentials: encryptJson(res.credentials), status: 'connected', lastError: null, updatedAt: new Date() })
        .where(eq(socialAccounts.id, account.id));
    }

    await db.update(socialPosts).set({
      status: 'published', publishedAt: new Date(),
      remoteId: res.remoteId || null, remoteUrl: res.url || null,
      error: null, workerId: null, leaseExpiresAt: null, nextRetryAt: null,
      attempts: (post.attempts || 0) + 1, updatedAt: new Date(),
    }).where(eq(socialPosts.id, post.id));

    try {
      broadcast(post.workspaceId, 'social.published', { id: post.id, platform: post.platform, url: res.url });
      emitWebhook({ workspaceId: post.workspaceId, event: 'social.published',
        payload: { id: post.id, platform: post.platform, url: res.url } }).catch(() => {});
      await db.insert(auditLog).values({ id: newId('a_'), userId: post.createdById || null,
        action: 'social.publish', target: post.id, meta: JSON.stringify({ platform: post.platform, url: res.url }) });
    } catch {}

    return { ok: true, url: res.url, remoteId: res.remoteId };
  } catch (e) {
    // Mark the account as errored if the adapter says creds are dead.
    if (/reconnect|expired|not connected/i.test(e.message || '')) {
      await db.update(socialAccounts).set({ status: 'error', lastError: String(e.message).slice(0, 300), updatedAt: new Date() })
        .where(eq(socialAccounts.id, account.id)).catch(() => {});
    }
    return markFailed(post, e.message);
  }
}
