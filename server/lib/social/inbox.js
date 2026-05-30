// Engagement inbox — sync incoming interactions from platforms (dedup via the
// unique index) and post replies back. Bluesky & Mastodon are wired; other
// providers light up as their fetchInbox/reply adapters are added.
import { randomBytes } from 'crypto';
import { and, eq, desc } from 'drizzle-orm';
import { db, sqlite } from '../../db/index.js';
import { socialAccounts, socialInbox, socialPosts } from '../../db/schema.js';
import { getProvider } from './index.js';
import { getApp } from './oauth.js';
import { encryptJson, decryptJson } from '../crypto.js';
import { broadcast } from '../realtime.js';

const newId = (p) => p + randomBytes(12).toString('hex');

// Prepared lazily — runs after ensureTables() has created social_inbox.
let _insert = null;
function insertStmt() {
  if (!_insert) {
    _insert = sqlite.prepare(`
      INSERT OR IGNORE INTO social_inbox
        (id, workspace_id, account_id, platform, type, remote_id, author_handle, author_name,
         author_avatar, text, parent_remote_id, url, reply_context, status, remote_created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
  }
  return _insert;
}

async function loadAccountCtx(account) {
  const prov = getProvider(account.platform);
  const creds = decryptJson(account.credentials);
  const app = prov?.connect === 'oauth' ? await getApp(account.workspaceId, account.platform).catch(() => null) : null;
  return { prov, creds, app };
}

export async function syncInbox(accountId) {
  const account = (await db.select().from(socialAccounts).where(eq(socialAccounts.id, accountId)).limit(1))[0];
  if (!account) return 0;
  const { prov, creds, app } = await loadAccountCtx(account);
  if (!prov?.adapter?.fetchInbox) return 0;

  // Some platforms (e.g. LinkedIn) pull engagement from our own recent posts.
  const recent = await db.select({ remoteId: socialPosts.remoteId }).from(socialPosts)
    .where(and(eq(socialPosts.accountId, account.id), eq(socialPosts.status, 'published')))
    .orderBy(desc(socialPosts.publishedAt)).limit(20);
  const recentPostIds = recent.map((r) => r.remoteId).filter(Boolean);

  let res;
  try { res = await prov.adapter.fetchInbox({ ...account, credentials: creds, _app: app }, { recentPostIds }); }
  catch { return 0; }
  if (res.credentials) {
    await db.update(socialAccounts).set({ credentials: encryptJson(res.credentials), updatedAt: new Date() }).where(eq(socialAccounts.id, account.id));
  }

  let added = 0;
  for (const it of (res.items || [])) {
    const ts = it.remoteCreatedAt ? Math.floor(new Date(it.remoteCreatedAt).getTime() / 1000) : Math.floor(Date.now() / 1000);
    const r = insertStmt().run(newId('in_'), account.workspaceId, account.id, account.platform, it.type, it.remoteId,
      it.authorHandle || null, it.authorName || null, it.authorAvatar || null, it.text || null,
      it.parentRemoteId || null, it.url || null, JSON.stringify(it.replyContext || {}), 'unread', ts);
    if (r.changes > 0) added++;
  }
  if (added) { try { broadcast(account.workspaceId, 'social.inbox', { accountId: account.id, added }); } catch { /* ignore */ } }
  return added;
}

export async function syncAllInboxes() {
  const rows = await db.select({ id: socialAccounts.id }).from(socialAccounts).where(eq(socialAccounts.status, 'connected'));
  let total = 0;
  for (const r of rows) { try { total += await syncInbox(r.id); } catch { /* skip */ } }
  return total;
}

export async function replyToItem(itemId, text, workspaceId) {
  const item = (await db.select().from(socialInbox)
    .where(and(eq(socialInbox.id, itemId), eq(socialInbox.workspaceId, workspaceId))).limit(1))[0];
  if (!item) return { ok: false, error: 'not found' };
  const account = item.accountId ? (await db.select().from(socialAccounts).where(eq(socialAccounts.id, item.accountId)).limit(1))[0] : null;
  if (!account) return { ok: false, error: 'account removed' };
  const { prov, creds, app } = await loadAccountCtx(account);
  if (!prov?.adapter?.reply) return { ok: false, error: 'reply not supported for this platform' };

  try {
    let ctx = {}; try { ctx = JSON.parse(item.replyContext || '{}'); } catch { /* ignore */ }
    const res = await prov.adapter.reply({ ...account, credentials: creds, _app: app }, { ...item, replyContext: ctx }, text);
    if (res.credentials) {
      await db.update(socialAccounts).set({ credentials: encryptJson(res.credentials), updatedAt: new Date() }).where(eq(socialAccounts.id, account.id));
    }
    await db.update(socialInbox).set({ status: 'replied', repliedAt: new Date() }).where(eq(socialInbox.id, item.id));
    return { ok: true, url: res.url };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
