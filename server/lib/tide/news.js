// News source — the licensed/official news layer. Reads Google News' PUBLIC
// per-topic RSS search feed (a published feed, like the Trends adapter — not
// scraped widget endpoints). Point MANDATE_TIDE_NEWS_URL at any licensed
// aggregator's RSS-search endpoint to swap providers without code changes.
//
// Off by default: enable with MANDATE_TIDE_NEWS=1. Disabled → Tide stays on the
// seeded source, so the demo runs offline and tests stay deterministic.
import { classify, distribution } from './sentiment.js';

const DEFAULT_GEO = () => process.env.MANDATE_TIDE_GEO || 'US';
const baseUrl = () => process.env.MANDATE_TIDE_NEWS_URL || 'https://news.google.com/rss/search';

export const id = 'news';
export const label = 'News (RSS)';
export const layer = 'licensed';
export const isEnabled = () => process.env.MANDATE_TIDE_NEWS === '1';
export const meta = { id, label, layer, get live() { return isEnabled(); } };

function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .trim();
}

// Parse RSS <item>s into { title, source }. Google News titles are
// "Headline - Outlet" and also carry a <source> element; prefer the element.
export function parseNews(xml) {
  const out = [];
  const items = String(xml || '').match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const it of items) {
    let title = decode((it.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
    if (!title) continue;
    let source = decode((it.match(/<source[^>]*>([\s\S]*?)<\/source>/i) || [])[1]);
    // Google News titles are "Headline - Outlet". Derive the outlet from the
    // suffix when there's no <source> element, and strip it either way.
    if (!source && title.includes(' - ')) source = title.split(' - ').pop();
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
    out.push({ title, source: source || null });
  }
  return out;
}

function queryFor(topic) {
  const parts = [topic.name, ...(topic.keywords || [])].filter(Boolean).slice(0, 5);
  // Quote the name, OR the keywords — a focused but inclusive query.
  return parts.length ? parts.join(' OR ') : topic.slug;
}

// Source-adapter contract. Throws on fetch/HTTP failure so the aggregator can
// fall back. Volume is the matched-article count (a recency-bounded RSS window).
export async function collect({ topic, geo = DEFAULT_GEO() }) {
  const q = encodeURIComponent(queryFor(topic));
  const url = `${baseUrl()}?q=${q}&hl=en-${geo}&gl=${geo}&ceid=${geo}:en`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mandate-Tide/1.0', Accept: 'application/rss+xml, application/xml, text/xml' },
  });
  if (!res.ok) throw new Error(`News RSS failed (${res.status})`);
  const items = parseNews(await res.text());

  const sentiment = items.length
    ? distribution(items.map((n) => classify(n.title)))
    : { pos: 0, neu: 1, neg: 0 };
  const drivers = [...new Set(items.map((n) => n.source).filter(Boolean))]
    .slice(0, 3).map((src) => ({ name: src, kind: 'outlet', pull: 0.7 }));

  return { volume: items.length, sentiment, drivers, sampleN: items.length, matched: items.length };
}
