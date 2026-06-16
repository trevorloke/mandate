import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, mockFetch, jsonResponse } from './helpers.js';

const { db, sqlite, schema } = await setupDb();
const listening = await import('../lib/social/listening.js');
const { encryptJson } = await import('../lib/crypto.js');

test('scoreSentiment classifies pos/neg/neu', () => {
  assert.equal(listening.scoreSentiment('I love this, great work!'), 'pos');
  assert.equal(listening.scoreSentiment('this is a corrupt disaster and a lie'), 'neg');
  assert.equal(listening.scoreSentiment('the meeting is at noon'), 'neu');
});

test('searchBluesky normalizes posts', async () => {
  const restore = mockFetch(() => jsonResponse({ posts: [
    { uri: 'at://did:plc:a/app.bsky.feed.post/r1', cid: 'c', author: { handle: 'jane.bsky.social', displayName: 'Jane', avatar: 'http://a' }, record: { text: 'hi housing' }, indexedAt: '2026-06-01T10:00:00Z' },
  ] }));
  try {
    const out = await listening.searchBluesky('housing');
    assert.equal(out.length, 1);
    assert.equal(out[0].authorHandle, '@jane.bsky.social');
    assert.equal(out[0].url, 'https://bsky.app/profile/jane.bsky.social/post/r1');
    assert.equal(out[0].text, 'hi housing');
  } finally { restore(); }
});

test('searchMastodon normalizes + strips HTML', async () => {
  const restore = mockFetch(() => jsonResponse({ statuses: [
    { id: '9', account: { acct: 'bob@inst', display_name: 'Bob', avatar: 'http://b' }, content: '<p>great <b>housing</b></p>', url: 'https://inst/@bob/9', created_at: '2026-06-01T11:00:00Z' },
  ] }));
  try {
    const out = await listening.searchMastodon({ instanceUrl: 'https://inst', accessToken: 't' }, 'housing');
    assert.equal(out[0].authorHandle, '@bob@inst');
    assert.equal(out[0].text, 'great housing');
  } finally { restore(); }
});

test('syncListening stores mentions, dedupes on re-run, and scores sentiment', async () => {
  await db.insert(schema.workspaces).values({ id: 'ws_l', name: 'W' });
  await db.insert(schema.socialAccounts).values({
    id: 'sa_b', workspaceId: 'ws_l', platform: 'bluesky', handle: '@me', status: 'connected',
    credentials: encryptJson({ service: 'https://bsky.social', did: 'd', handle: 'me', accessJwt: 'a', refreshJwt: 'r' }),
  });
  await db.insert(schema.socialKeywords).values({ id: 'kw_1', workspaceId: 'ws_l', phrase: 'housing' });

  const restore = mockFetch((url) => {
    if (url.includes('searchPosts')) return jsonResponse({ posts: [
      { uri: 'at://x/app.bsky.feed.post/p1', cid: 'c1', author: { handle: 'a.bsky.social', displayName: 'A' }, record: { text: 'love the housing plan' }, indexedAt: '2026-06-01T10:00:00Z' },
      { uri: 'at://x/app.bsky.feed.post/p2', cid: 'c2', author: { handle: 'b.bsky.social' }, record: { text: 'housing policy is a disaster' }, indexedAt: '2026-06-01T11:00:00Z' },
    ] });
    return jsonResponse({});
  });
  try {
    const a1 = await listening.syncListening('ws_l');
    const a2 = await listening.syncListening('ws_l');
    assert.equal(a1, 2, 'first sync stores both');
    assert.equal(a2, 0, 'second sync dedupes');
    const rows = sqlite.prepare('SELECT sentiment FROM social_listening WHERE workspace_id=? ORDER BY remote_created_at').all('ws_l');
    assert.deepEqual(rows.map((r) => r.sentiment), ['pos', 'neg']);
  } finally { restore(); }
});
