// RSS/Atom auto-import: fetch feeds, parse new items, queue them as drafts.
import { randomBytes } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { socialFeeds, socialAccounts, socialPosts } from '../../db/schema.js';
import { broadcast } from '../realtime.js';

const newId = (p) => p + randomBytes(12).toString('hex');

function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/gi, "'").replace(/&nbsp;/g, ' ')
    .trim();
}

// Parse RSS <item> and Atom <entry> blocks into {guid,title,link}.
export function parseFeed(xml) {
  const items = [];
  const blocks = String(xml || '').match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) || [];
  for (const b of blocks) {
    const grab = (re) => { const m = b.match(re); return m ? m[1] : null; };
    const title = decode(grab(/<title[^>]*>([\s\S]*?)<\/title>/i));
    let link = decode(grab(/<link[^>]*>([\s\S]*?)<\/link>/i));
    if (!link) { const m = b.match(/<link[^>]*href=["']([^"']+)["']/i); if (m) link = m[1]; }
    const guid = decode(grab(/<guid[^>]*>([\s\S]*?)<\/guid>/i)) || decode(grab(/<id[^>]*>([\s\S]*?)<\/id>/i)) || link || title;
    if (title) items.push({ guid, title, link: link || '' });
  }
  return items;
}

export async function syncFeed(feedId) {
  const feed = (await db.select().from(socialFeeds).where(eq(socialFeeds.id, feedId)).limit(1))[0];
  if (!feed) return 0;
  let items;
  try {
    const res = await fetch(feed.url, { headers: { 'User-Agent': 'Mandate-Beacon/1.0', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } });
    if (!res.ok) throw new Error(`feed fetch failed (${res.status})`);
    items = parseFeed(await res.text());
  } catch (e) {
    await db.update(socialFeeds).set({ lastError: String(e.message).slice(0, 300), lastCheckedAt: new Date() }).where(eq(socialFeeds.id, feedId));
    return 0;
  }
  if (!items.length) {
    await db.update(socialFeeds).set({ lastCheckedAt: new Date(), lastError: null }).where(eq(socialFeeds.id, feedId));
    return 0;
  }

  // New items above the last seen guid (newest-first feeds); first run imports 1.
  let newItems;
  if (!feed.lastItemGuid) newItems = items.slice(0, 1);
  else { const idx = items.findIndex((i) => i.guid === feed.lastItemGuid); newItems = idx === -1 ? items.slice(0, 10) : items.slice(0, idx); }
  newItems = newItems.slice(0, 10);

  let accountIds; try { accountIds = JSON.parse(feed.accountIds || '[]'); } catch { accountIds = []; }
  const accts = accountIds.length
    ? await db.select().from(socialAccounts).where(and(eq(socialAccounts.workspaceId, feed.workspaceId), inArray(socialAccounts.id, accountIds)))
    : [];

  // Advance the cursor only to the OLDEST item we actually import this run. If a
  // feed has more new items than the per-run cap, the remainder is drained over
  // subsequent runs instead of being skipped (jumping to items[0] lost them).
  const nextCursor = newItems.length ? newItems[newItems.length - 1].guid : feed.lastItemGuid;

  let created = 0;
  for (const it of newItems.reverse()) { // oldest first so drafts read chronologically
    const body = `${it.title}${it.link ? `\n${it.link}` : ''}`;
    const groupId = newId('sg_');
    const rows = accts.map((a) => ({ id: newId('sp_'), workspaceId: feed.workspaceId, groupId, accountId: a.id, platform: a.platform, body, status: 'draft', createdById: feed.createdById }));
    if (rows.length) { await db.insert(socialPosts).values(rows); created += rows.length; }
  }
  await db.update(socialFeeds).set({ lastItemGuid: nextCursor, lastCheckedAt: new Date(), lastError: null }).where(eq(socialFeeds.id, feedId));
  if (created) { try { broadcast(feed.workspaceId, 'social.feed', { feedId, created }); } catch { /* ignore */ } }
  return created;
}

export async function syncAllFeeds() {
  const rows = await db.select({ id: socialFeeds.id }).from(socialFeeds);
  let total = 0;
  for (const r of rows) { try { total += await syncFeed(r.id); } catch { /* skip */ } }
  return total;
}
