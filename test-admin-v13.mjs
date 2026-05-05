// E2E v13: OAuth/OIDC SSO end-to-end (with a stub OIDC provider) + captcha-protected public form
import { chromium } from 'playwright-core';
import http from 'http';

// ── Fake OIDC provider on :4500 + fake captcha siteverify on :4501 ─────
const FAKE_PORT = 4500;
const FAKE_BASE = `http://localhost:${FAKE_PORT}`;
const CAPTCHA_PORT = 4501;

const fakeOidc = http.createServer((req, res) => {
  const url = new URL(req.url, FAKE_BASE);
  if (url.pathname === '/.well-known/openid-configuration') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      issuer: FAKE_BASE,
      authorization_endpoint: `${FAKE_BASE}/authorize`,
      token_endpoint:         `${FAKE_BASE}/token`,
      userinfo_endpoint:      `${FAKE_BASE}/userinfo`,
    }));
    return;
  }
  if (url.pathname === '/authorize') {
    // Pretend the user approved → 302 back to redirect_uri with ?code & ?state
    const redirect = url.searchParams.get('redirect_uri');
    const state    = url.searchParams.get('state');
    const back = new URL(redirect);
    back.searchParams.set('code', 'fakecode-1');
    back.searchParams.set('state', state);
    res.writeHead(302, { location: back.toString() });
    res.end();
    return;
  }
  if (url.pathname === '/token' && req.method === 'POST') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ access_token: 'fake-access', token_type: 'Bearer', expires_in: 3600 }));
    });
    return;
  }
  if (url.pathname === '/userinfo') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      sub: 'fake-user-1',
      email: 'sso-user@m.app',
      email_verified: true,
      name: 'SSO User',
    }));
    return;
  }
  res.writeHead(404); res.end('not found');
});
await new Promise(r => fakeOidc.listen(FAKE_PORT, r));

// Fake captcha siteverify — accepts any token starting with 'good-'
const fakeCaptcha = http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c);
  req.on('end', () => {
    const params = new URLSearchParams(body);
    const token = params.get('response') || '';
    const success = token.startsWith('good-');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success, 'error-codes': success ? [] : ['invalid-input-response'] }));
  });
});
await new Promise(r => fakeCaptcha.listen(CAPTCHA_PORT, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const log = (...x) => console.log('  ', ...x);
const step = async (n, fn) => { try { const r = await fn(); console.log(`OK   ${n}`); return r; } catch (e) { console.log(`FAIL ${n}\n     ${e.message.slice(0, 300)}`); throw e; } };

await step('Sign up (super_admin)', async () => {
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.auth-screen__title');
  await page.fill('input[placeholder="Marcus Reyes"]', 'Marcus Reyes');
  await page.fill('input[placeholder="you@mandate.app"]', 'sa@m.app');
  await page.fill('input[placeholder="min 8 characters"]', 'supersecret123');
  await page.fill('input[placeholder="Meridian West — Assembly"]', 'Meridian West');
  await page.click('button:has-text("Create workspace & sign in")');
  await page.waitForSelector('.home2__greeting', { timeout: 10000 });
  // SSO is gated to Pro+
  await page.evaluate(async () => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    await fetch('/api/workspace/plan', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ plan: 'pro' }),
    });
  });
});

let providerId = null;
await step('Configure an OIDC provider via API (auto-provision on)', async () => {
  const r = await page.evaluate(async (issuer) => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    const resp = await fetch('/api/oauth-providers', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({
        kind: 'oidc', label: 'Acme SSO',
        issuerUrl: issuer,
        clientId: 'mdt-client', clientSecret: 'shh',
        scopes: 'openid email profile',
        autoProvision: true, autoProvisionRole: 'editor',
      }),
    });
    return resp.json();
  }, FAKE_BASE);
  if (!r.ok) throw new Error('provider create failed: ' + JSON.stringify(r));
  providerId = r.provider.id;
  log('provider id:', providerId);
});

await step('Logged-out user sees "Sign in with Acme SSO" on login page', async () => {
  // Sign out
  await page.evaluate(async () => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    return fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrf } });
  });
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.auth-screen__title');
  await page.waitForFunction(() => document.body.textContent.includes('Sign in with Acme SSO'), { timeout: 5000 });
  log('✓ "Sign in with Acme SSO" button visible');
});

await step('Click SSO button → end-to-end OIDC sign-in (auto-provision)', async () => {
  await page.click('a:has-text("Sign in with Acme SSO")');
  // Wait for any nav settle
  await page.waitForLoadState('domcontentloaded');
  // Give the redirect chain time to complete
  await page.waitForTimeout(2500);
  log('final url:', page.url());

  // Diagnostic: what does /me say after?
  const me = await page.evaluate(() => fetch('/api/auth/me', { credentials: 'include' }).then(r => r.json()));
  log('me response:', JSON.stringify(me));
  if (me.user?.email !== 'sso-user@m.app') {
    await page.screenshot({ path: '/tmp/mandate-audit/v13-fail-sso.png' });
    throw new Error('did not sign in as sso-user; me=' + JSON.stringify(me));
  }
  if (me.user?.role !== 'editor') throw new Error('auto-provision role mismatch (expected editor)');
});

