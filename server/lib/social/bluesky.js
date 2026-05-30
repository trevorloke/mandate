// Bluesky (AT Protocol) adapter.
// Open API — no developer app needed. The user authenticates with their handle
// and an *app password* (bsky.app → Settings → App Passwords). We hold the
// resulting session JWTs and refresh them transparently when they expire.
const DEFAULT_SERVICE = 'https://bsky.social';
export const CHAR_LIMIT = 300;

async function xrpc(service, nsid, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${service}/xrpc/${nsid}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

// Establish a session from handle + app password.
export async function connect({ identifier, appPassword, service }) {
  identifier = String(identifier || '').trim().replace(/^@/, '');
  service = (service || DEFAULT_SERVICE).replace(/\/$/, '');
  if (!identifier || !appPassword) throw new Error('Handle and app password are required.');

  const { ok, status, json } = await xrpc(service, 'com.atproto.server.createSession', {
    method: 'POST', body: { identifier, password: appPassword },
  });
  if (!ok) {
    throw new Error(json?.message || `Bluesky sign-in failed (${status}). Check the handle and app password.`);
  }

  // Best-effort profile fetch for display name + avatar.
  let displayName = json.handle, avatarUrl = null;
  const prof = await xrpc(service, `app.bsky.actor.getProfile?actor=${encodeURIComponent(json.did)}`, { token: json.accessJwt });
  if (prof.ok) { displayName = prof.json.displayName || json.handle; avatarUrl = prof.json.avatar || null; }

  return {
    platform: 'bluesky',
    handle: '@' + json.handle,
    displayName,
    avatarUrl,
    remoteId: json.did,
    instanceUrl: service,
    credentials: { service, did: json.did, handle: json.handle, accessJwt: json.accessJwt, refreshJwt: json.refreshJwt },
  };
}

async function refresh(creds) {
  const { ok, json } = await xrpc(creds.service, 'com.atproto.server.refreshSession', {
    method: 'POST', token: creds.refreshJwt,
  });
  if (!ok) throw new Error('Bluesky session expired — please reconnect the account.');
  return { ...creds, accessJwt: json.accessJwt, refreshJwt: json.refreshJwt };
}

// Upload raw image bytes as a blob (com.atproto.repo.uploadBlob).
async function uploadBlob(service, token, bytes, mime) {
  const res = await fetch(`${service}/xrpc/com.atproto.repo.uploadBlob`, {
    method: 'POST',
    headers: { 'Content-Type': mime || 'application/octet-stream', Authorization: `Bearer ${token}` },
    body: bytes,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, blob: json.blob, message: json.message };
}

// Publish a text post (optionally with up to 4 images). Returns
// { remoteId, url, credentials } — credentials carry any refreshed tokens.
export async function publish(account, post) {
  let creds = account.credentials;
  if (!creds?.accessJwt) throw new Error('Bluesky account is not connected.');
  const text = String(post.body || '');
  if ([...text].length > CHAR_LIMIT) throw new Error(`Bluesky posts are limited to ${CHAR_LIMIT} characters.`);

  const record = { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString() };

  // Attach images (max 4), uploading each as a blob; refresh token on 401.
  const media = (post.media || []).filter((m) => m.bytes).slice(0, 4);
  if (media.length) {
    const images = [];
    for (const m of media) {
      let up = await uploadBlob(creds.service, creds.accessJwt, m.bytes, m.mime);
      if (up.status === 401) { creds = await refresh(creds); up = await uploadBlob(creds.service, creds.accessJwt, m.bytes, m.mime); }
      if (!up.ok || !up.blob) throw new Error(up.message || 'Bluesky image upload failed.');
      images.push({ alt: '', image: up.blob });
    }
    record.embed = { $type: 'app.bsky.embed.images', images };
  }

  const create = (token) => xrpc(creds.service, 'com.atproto.repo.createRecord', {
    method: 'POST', token,
    body: { repo: creds.did, collection: 'app.bsky.feed.post', record },
  });

  let res = await create(creds.accessJwt);
  if (res.status === 400 && /expired|invalid/i.test(res.json?.message || '') || res.status === 401) {
    creds = await refresh(creds);
    res = await create(creds.accessJwt);
  }
  if (!res.ok) throw new Error(res.json?.message || `Bluesky publish failed (${res.status}).`);

  const rkey = String(res.json.uri || '').split('/').pop();
  const url = `https://bsky.app/profile/${creds.handle}/post/${rkey}`;
  return { remoteId: res.json.uri, url, credentials: creds };
}
