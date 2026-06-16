import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb } from './helpers.js';

await setupDb(); // feeds.js imports db at module load
const { parseFeed } = await import('../lib/social/feeds.js');

test('parses RSS items (title, link, guid)', () => {
  const xml = `<rss><channel>
    <item><title>First</title><link>https://ex.com/1</link><guid>g1</guid></item>
    <item><title>Second</title><link>https://ex.com/2</link><guid>g2</guid></item>
  </channel></rss>`;
  const items = parseFeed(xml);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], { guid: 'g1', title: 'First', link: 'https://ex.com/1' });
});

test('unwraps CDATA, decodes entities, and strips inline HTML', () => {
  const xml = `<rss><channel><item>
    <title><![CDATA[Roads &amp; Bridges <b>2026</b>]]></title><link>https://e/x</link><guid>z</guid>
  </item></channel></rss>`;
  assert.equal(parseFeed(xml)[0].title, 'Roads & Bridges 2026');
});

test('parses Atom entries with href links and id guids', () => {
  const xml = `<feed>
    <entry><title>Atom One</title><link href="https://a.com/1"/><id>a1</id></entry>
  </feed>`;
  const items = parseFeed(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].link, 'https://a.com/1');
  assert.equal(items[0].guid, 'a1');
});

test('falls back to link as guid when none present', () => {
  const xml = `<rss><channel><item><title>No Guid</title><link>https://e/only</link></item></channel></rss>`;
  assert.equal(parseFeed(xml)[0].guid, 'https://e/only');
});

test('returns [] for empty/garbage input', () => {
  assert.deepEqual(parseFeed(''), []);
  assert.deepEqual(parseFeed('<html>not a feed</html>'), []);
});
