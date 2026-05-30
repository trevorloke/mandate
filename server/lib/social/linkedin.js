// LinkedIn adapter — OAuth 2.0 + member UGC posting.
// Requires a developer app with the "Sign In with LinkedIn using OpenID Connect"
// and "Share on LinkedIn" products (scope w_member_social). Organization posting
// (w_organization_social) additionally needs LinkedIn partner approval.
export const CHAR_LIMIT = 3000;

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

export async function publish(account, post) {
  const creds = account.credentials;
  if (!creds?.accessToken || !creds.memberUrn) throw new Error('LinkedIn account is not connected.');

  const body = {
    author: creds.memberUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: String(post.body || '') },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      Authorization: `Bearer ${creds.accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.message || `LinkedIn publish failed (${res.status}).`);

  const urn = res.headers.get('x-restli-id') || j.id;
  return { remoteId: urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}` : null };
}
