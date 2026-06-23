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
import { db, sqlite } from '../db/index.js';
import { socialAccounts, socialPosts, socialApps, socialInbox, socialTemplates, socialLinks, socialFeeds, socialKeywords, socialListening, users, workspaces, auditLog } from '../db/schema.js';
import { syncFeed } from '../lib/social/feeds.js';
import { syncListening } from '../lib/social/listening.js';
import { getWorkspaceSlots, setWorkspaceSlots, nextQueueTime } from '../lib/social/slots.js';
import { bestTimes, nextBestTime } from '../lib/social/besttime.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { encrypt, encryptJson } from '../lib/crypto.js';
import { getProvider, providerCatalog } from '../lib/social/index.js';
import { buildAuthorizeUrl, handleCallback, getApp } from '../lib/social/oauth.js';
import { publishInline } from '../lib/social/publish.js';
import { saveMedia, getMedia, isAllowedMime, MAX_BYTES } from '../lib/social/media.js';
import { generateCaption, suggestReply, aiConfigured } from '../lib/social/assist.js';
import { refreshMetrics } from '../lib/social/metrics.js';
import { checkAccountHealth } from '../lib/social/health.js';
import { syncAllInboxes, replyToItem } from '../lib/social/inbox.js';
import { getWorkerStatus } from '../lib/social-worker.js';
import { peek, limitFor } from '../lib/social/ratelimit.js';
import { socialAnalyticsCsv } from '../lib/social/report.js';
import { broadcast } from '../lib/realtime.js';

const newId = (p) => p + randomBytes(12).toString('hex');
const safeJson = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

// Load a workspace row + its parsed settings blob (postingSlots, brandVoice, …).
async function getWsSettings(workspaceId) {
  const ws = (await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1))[0];
  return { ws, settings: safeJson(ws?.settings) };
}

const app = new Hono();

// ── OAuth callback (PUBLIC — provider redirect, verified by signed state).
// Registered BEFORE requireAuth so it does not require the session cookie.
app.get('/oauth/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const err = c.req.query('error');
  const fail = (msg) => c.redirect(`/?social_error=${encodeURIComponent(msg)}`);
  if (err) return fail(c.req.query('error_description') || err);
  if (!code || !state) return fail('missing code or state');
  try {
    const r = await handleCallback({ code, state });
    const dest = (r.returnTo && r.returnTo.startsWith('/')) ? r.returnTo : '/';
    return c.redirect(`${dest}${dest.includes('?') ? '&' : '?'}social_connected=${encodeURIComponent(r.platform)}`);
  } catch (e) {
    return fail(e.message || 'connection failed');
  }
});

// ── Media serving (PUBLIC — platforms like Facebook/Instagram fetch by URL).
app.get('/media/:id', async (c) => {
  const m = getMedia(c.req.param('id'));
  if (!m) return c.json({ error: 'not found' }, 404);
  return c.body(m.data, 200, {
    'Content-Type': m.mime,
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
});

// Everything below requires an authenticated session.
app.use('*', requireAuth);

// ── Media upload (multipart) → returns id + public url ──
app.post('/media', requireRole('editor'), async (c) => {
  const me = c.get('user');
  let body;
  try { body = await c.req.parseBody(); } catch { return c.json({ error: 'invalid upload' }, 400); }
  const file = body.file || body.image;
  if (!file || typeof file === 'string') return c.json({ error: 'no file provided' }, 400);
  if (!isAllowedMime(file.type)) return c.json({ error: 'unsupported image type' }, 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_BYTES) return c.json({ error: 'image too large (max 10MB)' }, 413);

  const saved = saveMedia({ workspaceId: me.workspaceId, userId: me.id, mime: file.type, filename: file.name, bytes });
  const origin = new URL(c.req.url).origin;
  return c.json({ ok: true, media: { id: saved.id, mime: saved.mime, size: saved.size, url: `${origin}/api/social/media/${saved.id}` } });
});

// ── sanitizers (never leak credentials) ──
const pubAccount = (a) => ({
  id: a.id, platform: a.platform, handle: a.handle, displayName: a.displayName,
  avatarUrl: a.avatarUrl, status: a.status, lastError: a.lastError,
  lastVerifiedAt: a.lastVerifiedAt, createdAt: a.createdAt,
});
const safeParse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
const pubPost = (p) => ({
  id: p.id, groupId: p.groupId, accountId: p.accountId, platform: p.platform,
  body: p.body, status: p.status, scheduledAt: p.scheduledAt, publishedAt: p.publishedAt,
  remoteUrl: p.remoteUrl, error: p.error, createdAt: p.createdAt,
  attempts: p.attempts, nextRetryAt: p.nextRetryAt,
  media: safeParse(p.mediaJson) || [], metrics: safeParse(p.metricsJson), metricsAt: p.metricsAt,
});

// ── providers (with per-workspace "developer app configured" flag) ──
app.get('/providers', async (c) => {
  const me = c.get('user');
  const rows = await db.select().from(socialApps).where(eq(socialApps.workspaceId, me.workspaceId));
  const configured = new Set(rows.filter((r) => r.clientId && r.active).map((r) => r.platform));
  return c.json({ providers: providerCatalog().map((p) => ({ ...p, configured: configured.has(p.id) })), aiAvailable: aiConfigured() });
});

// ── AI caption assist ──
app.post('/assist', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const { draft = '', mode = 'improve', platform = '', charLimit = null } = await c.req.json().catch(() => ({}));
  if (!String(draft).trim() && mode !== 'generate') return c.json({ error: 'nothing to work with' }, 400);
  try {
    const { settings } = await getWsSettings(me.workspaceId);
    const r = await generateCaption({ draft, mode, platform, charLimit, brandVoice: settings.brandVoice || '' });
    return c.json({ ok: true, text: r.text });
  } catch (e) {
    return c.json({ error: e.message, code: e.code || null }, e.code === 'no_key' ? 503 : 400);
  }
});

// ── AI brand voice (per-workspace guidelines fed into every generation) ──
app.get('/brand-voice', async (c) => {
  const me = c.get('user');
  const { settings } = await getWsSettings(me.workspaceId);
  return c.json({ brandVoice: settings.brandVoice || '' });
});

app.put('/brand-voice', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const { brandVoice = '' } = await c.req.json().catch(() => ({}));
  const { ws, settings } = await getWsSettings(me.workspaceId);
  if (!ws) return c.json({ error: 'workspace not found' }, 404);
  const clean = String(brandVoice || '').slice(0, 2000);
  await db.update(workspaces)
    .set({ settings: JSON.stringify({ ...settings, brandVoice: clean }), updatedAt: new Date() })
    .where(eq(workspaces.id, me.workspaceId));
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'social.brand_voice.save', target: me.workspaceId });
  return c.json({ ok: true, brandVoice: clean });
});

