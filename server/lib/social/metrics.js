// Pull engagement metrics for published posts and store them on the row.
// Used by the on-demand refresh route and the periodic worker pass.
import { and, eq, gt, isNotNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { socialAccounts, socialPosts } from '../../db/schema.js';
import { getProvider } from './index.js';
import { getApp } from './oauth.js';
import { encryptJson, decryptJson } from '../crypto.js';
import { randomBytes } from 'crypto';
import { sqlite } from '../../db/index.js';

export async function refreshMetrics(postId) {
  const post = (await db.select().from(socialPosts).where(eq(socialPosts.id, postId)).limit(1))[0];
  if (!post || post.status !== 'published' || !post.remoteId) return { ok: false, error: 'not published' };
  const account = post.accountId
    ? (await db.select().from(socialAccounts).where(eq(socialAccounts.id, post.accountId)).limit(1))[0]
    : null;
  if (!account) return { ok: false, error: 'account removed' };
  const prov = getProvider(post.platform);
  if (!prov?.adapter?.metrics) return { ok: false, error: 'metrics unsupported' };

  try {
    const creds = decryptJson(account.credentials);
    const app = prov.connect === 'oauth' ? await getApp(account.workspaceId, post.platform).catch(() => null) : null;
    const res = await prov.adapter.metrics({ ...account, credentials: creds, _app: app }, post.remoteId);
    if (res.credentials) {
      await db.update(socialAccounts).set({ credentials: encryptJson(res.credentials), updatedAt: new Date() })
        .where(eq(socialAccounts.id, account.id));
    }
    const metricsJson = JSON.stringify(res.metrics || {});
    await db.update(socialPosts).set({ metricsJson, metricsAt: new Date(), updatedAt: new Date() })
      .where(eq(socialPosts.id, post.id));
    // Append to the time series when the numbers actually moved (always keep
    // the first snapshot so velocity has a baseline).
    try {
      if (post.metricsJson !== metricsJson || !post.metricsAt) {
        sqlite.prepare('INSERT INTO social_metrics_history (id, workspace_id, post_id, metrics_json) VALUES (?,?,?,?)')
          .run('mh_' + randomBytes(12).toString('hex'), post.workspaceId, post.id, metricsJson);
      }
    } catch { /* history is best-effort */ }
    return { ok: true, metrics: res.metrics };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Periodic pass: refresh a small batch of recently-published posts whose
// metrics are stale (or never fetched). Keeps API usage modest.
export async function refreshStaleMetrics({ maxAgeDays = 14, staleMs = 60 * 60 * 1000, batch = 25 } = {}) {
  const since = new Date(Date.now() - maxAgeDays * 86400_000);
  const staleBefore = new Date(Date.now() - staleMs);
  const rows = await db.select({ id: socialPosts.id, metricsAt: socialPosts.metricsAt }).from(socialPosts)
    .where(and(
      eq(socialPosts.status, 'published'),
      isNotNull(socialPosts.remoteId),
      gt(socialPosts.publishedAt, since),
    ))
    .limit(200);
  const due = rows.filter((r) => !r.metricsAt || new Date(r.metricsAt) < staleBefore).slice(0, batch);
  for (const r of due) {
    try { await refreshMetrics(r.id); } catch { /* skip one */ }
  }
  return due.length;
}
