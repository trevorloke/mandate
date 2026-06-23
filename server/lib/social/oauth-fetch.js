// Shared OAuth token-refresh wrapper for adapter requests.
//
// Both X and LinkedIn hold short-lived access tokens with a refresh token. This
// gives every adapter call the same robustness the publish path already had:
//   1. PROACTIVE — refresh just before a token is due to expire.
//   2. REACTIVE  — if a request still 401s (token revoked early), refresh once
//      and retry.
// Refreshing requires the developer-app creds (account._app, loaded for OAuth
// providers) and a refresh token; when either is missing we skip refresh and let
// the platform's error surface (→ account marked needs-reconnect upstream).
//
// `refreshFn(creds, app)` is platform-specific and returns updated creds.
// Callers persist the returned `creds` (publishPost/refreshMetrics/etc. already do).
const NEAR_MS = 15_000;

export async function ensureFresh(account, refreshFn) {
  const creds = account.credentials;
  const app = account._app || null;
  if (creds?.refreshToken && app && creds.expiresAt && creds.expiresAt < Date.now() + NEAR_MS) {
    return refreshFn(creds, app);
  }
  return creds;
}

// Run `run(token, creds)` (returning a fetch Response) with proactive + reactive
// refresh. Returns { res, creds } — creds may be newer than account.credentials.
export async function withRefresh(account, refreshFn, run) {
  const app = account._app || null;
  let creds = account.credentials;
  const canRefresh = !!(creds?.refreshToken && app);
  if (canRefresh && creds.expiresAt && creds.expiresAt < Date.now() + NEAR_MS) {
    creds = await refreshFn(creds, app);
  }
  let res = await run(creds.accessToken, creds);
  if (res.status === 401 && canRefresh) {
    creds = await refreshFn(creds, app);
    res = await run(creds.accessToken, creds);
  }
  return { res, creds };
}