await step('Audit log records the OAuth login', async () => {
  // Sign back in as the original admin to read audit
  await page.evaluate(async () => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    return fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrf } });
  });
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.auth-screen__title');
  await page.fill('input[type=email]', 'sa@m.app');
  await page.fill('input[type=password]', 'supersecret123');
  await page.click('button:has-text("Sign in")');
  await page.waitForSelector('.mdt__bar', { timeout: 10000 });

  const r = await page.evaluate(() => fetch('/api/audit?limit=200', { credentials: 'include' }).then(r => r.json()));
  const provLog = r.log.find(l => l.action === 'oauth.provision');
  const loginLog = r.log.find(l => l.action === 'auth.oauth_login');
  if (!provLog) throw new Error('no oauth.provision audit entry');
  if (!loginLog) throw new Error('no auth.oauth_login audit entry');
  log('✓ oauth.provision and auth.oauth_login present');
});

let captchaForm = null;
await step('Create a public form WITH captcha (hCaptcha)', async () => {
  // Use hCaptcha's public TEST keys (hCaptcha provides "always-pass" sitekey/secret for testing).
  // Per hCaptcha docs: sitekey '10000000-ffff-ffff-ffff-000000000001' + secret '0x0000000000000000000000000000000000000000' returns success.
  const r = await page.evaluate(async () => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    const resp = await fetch('/api/forms', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({
        label: 'Spam-protected donate',
        module: 'raise', kind: 'donor',
        allowedFields: [
          { key: 'name',  label: 'Name',  type: 'text',  required: true },
          { key: 'email', label: 'Email', type: 'email', required: true },
        ],
        rateLimitPerMin: 50,
        captchaProvider: 'hcaptcha',
        captchaSitekey: '10000000-ffff-ffff-ffff-000000000001',
        captchaSecret:  '0x0000000000000000000000000000000000000000',
      }),
    });
    return resp.json();
  });
  if (!r.ok) throw new Error('create form failed: ' + JSON.stringify(r));
  captchaForm = r.form;
  log('captcha form slug:', captchaForm.slug);
  if (captchaForm.captchaProvider !== 'hcaptcha') throw new Error('captcha not stored');
  if (!captchaForm.hasCaptchaSecret) throw new Error('captchaSecret should be marked present');
});

await step('Public GET returns sitekey but NOT secret', async () => {
  const r = await fetch(`http://localhost:3000/api/public/forms/${captchaForm.slug}`).then(r => r.json());
  log('captcha config from public GET:', JSON.stringify(r.form.captcha));
  if (!r.form.captcha) throw new Error('captcha config missing in public GET');
  if (r.form.captcha.provider !== 'hcaptcha') throw new Error('wrong provider');
  if (!r.form.captcha.sitekey) throw new Error('no sitekey returned');
  // Make sure secret isn't in the response anywhere
  if (JSON.stringify(r).includes('captchaSecret')) throw new Error('secret leaked');
});

await step('Public submit WITHOUT captcha token → rejected', async () => {
  const resp = await fetch(`http://localhost:3000/api/public/forms/${captchaForm.slug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Bot', email: 'bot@x.com' }),
  });
  const body = await resp.json();
  log('no-captcha submit:', resp.status, body.error);
  if (resp.status !== 400) throw new Error(`expected 400, got ${resp.status}`);
  if (!/captcha/i.test(body.error || '')) throw new Error('expected captcha error');
});

await step('Public submit WITH a valid captcha token → accepted', async () => {
  // Our fake captcha siteverify accepts any token that starts with 'good-'
  const resp = await fetch(`http://localhost:3000/api/public/forms/${captchaForm.slug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Honest Donor',
      email: 'honest@x.com',
      _captcha: 'good-token-from-the-widget',
    }),
  });
  const body = await resp.json();
  log('with-captcha submit:', resp.status, JSON.stringify(body));
  if (resp.status !== 200 || !body.ok) throw new Error('expected 200 ok with valid captcha token');
});

await step('Public submit with an INVALID token → still rejected', async () => {
  const resp = await fetch(`http://localhost:3000/api/public/forms/${captchaForm.slug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Spammer', email: 's@x.com',
      _captcha: 'bad-bogus-token',
    }),
  });
  log('bad-captcha submit:', resp.status);
  if (resp.status !== 400) throw new Error(`expected 400, got ${resp.status}`);
});

console.log(`\nTotal page errors: ${errors.length}`);
errors.slice(0, 5).forEach(e => console.log(`  · ${e.slice(0, 200)}`));

await browser.close();
fakeOidc.close();
fakeCaptcha.close();
