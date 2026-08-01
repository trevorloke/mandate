// Meta/Instagram token refresh: long-lived user-token re-exchange + Page-token
// re-derivation, triggered proactively (near expiry) and reactively (Graph error
// code 190). Network mocked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockFetch, jsonResponse } from './helpers.js';

const meta = await import('../lib/social/meta.js');
const ig = await import('../lib/social/instagram.js');
const { isMetaAuthError } = await import('../lib/social/meta-token.js');

const app = { clientId: 'c', clientSecret: 's' };
const oauthErr = (msg = 'expired') => jsonResponse({ error: { code: 190, type: 'OAuthException', message: msg } }, 400);

// Route the Graph refresh calls (token exchange + page list) for a mock.
function graphRefresh(url, { newUser = 'u-new', newPage = 'pt-new' } = {}) {
  if (url.includes('grant_type=fb_exchange_token')) return jsonResponse({ access_token: newUser, expires_in: 5_184_000 });
  if (url.includes('/me/accounts')) return jsonResponse({ data: [{ id: 'p1', name: 'P', access_token: newPage }] });
  return null;
}

test('isMetaAuthError catches code 190 and 401', () => {
  assert.equal(isMetaAuthError({ status: 400 }, { error: { code: 190 } }), true);
  assert.equal(isMetaAuthError({ status: 401 }, {}), true);
  assert.equal(isMetaAuthError({ status: 400 }, { error: { code: 100 } }), false);
  assert.equal(isMetaAuthError({ status: 200 }, {}), false);
});

test('meta.metrics refreshes proactively when the user token is near expiry', async () => {
  let refreshes = 0;
  const restore = mockFetch((url) => {
    const g = graphRefresh(url); if (g) { if (url.includes('fb_exchange_token')) refreshes++; return g; }
    if (url.includes('access_token=pt-new')) return jsonResponse({ likes: { summary: { total_count: 12 } }, comments: { summary: { total_count: 3 } }, shares: { count: 1 } });
    return jsonResponse({ error: { message: 'stale token used' } }, 400);
  });
  try {
    const account = { _app: app, credentials: { userToken: 'u-old', expiresAt: Date.now() - 1000, pages: [{ id: 'p1', name: 'P', token: 'pt-old' }], pageId: 'p1' } };
    const out = await meta.metrics(account, '999');
    assert.equal(refreshes, 1, 'refreshed before the request');
    assert.equal(out.metrics.likes, 12);
    assert.equal(out.credentials.pages[0].token, 'pt-new', 'returns re-derived page token for persistence');
  } finally { restore(); }
});

test('meta.metrics refreshes reactively on a code-190 error then retries', async () => {
  let metricCalls = 0;
  const restore = mockFetch((url) => {
    const g = graphRefresh(url); if (g) return g;
    if (url.includes('/999?')) { // the metrics endpoint
      metricCalls++;
      return metricCalls === 1 ? oauthErr() : jsonResponse({ likes: { summary: { total_count: 4 } } });
    }
    return jsonResponse({});
  });
  try {
    const account = { _app: app, credentials: { userToken: 'u-old', expiresAt: Date.now() + 3600_000, pages: [{ id: 'p1', name: 'P', token: 'pt-old' }], pageId: 'p1' } };
    const out = await meta.metrics(account, '999');
    assert.equal(metricCalls, 2, 'retried after refresh');
    assert.equal(out.metrics.likes, 4);
    assert.equal(out.credentials.pages[0].token, 'pt-new');
  } finally { restore(); }
});

test('instagram.metrics refreshes reactively on a code-190 error', async () => {
  let metricCalls = 0;
  const restore = mockFetch((url) => {
    const g = graphRefresh(url); if (g) return g;
    if (url.includes('/m99?')) {
      metricCalls++;
      return metricCalls === 1 ? oauthErr() : jsonResponse({ like_count: 8, comments_count: 2 });
    }
    return jsonResponse({});
  });
  try {
    const account = { _app: app, credentials: { igUserId: 'ig1', pageId: 'p1', pageToken: 'pt-old', userToken: 'u-old', expiresAt: Date.now() + 3600_000 } };
    const out = await ig.metrics(account, 'm99');
    assert.equal(metricCalls, 2);
    assert.equal(out.metrics.likes, 8);
    assert.equal(out.credentials.pageToken, 'pt-new', 'IG re-derived its page token from the refreshed user token');
  } finally { restore(); }
});

test('no refresh when the account lacks a user token (legacy connection)', async () => {
  let refreshes = 0;
  const restore = mockFetch((url) => {
    if (url.includes('fb_exchange_token')) { refreshes++; return jsonResponse({ access_token: 'x' }); }
    return oauthErr(); // metrics call 401s
  });
  try {
    const account = { _app: app, credentials: { igUserId: 'ig1', pageId: 'p1', pageToken: 'pt-old' } }; // no userToken
    await assert.rejects(() => ig.metrics(account, 'm1'));
    assert.equal(refreshes, 0, 'cannot refresh without a user token → error surfaces for reconnect');
  } finally { restore(); }
});
