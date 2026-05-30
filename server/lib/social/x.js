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

export async function publish(account, post) {
  let creds = account.credentials;
  if (!creds?.accessToken) throw new Error('X account is not connected.');
  const text = String(post.body || '');
  if ([...text].length > CHAR_LIMIT) throw new Error(`X posts are limited to ${CHAR_LIMIT} characters.`);

  // Refresh proactively if the token is near expiry.
  if (creds.expiresAt && creds.expiresAt < Date.now() + 15_000) {
    creds = await refresh(creds, account._app);
  }

  const doPost = (token) => fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
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
