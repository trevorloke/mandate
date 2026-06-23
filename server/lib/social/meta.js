// Meta adapter — Facebook Login → post to a Facebook Page feed.
// Requires a Meta developer app. Posting to a Page needs pages_manage_posts +
// pages_read_engagement; production use requires App Review + Business
// verification (dev mode works for the app's own admins/testers).
//
// v1 publishes to a Facebook Page. Instagram publishing (which needs an IG
// Business account linked to the Page + a 2-step media container) is a planned
// follow-up; text-only IG isn't supported by the API, so it needs media first.
const GRAPH = 'https://graph.facebook.com/v19.0';
export const CHAR_LIMIT = 2200;

import { exchangeLongLived, fetchPages, ensureMetaFresh, metaFetch } from './meta-token.js';

// Extend the long-lived user token and re-derive Page tokens from it.
async function refreshCreds(creds, app) {
  const { userToken, expiresAt } = await exchangeLongLived(creds.userToken, app);
  const pages = await fetchPages(userToken);
  return { ...creds, userToken, expiresAt, pages: pages.length ? pages : creds.pages };
}
const pageTokenOf = (creds) => (creds.pages || []).find((p) => p.id === creds.pageId)?.token;

export const oauth = {
  authorizeUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
  tokenUrl: `${GRAPH}/oauth/access_token`,
  scopes: ['public_profile', 'pages_show_list', 'pages_manage_posts', 'pages_read_engagement'],
  pkce: false,
  scopeSep: ',', // Facebook expects comma-separated scopes

  // Facebook's token endpoint is a GET with query params.
  async exchange({ code, redirectUri, app }) {
    const url = `${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(app.clientId)}`
      + `&redirect_uri=${encodeURIComponent(redirectUri)}`
      + `&client_secret=${encodeURIComponent(app.clientSecret)}`
      + `&code=${encodeURIComponent(code)}`;
    const r = await fetch(url);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `Facebook token exchange failed (${r.status})`);
    return j;
  },

  async identity({ tokens, app }) {
    let userToken = tokens.access_token;
    let expiresAt = null;
    // Upgrade to a long-lived user token (~60 days).
    try {
      const ll = await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token`
        + `&client_id=${encodeURIComponent(app.clientId)}`
        + `&client_secret=${encodeURIComponent(app.clientSecret)}`
        + `&fb_exchange_token=${encodeURIComponent(userToken)}`).then((r) => r.json());
      if (ll.access_token) { userToken = ll.access_token; expiresAt = ll.expires_in ? Date.now() + ll.expires_in * 1000 : null; }
    } catch { /* keep short-lived token */ }

    const me = await fetch(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(userToken)}`).then((r) => r.json());
    // Also pull each Page's linked Instagram Business account, if any.
    const pagesResp = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}&access_token=${encodeURIComponent(userToken)}`).then((r) => r.json());
    const pages = (pagesResp.data || []).map((p) => ({
      id: p.id, name: p.name, token: p.access_token,
      ig: p.instagram_business_account || null,
    }));
    const primary = pages[0] || null;

    // Each linked IG account becomes its own connected 'instagram' account.
    const extraAccounts = [];
    for (const p of pages) {
      if (p.ig?.id) {
        extraAccounts.push({
          platform: 'instagram',
          handle: p.ig.username ? '@' + p.ig.username : p.name,
          displayName: p.ig.username || p.name,
          avatarUrl: p.ig.profile_picture_url || null,
          remoteId: p.ig.id,
          // Carry the user token so the IG account can self-refresh its Page token.
          credentials: { igUserId: p.ig.id, pageId: p.id, pageToken: p.token, userToken, expiresAt },
        });
      }
    }

    return {
      remoteId: me.id,
      handle: primary ? primary.name : (me.name || 'Facebook'),
      displayName: primary ? primary.name : (me.name || 'Facebook'),
      avatarUrl: null,
      credentials: { userToken, expiresAt, pages: pages.map((p) => ({ id: p.id, name: p.name, token: p.token })), pageId: primary?.id || null },
      extraAccounts,
    };
  },
};

export async function publish(account, post) {
  let creds = account.credentials;
  if (!creds?.pageId) throw new Error('No Facebook Page selected — reconnect and grant Page access.');
  creds = await ensureMetaFresh(account, refreshCreds); // proactive token refresh
  const page = (creds.pages || []).find((p) => p.id === creds.pageId);
  if (!page?.token) throw new Error('Missing Page access token — reconnect the account.');

  const message = String(post.body || '');
  const photos = (post.media || []).filter((m) => m.url);

  let id;
  if (photos.length === 0) {
    // Text feed post.
    const r = await fetch(`${GRAPH}/${creds.pageId}/feed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, access_token: page.token }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `Facebook publish failed (${r.status}).`);
    id = j.id;
  } else if (photos.length === 1) {
    const r = await fetch(`${GRAPH}/${creds.pageId}/photos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: photos[0].url, caption: message, access_token: page.token }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `Facebook publish failed (${r.status}).`);
    id = j.post_id || j.id;
  } else {
    // Multi-photo: upload each unpublished, then attach to a single feed post.
    const attached = [];
    for (const m of photos) {
      const r = await fetch(`${GRAPH}/${creds.pageId}/photos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: m.url, published: false, access_token: page.token }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error?.message || `Facebook photo upload failed (${r.status}).`);
      attached.push({ media_fbid: j.id });
    }
    const r = await fetch(`${GRAPH}/${creds.pageId}/feed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, attached_media: attached, access_token: page.token }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `Facebook publish failed (${r.status}).`);
    id = j.id;
  }

  return { remoteId: id, url: id ? `https://www.facebook.com/${id}` : null, credentials: creds };
}

