// X / Twitter adapter — API v2 with OAuth 2.0 Authorization Code + PKCE.
// Requires a developer app (client id/secret) and, for posting, a paid API tier.
// Scopes: tweet.write to post, offline.access for refresh tokens.
export const CHAR_LIMIT = 280;

const TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';

function basicAuth(app) {
  return 'Basic ' + Buffer.from(`${app.clientId}:${app.clientSecret}`).toString('base64');
}

export const oauth = {
  authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
  tokenUrl: TOKEN_URL,
  scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
  pkce: true,
  clientAuth: 'basic', // X confidential clients authenticate on the token endpoint with Basic

  async identity({ tokens }) {
    const r = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url,username,name', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.detail || `X identity lookup failed (${r.status})`);
    const u = j.data || {};
    return {
      remoteId: u.id,
      handle: u.username ? '@' + u.username : null,
      displayName: u.name || u.username,
      avatarUrl: u.profile_image_url || null,
      credentials: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt: Date.now() + (tokens.expires_in || 7200) * 1000,
        username: u.username,
      },
    };
  },
};

async function refresh(creds, app) {
  if (!creds.refreshToken || !app) throw new Error('X session expired — reconnect the account.');
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: creds.refreshToken, client_id: app.clientId });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuth(app) },
    body,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('X session expired — reconnect the account.');
  return {
    ...creds,
    accessToken: j.access_token,
    refreshToken: j.refresh_token || creds.refreshToken,
    expiresAt: Date.now() + (j.expires_in || 7200) * 1000,
  };
}

// Upload image bytes via the v1.1 media endpoint (works with OAuth2 user
// context); returns a media_id_string to attach to a v2 tweet.
async function uploadMediaX(token, m) {
  const fd = new FormData();
  fd.append('media', new Blob([m.bytes], { type: m.mime || 'application/octet-stream' }));
  const res = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(j?.errors?.[0]?.message || j?.error || `X media upload failed (${res.status}).`);
    e.status = res.status;
    throw e;
  }
  // Best-effort alt text.
  if (m.alt) {
    await fetch('https://upload.twitter.com/1.1/media/metadata/create.json', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ media_id: j.media_id_string, alt_text: { text: String(m.alt).slice(0, 1000) } }),
    }).catch(() => {});
  }
  return j.media_id_string;
}

export async function publish(account, post) {
  let creds = account.credentials;
  if (!creds?.accessToken) throw new Error('X account is not connected.');
  const text = String(post.body || '');
  if ([...text].length > CHAR_LIMIT) throw new Error(`X posts are limited to ${CHAR_LIMIT} characters.`);

  // Refresh proactively if the token is near expiry.
  if (creds.expiresAt && creds.expiresAt < Date.now() + 15_000) {
    creds = await refresh(creds, account._app);
  }

  // Upload images (max 4), refreshing the token once on 401.
  const media = (post.media || []).filter((m) => m.bytes).slice(0, 4);
  const mediaIds = [];
  for (const m of media) {
    try {
      mediaIds.push(await uploadMediaX(creds.accessToken, m));
    } catch (e) {
      if (e.status === 401 && creds.refreshToken && account._app) {
        creds = await refresh(creds, account._app);
        mediaIds.push(await uploadMediaX(creds.accessToken, m));
      } else throw e;
    }
  }

  const payload = { text };
  if (mediaIds.length) payload.media = { media_ids: mediaIds };

  const doPost = (token) => fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });

  let res = await doPost(creds.accessToken);
  if (res.status === 401 && creds.refreshToken && account._app) {
    creds = await refresh(creds, account._app);
    res = await doPost(creds.accessToken);
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.detail || j?.title || `X publish failed (${res.status}).`);

  const id = j.data?.id;
  const user = creds.username || (account.handle || '').replace(/^@/, '');
  const url = id ? (user ? `https://x.com/${user}/status/${id}` : `https://x.com/i/status/${id}`) : null;
  return { remoteId: id, url, credentials: creds };
}

