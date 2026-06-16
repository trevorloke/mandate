import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, mockFetch, jsonResponse } from './helpers.js';

const { db, sqlite, schema } = await setupDb();
const { syncInbox, replyToItem } = await import('../lib/social/inbox.js');
const { encryptJson } = await import('../lib/crypto.js');

await db.insert(schema.workspaces).values({ id: 'ws_i', name: 'W' });
await db.insert(schema.socialAccounts).values({
  id: 'sa_m', workspaceId: 'ws_i', platform: 'mastodon', handle: '@m', status: 'connected',
  credentials: encryptJson({ instanceUrl: 'https://inst', accessToken: 't' }),
});

const mentions = [
  { type: 'mention', status: { id: '1', content: '<p>hey @me, love it</p>', url: 'https://inst/1', in_reply_to_id: null }, account: { acct: 'a@inst', display_name: 'A', avatar: 'http://a' } },
  { type: 'mention', status: { id: '2', content: '<p>question for you</p>', url: 'https://inst/2', in_reply_to_id: null }, account: { acct: 'b@inst', display_name: 'B' } },
];

test('syncInbox stores mentions then dedupes', async () => {
  const restore = mockFetch((url) => {
    if (url.includes('/notifications')) return jsonResponse(mentions);
    return jsonResponse({});
  });
  try {
    const a1 = await syncInbox('sa_m');
    const a2 = await syncInbox('sa_m');
    assert.equal(a1, 2);
    assert.equal(a2, 0, 'deduped on re-sync');
    const rows = sqlite.prepare('SELECT author_handle, text, status FROM social_inbox WHERE workspace_id=? ORDER BY remote_id').all('ws_i');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].author_handle, '@a@inst');
    assert.equal(rows[0].text, 'hey @me, love it');
    assert.equal(rows[0].status, 'unread');
  } finally { restore(); }
});

test('replyToItem posts a threaded reply and marks the item replied', async () => {
  const item = sqlite.prepare('SELECT id FROM social_inbox WHERE workspace_id=? LIMIT 1').get('ws_i');
  let captured = null;
  const restore = mockFetch((url, opts) => {
    if (url.includes('/api/v1/statuses')) { captured = JSON.parse(opts.body); return jsonResponse({ id: '99', url: 'https://inst/99' }); }
    return jsonResponse({});
  });
  try {
    const r = await replyToItem(item.id, 'thanks!', 'ws_i');
    assert.equal(r.ok, true);
    assert.equal(captured.in_reply_to_id, '1', 'replies to the source status');
    const after = sqlite.prepare('SELECT status FROM social_inbox WHERE id=?').get(item.id);
    assert.equal(after.status, 'replied');
  } finally { restore(); }
});
