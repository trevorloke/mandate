// Social (Beacon) routes — connected accounts + compose/schedule/publish.
//   GET    /api/social/providers           provider catalogue (for connect UI)
//   GET    /api/social/accounts            connected accounts (no secrets)
//   POST   /api/social/accounts/connect    connect an account (editor+)
//   POST   /api/social/accounts/:id/verify re-verify an account (editor+)
//   DELETE /api/social/accounts/:id        disconnect (editor+)
//   GET    /api/social/posts[?status=]     posts, grouped by compose batch
//   POST   /api/social/posts               compose → publish now or schedule (editor+)
//   POST   /api/social/posts/:groupId/cancel   cancel a scheduled group (editor+)
//   POST   /api/social/posts/:id/retry         retry a failed post (editor+)
import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { and, eq, desc, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { socialAccounts, socialPosts, auditLog } from '../db/schema.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { encryptJson } from '../lib/crypto.js';
import { getProvider, providerCatalog } from '../lib/social/index.js';
import { publishPost } from '../lib/social/publish.js';
import { broadcast } from '../lib/realtime.js';

const newId = (p) => p + randomBytes(12).toString('hex');

const app = new Hono();
app.use('*', requireAuth);

// ── sanitizers (never leak credentials) ──
const pubAccount = (a) => ({
  id: a.id, platform: a.platform, handle: a.handle, displayName: a.displayName,
  avatarUrl: a.avatarUrl, status: a.status, lastError: a.lastError,
  lastVerifiedAt: a.lastVerifiedAt, createdAt: a.createdAt,
});
const pubPost = (p) => ({
  id: p.id, groupId: p.groupId, accountId: p.accountId, platform: p.platform,
  body: p.body, status: p.status, scheduledAt: p.scheduledAt, publishedAt: p.publishedAt,
  remoteUrl: p.remoteUrl, error: p.error, createdAt: p.createdAt,
});

// ── providers ──
app.get('/providers', (c) => c.json({ providers: providerCatalog() }));

// ── accounts ──
app.get('/accounts', async (c) => {
  const me = c.get('user');
  const rows = await db.select().from(socialAccounts)
    .where(eq(socialAccounts.workspaceId, me.workspaceId))
    .orderBy(desc(socialAccounts.createdAt));
  return c.json({ accounts: rows.map(pubAccount) });
});

app.post('/accounts/connect', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { platform, ...input } = body;
  const prov = getProvider(platform);
  if (!prov) return c.json({ error: 'unknown platform' }, 400);

  let acct;
  try { acct = await prov.adapter.connect(input); }
  catch (e) { return c.json({ error: e.message || 'connection failed' }, 400); }

  const id = newId('sa_');
  await db.insert(socialAccounts).values({
    id, workspaceId: me.workspaceId,
    platform: acct.platform || platform,
    handle: acct.handle, displayName: acct.displayName, avatarUrl: acct.avatarUrl,
    remoteId: acct.remoteId, instanceUrl: acct.instanceUrl,
    credentials: encryptJson(acct.credentials), scopes: acct.scopes || null,
    status: 'connected', lastVerifiedAt: new Date(), createdById: me.id,
  });
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'social.account.connect',
    target: id, meta: JSON.stringify({ platform: acct.platform || platform, handle: acct.handle }) });

  const fresh = (await db.select().from(socialAccounts).where(eq(socialAccounts.id, id)).limit(1))[0];
  try { broadcast(me.workspaceId, 'social.account', { id, action: 'connected' }); } catch {}
  return c.json({ ok: true, account: pubAccount(fresh) });
});