// ── developer apps (client id/secret per platform; secret encrypted) ──
app.get('/apps', async (c) => {
  const me = c.get('user');
  const origin = new URL(c.req.url).origin;
  const rows = await db.select().from(socialApps).where(eq(socialApps.workspaceId, me.workspaceId));
  const apps = {};
  for (const r of rows) {
    apps[r.platform] = { platform: r.platform, clientId: r.clientId, hasSecret: !!r.clientSecret, active: !!r.active, extra: safeJson(r.extra) };
  }
  return c.json({ apps, redirectUri: `${origin}/api/social/oauth/callback` });
});

app.put('/apps/:platform', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const platform = c.req.param('platform');
  if (!getProvider(platform)) return c.json({ error: 'unknown platform' }, 400);
  const { clientId, clientSecret, extra } = await c.req.json().catch(() => ({}));
  const existing = (await db.select().from(socialApps)
    .where(and(eq(socialApps.workspaceId, me.workspaceId), eq(socialApps.platform, platform))).limit(1))[0];

  const values = {
    clientId: clientId ?? existing?.clientId ?? null,
    extra: JSON.stringify(extra || safeJson(existing?.extra) || {}),
    active: true,
  };
  // Only overwrite the secret when a new one is supplied (so editing other
  // fields doesn't wipe it). Encrypted at rest.
  if (clientSecret) values.clientSecret = encrypt(clientSecret);
  else if (existing) values.clientSecret = existing.clientSecret;

  if (existing) await db.update(socialApps).set(values).where(eq(socialApps.id, existing.id));
  else await db.insert(socialApps).values({ id: newId('app_'), workspaceId: me.workspaceId, platform, ...values });
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'social.app.save', target: platform });
  return c.json({ ok: true });
});

app.delete('/apps/:platform', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const platform = c.req.param('platform');
  await db.delete(socialApps).where(and(eq(socialApps.workspaceId, me.workspaceId), eq(socialApps.platform, platform)));
  return c.json({ ok: true });
});

// ── OAuth connect: redirect the browser to the provider's authorize page ──
app.get('/connect/:platform/start', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const platform = c.req.param('platform');
  const prov = getProvider(platform);
  if (!prov || prov.connect !== 'oauth') return c.json({ error: 'platform does not use OAuth connect' }, 400);
  const devApp = await getApp(me.workspaceId, platform);
  if (!devApp || !devApp.clientId) return c.json({ error: 'configure the developer app first (Beacon → Settings)' }, 400);

  const origin = new URL(c.req.url).origin;
  const redirectUri = `${origin}/api/social/oauth/callback`;
  const returnTo = c.req.query('returnTo') || '/';
  try {
    const url = await buildAuthorizeUrl({ provider: prov, app: devApp, workspaceId: me.workspaceId, userId: me.id, redirectUri, returnTo });
    return c.redirect(url);
  } catch (e) {
    return c.json({ error: e.message || 'could not start OAuth' }, 400);
  }
});

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
  const res = await checkAccountHealth(id); // live token check + status update
  const fresh = (await db.select().from(socialAccounts).where(eq(socialAccounts.id, id)).limit(1))[0];
  return c.json({ ok: res.ok, error: res.error || null, account: pubAccount(fresh) });
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
        scheduledAt: p.scheduledAt, status: p.status, targets: [],
      });
    }
    groups.get(p.groupId).targets.push(pubPost(p));
  }
  return c.json({ groups: Array.from(groups.values()), posts: rows.map(pubPost) });
});

