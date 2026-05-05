// CSRF protection — double-submit cookie.
//
// Strategy:
//   - Every response that doesn't already have one sets `mdt_csrf` (random hex, NOT HttpOnly so JS can read it).
//   - On mutating requests (POST/PUT/DELETE/PATCH) using cookie session auth, require an
//     `X-CSRF-Token` header equal to the cookie value.
//   - Bearer-token requests are exempt (they're not subject to CSRF — different threat model).
//   - Auth bootstrap routes (signup, login, password-reset/request, invite/accept, reset-password/:token)
//     are exempt because the user has no session yet to attack.
import { randomBytes } from 'crypto';

const CSRF_COOKIE = 'mdt_csrf';

const EXEMPT_PATHS = [
  '/api/auth/signup',
  '/api/auth/login',
  '/api/auth/setup-state',
  '/api/auth/me',
  '/api/password-reset/request',
  '/api/auth/oauth/providers',
  '/api/auth/oauth/callback',
  '/api/auth/passkey/login/begin',
  '/api/auth/passkey/login/complete',
];
const EXEMPT_PATTERNS = [
  /^\/api\/invites\/[a-f0-9]+$/,           // POST accept-invite
  /^\/api\/password-reset\/[a-f0-9]+$/,    // POST set-new-password
  /^\/api\/public\/forms\/[a-f0-9]+$/,     // public form submit (no auth, no cookies)
  /^\/api\/auth\/oauth\/start\/oap_[a-f0-9]+$/,  // OAuth start (public GET → redirect)
];

function getCsrfCookie(c) {
  const cookie = c.req.header('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export const csrfMiddleware = async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const method = c.req.method.toUpperCase();
  const isMutating = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

  // Bearer auth requests are CSRF-exempt
  const auth = c.req.header('authorization') || '';
  const isBearer = auth.toLowerCase().startsWith('bearer ');

  // Exempt list
  const isExempt = EXEMPT_PATHS.includes(path) || EXEMPT_PATTERNS.some(re => re.test(path));

  if (isMutating && !isBearer && !isExempt) {
    const cookie = getCsrfCookie(c);
    const header = c.req.header('x-csrf-token');
    if (!cookie || !header || cookie !== header) {
      return c.json({ error: 'csrf token missing or mismatched' }, 403);
    }
  }

  await next();

  // Always ensure a CSRF cookie is present so the client can read it for next time.
  // Set only if missing (avoid unnecessary churn).
  if (!getCsrfCookie(c)) {
    const tok = randomBytes(16).toString('hex');
    // SameSite=Lax + not HttpOnly (so JS can mirror it into header). Add Secure on HTTPS.
    const proto = c.req.header('x-forwarded-proto') || '';
    let isHttps = process.env.MANDATE_FORCE_SECURE_COOKIES === '1' || proto.toLowerCase().startsWith('https');
    if (!isHttps) { try { isHttps = new URL(c.req.url).protocol === 'https:'; } catch {} }
    const secure = isHttps ? '; Secure' : '';
    const existing = c.res.headers.get('Set-Cookie');
    const newCookie = `${CSRF_COOKIE}=${tok}; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}${secure}`;
    if (existing) c.res.headers.append('Set-Cookie', newCookie);
    else c.res.headers.set('Set-Cookie', newCookie);
  }
};