export async function metrics(account, remoteId) {
  let creds = account.credentials;
  if (creds.expiresAt && creds.expiresAt < Date.now() + 15_000 && account._app) creds = await refresh(creds, account._app);
  const r = await fetch(`https://api.twitter.com/2/tweets/${remoteId}?tweet.fields=public_metrics`, { headers: { Authorization: `Bearer ${creds.accessToken}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.detail || j?.title || `X metrics failed (${r.status}).`);
  const m = j.data?.public_metrics || {};
  return { metrics: { likes: m.like_count || 0, reposts: m.retweet_count || 0, replies: m.reply_count || 0, quotes: m.quote_count || 0, impressions: m.impression_count || 0 }, credentials: creds };
}

export async function verify(account) {
  let creds = account.credentials;
  if (creds.expiresAt && creds.expiresAt < Date.now() + 15_000 && account._app) creds = await refresh(creds, account._app);
  const r = await fetch('https://api.twitter.com/2/users/me', { headers: { Authorization: `Bearer ${creds.accessToken}` } });
  if (!r.ok) throw new Error(`X token is invalid (${r.status}) — reconnect.`);
  return { ok: true, credentials: creds };
}

// Pull recent @-mentions for the inbox.
export async function fetchInbox(account, { limit = 40 } = {}) {
  let creds = account.credentials;
  if (creds.expiresAt && creds.expiresAt < Date.now() + 15_000 && account._app) creds = await refresh(creds, account._app);
  const uid = account.remoteId;
  if (!uid) throw new Error('Missing X user id.');
  const url = `https://api.twitter.com/2/users/${uid}/mentions?max_results=${Math.min(limit, 100)}`
    + `&expansions=author_id&tweet.fields=created_at&user.fields=username,name,profile_image_url`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${creds.accessToken}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.detail || j?.title || `X mentions failed (${r.status}).`);
  const users = {};
  for (const u of (j.includes?.users || [])) users[u.id] = u;
  const items = (j.data || []).map((t) => {
    const u = users[t.author_id] || {};
    return {
      remoteId: t.id, type: 'mention',
      authorHandle: u.username ? '@' + u.username : null, authorName: u.name || u.username, authorAvatar: u.profile_image_url || null,
      text: t.text || '', url: u.username ? `https://x.com/${u.username}/status/${t.id}` : null,
      replyContext: { tweetId: t.id }, remoteCreatedAt: t.created_at,
    };
  });
  return { items, credentials: creds };
}

export async function reply(account, item, text) {
  let creds = account.credentials;
  if (creds.expiresAt && creds.expiresAt < Date.now() + 15_000 && account._app) creds = await refresh(creds, account._app);
  const r = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.accessToken}` },
    body: JSON.stringify({ text: String(text || ''), reply: { in_reply_to_tweet_id: item.replyContext?.tweetId } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.detail || j?.title || `X reply failed (${r.status}).`);
  const id = j.data?.id;
  const user = creds.username;
  return { remoteId: id, url: user ? `https://x.com/${user}/status/${id}` : null, credentials: creds };
}

export async function publishThread(account, segments, opts = {}) {
  let creds = account.credentials;
  if (creds.expiresAt && creds.expiresAt < Date.now() + 15_000 && account._app) creds = await refresh(creds, account._app);
  let prevId = null, firstId = null;
  for (let i = 0; i < segments.length; i++) {
    const text = String(segments[i] || '');
    if ([...text].length > CHAR_LIMIT) throw new Error(`Thread tweet ${i + 1} exceeds ${CHAR_LIMIT} characters.`);
    const payload = { text };
    if (i === 0 && (opts.media || []).length) {
      const ids = [];
      for (const m of opts.media.filter((x) => x.bytes).slice(0, 4)) ids.push(await uploadMediaX(creds.accessToken, m));
      if (ids.length) payload.media = { media_ids: ids };
    }
    if (prevId) payload.reply = { in_reply_to_tweet_id: prevId };
    const r = await fetch('https://api.twitter.com/2/tweets', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.accessToken}` }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.detail || j?.title || `X thread tweet ${i + 1} failed.`);
    prevId = j.data?.id; if (i === 0) firstId = prevId;
  }
  const user = creds.username;
  return { remoteId: firstId, url: firstId && user ? `https://x.com/${user}/status/${firstId}` : null, credentials: creds };
}

export async function audience(account) {
  let creds = account.credentials;
  if (creds.expiresAt && creds.expiresAt < Date.now() + 15_000 && account._app) creds = await refresh(creds, account._app);
  const r = await fetch('https://api.twitter.com/2/users/me?user.fields=public_metrics', { headers: { Authorization: `Bearer ${creds.accessToken}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('X profile fetch failed.');
  return { followers: j.data?.public_metrics?.followers_count || 0, credentials: creds };
}
