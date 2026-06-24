// Tide — News (RSS) source behind the source-adapter contract. Network mocked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockFetch } from './helpers.js';

const news = await import('../lib/tide/news.js');
const { enabledSources, sourceCatalog, SOURCES, buildReading } = await import('../lib/tide/index.js');

const RSS = `<?xml version="1.0"?><rss><channel>
  <item><title>Rent prices fall in a housing crisis - BBC</title><source url="https://bbc.com">BBC</source></item>
  <item><title>Zoning reform a great win for renters - Reuters</title><source url="https://reuters.com">Reuters</source></item>
  <item><title>Housing scandal deepens, families fear eviction - City Desk</title></item>
</channel></rss>`;

const topic = (over = {}) => ({ id: 't', name: 'Housing', slug: 'housing', keywords: ['rent', 'zoning'], refreshHours: 4, ...over });

test('parseNews extracts title + source (element or "- Outlet" suffix)', () => {
  const parsed = news.parseNews(RSS);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].source, 'BBC');
  assert.equal(parsed[0].title, 'Rent prices fall in a housing crisis');
  assert.equal(parsed[2].source, 'City Desk', 'falls back to the " - Outlet" suffix');
});

test('collect scores volume (article count), sentiment, outlet drivers', async () => {
  let calledUrl = null;
  const restore = mockFetch((url) => { calledUrl = url; return new Response(RSS, { status: 200 }); });
  try {
    const sig = await news.collect({ topic: topic(), geo: 'US' });
    assert.match(calledUrl, /q=Housing/);          // topic name flows into the query
    assert.equal(sig.volume, 3);
    assert.equal(sig.sampleN, 3);
    const sum = sig.sentiment.pos + sig.sentiment.neu + sig.sentiment.neg;
    assert.ok(Math.abs(sum - 1) < 1e-9);
    assert.ok(sig.sentiment.neg > 0 && sig.sentiment.pos > 0, 'mixed headlines');
    assert.ok(sig.drivers.some((d) => d.kind === 'outlet' && d.name === 'BBC'));
  } finally { restore(); }
});

test('collect returns neutral zero signal on an empty feed', async () => {
  const restore = mockFetch(() => new Response('<rss><channel></channel></rss>', { status: 200 }));
  try {
    const sig = await news.collect({ topic: topic() });
    assert.equal(sig.volume, 0);
    assert.deepEqual(sig.sentiment, { pos: 0, neu: 1, neg: 0 });
  } finally { restore(); }
});

test('collect throws on HTTP error', async () => {
  const restore = mockFetch(() => new Response('x', { status: 500 }));
  try { await assert.rejects(() => news.collect({ topic: topic() }), /News RSS failed/); }
  finally { restore(); }
});

test('env gating: news joins enabledSources + catalogue when flagged', () => {
  delete process.env.MANDATE_TIDE_NEWS;
  assert.ok(!enabledSources().some((s) => s.id === 'news'));
  assert.equal(sourceCatalog().find((s) => s.id === 'news').live, false);

  process.env.MANDATE_TIDE_NEWS = '1';
  try {
    assert.deepEqual(enabledSources().map((s) => s.id), ['news']);
    assert.equal(sourceCatalog().find((s) => s.id === 'news').live, true);
  } finally { delete process.env.MANDATE_TIDE_NEWS; }
});

test('buildReading uses news when enabled as the sole source', async () => {
  const restore = mockFetch(() => new Response(RSS, { status: 200 }));
  try {
    const r = await buildReading({ topic: topic(), panelists: [], prev: null, sources: [SOURCES.news] });
    assert.equal(r.volume, 3);
    assert.deepEqual(r.sources, [{ id: 'news', layer: 'licensed' }]);
  } finally { restore(); }
});
