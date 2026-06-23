// AI reply drafting — unit (assist module) + route (/inbox/:id/suggest-reply).
// The Claude API is mocked; we set ANTHROPIC_API_KEY per-test since aiConfigured()
// reads it at call time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, mockFetch, jsonResponse } from './helpers.js';

const { db, schema } = await setupDb();
const { encryptJson } = await import('../lib/crypto.js');
const assist = await import('../lib/social/assist.js');
const socialApp = (await import('../routes/social.js')).default;

const claudeResp = (text) => jsonResponse({ content: [{ type: 'text', text }] });

test('suggestReply throws no_key when ANTHROPIC_API_KEY is unset', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  await assert.rejects(() => assist.suggestReply({ text: 'hi' }), (e) => e.code === 'no_key');
});

test('suggestReply asks the model in the chosen tone and returns the draft', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const restore = mockFetch((url, opts) => {
    assert.ok(url.includes('api.anthropic.com'), 'calls the Claude API');
    const body = JSON.parse(opts.body);
    assert.ok(body.system.includes('community manager'), 'uses the reply persona');
    assert.ok(/gracious/.test(body.system), 'reflects the grateful tone');
    return claudeResp('Thank you so much — that means a lot! 🙌');
  });
  try {
    const r = await assist.suggestReply({ text: 'love your work', authorHandle: '@a', platform: 'bluesky', tone: 'grateful', charLimit: 300 });
    assert.equal(r.text, 'Thank you so much — that means a lot! 🙌');
  } finally { restore(); delete process.env.ANTHROPIC_API_KEY; }
});

// ── Route wiring ──
const SID = 'sess_ai';
await db.insert(schema.workspaces).values({ id: 'ws_ai', name: 'W' });
await db.insert(schema.users).values({ id: 'u_ai', email: 'ai@t.com', passwordHash: 'x', name: 'AI', role: 'editor', workspaceId: 'ws_ai' });
await db.insert(schema.sessions).values({ id: SID, userId: 'u_ai', expiresAt: new Date(Date.now() + 3600e3) });
await db.insert(schema.socialAccounts).values({
  id: 'sa_ai', workspaceId: 'ws_ai', platform: 'bluesky', handle: '@b', status: 'connected',
  credentials: encryptJson({ service: 'https://pds', did: 'd', handle: 'b', accessJwt: 'a', refreshJwt: 'r' }),
});
await db.insert(schema.socialInbox).values({
  id: 'in_ai', workspaceId: 'ws_ai', accountId: 'sa_ai', platform: 'bluesky', type: 'mention',
  remoteId: 'at://x/p/1', authorHandle: '@critic', text: 'why did you vote for this?', status: 'unread',
});
const rq = (path, body) => socialApp.request(path, {
  method: 'POST', headers: { Cookie: `mdt_session=${SID}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body || {}),
});

test('POST /inbox/:id/suggest-reply returns an AI draft (does not send)', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const restore = mockFetch(() => claudeResp('Happy to explain — here is the reasoning behind that vote.'));
  try {
    const r = await rq('/inbox/in_ai/suggest-reply', { tone: 'professional' });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.text, 'Happy to explain — here is the reasoning behind that vote.');
  } finally { restore(); delete process.env.ANTHROPIC_API_KEY; }
});

test('suggest-reply returns 400 no_key when AI is not configured', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const r = await rq('/inbox/in_ai/suggest-reply', { tone: 'friendly' });
  assert.equal(r.status, 400);
  const j = await r.json();
  assert.equal(j.code, 'no_key');
});

test('suggest-reply 404s for an unknown item', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  try {
    const r = await rq('/inbox/nope/suggest-reply', {});
    assert.equal(r.status, 404);
  } finally { delete process.env.ANTHROPIC_API_KEY; }
});
