// Mastodon adapter.
// Works against any Mastodon instance. The user creates an access token on their
// instance (Preferences → Development → New application, with write:statuses) and
// pastes the instance URL + token — no OAuth app registration on our side needed.
export const CHAR_LIMIT = 500; // instance default; instances may differ

function normalizeBase(instanceUrl) {
  let u = String(instanceUrl || '').trim();
  if (!u) throw new Error('Instance URL is required.');
  if (!/^https?:\/\//.test(u)) u = 'https://' + u;
  return u.replace(/\/$/, '');
}
function hostOf(base) { try { return new URL(base).host; } catch { return base; } }

export async function connect({ instanceUrl, accessToken }) {
  const base = normalizeBase(instanceUrl);
  accessToken = String(accessToken || '').trim();
  if (!accessToken) throw new Error('Access token is required.');

  const res = await fetch(`${base}/api/v1/accounts/verify_credentials`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Mastodon verification failed (${res.status}). Check the instance URL and token.`);

  return {
    platform: 'mastodon',
    handle: `@${json.username}@${hostOf(base)}`,
    displayName: json.display_name || json.username,
    avatarUrl: json.avatar || null,
    remoteId: json.id,
    instanceUrl: base,
    credentials: { instanceUrl: base, accessToken },
  };
}

async function uploadMedia(creds, m) {
  const fd = new FormData();
  fd.append('file', new Blob([m.bytes], { type: m.mime || 'application/octet-stream' }), m.id || 'image');
  if (m.alt) fd.append('description', m.alt);
  const res = await fetch(`${creds.instanceUrl}/api/v2/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.accessToken}` },
    body: fd,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Mastodon media upload failed (${res.status}).`);
  return json.id;
}

export async function publish(account, post) {
  const creds = account.credentials;
  if (!creds?.accessToken) throw new Error('Mastodon account is not connected.');
  const status = String(post.body || '');

  const media = (post.media || []).filter((m) => m.bytes).slice(0, 4);
  const mediaIds = [];
  for (const m of media) mediaIds.push(await uploadMedia(creds, m));

  const payload = { status, visibility: 'public' };
  if (mediaIds.length) payload.media_ids = mediaIds;

  const res = await fetch(`${creds.instanceUrl}/api/v1/statuses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.accessToken}`,
      'Idempotency-Key': post.id || undefined },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Mastodon publish failed (${res.status}).`);
  return { remoteId: String(json.id), url: json.url || json.uri };
}

export async function metrics(account, remoteId) {
  const creds = account.credentials;
  const r = await fetch(`${creds.instanceUrl}/api/v1/statuses/${remoteId}`, { headers: { Authorization: `Bearer ${creds.accessToken}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `Mastodon metrics failed (${r.status}).`);
  return { metrics: { likes: j.favourites_count || 0, reposts: j.reblogs_count || 0, replies: j.replies_count || 0 } };
}

export async function verify(account) {
  const creds = account.credentials;
  const r = await fetch(`${creds.instanceUrl}/api/v1/accounts/verify_credentials`, { headers: { Authorization: `Bearer ${creds.accessToken}` } });
  if (!r.ok) throw new Error(`Mastodon token is invalid (${r.status}) — reconnect.`);
  return { ok: true };
}
