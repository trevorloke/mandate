// Token-refresh hardening for the OAuth adapters (X, LinkedIn):
// proactive refresh before expiry + reactive refresh-and-retry on a 401.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockFetch, jsonResponse } from './helpers.js';

const { withRefresh, ensureFresh } = await import('../lib/social/oauth-fetch.js');
const x = await import('../lib/social/x.js');
const li = await import('../lib/social/linkedin.js');

const app = { clientId: 'c', clientSecret: 's' };
const fresh = (over = {}) => ({ accessToken: 'old', refreshToken: 'r', expiresAt: Date.now() + 3600_000, ...over });

// ── withRefresh ──
test('withRefresh: no refresh when the token is fresh', async () => {
  let refreshed = 0; const calls = [];
  const { creds } = await withRefresh({ credentials: fresh(), _app: app }, (c) => { refreshed++; return { ...c, accessToken: 'new' }; }
    , (token) => { calls.push(token); return jsonResponse({ ok: true }); });
  assert.equal(refreshed, 0);
  assert.equal(creds.accessToken, 'old');
  assert.deepEqual(calls, ['old']);
});

test('withRefresh: proactive refresh when near expiry', async () => {
  let refreshed = 0; const calls = [];
  const { creds } = await withRefresh({ credentials: fresh({ expiresAt: Date.now() + 5_000 }), _app: app },
    (c) => { refreshed++; return { ...c, accessToken: 'fresh' }; },
    (t) => { calls.push(t); return jsonResponse({}); });
  assert.equal(refreshed, 1);
  assert.equal(creds.accessToken, 'fresh');
  assert.deepEqual(calls, ['fresh'], 'request used the refreshed token');
});

test('withRefresh: reactive refresh + retry on 401', async () => {
  let refreshed = 0; const calls = [];
  const { res, creds } = await withRefresh({ credentials: fresh(), _app: app },
    (c) => { refreshed++; return { ...c, accessToken: 'fresh' }; },
    (t) => { calls.push(t); return calls.length === 1 ? jsonResponse({ error: 'unauth' }, 401) : jsonResponse({ ok: true }); });
  assert.equal(refreshed, 1);
  assert.deepEqual(calls, ['old', 'fresh']);
  assert.equal(res.status, 200);
  assert.equal(creds.accessToken, 'fresh');
});

test('withRefresh: no refresh when not refreshable — 401 surfaces', async () => {
  let refreshed = 0;
  const { res } = await withRefresh({ credentials: fresh({ refreshToken: null }), _app: app },
    () => { refreshed++; }, () => jsonResponse({}, 401));
  assert.equal(refreshed, 0);
  assert.equal(res.status, 401);
});

test('ensureFresh: refreshes only when near expiry AND refreshable', async () => {
  const rf = (c) => ({ ...c, accessToken: 'fresh' });
  assert.equal((await ensureFresh({ credentials: fresh(), _app: app }, rf)).accessToken, 'old');
  assert.equal((await ensureFresh({ credentials: fresh({ expiresAt: Date.now() + 1000 }), _app: app }, rf)).accessToken, 'fresh');
  assert.equal((await ensureFresh({ credentials: fresh({ expiresAt: Date.now() + 1000 }), _app: null }, rf)).accessToken, 'old');
});

// ── Adapter integration (mocked network) ──
test('x.metrics refreshes and retries on a 401', async () => {
  let token = 0, tweets = 0;
  const restore = mockFetch((url) => {
    if (url.includes('/oauth2/token')) { token++; return jsonResponse({ access_token: 'x-fresh', expires_in: 7200 }); }
    if (url.includes('/2/tweets/')) { tweets++; return tweets === 1 ? jsonResponse({ title: 'Unauthorized' }, 401) : jsonResponse({ data: { public_metrics: { like_count: 5, retweet_count: 1 } } }); }
    return jsonResponse({});
  });
  try {
    const out = await x.metrics({ credentials: fresh(), _app: app }, '123');
    assert.equal(token, 1, 'refreshed once');
    assert.equal(tweets, 2, 'retried after refresh');
    assert.equal(out.metrics.likes, 5);
    assert.equal(out.credentials.accessToken, 'x-fresh', 'returns refreshed creds for persistence');
  } finally { restore(); }
});

test('linkedin.metrics refreshes proactively when the token is expired', async () => {
  let token = 0;
  const restore = mockFetch((url) => {
    if (url.includes('/oauth/v2/accessToken')) { token++; return jsonResponse({ access_token: 'li-fresh', expires_in: 5_184_000 }); }
    if (url.includes('/v2/socialActions/')) return jsonResponse({ likesSummary: { totalLikes: 9 }, commentsSummary: { aggregatedTotalComments: 2 } });
    return jsonResponse({});
  });
  try {
    const account = { credentials: fresh({ expiresAt: Date.now() - 1000, memberUrn: 'urn:li:person:x' }), _app: app };
    const out = await li.metrics(account, 'urn:li:share:1');
    assert.equal(token, 1, 'refreshed before the request');
    assert.equal(out.metrics.likes, 9);
    assert.equal(out.credentials.accessToken, 'li-fresh');
  } finally { restore(); }
});

test('linkedin.publish refreshes and retries on a 401', async () => {
  let token = 0, posts = 0;
  const restore = mockFetch((url) => {
    if (url.includes('/oauth/v2/accessToken')) { token++; return jsonResponse({ access_token: 'li2', expires_in: 5_184_000 }); }
    if (url.includes('/v2/ugcPosts')) {
      posts++;
      return posts === 1
        ? jsonResponse({ message: 'token revoked' }, 401)
        : new Response(JSON.stringify({ id: 'urn:li:share:9' }), { status: 201, headers: { 'content-type': 'application/json', 'x-restli-id': 'urn:li:share:9' } });
    }
    return jsonResponse({});
  });
  try {
    const account = { credentials: fresh({ memberUrn: 'urn:li:person:x' }), _app: app };
    const out = await li.publish(account, { body: 'hello world' });
    assert.equal(token, 1);
    assert.equal(posts, 2, 'retried the share after refresh');
    assert.equal(out.remoteId, 'urn:li:share:9');
    assert.equal(out.credentials.accessToken, 'li2');
  } finally { restore(); }
});
