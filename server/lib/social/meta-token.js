// Meta (Facebook + Instagram) token refresh. Different model from X/LinkedIn:
// there's no refresh_token grant — instead a long-lived USER token (~60 days) is
// extended by exchanging it again (fb_exchange_token), after which Page tokens are
// re-derived from it. Auth failures surface as Graph error code 190 (HTTP 400),
// not 401, so reactive detection looks at the error body.
const GRAPH = 'https://graph.facebook.com/v19.0';
export const REFRESH_WINDOW_MS = 7 * 86_400_000; // refresh within a week of expiry

// Exchange the current long-lived user token for a fresh one (+ new expiry).
export async function exchangeLongLived(userToken, app) {
  const url = `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token`
    + `&client_id=${encodeURIComponent(app.clientId)}`
    + `&client_secret=${encodeURIComponent(app.clientSecret)}`
    + `&fb_exchange_token=${encodeURIComponent(userToken)}`;
  const j = await fetch(url).then((r) => r.json()).catch(() => ({}));
  if (!j.access_token) throw new Error('Facebook session expired — reconnect the account.');
  return { userToken: j.access_token, expiresAt: j.expires_in ? Date.now() + j.expires_in * 1000 : null };
}

// Page access tokens derived from a (long-lived) user token are themselves
// long-lived; re-fetch them whenever the user token is refreshed.
export async function fetchPages(userToken) {
  const j = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(userToken)}`)
    .then((r) => r.json()).catch(() => ({}));
  return (j.data || []).map((p) => ({ id: p.id, name: p.name, token: p.access_token }));
}

export function isMetaAuthError(res, json) {
  if (res.status === 401) return true;
  const e = json?.error;
  return !!e && (e.code === 190 || e.type === 'OAuthException');
}

const canRefresh = (account) => !!(account.credentials?.userToken && account._app);

// Proactive-only refresh: returns fresh creds when the user token is near expiry,
// else the existing creds. `refreshCreds(creds, app)` is adapter-specific.
export async function ensureMetaFresh(account, refreshCreds) {
  const creds = account.credentials;
  if (canRefresh(account) && creds.expiresAt && creds.expiresAt < Date.now() + REFRESH_WINDOW_MS) {
    try { return await refreshCreds(creds, account._app); } catch { return creds; }
  }
  return creds;
}

// Run `run(creds)` (returning a fetch Response) with proactive + reactive refresh.
// Returns { res, json, creds } — json is already parsed; creds may be newer.
export async function metaFetch(account, refreshCreds, run) {
  const refreshable = canRefresh(account);
  let creds = await ensureMetaFresh(account, refreshCreds);
  let res = await run(creds);
  let json = await res.json().catch(() => ({}));
  if (refreshable && isMetaAuthError(res, json)) {
    creds = await refreshCreds(creds, account._app);
    res = await run(creds);
    json = await res.json().catch(() => ({}));
  }
  return { res, json, creds };
}
