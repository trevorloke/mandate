// Instagram adapter (Graph API). Instagram is connected *through* Meta: when a
// Facebook Page with a linked IG Business account is authorized, we store an
// 'instagram' account whose credentials carry { igUserId, pageToken }.
//
// Publishing is a 2-step container flow and REQUIRES a publicly reachable image
// URL (set MANDATE_PUBLIC_URL so the worker can build one). Text-only IG posts
// are not supported by the API.
const GRAPH = 'https://graph.facebook.com/v19.0';
export const CHAR_LIMIT = 2200;

export async function publish(account, post) {
  const creds = account.credentials;
  if (!creds?.igUserId || !creds?.pageToken) throw new Error('Instagram account is not connected.');
  const media = (post.media || []).filter((m) => m.url);
  if (media.length === 0) throw new Error('Instagram requires an image with a public URL (set MANDATE_PUBLIC_URL).');

  const image = media[0]; // single-image post for v1
  const caption = String(post.body || '');

  // 1) Create a media container.
  const createRes = await fetch(`${GRAPH}/${creds.igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: image.url, caption, access_token: creds.pageToken }),
  });
  const created = await createRes.json().catch(() => ({}));
  if (!createRes.ok) throw new Error(created?.error?.message || `Instagram container failed (${createRes.status}).`);

  // 2) Publish the container.
  const pubRes = await fetch(`${GRAPH}/${creds.igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: created.id, access_token: creds.pageToken }),
  });
  const published = await pubRes.json().catch(() => ({}));
  if (!pubRes.ok) throw new Error(published?.error?.message || `Instagram publish failed (${pubRes.status}).`);

  const id = published.id;
  const user = (account.handle || '').replace(/^@/, '');
  return { remoteId: id, url: user ? `https://www.instagram.com/${user}/` : 'https://www.instagram.com/' };
}

export async function metrics(account, remoteId) {
  const creds = account.credentials;
  const r = await fetch(`${GRAPH}/${remoteId}?fields=like_count,comments_count&access_token=${encodeURIComponent(creds.pageToken)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Instagram metrics failed (${r.status}).`);
  return { metrics: { likes: j.like_count || 0, comments: j.comments_count || 0 } };
}
