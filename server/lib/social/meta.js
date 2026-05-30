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
    // Upgrade to a long-lived user token (~60 days).
    try {
      const ll = await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token`
        + `&client_id=${encodeURIComponent(app.clientId)}`
        + `&client_secret=${encodeURIComponent(app.clientSecret)}`
        + `&fb_exchange_token=${encodeURIComponent(userToken)}`).then((r) => r.json());
      if (ll.access_token) userToken = ll.access_token;
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
          credentials: { igUserId: p.ig.id, pageId: p.id, pageToken: p.token },
        });
      }
    }

    return {
      remoteId: me.id,
      handle: primary ? primary.name : (me.name || 'Facebook'),
      displayName: primary ? primary.name : (me.name || 'Facebook'),
      avatarUrl: null,
      credentials: { userToken, pages: pages.map(({ ig, ...rest }) => rest), pageId: primary?.id || null },
      extraAccounts,
    };
  },
};

export async function publish(account, post) {
  const creds = account.credentials;
  if (!creds?.pageId) throw new Error('No Facebook Page selected — reconnect and grant Page access.');
  const page = (creds.pages || []).find((p) => p.id === creds.pageId);
  if (!page?.token) throw new Error('Missing Page access token — reconnect the account.');

  const message = String(post.body || '');
  const photo = (post.media || []).find((m) => m.url);

  // With an image → photo post; otherwise a text feed post.
  let endpoint, body;
  if (photo) {
    endpoint = `${GRAPH}/${creds.pageId}/photos`;
    body = { url: photo.url, caption: message, access_token: page.token };
  } else {
    endpoint = `${GRAPH}/${creds.pageId}/feed`;
    body = { message, access_token: page.token };
  }

  const res = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `Facebook publish failed (${res.status}).`);

  const id = j.post_id || j.id; // photos returns {id, post_id}
  return { remoteId: id, url: id ? `https://www.facebook.com/${id}` : null };
}