app.post('/posts', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const { body = '', targets = [], scheduledAt: scheduledAtRaw = null, publishNow = false, media = [], saveDraft = false, submitForApproval = false, thread = null, queue = false, bestTime = false } = await c.req.json().catch(() => ({}));
  // Queue mode: server picks the next free posting slot for this workspace.
  // Best-time mode: server picks the next high-engagement window from history.
  let scheduledAt = scheduledAtRaw;
  if (queue && !publishNow) {
    const q = await nextQueueTime(me.workspaceId, { sqlite });
    if (q.error) return c.json({ error: q.error }, 400);
    scheduledAt = q.time.toISOString();
  } else if (bestTime && !publishNow) {
    const b = await nextBestTime(me.workspaceId, {});
    if (b.error) return c.json({ error: b.error }, 400);
    scheduledAt = b.time.toISOString();
  }
  // A thread is an array of segment strings; the first segment is the head/body.
  const threadSegs = Array.isArray(thread) ? thread.map((s) => String(s || '').trim()).filter(Boolean) : null;
  const isThread = threadSegs && threadSegs.length > 1;
  const text = isThread ? threadSegs[0] : String(body || '').trim();
  const mediaRefs = Array.isArray(media) ? media.filter((m) => m && m.id).map((m) => ({ id: m.id, mime: m.mime, alt: m.alt ? String(m.alt).slice(0, 1000) : undefined })) : [];
  if (!text && mediaRefs.length === 0) return c.json({ error: 'post is empty' }, 400);
  if (!Array.isArray(targets) || targets.length === 0) return c.json({ error: 'select at least one account' }, 400);

  const accts = await db.select().from(socialAccounts)
    .where(and(eq(socialAccounts.workspaceId, me.workspaceId), inArray(socialAccounts.id, targets)));
  if (accts.length === 0) return c.json({ error: 'no matching accounts' }, 400);

  // Per-platform guards: length, and Instagram requires an image.
  for (const a of accts) {
    const lim = getProvider(a.platform)?.charLimit;
    if (lim && [...text].length > lim) {
      return c.json({ error: `Too long for ${a.platform} (${[...text].length}/${lim}).` }, 400);
    }
    if (a.platform === 'instagram' && mediaRefs.length === 0) {
      return c.json({ error: 'Instagram posts require an image.' }, 400);
    }
  }

  const when = (!publishNow && scheduledAt) ? new Date(scheduledAt) : null;
  if (when && isNaN(when.getTime())) return c.json({ error: 'invalid schedule time' }, 400);

  const groupId = newId('sg_');
  // Status by intent. draft/pending keep any `when` so it can be scheduled on
  // publish/approval; publishNow is marked scheduled-now and published inline.
  let status;
  // publishNow is inserted as a draft (which the worker never claims) and then
  // published inline below — this closes the insert→publish window where the
  // worker could otherwise claim a 'scheduled,now' row and double-post.
  if (publishNow) status = 'draft';
  else if (submitForApproval) status = 'pending';
  else if (saveDraft) status = 'draft';
  else if (when) status = 'scheduled';
  else status = 'draft';
  const mediaJson = mediaRefs.length ? JSON.stringify(mediaRefs) : null;
  const threadJson = isThread ? JSON.stringify(threadSegs) : null;
  const rows = accts.map((a) => ({
    id: newId('sp_'), workspaceId: me.workspaceId, groupId, accountId: a.id, platform: a.platform,
    body: text, mediaJson, threadJson, status, scheduledAt: publishNow ? null : when, createdById: me.id,
  }));
  await db.insert(socialPosts).values(rows);
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'social.post.create',
    target: groupId, meta: JSON.stringify({ count: rows.length, status }) });

  let results = null;
  if (publishNow) {
    results = [];
    for (const r of rows) {
      const res = await publishInline(r.id);
      results.push({ id: r.id, platform: r.platform, ...res });
    }
  }
  try { broadcast(me.workspaceId, 'social.post', { groupId, action: publishNow ? 'published' : status }); } catch {}

  const fresh = await db.select().from(socialPosts).where(eq(socialPosts.groupId, groupId));
  return c.json({ ok: true, groupId, posts: fresh.map(pubPost), results });
});

app.post('/posts/:groupId/cancel', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const groupId = c.req.param('groupId');
  const rows = await db.select().from(socialPosts)
    .where(and(eq(socialPosts.workspaceId, me.workspaceId), eq(socialPosts.groupId, groupId)));
  if (!rows.length) return c.json({ error: 'not found' }, 404);
  const cancelable = rows.filter((r) => ['scheduled', 'draft', 'failed', 'pending', 'rejected'].includes(r.status));
  for (const r of cancelable) {
    await db.update(socialPosts).set({ status: 'canceled', updatedAt: new Date() }).where(eq(socialPosts.id, r.id));
  }
  return c.json({ ok: true, canceled: cancelable.length });
});

// Helper: load a workspace's posts for a group.
async function groupPosts(workspaceId, groupId) {
  return db.select().from(socialPosts)
    .where(and(eq(socialPosts.workspaceId, workspaceId), eq(socialPosts.groupId, groupId)));
}

// Submit a draft (or rejected) group for approval → pending.
// Reschedule a group to a new time (drag-to-reschedule on the calendar).
app.post('/posts/:groupId/reschedule', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const groupId = c.req.param('groupId');
  const { scheduledAt } = await c.req.json().catch(() => ({}));
  const when = scheduledAt ? new Date(scheduledAt) : null;
  if (!when || isNaN(when.getTime())) return c.json({ error: 'invalid time' }, 400);
  const rows = await groupPosts(me.workspaceId, groupId);
  if (!rows.length) return c.json({ error: 'not found' }, 404);
  const targetable = rows.filter((r) => ['scheduled', 'draft', 'pending'].includes(r.status));
  for (const r of targetable) {
    await db.update(socialPosts).set({ scheduledAt: when, status: r.status === 'draft' ? 'scheduled' : r.status, updatedAt: new Date() }).where(eq(socialPosts.id, r.id));
  }
  return c.json({ ok: true, rescheduled: targetable.length });
});

app.post('/posts/:groupId/submit', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const groupId = c.req.param('groupId');
  const rows = await groupPosts(me.workspaceId, groupId);
  if (!rows.length) return c.json({ error: 'not found' }, 404);
  const targetable = rows.filter((r) => ['draft', 'rejected'].includes(r.status));
  for (const r of targetable) {
    await db.update(socialPosts).set({ status: 'pending', error: null, updatedAt: new Date() }).where(eq(socialPosts.id, r.id));
  }
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'social.post.submit', target: groupId });
  try { broadcast(me.workspaceId, 'social.post', { groupId, action: 'pending' }); } catch {}
  return c.json({ ok: true, submitted: targetable.length });
});

// Approve a pending group (admin) → schedule if future, else publish now.
app.post('/posts/:groupId/approve', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const groupId = c.req.param('groupId');
  const rows = await groupPosts(me.workspaceId, groupId);
  if (!rows.length) return c.json({ error: 'not found' }, 404);
  const pending = rows.filter((r) => r.status === 'pending');
  const results = [];
  for (const r of pending) {
    const future = r.scheduledAt && new Date(r.scheduledAt).getTime() > Date.now();
    if (future) {
      await db.update(socialPosts).set({ status: 'scheduled', updatedAt: new Date() }).where(eq(socialPosts.id, r.id));
    } else {
      const res = await publishInline(r.id);
      results.push({ id: r.id, platform: r.platform, ...res });
    }
  }
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'social.post.approve', target: groupId, meta: JSON.stringify({ count: pending.length }) });
  try { broadcast(me.workspaceId, 'social.post', { groupId, action: 'approved' }); } catch {}
  return c.json({ ok: true, approved: pending.length, results: results.length ? results : null });
});

