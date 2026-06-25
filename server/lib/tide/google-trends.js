// Google Trends source — the first *real* source behind Tide's adapter contract.
//
// It reads Google's PUBLIC daily-trends RSS feed (the "free, public" tap the
// brief endorses), not the internal widget endpoints pytrends scrapes — so it's
// the licensed/official layer: boring, legal, reliable, and not a tap a platform
// or regulator can quietly switch off the way scraping is.
//
// Off by default: enable with MANDATE_TIDE_GOOGLE_TRENDS=1 (optionally
// MANDATE_TIDE_GEO, MANDATE_TIDE_GOOGLE_TRENDS_URL). When disabled, Tide stays
// on the seeded source so the demo runs offline and tests stay deterministic.
import { classify, distribution } from './sentiment.js';

const DEFAULT_GEO = () => process.env.MANDATE_TIDE_GEO || 'US';
const rssUrl = (geo) => process.env.MANDATE_TIDE_GOOGLE_TRENDS_URL
  || `https://trends.google.com/trends/trendingsearches/daily/rss?geo=${encodeURIComponent(geo)}`;

export const id = 'google_trends';
export const label = 'Google Trends';
export const layer = 'licensed';
export const isEnabled = () => process.env.MANDATE_TIDE_GOOGLE_TRENDS === '1';
export const meta = { id, label, layer, get live() { return isEnabled(); } };

function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .trim();
}

const trafficToInt = (s) => {
  const m = String(s || '').replace(/[,+\s]/g, '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
};

// Parse the daily-trends RSS into [{ title, traffic, news:[{title,source}] }].
export function parseTrends(xml) {
  const out = [];
  const items = String(xml || '').match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const it of items) {
    const title = decode((it.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
    if (!title) continue;
    const traffic = trafficToInt((it.match(/<ht:approx_traffic[^>]*>([\s\S]*?)<\/ht:approx_traffic>/i) || [])[1]);
    const news = [];
    const newsBlocks = it.match(/<ht:news_item[\s>][\s\S]*?<\/ht:news_item>/gi) || [];
    for (const nb of newsBlocks) {
      const nt = decode((nb.match(/<ht:news_item_title[^>]*>([\s\S]*?)<\/ht:news_item_title>/i) || [])[1]);
      const ns = decode((nb.match(/<ht:news_item_source[^>]*>([\s\S]*?)<\/ht:news_item_source>/i) || [])[1]);
      if (nt) news.push({ title: nt, source: ns || null });
    }
    out.push({ title, traffic, news });
  }
  return out;
}

const terms = (topic) => [topic.slug, topic.name, ...(topic.keywords || [])]
  .filter(Boolean).map((t) => String(t).toLowerCase());

const matches = (text, ts) => { const low = String(text).toLowerCase(); return ts.some((t) => t && low.includes(t)); };

// Source-adapter contract: collect({ topic, at }) -> { volume, sentiment, drivers, sampleN }.
// Throws on fetch/HTTP failure so the aggregator can fall back to other sources.
export async function collect({ topic, geo = DEFAULT_GEO() }) {
  const res = await fetch(rssUrl(geo), {
    headers: { 'User-Agent': 'Mandate-Tide/1.0', Accept: 'application/rss+xml, application/xml, text/xml' },
  });
  if (!res.ok) throw new Error(`Google Trends RSS failed (${res.status})`);
  const trends = parseTrends(await res.text());

  const ts = terms(topic);
  // A trend matches if its title or any of its headlines mention the topic.
  const matched = trends.filter((tr) => matches(tr.title, ts) || tr.news.some((n) => matches(n.title, ts)));

  const volume = matched.reduce((s, tr) => s + (tr.traffic || 0), 0);
  const headlines = matched.flatMap((tr) => tr.news);
  const sentiment = headlines.length
    ? distribution(headlines.map((n) => classify(n.title)))
    : { pos: 0, neu: 1, neg: 0 };

  // Drivers: the matched trend queries + the outlets carrying them.
  const drivers = [
    ...matched.slice(0, 2).map((tr) => ({ name: tr.title, kind: 'trend', pull: 1 })),
    ...[...new Set(headlines.map((n) => n.source).filter(Boolean))].slice(0, 2)
      .map((src) => ({ name: src, kind: 'outlet', pull: 0.6 })),
  ];

  return { volume, sentiment, drivers, sampleN: headlines.length, matched: matched.length };
}