app.post('/accounts/:id/verify', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const row = (await db.select().from(socialAccounts)
    .where(and(eq(socialAccounts.id, id), eq(socialAccounts.workspaceId, me.workspaceId))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  // Lightweight: mark verified now. (Per-platform live re-check can be added later.)
  await db.update(socialAccounts).set({ status: 'connected', lastError: null, lastVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(socialAccounts.id, id));
  return c.json({ ok: true });
});

app.delete('/accounts/:id', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const row = (await db.select().from(socialAccounts)
    .where(and(eq(socialAccounts.id, id), eq(socialAccounts.workspaceId, me.workspaceId))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  await db.delete(socialAccounts).where(eq(socialAccounts.id, id));
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'social.account.disconnect', target: id });
  try { broadcast(me.workspaceId, 'social.account', { id, action: 'disconnected' }); } catch {}
  return c.json({ ok: true });
});

// ── posts ──
app.get('/posts', async (c) => {
  const me = c.get('user');
  const status = c.req.query('status');
  const where = status
    ? and(eq(socialPosts.workspaceId, me.workspaceId), eq(socialPosts.status, status))
    : eq(socialPosts.workspaceId, me.workspaceId);
  const rows = await db.select().from(socialPosts).where(where).orderBy(desc(socialPosts.createdAt)).limit(500);

  // Group by compose batch for display.
  const groups = new Map();
  for (const p of rows) {
    if (!groups.has(p.groupId)) {
      groups.set(p.groupId, {
        groupId: p.groupId, body: p.body, createdAt: p.createdAt,
        scheduledAt: p.scheduledAt, targets: [],
      });
    }
    groups.get(p.groupId).targets.push(pubPost(p));
  }
  return c.json({ groups: Array.from(groups.values()), posts: rows.map(pubPost) });
});

app.post('/posts', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const { body = '', targets = [], scheduledAt = null, publishNow = false } = await c.req.json().catch(() => ({}));
  const text = String(body || '').trim();
  if (!text) return c.json({ error: 'post body is empty' }, 400);
  if (!Array.isArray(targets) || targets.length === 0) return c.json({ error: 'select at least one account' }, 400);

  const accts = await db.select().from(socialAccounts)
    .where(and(eq(socialAccounts.workspaceId, me.workspaceId), inArray(socialAccounts.id, targets)));
  if (accts.length === 0) return c.json({ error: 'no matching accounts' }, 400);

  // Per-platform length guard.
  for (const a of accts) {
    const lim = getProvider(a.platform)?.charLimit;
    if (lim && [...text].length > lim) {
      return c.json({ error: `Too long for ${a.platform} (${[...text].length}/${lim}).` }, 400);
    }
  }

  const when = (!publishNow && scheduledAt) ? new Date(scheduledAt) : null;
  if (when && isNaN(when.getTime())) return c.json({ error: 'invalid schedule time' }, 400);

  const groupId = newId('sg_');
  // publishNow → mark scheduled-now, publish inline below. Otherwise scheduled or draft.
  const status = publishNow ? 'scheduled' : (when ? 'scheduled' : 'draft');
  const rows = accts.map((a) => ({
    id: newId('sp_'), workspaceId: me.workspaceId, groupId, accountId: a.id, platform: a.platform,
    body: text, status, scheduledAt: publishNow ? new Date() : when, createdById: me.id,
  }));
  await db.insert(socialPosts).values(rows);
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'social.post.create',
    target: groupId, meta: JSON.stringify({ count: rows.length, publishNow: !!publishNow, scheduled: !!when }) });

  let results = null;
  if (publishNow) {
    results = [];
    for (const r of rows) {
      const res = await publishPost(r.id);
      results.push({ id: r.id, platform: r.platform, ...res });
    }
  }
  try { broadcast(me.workspaceId, 'social.post', { groupId, action: publishNow ? 'published' : (when ? 'scheduled' : 'drafted') }); } catch {}

  const fresh = await db.select().from(socialPosts).where(eq(socialPosts.groupId, groupId));
  return c.json({ ok: true, groupId, posts: fresh.map(pubPost), results });
});

app.post('/posts/:groupId/cancel', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const groupId = c.req.param('groupId');
  const rows = await db.select().from(socialPosts)
    .where(and(eq(socialPosts.workspaceId, me.workspaceId), eq(socialPosts.groupId, groupId)));
  if (!rows.length) return c.json({ error: 'not found' }, 404);
  const cancelable = rows.filter((r) => ['scheduled', 'draft', 'failed'].includes(r.status));
  for (const r of cancelable) {
    await db.update(socialPosts).set({ status: 'canceled', updatedAt: new Date() }).where(eq(socialPosts.id, r.id));
  }
  return c.json({ ok: true, canceled: cancelable.length });
});

app.post('/posts/:id/retry', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const row = (await db.select().from(socialPosts)
    .where(and(eq(socialPosts.id, id), eq(socialPosts.workspaceId, me.workspaceId))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  if (!['failed', 'canceled'].includes(row.status)) return c.json({ error: 'only failed/canceled posts can be retried' }, 400);
  const res = await publishPost(id);
  const fresh = (await db.select().from(socialPosts).where(eq(socialPosts.id, id)).limit(1))[0];
  return c.json({ ok: res.ok, result: res, post: pubPost(fresh) });
});

export default app;