export async function metrics(account, remoteId) {
  if (!pageTokenOf(account.credentials)) throw new Error('Missing Page access token.');
  const { res, json, creds } = await metaFetch(account, refreshCreds, (c) =>
    fetch(`${GRAPH}/${remoteId}?fields=likes.summary(true),comments.summary(true),shares&access_token=${encodeURIComponent(pageTokenOf(c))}`));
  if (!res.ok) throw new Error(json?.error?.message || `Facebook metrics failed (${res.status}).`);
  return { metrics: { likes: json.likes?.summary?.total_count || 0, comments: json.comments?.summary?.total_count || 0, shares: json.shares?.count || 0 }, credentials: creds };
}

export async function verify(account) {
  const { res, creds } = await metaFetch(account, refreshCreds, (c) =>
    fetch(`${GRAPH}/me?access_token=${encodeURIComponent(pageTokenOf(c) || c.userToken)}`));
  if (!res.ok) throw new Error(`Facebook token is invalid (${res.status}) — reconnect.`);
  return { ok: true, credentials: creds };
}

// Pull comments on recent Page posts for the inbox.
export async function fetchInbox(account, { postLimit = 10 } = {}) {
  if (!pageTokenOf(account.credentials)) throw new Error('Missing Page access token.');
  const { res, json: feed, creds } = await metaFetch(account, refreshCreds, (c) =>
    fetch(`${GRAPH}/${c.pageId}/feed?fields=id,permalink_url,comments.limit(25){id,message,from,created_time,permalink_url}&limit=${postLimit}&access_token=${encodeURIComponent(pageTokenOf(c))}`));
  if (!res.ok) throw new Error(feed?.error?.message || `Facebook inbox failed (${res.status}).`);
  const items = [];
  for (const post of (feed.data || [])) {
    for (const c of (post.comments?.data || [])) {
      if (c.from?.id === creds.pageId) continue; // skip our own replies
      items.push({
        remoteId: c.id, type: 'comment',
        authorHandle: null, authorName: c.from?.name || 'Someone', authorAvatar: null,
        text: c.message || '', url: c.permalink_url || post.permalink_url, replyContext: { commentId: c.id }, remoteCreatedAt: c.created_time,
      });
    }
  }
  return { items, credentials: creds };
}

export async function reply(account, item, text) {
  if (!pageTokenOf(account.credentials)) throw new Error('Missing Page access token.');
  const { res, json, creds } = await metaFetch(account, refreshCreds, (c) =>
    fetch(`${GRAPH}/${item.replyContext?.commentId}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: String(text || ''), access_token: pageTokenOf(c) }),
    }));
  if (!res.ok) throw new Error(json?.error?.message || `Facebook reply failed (${res.status}).`);
  return { remoteId: json.id, credentials: creds };
}

export async function audience(account) {
  if (!pageTokenOf(account.credentials)) throw new Error('Missing Page token.');
  const { res, json, creds } = await metaFetch(account, refreshCreds, (c) =>
    fetch(`${GRAPH}/${c.pageId}?fields=fan_count&access_token=${encodeURIComponent(pageTokenOf(c))}`));
  if (!res.ok) throw new Error('Facebook page fetch failed.');
  return { followers: json.fan_count || 0, credentials: creds };
}
