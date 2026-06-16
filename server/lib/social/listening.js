// Keyword listening — search public/connected networks for tracked phrases and
// store the mentions (deduped). Bluesky search is PUBLIC (no auth needed via
// the AppView); Mastodon search uses each connected account's token against
// its own instance. Other platforms can be added behind the same shape.
import { randomBytes } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db, sqlite } from '../../db/index.js';
import { socialKeywords, socialAccounts } from '../../db/schema.js';
import { decryptJson } from '../crypto.js';
import { broadcast } from '../realtime.js';

const newId = (p) => p + randomBytes(12).toString('hex');
const BSKY_APPVIEW = 'https://public.api.bsky.app';

// Prepared lazily — runs after ensureTables().
let _insert = null;
function insertStmt() {
  if (!_insert) {
    _insert = sqlite.prepare(`
      INSERT OR IGNORE INTO social_listening
        (id, workspace_id, keyword_id, platform, remote_id, author_handle, author_name,
         author_avatar, text, url, sentiment, remote_created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `);
  }
  return _insert;
}

// ── Tiny sentiment lexicon (fast, offline; AI-grade scoring can layer on later)
// Word terms match on whole-word boundaries (so 'no' doesn't fire inside
// 'noon'/'now'); symbol terms match as substrings.
const POS_WORDS = ['love', 'great', 'good', 'amazing', 'excellent', 'win', 'wins', 'winning', 'best', 'support', 'proud', 'hope', 'thank', 'thanks', 'congrats', 'congratulations', 'happy', 'excited', 'inspiring', 'brilliant', 'fantastic', 'incredible', 'yes'];
const NEG_WORDS = ['hate', 'bad', 'terrible', 'awful', 'worst', 'lie', 'lies', 'liar', 'corrupt', 'scandal', 'fail', 'fails', 'failed', 'failure', 'angry', 'disgust', 'disgrace', 'shame', 'shameful', 'wrong', 'broken', 'disaster', 'no', 'never'];
const POS_SYM = ['❤', '🎉', '👏', '🙌', '💪'];
const NEG_SYM = ['👎', '😡', '🤬'];
export function scoreSentiment(text) {
  const raw = String(text || '');
  const words = new Set((raw.toLowerCase().match(/[a-z']+/g) || []));
  let s = 0;
  for (const w of POS_WORDS) if (words.has(w)) s++;
  for (const w of NEG_WORDS) if (words.has(w)) s--;
  for (const w of POS_SYM) if (raw.includes(w)) s++;
  for (const w of NEG_SYM) if (raw.includes(w)) s--;
  return s > 0 ? 'pos' : s < 0 ? 'neg' : 'neu';
}

// ── Per-platform searches → normalized {remoteId, authorHandle, authorName,
//    authorAvatar, text, url, remoteCreatedAt}
// When a connected Bluesky account's creds are supplied we search through its
// own PDS session (more reliable, higher limits); otherwise the public AppView.
export async function searchBluesky(phrase, { limit = 25, creds = null } = {}) {
  const base = creds?.service || BSKY_APPVIEW;
  const headers = { 'User-Agent': 'Mandate-Beacon/1.0' };
  if (creds?.accessJwt) headers.Authorization = `Bearer ${creds.accessJwt}`;
  const r = await fetch(`${base}/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(phrase)}&limit=${limit}`, { headers });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.message || `Bluesky search failed (${r.status}).`);
  return (j.posts || []).map((p) => {
    const rkey = String(p.uri || '').split('/').pop();
    return {
      remoteId: p.uri,
      authorHandle: '@' + p.author.handle,
      authorName: p.author.displayName || p.author.handle,
      authorAvatar: p.author.avatar || null,
      text: p.record?.text || '',
      url: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`,
      remoteCreatedAt: p.indexedAt || p.record?.createdAt || null,
    };
  });
}

function stripHtml(s) {
  return String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

export async function searchMastodon(creds, phrase, { limit = 20 } = {}) {
  const r = await fetch(`${creds.instanceUrl}/api/v2/search?q=${encodeURIComponent(phrase)}&type=statuses&limit=${limit}`, {
    headers: { Authorization: `Bearer ${creds.accessToken}` },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `Mastodon search failed (${r.status}).`);
  return (j.statuses || []).map((s) => ({
    remoteId: s.id,
    authorHandle: '@' + s.account.acct,
    authorName: s.account.display_name || s.account.username,
    authorAvatar: s.account.avatar || null,
    text: stripHtml(s.content),
    url: s.url || s.uri,
    remoteCreatedAt: s.created_at,
  }));
}

// Sync all keywords for one workspace. Returns the number of NEW mentions.
export async function syncListening(workspaceId) {
  const keywords = await db.select().from(socialKeywords).where(eq(socialKeywords.workspaceId, workspaceId));
  if (!keywords.length) return 0;
  const mastoAccts = await db.select().from(socialAccounts)
    .where(and(eq(socialAccounts.workspaceId, workspaceId), eq(socialAccounts.platform, 'mastodon'), eq(socialAccounts.status, 'connected')));
  const bskyAcct = (await db.select().from(socialAccounts)
    .where(and(eq(socialAccounts.workspaceId, workspaceId), eq(socialAccounts.platform, 'bluesky'), eq(socialAccounts.status, 'connected'))).limit(1))[0];
  const bskyCreds = bskyAcct ? decryptJson(bskyAcct.credentials) : null;

  let added = 0;
  const store = (kw, platform, items) => {
    for (const it of items) {
      const ts = it.remoteCreatedAt ? Math.floor(new Date(it.remoteCreatedAt).getTime() / 1000) : Math.floor(Date.now() / 1000);
      const r = insertStmt().run(newId('lm_'), workspaceId, kw.id, platform, it.remoteId,
        it.authorHandle || null, it.authorName || null, it.authorAvatar || null,
        it.text || null, it.url || null, scoreSentiment(it.text), ts);
      if (r.changes > 0) added++;
    }
  };

  for (const kw of keywords) {
    try { store(kw, 'bluesky', await searchBluesky(kw.phrase, { creds: bskyCreds })); } catch { /* skip phrase */ }
    for (const a of mastoAccts) {
      try { store(kw, 'mastodon', await searchMastodon(decryptJson(a.credentials), kw.phrase)); } catch { /* skip */ }
    }
  }
  if (added) { try { broadcast(workspaceId, 'social.listening', { added }); } catch { /* ignore */ } }
  return added;
}

export async function syncAllListening() {
  const rows = sqlite.prepare('SELECT DISTINCT workspace_id FROM social_keywords').all();
  let total = 0;
  for (const r of rows) { try { total += await syncListening(r.workspace_id); } catch { /* skip ws */ } }
  return total;
}
