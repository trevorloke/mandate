// Instagram adapter (Graph API). Instagram is connected *through* Meta: when a
// Facebook Page with a linked IG Business account is authorized, we store an
// 'instagram' account whose credentials carry { igUserId, pageToken }.
//
// Publishing is a 2-step container flow and REQUIRES a publicly reachable image
// URL (set MANDATE_PUBLIC_URL so the worker can build one). Text-only IG posts
// are not supported by the API.
const GRAPH = 'https://graph.facebook.com/v19.0';
export const CHAR_LIMIT = 2200;

import { exchangeLongLived, fetchPages, ensureMetaFresh, metaFetch } from './meta-token.js';

// Refresh the user token and re-derive this account's Page token (the IG Graph
// API authenticates with the linked Page's token).
async function refreshCreds(creds, app) {
  const { userToken, expiresAt } = await exchangeLongLived(creds.userToken, app);
  const pages = await fetchPages(userToken);
  const page = pages.find((p) => p.id === creds.pageId);
  return { ...creds, userToken, expiresAt, pageToken: page?.token || creds.pageToken };
}

async function igContainer(igUserId, token, params) {
  const r = await fetch(`${GRAPH}/${igUserId}/media`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, access_token: token }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Instagram container failed (${r.status}).`);
  return j.id;
}

export async function publish(account, post) {
  let creds = account.credentials;
  if (!creds?.igUserId || !creds?.pageToken) throw new Error('Instagram account is not connected.');
  const media = (post.media || []).filter((m) => m.url).slice(0, 10);
  if (media.length === 0) throw new Error('Instagram requires an image with a public URL (set MANDATE_PUBLIC_URL).');
  const caption = String(post.body || '');
  creds = await ensureMetaFresh(account, refreshCreds); // proactive token refresh
  const { igUserId, pageToken: token } = creds;

  // 1) Build a container — single image, or a CAROUSEL of child containers.
  let creationId;
  if (media.length === 1) {
    creationId = await igContainer(igUserId, token, { image_url: media[0].url, caption });
  } else {
    const children = [];
    for (const m of media) children.push(await igContainer(igUserId, token, { image_url: m.url, is_carousel_item: true }));
    creationId = await igContainer(igUserId, token, { media_type: 'CAROUSEL', caption, children });
  }

  // 2) Publish the container.
  const pubRes = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: creationId, access_token: token }),
  });
  const published = await pubRes.json().catch(() => ({}));
  if (!pubRes.ok) throw new Error(published?.error?.message || `Instagram publish failed (${pubRes.status}).`);

  const id = published.id;
  const user = (account.handle || '').replace(/^@/, '');
  return { remoteId: id, url: user ? `https://www.instagram.com/${user}/` : 'https://www.instagram.com/', credentials: creds };
}

export async function metrics(account, remoteId) {
  const { res, json, creds } = await metaFetch(account, refreshCreds, (c) =>
    fetch(`${GRAPH}/${remoteId}?fields=like_count,comments_count&access_token=${encodeURIComponent(c.pageToken)}`));
  if (!res.ok) throw new Error(json?.error?.message || `Instagram metrics failed (${res.status}).`);
  return { metrics: { likes: json.like_count || 0, comments: json.comments_count || 0 }, credentials: creds };
}

export async function verify(account) {
  const { res, creds } = await metaFetch(account, refreshCreds, (c) =>
    fetch(`${GRAPH}/${c.igUserId}?fields=id&access_token=${encodeURIComponent(c.pageToken)}`));
  if (!res.ok) throw new Error(`Instagram token is invalid (${res.status}) — reconnect.`);
  return { ok: true, credentials: creds };
}

// Pull comments on recent media for the inbox.
export async function fetchInbox(account, { mediaLimit = 8 } = {}) {
  const { res, json: m, creds } = await metaFetch(account, refreshCreds, (c) =>
    fetch(`${GRAPH}/${c.igUserId}/media?fields=id,permalink&limit=${mediaLimit}&access_token=${encodeURIComponent(c.pageToken)}`));
  if (!res.ok) throw new Error(m?.error?.message || `Instagram inbox failed (${res.status}).`);
  const items = [];
  for (const media of (m.data || [])) {
    const cm = await fetch(`${GRAPH}/${media.id}/comments?fields=id,text,username,timestamp&access_token=${encodeURIComponent(creds.pageToken)}`)
      .then((r) => r.json()).catch(() => ({}));
    for (const c of (cm.data || [])) {
      items.push({
        remoteId: c.id, type: 'comment',
        authorHandle: c.username ? '@' + c.username : null, authorName: c.username, authorAvatar: null,
        text: c.text || '', url: media.permalink, replyContext: { commentId: c.id }, remoteCreatedAt: c.timestamp,
      });
    }
  }
  return { items, credentials: creds };
}

export async function reply(account, item, text) {
  const { res, json, creds } = await metaFetch(account, refreshCreds, (c) =>
    fetch(`${GRAPH}/${item.replyContext?.commentId}/replies`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: String(text || ''), access_token: c.pageToken }),
    }));
  if (!res.ok) throw new Error(json?.error?.message || `Instagram reply failed (${res.status}).`);
  return { remoteId: json.id, credentials: creds };
}

export async function audience(account) {
  const { res, json, creds } = await metaFetch(account, refreshCreds, (c) =>
    fetch(`${GRAPH}/${c.igUserId}?fields=followers_count&access_token=${encodeURIComponent(c.pageToken)}`));
  if (!res.ok) throw new Error('Instagram profile fetch failed.');
  return { followers: json.followers_count || 0, credentials: creds };
}
