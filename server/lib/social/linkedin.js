// LinkedIn adapter — OAuth 2.0 + member UGC posting.
// Requires a developer app with the "Sign In with LinkedIn using OpenID Connect"
// and "Share on LinkedIn" products (scope w_member_social). Organization posting
// (w_organization_social) additionally needs LinkedIn partner approval.
export const CHAR_LIMIT = 3000;

import { withRefresh, ensureFresh } from './oauth-fetch.js';

const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';

export const oauth = {
  authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
  tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
  scopes: ['openid', 'profile', 'w_member_social'],
  pkce: false,

  async identity({ tokens }) {
    // OpenID Connect userinfo gives us the member's sub (id), name, picture.
    const r = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.message || `LinkedIn identity lookup failed (${r.status})`);
    return {
      remoteId: j.sub,
      handle: j.name,
      displayName: j.name,
      avatarUrl: j.picture || null,
      credentials: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
        memberUrn: `urn:li:person:${j.sub}`,
      },
    };
  },
};

// Exchange a refresh token for a fresh access token. LinkedIn refresh tokens are
// available to approved apps; client creds go in the body (client_secret_post).
async function refresh(creds, app) {
  if (!creds.refreshToken || !app) throw new Error('LinkedIn session expired — reconnect the account.');
  const body = new URLSearchParams({
    grant_type: 'refresh_token', refresh_token: creds.refreshToken,
    client_id: app.clientId, client_secret: app.clientSecret,
  });
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error('LinkedIn session expired — reconnect the account.');
  return {
    ...creds,
    accessToken: j.access_token,
    refreshToken: j.refresh_token || creds.refreshToken,
    expiresAt: j.expires_in ? Date.now() + j.expires_in * 1000 : creds.expiresAt,
  };
}

// Proactive + reactive token refresh around a single LinkedIn API request.
const af = (account, run) => withRefresh(account, refresh, run);

// Upload an image via the Assets API; returns the asset URN for the share.
async function uploadImageLI(creds, m) {
  const reg = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0', Authorization: `Bearer ${creds.accessToken}` },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: creds.memberUrn,
        serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
      },
    }),
  });
  const rj = await reg.json().catch(() => ({}));
  if (!reg.ok) throw new Error(rj?.message || `LinkedIn upload register failed (${reg.status}).`);
  const asset = rj.value?.asset;
  const uploadUrl = rj.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
  if (!asset || !uploadUrl) throw new Error('LinkedIn upload registration incomplete.');

  const up = await fetch(uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${creds.accessToken}` }, body: m.bytes });
  if (!up.ok) throw new Error(`LinkedIn image upload failed (${up.status}).`);
  return asset;
}

export async function publish(account, post) {
  let creds = account.credentials;
  if (!creds?.accessToken || !creds.memberUrn) throw new Error('LinkedIn account is not connected.');
  creds = await ensureFresh(account, refresh);

  const media = (post.media || []).filter((m) => m.bytes).slice(0, 9);
  const assets = [];
  for (const m of media) assets.push({ urn: await uploadImageLI(creds, m), alt: m.alt || '' });

  const share = {
    shareCommentary: { text: String(post.body || '') },
    shareMediaCategory: assets.length ? 'IMAGE' : 'NONE',
  };
  // `description.text` is the accessibility alt text shown by LinkedIn screen
  // readers; attach it per-image only when the author supplied one.
  if (assets.length) share.media = assets.map((a) => ({
    status: 'READY', media: a.urn,
    ...(a.alt ? { description: { text: String(a.alt).slice(0, 1000) } } : {}),
  }));

  const body = {
    author: creds.memberUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: { 'com.linkedin.ugc.ShareContent': share },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

  const { res, creds: c2 } = await af({ ...account, credentials: creds }, (token) =>
    fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }));
  creds = c2;
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.message || `LinkedIn publish failed (${res.status}).`);

  const urn = res.headers.get('x-restli-id') || j.id;
  return { remoteId: urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}` : null, credentials: creds };
}

export async function metrics(account, remoteId) {
  const { res, creds } = await af(account, (token) =>
    fetch(`https://api.linkedin.com/v2/socialActions/${encodeURIComponent(remoteId)}`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Restli-Protocol-Version': '2.0.0' },
    }));
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.message || `LinkedIn metrics failed (${res.status}).`);
  return { metrics: { likes: j.likesSummary?.totalLikes || 0, comments: j.commentsSummary?.aggregatedTotalComments || 0 }, credentials: creds };
}

export async function verify(account) {
  const { res, creds } = await af(account, (token) =>
    fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${token}` } }));
  if (!res.ok) throw new Error(`LinkedIn token is invalid (${res.status}) — reconnect.`);
  return { ok: true, credentials: creds };
}

// Inbox: comments on the member's recent posts (URNs we published via Beacon).
export async function fetchInbox(account, { recentPostIds = [] } = {}) {
  let creds = account.credentials;
  const items = [];
  for (const urn of recentPostIds.slice(0, 15)) {
    if (!urn) continue;
    const { res, creds: c2 } = await af({ ...account, credentials: creds }, (token) =>
      fetch(`https://api.linkedin.com/v2/socialActions/${encodeURIComponent(urn)}/comments`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Restli-Protocol-Version': '2.0.0' },
      }));
    creds = c2;
    if (!res.ok) continue;
    const j = await res.json().catch(() => ({}));
    for (const c of (j.elements || [])) {
      if (c.actor === creds.memberUrn) continue; // skip our own comments
      const who = String(c.actor || '').split(':').pop();
      items.push({
        remoteId: c['$URN'] || c.id || `${urn}#${c.created?.time || ''}`,
        type: 'comment',
        authorHandle: null, authorName: who ? `LinkedIn member ${who.slice(0, 6)}` : 'LinkedIn member', authorAvatar: null,
        text: c.message?.text || '',
        url: null, replyContext: { shareUrn: urn },
        remoteCreatedAt: c.created?.time ? new Date(c.created.time).toISOString() : null,
      });
    }
  }
  return { items, credentials: creds };
}

export async function reply(account, item, text) {
  const shareUrn = item.replyContext?.shareUrn;
  if (!shareUrn) throw new Error('Missing LinkedIn share reference.');
  const { res, creds } = await af(account, (token, c) =>
    fetch(`https://api.linkedin.com/v2/socialActions/${encodeURIComponent(shareUrn)}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Restli-Protocol-Version': '2.0.0' },
      body: JSON.stringify({ actor: c.memberUrn, message: { text: String(text || '') } }),
    }));
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.message || `LinkedIn reply failed (${res.status}).`);
  return { remoteId: j['$URN'] || j.id, credentials: creds };
}
