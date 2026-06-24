// Tide — Google Trends source (real, public daily-trends RSS) behind the source
// adapter contract. Network mocked; verifies parsing, topic matching, sentiment,
// drivers, env gating, and that the aggregator degrades gracefully when a live
// source fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockFetch } from './helpers.js';

const gt = await import('../lib/tide/google-trends.js');
const { buildReading, enabledSources, sourceCatalog, SOURCES } = await import('../lib/tide/index.js');

const RSS = `<?xml version="1.0"?><rss><channel>
  <item>
    <title>Housing market crash</title>
    <ht:approx_traffic>200,000+</ht:approx_traffic>
    <ht:news_item><ht:news_item_title>Rent prices decline in a major crisis</ht:news_item_title><ht:news_item_source>BBC</ht:news_item_source></ht:news_item>
    <ht:news_item><ht:news_item_title>Housing fails to recover, scandal grows</ht:news_item_title><ht:news_item_source>Reuters</ht:news_item_source></ht:news_item>
  </item>
  <item>
    <title>Local transit win</title>
    <ht:approx_traffic>50,000+</ht:approx_traffic>
    <ht:news_item><ht:news_item_title>New buses a great win for riders</ht:news_item_title><ht:news_item_source>City Desk</ht:news_item_source></ht:news_item>
  </item>
  <item>
    <title>Celebrity gossip</title>
    <ht:approx_traffic>1,000,000+</ht:approx_traffic>
    <ht:news_item><ht:news_item_title>Star spotted downtown</ht:news_item_title><ht:news_item_source>TMZ</ht:news_item_source></ht:news_item>
  </item>
</channel></rss>`;

const topic = (over = {}) => ({ id: 't', name: 'Housing', slug: 'housing', keywords: ['rent', 'zoning'], refreshHours: 4, ...over });

test('parseTrends extracts title, traffic and news items', () => {
  const parsed = gt.parseTrends(RSS);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].title, 'Housing market crash');
  assert.equal(parsed[0].traffic, 200000);
  assert.equal(parsed[0].news.length, 2);
  assert.equal(parsed[0].news[0].source, 'BBC');
});

test('collect matches topic terms, scores volume + sentiment + drivers', async () => {
  const restore = mockFetch(() => new Response(RSS, { status: 200 }));
  try {
    const sig = await gt.collect({ topic: topic(), geo: 'US' });
    // Only the housing + transit-mentioning entries match "housing"/"rent"; gossip doesn't.
    assert.equal(sig.matched, 1);            // "Housing market crash" (title) + rent headline
    assert.equal(sig.volume, 200000);
    const sum = sig.sentiment.pos + sig.sentiment.neu + sig.sentiment.neg;
    assert.ok(Math.abs(sum - 1) < 1e-9);
    assert.ok(sig.sentiment.neg > 0, 'crisis/scandal headlines read negative');
    assert.ok(sig.drivers.some((d) => d.kind === 'outlet' && ['BBC', 'Reuters'].includes(d.name)));
    assert.ok(sig.drivers.some((d) => d.kind === 'trend'));
  } finally { restore(); }
});

test('collect returns a zero-volume neutral signal when nothing matches', async () => {
  const restore = mockFetch(() => new Response(RSS, { status: 200 }));
  try {
    const sig = await gt.collect({ topic: topic({ name: 'Fisheries', slug: 'fisheries', keywords: ['quota'] }) });
    assert.equal(sig.matched, 0);
    assert.equal(sig.volume, 0);
    assert.deepEqual(sig.sentiment, { pos: 0, neu: 1, neg: 0 });
  } finally { restore(); }
});

test('collect throws on HTTP error so the aggregator can fall back', async () => {
  const restore = mockFetch(() => new Response('nope', { status: 503 }));
  try { await assert.rejects(() => gt.collect({ topic: topic() }), /Google Trends RSS failed/); }
  finally { restore(); }
});

test('env gating: enabledSources + catalogue reflect the flag', () => {
  delete process.env.MANDATE_TIDE_GOOGLE_TRENDS;
  assert.deepEqual(enabledSources().map((s) => s.id), ['seed'], 'seed-only when disabled');
  assert.equal(sourceCatalog().find((s) => s.id === 'google_trends').live, false);

  process.env.MANDATE_TIDE_GOOGLE_TRENDS = '1';
  try {
    assert.deepEqual(enabledSources().map((s) => s.id), ['google_trends'], 'live source replaces seed when enabled');
    assert.equal(sourceCatalog().find((s) => s.id === 'google_trends').live, true);
  } finally { delete process.env.MANDATE_TIDE_GOOGLE_TRENDS; }
});

test('buildReading uses the live source, and falls back to seed when it fails', async () => {
  // Live source succeeds → its volume flows into the reading.
  const restore = mockFetch(() => new Response(RSS, { status: 200 }));
  try {
    const r = await buildReading({ topic: topic(), panelists: [], prev: null, sources: [SOURCES.google_trends] });
    assert.equal(r.volume, 200000);
    assert.deepEqual(r.sources, [{ id: 'google_trends', layer: 'licensed' }]);
  } finally { restore(); }

  // Live source throws → reading still produced from the seeded floor.
  const restore2 = mockFetch(() => { throw new Error('network down'); });
  try {
    const r = await buildReading({ topic: topic(), panelists: [], prev: null, sources: [SOURCES.google_trends] });
    assert.ok(r.volume > 0, 'seed floor produced a volume');
    assert.deepEqual(r.sources, [{ id: 'seed', layer: 'public' }]);
    assert.match(r.why, /Housing/);
  } finally { restore2(); }
});
