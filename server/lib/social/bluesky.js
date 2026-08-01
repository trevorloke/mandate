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

const enc = new TextEncoder();
const blen = (s) => enc.encode(s).length;
const decodeEntities = (s) => String(s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// Compute richtext facets (links, #tags, @mentions) with UTF-8 byte offsets so
// they render as clickable rich text rather than plain strings.
async function buildFacets(text, service, token) {
  const facets = [];
  let m;
  const urlRe = /(https?:\/\/[^\s]+)/g;
  while ((m = urlRe.exec(text))) {
    const url = m[1].replace(/[.,;!?)\]]+$/, '');
    const start = blen(text.slice(0, m.index));
    facets.push({ index: { byteStart: start, byteEnd: start + blen(url) }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }] });
  }
  const tagRe = /(^|\s)(#[^\s#]+)/g;
  while ((m = tagRe.exec(text))) {
    const at = m.index + m[1].length;
    const start = blen(text.slice(0, at));
    facets.push({ index: { byteStart: start, byteEnd: start + blen(m[2]) }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[2].slice(1) }] });
  }
  const menRe = /(^|\s)(@[a-zA-Z0-9][a-zA-Z0-9.-]+)/g;
  const mentions = [];
  while ((m = menRe.exec(text))) mentions.push({ handle: m[2].slice(1).replace(/\.+$/, ''), at: m.index + m[1].length, raw: m[2] });
  for (const mn of mentions) {
    try {
      const r = await fetch(`${service}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(mn.handle)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const j = await r.json().catch(() => ({}));
      if (j.did) {
        const start = blen(text.slice(0, mn.at));
        facets.push({ index: { byteStart: start, byteEnd: start + blen('@' + mn.handle) }, features: [{ $type: 'app.bsky.richtext.facet#mention', did: j.did }] });
      }
    } catch { /* skip unresolved mention */ }
  }
  return facets.length ? facets : undefined;
}

// Best-effort external link card from a URL's OpenGraph metadata.
async function fetchCard(url, service, token) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mandate-Beacon/1.0' }, redirect: 'follow' });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 200_000);
    const og = (p) => {
      const a = html.match(new RegExp(`<meta[^>]+property=["']og:${p}["'][^>]+content=["']([^"']*)["']`, 'i'));
      const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:${p}["']`, 'i'));
      return (a && a[1]) || (b && b[1]) || null;
    };
    const title = decodeEntities(og('title') || (html.match(/<title>([^<]*)<\/title>/i)?.[1]) || url).slice(0, 300);
    const description = decodeEntities(og('description') || '').slice(0, 1000);
    const external = { uri: url, title, description };
    // Upload the OG image as a thumb when present.
    const img = og('image');
    if (img) {
      try {
        const ir = await fetch(img);
        if (ir.ok) {
          const bytes = Buffer.from(await ir.arrayBuffer());
          const mime = ir.headers.get('content-type') || 'image/jpeg';
          const up = await uploadBlob(service, token, bytes, mime);
          if (up.ok && up.blob) external.thumb = up.blob;
        }
      } catch { /* thumb optional */ }
    }
    return external;
  } catch { return null; }
}

// Publish a text post (optionally with up to 4 images). Returns
// { remoteId, url, credentials } — credentials carry any refreshed tokens.
export async function publish(account, post) {
  let creds = account.credentials;
  if (!creds?.accessJwt) throw new Error('Bluesky account is not connected.');
  const text = String(post.body || '');
  if ([...text].length > CHAR_LIMIT) throw new Error(`Bluesky posts are limited to ${CHAR_LIMIT} characters.`);

  const record = { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString() };

  // Rich text: clickable links, #tags, @mentions.
  const facets = await buildFacets(text, creds.service, creds.accessJwt);
  if (facets) record.facets = facets;

  // Attach images (max 4), uploading each as a blob; refresh token on 401.
  const media = (post.media || []).filter((m) => m.bytes).slice(0, 4);
  if (media.length) {
    const images = [];
    for (const m of media) {
      let up = await uploadBlob(creds.service, creds.accessJwt, m.bytes, m.mime);
      if (up.status === 401) { creds = await refresh(creds); up = await uploadBlob(creds.service, creds.accessJwt, m.bytes, m.mime); }
      if (!up.ok || !up.blob) throw new Error(up.message || 'Bluesky image upload failed.');
      images.push({ alt: m.alt || '', image: up.blob });
    }
    record.embed = { $type: 'app.bsky.embed.images', images };
  } else {
    // No images — if the text has a link, attach a preview card (best-effort).
    const firstLink = (text.match(/(https?:\/\/[^\s]+)/) || [])[0];
    if (firstLink) {
      const external = await fetchCard(firstLink.replace(/[.,;!?)\]]+$/, ''), creds.service, creds.accessJwt);
      if (external) record.embed = { $type: 'app.bsky.embed.external', external };
    }
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

// Fetch engagement counts for a published post (by its at:// uri).
export async function metrics(account, remoteId) {
  let creds = account.credentials;
  const get = (token) => xrpc(creds.service, `app.bsky.feed.getPosts?uris=${encodeURIComponent(remoteId)}`, { token });
  let r = await get(creds.accessJwt);
  if (r.status === 401) { creds = await refresh(creds); r = await get(creds.accessJwt); }
  if (!r.ok) throw new Error(r.json?.message || `Bluesky metrics failed (${r.status}).`);
  const p = r.json.posts?.[0] || {};
  return { metrics: { likes: p.likeCount || 0, reposts: p.repostCount || 0, replies: p.replyCount || 0, quotes: p.quoteCount || 0 }, credentials: creds };
}

// Health check — confirm the session is usable, refreshing if needed.
export async function verify(account) {
  let creds = account.credentials;
  let r = await xrpc(creds.service, 'com.atproto.server.getSession', { token: creds.accessJwt });
  if (r.status === 401) { creds = await refresh(creds); r = await xrpc(creds.service, 'com.atproto.server.getSession', { token: creds.accessJwt }); }
  if (!r.ok) throw new Error(r.json?.message || 'Bluesky session is invalid — reconnect.');
  return { ok: true, credentials: creds };
}

// Pull recent replies/mentions/quotes from notifications.
export async function fetchInbox(account, { limit = 40 } = {}) {
  let creds = account.credentials;
  const get = (token) => xrpc(creds.service, `app.bsky.notification.listNotifications?limit=${limit}`, { token });
  let r = await get(creds.accessJwt);
  if (r.status === 401) { creds = await refresh(creds); r = await get(creds.accessJwt); }
  if (!r.ok) throw new Error(r.json?.message || 'Bluesky notifications failed.');
  const items = [];
  for (const n of (r.json.notifications || [])) {
    if (!['reply', 'mention', 'quote'].includes(n.reason)) continue;
    const rec = n.record || {};
    const rkey = String(n.uri).split('/').pop();
    const parent = { uri: n.uri, cid: n.cid };
    const root = rec.reply?.root ? { uri: rec.reply.root.uri, cid: rec.reply.root.cid } : parent;
    items.push({
      remoteId: n.uri, type: n.reason,
      authorHandle: '@' + n.author.handle, authorName: n.author.displayName || n.author.handle, authorAvatar: n.author.avatar || null,
      text: rec.text || '', parentRemoteId: n.reasonSubject || rec.reply?.parent?.uri || null,
      url: `https://bsky.app/profile/${n.author.handle}/post/${rkey}`,
      replyContext: { parent, root },
      remoteCreatedAt: n.indexedAt,
    });
  }
  return { items, credentials: creds };
}

// Reply to an inbox item (threaded).
export async function reply(account, item, text) {
  let creds = account.credentials;
  const ctx = item.replyContext || {};
  if (!ctx.parent || !ctx.root) throw new Error('Missing reply context.');
  const record = { $type: 'app.bsky.feed.post', text: String(text || ''), createdAt: new Date().toISOString(), reply: { root: ctx.root, parent: ctx.parent } };
  const create = (token) => xrpc(creds.service, 'com.atproto.repo.createRecord', { method: 'POST', token, body: { repo: creds.did, collection: 'app.bsky.feed.post', record } });
  let r = await create(creds.accessJwt);
  if (r.status === 401) { creds = await refresh(creds); r = await create(creds.accessJwt); }
  if (!r.ok) throw new Error(r.json?.message || 'Bluesky reply failed.');
  const rkey = String(r.json.uri).split('/').pop();
  return { remoteId: r.json.uri, url: `https://bsky.app/profile/${creds.handle}/post/${rkey}`, credentials: creds };
}

// Publish a thread (reply chain). Images go on the first post only.
export async function publishThread(account, segments, opts = {}) {
  let creds = account.credentials;
  if (!creds?.accessJwt) throw new Error('Bluesky account is not connected.');
  let root = null, parent = null, firstUrl = null, firstRemote = null;
  for (let i = 0; i < segments.length; i++) {
    const text = String(segments[i] || '');
    if ([...text].length > CHAR_LIMIT) throw new Error(`Thread post ${i + 1} exceeds ${CHAR_LIMIT} characters.`);
    const record = { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString() };
    const facets = await buildFacets(text, creds.service, creds.accessJwt);
    if (facets) record.facets = facets;
    if (i === 0 && (opts.media || []).length) {
      const images = [];
      for (const m of opts.media.filter((x) => x.bytes).slice(0, 4)) {
        let up = await uploadBlob(creds.service, creds.accessJwt, m.bytes, m.mime);
        if (up.status === 401) { creds = await refresh(creds); up = await uploadBlob(creds.service, creds.accessJwt, m.bytes, m.mime); }
        if (up.ok && up.blob) images.push({ alt: m.alt || '', image: up.blob });
      }
      if (images.length) record.embed = { $type: 'app.bsky.embed.images', images };
    }
    if (parent) record.reply = { root, parent };
    const create = (token) => xrpc(creds.service, 'com.atproto.repo.createRecord', { method: 'POST', token, body: { repo: creds.did, collection: 'app.bsky.feed.post', record } });
    let r = await create(creds.accessJwt);
    if (r.status === 401) { creds = await refresh(creds); r = await create(creds.accessJwt); }
    if (!r.ok) throw new Error(r.json?.message || `Bluesky thread post ${i + 1} failed.`);
    const ref = { uri: r.json.uri, cid: r.json.cid };
    if (i === 0) { root = ref; firstRemote = r.json.uri; const rkey = String(r.json.uri).split('/').pop(); firstUrl = `https://bsky.app/profile/${creds.handle}/post/${rkey}`; }
    parent = ref;
  }
  return { remoteId: firstRemote, url: firstUrl, credentials: creds };
}

// Current follower count (for audience growth tracking).
export async function audience(account) {
  let creds = account.credentials;
  const get = (token) => xrpc(creds.service, `app.bsky.actor.getProfile?actor=${encodeURIComponent(creds.did)}`, { token });
  let r = await get(creds.accessJwt);
  if (r.status === 401) { creds = await refresh(creds); r = await get(creds.accessJwt); }
  if (!r.ok) throw new Error('Bluesky profile fetch failed.');
  return { followers: r.json.followersCount || 0, credentials: creds };
}