// Reject a pending group (admin).
app.post('/posts/:groupId/reject', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const groupId = c.req.param('groupId');
  const { reason = '' } = await c.req.json().catch(() => ({}));
  const rows = await groupPosts(me.workspaceId, groupId);
  if (!rows.length) return c.json({ error: 'not found' }, 404);
  const pending = rows.filter((r) => r.status === 'pending');
  for (const r of pending) {
    await db.update(socialPosts).set({ status: 'rejected', error: String(reason || 'rejected').slice(0, 300), updatedAt: new Date() }).where(eq(socialPosts.id, r.id));
  }
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'social.post.reject', target: groupId });
  try { broadcast(me.workspaceId, 'social.post', { groupId, action: 'rejected' }); } catch {}
  return c.json({ ok: true, rejected: pending.length });
});

// Publish a draft/pending/rejected/scheduled/failed group right now (editor).
app.post('/posts/:groupId/publish', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const groupId = c.req.param('groupId');
  const rows = await groupPosts(me.workspaceId, groupId);
  if (!rows.length) return c.json({ error: 'not found' }, 404);
  const sendable = rows.filter((r) => ['draft', 'pending', 'rejected', 'scheduled', 'failed'].includes(r.status));
  const results = [];
  for (const r of sendable) {
    const res = await publishInline(r.id);
    results.push({ id: r.id, platform: r.platform, ...res });
  }
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'social.post.publish', target: groupId });
  try { broadcast(me.workspaceId, 'social.post', { groupId, action: 'published' }); } catch {}
  return c.json({ ok: true, results });
});

// Aggregate analytics across all published posts (powers the Performance tab).
app.get('/analytics', async (c) => {
  const me = c.get('user');
  const rows = await db.select().from(socialPosts)
    .where(and(eq(socialPosts.workspaceId, me.workspaceId), eq(socialPosts.status, 'published')));

  const FIELDS = ['likes', 'reposts', 'replies', 'comments', 'shares', 'impressions'];
  const blank = () => ({ posts: 0, likes: 0, reposts: 0, replies: 0, comments: 0, shares: 0, impressions: 0 });
  const engOf = (m) => (m.likes || 0) + (m.reposts || 0) + (m.replies || 0) + (m.comments || 0) + (m.shares || 0);
  const add = (acc, m) => { acc.posts++; for (const k of FIELDS) acc[k] += (m?.[k] || 0); };

  const totals = blank();
  const byPlat = {};
  const scored = [];
  for (const p of rows) {
    const m = safeParse(p.metricsJson) || {};
    add(totals, m);
    (byPlat[p.platform] || (byPlat[p.platform] = blank()));
    add(byPlat[p.platform], m);
    scored.push({ id: p.id, platform: p.platform, body: p.body, remoteUrl: p.remoteUrl, metrics: m, engagement: engOf(m), publishedAt: p.publishedAt });
  }
  totals.engagement = engOf(totals);
  const byPlatform = Object.entries(byPlat)
    .map(([platform, v]) => ({ platform, ...v, engagement: engOf(v) }))
    .sort((a, b) => b.engagement - a.engagement);
  const top = scored.filter((s) => s.engagement > 0).sort((a, b) => b.engagement - a.engagement).slice(0, 5);

  // Audience growth: latest follower count + 30-day series per account.
  const audience = [];
  try {
    const accts = await db.select().from(socialAccounts).where(eq(socialAccounts.workspaceId, me.workspaceId));
    const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const snapRows = sqlite.prepare(
      'SELECT account_id, day, followers FROM social_audience WHERE workspace_id = ? AND day >= ? ORDER BY day'
    ).all(me.workspaceId, since);
    const byAcct = {};
    for (const r of snapRows) (byAcct[r.account_id] || (byAcct[r.account_id] = {}))[r.day] = r.followers;
    for (const a of accts) {
      const series = byAcct[a.id] || {};
      const days = Object.keys(series).sort();
      if (!days.length) continue;
      const latest = series[days[days.length - 1]];
      const first = series[days[0]];
      audience.push({ accountId: a.id, platform: a.platform, handle: a.handle, followers: latest, delta: latest - first, series });
    }
    audience.sort((x, y) => y.followers - x.followers);
  } catch { /* audience optional */ }

  return c.json({ totals, byPlatform, top, postCount: rows.length, audience });
});

// Download all published-post performance as a CSV (one row per post).
app.get('/analytics/export', async (c) => {
  const me = c.get('user');
  const csv = await socialAnalyticsCsv(me.workspaceId);
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="beacon-analytics-${new Date().toISOString().slice(0, 10)}.csv"`);
  return c.body(csv);
});

// ── Observability: worker liveness + queue depth + budgets + account health ──
// Powers the System/Health panel so operators can trust the publishing pipeline.
app.get('/status', async (c) => {
  const me = c.get('user');
  const ws = me.workspaceId;
  const now = Math.floor(Date.now() / 1000);

  // Queue depth (this workspace).
  const byStatus = {};
  for (const r of sqlite.prepare('SELECT status, COUNT(*) n FROM social_posts WHERE workspace_id = ? GROUP BY status').all(ws)) {
    byStatus[r.status] = r.n;
  }
  const one = (sql, ...args) => sqlite.prepare(sql).get(ws, ...args).n;
  const dueNow = one("SELECT COUNT(*) n FROM social_posts WHERE workspace_id=? AND status='scheduled' AND scheduled_at IS NOT NULL AND scheduled_at<=?", now);
  // Scheduled, past due by >2 min and still not picked up → worker may be behind.
  const overdue = one("SELECT COUNT(*) n FROM social_posts WHERE workspace_id=? AND status='scheduled' AND scheduled_at IS NOT NULL AND scheduled_at<?", now - 120);
  const retrying = one("SELECT COUNT(*) n FROM social_posts WHERE workspace_id=? AND status='failed' AND next_retry_at IS NOT NULL", );
  const failedTerminal = one("SELECT COUNT(*) n FROM social_posts WHERE workspace_id=? AND status='failed' AND next_retry_at IS NULL", );
  // Stuck in 'publishing' with an expired lease → a crashed/slow publish.
  const stuck = one("SELECT COUNT(*) n FROM social_posts WHERE workspace_id=? AND status='publishing' AND lease_expires_at IS NOT NULL AND lease_expires_at<?", now);
  const nextRow = sqlite.prepare("SELECT MIN(scheduled_at) m FROM social_posts WHERE workspace_id=? AND status='scheduled' AND scheduled_at IS NOT NULL AND scheduled_at>?").get(ws, now);

  // Account health + rate-limit budgets for each connected platform.
  const accounts = sqlite.prepare(
    'SELECT id, platform, handle, status, last_error AS lastError, last_verified_at AS lastVerifiedAt FROM social_accounts WHERE workspace_id = ? ORDER BY platform'
  ).all(ws);
  const summary = { total: accounts.length, connected: 0, error: 0 };
  for (const a of accounts) { if (a.status === 'connected') summary.connected++; else if (a.status === 'error') summary.error++; }

  const platforms = [...new Set(accounts.filter((a) => a.status === 'connected').map((a) => a.platform))];
  const budgets = platforms.map((p) => {
    const lim = limitFor(p) || {};
    const b = peek(`${ws}:${p}`, lim);
    return { platform: p, tokens: Math.floor(b.tokens), capacity: b.capacity, refillPerMin: lim.refillPerMin ?? null };
  });

  // Recent failures for context (most recent first).
  const failures = sqlite.prepare(
    "SELECT id, platform, error, attempts, next_retry_at AS nextRetryAt, updated_at AS at FROM social_posts WHERE workspace_id=? AND status='failed' ORDER BY updated_at DESC LIMIT 10"
  ).all(ws);

  return c.json({
    serverTime: now,
    worker: getWorkerStatus(),
    queue: { byStatus, dueNow, overdue, retrying, failedTerminal, stuck, nextScheduledAt: nextRow?.m ?? null },
    accounts: { summary, list: accounts },
    budgets,
    failures,
  });
});

// Best-time-to-post suggestions from this workspace's own engagement history.
app.get('/best-times', async (c) => {
  const me = c.get('user');
  const platform = c.req.query('platform') || null;
  const { suggestions, grid, samples, tz } = await bestTimes(me.workspaceId, platform);
  return c.json({ suggestions, grid, samples, tz });
});

// Per-post metrics history (engagement over time).
app.get('/posts/:id/history', async (c) => {
  const me = c.get('user');
  const rows = sqlite.prepare(
    'SELECT metrics_json, captured_at FROM social_metrics_history WHERE workspace_id = ? AND post_id = ? ORDER BY captured_at'
  ).all(me.workspaceId, c.req.param('id'));
  return c.json({ history: rows.map((r) => ({ metrics: safeParse(r.metrics_json) || {}, capturedAt: r.captured_at })) });
});

// Refresh engagement metrics for all published posts in a compose group.
app.post('/posts/:groupId/metrics', async (c) => {
  const me = c.get('user');
  const groupId = c.req.param('groupId');
  const rows = await db.select().from(socialPosts)
    .where(and(eq(socialPosts.workspaceId, me.workspaceId), eq(socialPosts.groupId, groupId)));
  if (!rows.length) return c.json({ error: 'not found' }, 404);
  for (const r of rows) {
    if (r.status === 'published' && r.remoteId) { try { await refreshMetrics(r.id); } catch { /* skip */ } }
  }
  const fresh = await db.select().from(socialPosts).where(eq(socialPosts.groupId, groupId));
  return c.json({ ok: true, posts: fresh.map(pubPost) });
});

app.post('/posts/:id/retry', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const row = (await db.select().from(socialPosts)
    .where(and(eq(socialPosts.id, id), eq(socialPosts.workspaceId, me.workspaceId))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  if (!['failed', 'canceled'].includes(row.status)) return c.json({ error: 'only failed/canceled posts can be retried' }, 400);
  const res = await publishInline(id);
  const fresh = (await db.select().from(socialPosts).where(eq(socialPosts.id, id)).limit(1))[0];
  return c.json({ ok: res.ok, result: res, post: pubPost(fresh) });
});

// ── Engagement inbox ──
const pubInbox = (r) => ({
  id: r.id, accountId: r.accountId, platform: r.platform, type: r.type,
  authorHandle: r.authorHandle, authorName: r.authorName, authorAvatar: r.authorAvatar,
  text: r.text, url: r.url, status: r.status, assignedToId: r.assignedToId, remoteCreatedAt: r.remoteCreatedAt,
});

// Lightweight team roster for the inbox assignee picker (editor+; not the
// full admin user list).
app.get('/team', async (c) => {
  const me = c.get('user');
  const rows = await db.select().from(users).where(eq(users.workspaceId, me.workspaceId));
  return c.json({ team: rows.map((u) => ({ id: u.id, name: u.name, initials: u.initials })) });
});

app.get('/inbox', async (c) => {
  const me = c.get('user');
  const status = c.req.query('status');
  const assignee = c.req.query('assignee'); // 'me' | userId
  const conds = [eq(socialInbox.workspaceId, me.workspaceId)];
  if (status && status !== 'all') conds.push(eq(socialInbox.status, status));
  if (assignee === 'me') conds.push(eq(socialInbox.assignedToId, me.id));
  else if (assignee) conds.push(eq(socialInbox.assignedToId, assignee));
  const where = conds.length > 1 ? and(...conds) : conds[0];
  const rows = await db.select().from(socialInbox).where(where).orderBy(desc(socialInbox.remoteCreatedAt)).limit(200);
  const unread = (await db.select().from(socialInbox)
    .where(and(eq(socialInbox.workspaceId, me.workspaceId), eq(socialInbox.status, 'unread')))).length;
  return c.json({ items: rows.map(pubInbox), unread });
});

// Manual refresh — pull latest interactions now.
app.post('/inbox/sync', requireRole('editor'), async (c) => {
  const added = await syncAllInboxes();
  return c.json({ ok: true, added });
});

app.post('/inbox/:id/read', async (c) => {
  const me = c.get('user');
  await db.update(socialInbox).set({ status: 'read' })
    .where(and(eq(socialInbox.id, c.req.param('id')), eq(socialInbox.workspaceId, me.workspaceId)));
  return c.json({ ok: true });
});

app.post('/inbox/:id/assign', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const { userId = null } = await c.req.json().catch(() => ({}));
  // Validate the assignee is in this workspace (or null to unassign).
  if (userId) {
    const u = (await db.select().from(users).where(and(eq(users.id, userId), eq(users.workspaceId, me.workspaceId))).limit(1))[0];
    if (!u) return c.json({ error: 'unknown user' }, 400);
  }
  await db.update(socialInbox)
    .set({ assignedToId: userId, assignedAt: userId ? new Date() : null })
    .where(and(eq(socialInbox.id, c.req.param('id')), eq(socialInbox.workspaceId, me.workspaceId)));
  return c.json({ ok: true });
});

app.post('/inbox/:id/archive', async (c) => {
  const me = c.get('user');
  await db.update(socialInbox).set({ status: 'archived' })
    .where(and(eq(socialInbox.id, c.req.param('id')), eq(socialInbox.workspaceId, me.workspaceId)));
  return c.json({ ok: true });
});

app.post('/inbox/:id/reply', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const { text = '' } = await c.req.json().catch(() => ({}));
  if (!String(text).trim()) return c.json({ error: 'reply is empty' }, 400);
  const res = await replyToItem(c.req.param('id'), text, me.workspaceId);
  if (!res.ok) return c.json({ error: res.error || 'reply failed' }, 400);
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'social.inbox.reply', target: c.req.param('id') });
  return c.json({ ok: true, url: res.url });
});

// AI-drafted reply suggestion for an inbox item (does not send — fills the box).
app.post('/inbox/:id/suggest-reply', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const { tone = 'friendly' } = await c.req.json().catch(() => ({}));
  const item = (await db.select().from(socialInbox)
    .where(and(eq(socialInbox.id, c.req.param('id')), eq(socialInbox.workspaceId, me.workspaceId))).limit(1))[0];
  if (!item) return c.json({ error: 'not found' }, 404);
  try {
    const charLimit = getProvider(item.platform)?.charLimit || null;
    const { settings } = await getWsSettings(me.workspaceId);
    const { text } = await suggestReply({
      text: item.text || '', authorHandle: item.authorHandle, platform: item.platform,
      type: item.type, tone, charLimit, brandVoice: settings.brandVoice || '',
    });
    return c.json({ ok: true, text });
  } catch (e) {
    return c.json({ error: e.message, code: e.code || null }, e.code === 'no_key' ? 400 : 502);
  }
});

// ── Content library (reusable templates) ──
const pubTemplate = (t) => ({
  id: t.id, name: t.name, body: t.body, media: safeParse(t.mediaJson) || [],
  tags: safeParse(t.tags) || [], updatedAt: t.updatedAt,
});

app.get('/templates', async (c) => {
  const me = c.get('user');
  const rows = await db.select().from(socialTemplates)
    .where(eq(socialTemplates.workspaceId, me.workspaceId)).orderBy(desc(socialTemplates.updatedAt)).limit(200);
  return c.json({ templates: rows.map(pubTemplate) });
});

app.post('/templates', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const { name = '', body = '', media = [], tags = [] } = await c.req.json().catch(() => ({}));
  if (!String(name).trim()) return c.json({ error: 'name required' }, 400);
  const id = newId('tpl_');
  const mediaRefs = Array.isArray(media) ? media.filter((m) => m && m.id).map((m) => ({ id: m.id, mime: m.mime, alt: m.alt })) : [];
  await db.insert(socialTemplates).values({
    id, workspaceId: me.workspaceId, name: String(name).trim(), body: String(body || ''),
    mediaJson: mediaRefs.length ? JSON.stringify(mediaRefs) : null,
    tags: JSON.stringify(Array.isArray(tags) ? tags : []), createdById: me.id,
  });
  const fresh = (await db.select().from(socialTemplates).where(eq(socialTemplates.id, id)).limit(1))[0];
  return c.json({ ok: true, template: pubTemplate(fresh) });
});

app.put('/templates/:id', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const row = (await db.select().from(socialTemplates)
    .where(and(eq(socialTemplates.id, id), eq(socialTemplates.workspaceId, me.workspaceId))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  const { name, body, media, tags } = await c.req.json().catch(() => ({}));
  const updates = { updatedAt: new Date() };
  if (typeof name === 'string' && name.trim()) updates.name = name.trim();
  if (typeof body === 'string') updates.body = body;
  if (Array.isArray(media)) updates.mediaJson = media.length ? JSON.stringify(media.filter((m) => m && m.id).map((m) => ({ id: m.id, mime: m.mime, alt: m.alt }))) : null;
  if (Array.isArray(tags)) updates.tags = JSON.stringify(tags);
  await db.update(socialTemplates).set(updates).where(eq(socialTemplates.id, id));
  const fresh = (await db.select().from(socialTemplates).where(eq(socialTemplates.id, id)).limit(1))[0];
  return c.json({ ok: true, template: pubTemplate(fresh) });
});

app.delete('/templates/:id', requireRole('editor'), async (c) => {
  const me = c.get('user');
  await db.delete(socialTemplates)
    .where(and(eq(socialTemplates.id, c.req.param('id')), eq(socialTemplates.workspaceId, me.workspaceId)));
  return c.json({ ok: true });
});

// ── Short links + click tracking ──
const shortBase = (c) => (process.env.MANDATE_PUBLIC_URL || new URL(c.req.url).origin).replace(/\/$/, '');

function withUtm(url, utm) {
  if (!utm || typeof utm !== 'object') return url;
  try {
    const u = new URL(url);
    const map = { source: 'utm_source', medium: 'utm_medium', campaign: 'utm_campaign', content: 'utm_content', term: 'utm_term' };
    for (const [k, p] of Object.entries(map)) if (utm[k]) u.searchParams.set(p, String(utm[k]));
    return u.toString();
  } catch { return url; }
}

app.post('/shorten', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const { url, title = null, postId = null, utm = null } = await c.req.json().catch(() => ({}));
  if (!/^https?:\/\//i.test(String(url || ''))) return c.json({ error: 'a valid http(s) url is required' }, 400);
  const cleanUtm = utm && typeof utm === 'object'
    ? Object.fromEntries(['source', 'medium', 'campaign', 'content', 'term'].map((k) => [k, utm[k] ? String(utm[k]).trim() : '']).filter(([, v]) => v))
    : null;
  const target = withUtm(url, cleanUtm);
  // Random slug; retry once on the (vanishingly rare) unique collision.
  let slug, id = newId('sl_');
  for (let attempt = 0; attempt < 2; attempt++) {
    slug = randomBytes(5).toString('hex').slice(0, 7);
    try {
      await db.insert(socialLinks).values({ id, workspaceId: me.workspaceId, slug, targetUrl: target, title, postId, utm: cleanUtm && Object.keys(cleanUtm).length ? JSON.stringify(cleanUtm) : null, createdById: me.id });
      break;
    } catch (e) { if (attempt === 1) return c.json({ error: 'could not create link' }, 500); }
  }
  return c.json({ ok: true, id, slug, shortUrl: `${shortBase(c)}/l/${slug}`, targetUrl: target });
});

app.get('/links', async (c) => {
  const me = c.get('user');
  const rows = await db.select().from(socialLinks)
    .where(eq(socialLinks.workspaceId, me.workspaceId)).orderBy(desc(socialLinks.clicks)).limit(100);
  const base = shortBase(c);
  // 14-day clicks-per-day series per link (single grouped query over events).
  const since = Math.floor(Date.now() / 1000) - 14 * 86400;
  const series = {};
  try {
    const ids = rows.map((l) => l.id);
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      const events = sqlite.prepare(
        `SELECT link_id, date(created_at,'unixepoch') AS day, COUNT(*) AS n
         FROM social_link_clicks WHERE link_id IN (${placeholders}) AND created_at >= ?
         GROUP BY link_id, day`
      ).all(...ids, since);
      for (const e of events) { (series[e.link_id] || (series[e.link_id] = {}))[e.day] = e.n; }
    }
  } catch { /* series optional */ }
  return c.json({ links: rows.map((l) => ({
    id: l.id, slug: l.slug, shortUrl: `${base}/l/${l.slug}`, targetUrl: l.targetUrl,
    title: l.title, clicks: l.clicks, lastClickAt: l.lastClickAt,
    utm: safeParse(l.utm) || null, series: series[l.id] || {},
  })) });
});

// ── Bulk schedule from parsed CSV rows ──
// Each row: { body, accounts, scheduledAt?, thread? }. `accounts` is a
// comma/semicolon list matched against handle, platform, or account id.
app.post('/bulk', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const { rows = [] } = await c.req.json().catch(() => ({}));
  if (!Array.isArray(rows) || rows.length === 0) return c.json({ error: 'no rows' }, 400);

  const accts = await db.select().from(socialAccounts).where(eq(socialAccounts.workspaceId, me.workspaceId));
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/^@/, '');
  const byKey = {};
  for (const a of accts) {
    byKey[norm(a.id)] = a;
    if (a.handle) byKey[norm(a.handle)] = a;
    if (!byKey[norm(a.platform)]) byKey[norm(a.platform)] = a; // first account of a platform
  }

  const results = [];
  let created = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    const body = String(row.body || '').trim();
    const tokens = String(row.accounts || '').split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    const matched = []; const unmatched = [];
    for (const t of tokens) { const a = byKey[norm(t)]; if (a) matched.push(a); else unmatched.push(t); }
    const uniq = [...new Map(matched.map((a) => [a.id, a])).values()];

    const threadSegs = row.thread ? String(row.thread).split('||').map((s) => s.trim()).filter(Boolean) : null;
    const isThread = threadSegs && threadSegs.length > 1;
    if (!body && !isThread) { results.push({ row: i + 1, ok: false, error: 'empty body' }); continue; }
    if (uniq.length === 0) { results.push({ row: i + 1, ok: false, error: `no accounts matched: ${tokens.join(', ') || '(none)'}` }); continue; }
    const when = row.scheduledAt ? new Date(row.scheduledAt) : null;
    if (row.scheduledAt && (!when || isNaN(when.getTime()))) { results.push({ row: i + 1, ok: false, error: 'invalid scheduledAt' }); continue; }

    const groupId = newId('sg_');
    const status = when ? 'scheduled' : 'draft';
    const insertRows = uniq.map((a) => ({
      id: newId('sp_'), workspaceId: me.workspaceId, groupId, accountId: a.id, platform: a.platform,
      body: isThread ? threadSegs[0] : body, threadJson: isThread ? JSON.stringify(threadSegs) : null,
      status, scheduledAt: when, createdById: me.id,
    }));
    await db.insert(socialPosts).values(insertRows);
    created += insertRows.length;
    results.push({ row: i + 1, ok: true, accounts: uniq.length, status, unmatched: unmatched.length ? unmatched : undefined });
  }
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'social.bulk', target: 'bulk', meta: JSON.stringify({ rows: rows.length, created }) });
  return c.json({ ok: true, created, results });
});

// ── RSS/Atom auto-import feeds ──
const pubFeed = (f) => ({
  id: f.id, url: f.url, title: f.title, accountIds: safeParse(f.accountIds) || [],
  lastCheckedAt: f.lastCheckedAt, lastError: f.lastError,
});

app.get('/feeds', async (c) => {
  const me = c.get('user');
  const rows = await db.select().from(socialFeeds).where(eq(socialFeeds.workspaceId, me.workspaceId)).orderBy(desc(socialFeeds.createdAt));
  return c.json({ feeds: rows.map(pubFeed) });
});

app.post('/feeds', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const { url, title = null, accountIds = [] } = await c.req.json().catch(() => ({}));
  if (!/^https?:\/\//i.test(String(url || ''))) return c.json({ error: 'a valid feed url is required' }, 400);
  const id = newId('feed_');
  await db.insert(socialFeeds).values({
    id, workspaceId: me.workspaceId, url: String(url).trim(), title: title ? String(title) : null,
    accountIds: JSON.stringify(Array.isArray(accountIds) ? accountIds : []), createdById: me.id,
  });
  syncFeed(id).catch(() => {}); // first pull in the background
  const fresh = (await db.select().from(socialFeeds).where(eq(socialFeeds.id, id)).limit(1))[0];
  return c.json({ ok: true, feed: pubFeed(fresh) });
});

app.post('/feeds/:id/check', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const row = (await db.select().from(socialFeeds).where(and(eq(socialFeeds.id, id), eq(socialFeeds.workspaceId, me.workspaceId))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  const created = await syncFeed(id);
  const fresh = (await db.select().from(socialFeeds).where(eq(socialFeeds.id, id)).limit(1))[0];
  return c.json({ ok: true, created, feed: pubFeed(fresh) });
});

app.delete('/feeds/:id', requireRole('editor'), async (c) => {
  const me = c.get('user');
  await db.delete(socialFeeds).where(and(eq(socialFeeds.id, c.req.param('id')), eq(socialFeeds.workspaceId, me.workspaceId)));
  return c.json({ ok: true });
});

// ── Queue slots (Buffer-style posting schedule) ──
app.get('/slots', async (c) => {
  const me = c.get('user');
  const { slots, tz } = await getWorkspaceSlots(me.workspaceId);
  return c.json({ slots, tz });
});

app.put('/slots', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const { slots = [] } = await c.req.json().catch(() => ({}));
  const clean = await setWorkspaceSlots(me.workspaceId, slots);
  return c.json({ ok: true, slots: clean });
});

// ── Keyword listening ──
app.get('/keywords', async (c) => {
  const me = c.get('user');
  const rows = await db.select().from(socialKeywords).where(eq(socialKeywords.workspaceId, me.workspaceId)).orderBy(desc(socialKeywords.createdAt));
  return c.json({ keywords: rows.map((k) => ({ id: k.id, phrase: k.phrase })) });
});

app.post('/keywords', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const { phrase = '' } = await c.req.json().catch(() => ({}));
  const p = String(phrase).trim();
  if (!p) return c.json({ error: 'phrase required' }, 400);
  if (p.length > 100) return c.json({ error: 'phrase too long' }, 400);
  const id = newId('kw_');
  await db.insert(socialKeywords).values({ id, workspaceId: me.workspaceId, phrase: p, createdById: me.id });
  syncListening(me.workspaceId).catch(() => {}); // first scan in the background
  return c.json({ ok: true, keyword: { id, phrase: p } });
});

app.delete('/keywords/:id', requireRole('editor'), async (c) => {
  const me = c.get('user');
  await db.delete(socialKeywords).where(and(eq(socialKeywords.id, c.req.param('id')), eq(socialKeywords.workspaceId, me.workspaceId)));
  return c.json({ ok: true });
});

app.get('/listening', async (c) => {
  const me = c.get('user');
  const keywordId = c.req.query('keyword');
  const sentiment = c.req.query('sentiment');
  const conds = [eq(socialListening.workspaceId, me.workspaceId)];
  if (keywordId) conds.push(eq(socialListening.keywordId, keywordId));
  if (sentiment && ['pos', 'neg', 'neu'].includes(sentiment)) conds.push(eq(socialListening.sentiment, sentiment));
  const rows = await db.select().from(socialListening)
    .where(conds.length > 1 ? and(...conds) : conds[0])
    .orderBy(desc(socialListening.remoteCreatedAt)).limit(200);
  // Sentiment counts over the whole workspace stream (for the summary strip).
  const counts = { pos: 0, neg: 0, neu: 0 };
  try {
    const all = sqlite.prepare('SELECT sentiment, COUNT(*) n FROM social_listening WHERE workspace_id = ? GROUP BY sentiment').all(me.workspaceId);
    for (const r of all) if (counts[r.sentiment] != null) counts[r.sentiment] = r.n;
  } catch { /* counts optional */ }
  return c.json({
    items: rows.map((r) => ({
      id: r.id, keywordId: r.keywordId, platform: r.platform,
      authorHandle: r.authorHandle, authorName: r.authorName, authorAvatar: r.authorAvatar,
      text: r.text, url: r.url, sentiment: r.sentiment, remoteCreatedAt: r.remoteCreatedAt,
    })),
    counts,
  });
});

app.post('/listening/sync', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const added = await syncListening(me.workspaceId);
  return c.json({ ok: true, added });
});

export default app;
