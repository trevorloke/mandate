// E2E v11: TOTP 2FA enrollment + login gate, recovery codes, activity feed, per-bucket permissions
import { chromium } from 'playwright-core';
import * as otp from 'otplib';
const TOTP_OPTS = { algorithm: 'SHA1', digits: 6, step: 30, window: 1, encoding: 'base32' };
const authenticator = {
  generate: (secret) => otp.generateSync({ secret, ...TOTP_OPTS }),
};

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

await step('Sign up + seed', async () => {
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.auth-screen__title');
  await page.fill('input[placeholder="Marcus Reyes"]', 'Marcus Reyes');
  await page.fill('input[placeholder="you@mandate.app"]', 'sa@m.app');
  await page.fill('input[placeholder="min 8 characters"]', 'supersecret123');
  await page.fill('input[placeholder="Meridian West — Assembly"]', 'Meridian West');
  await page.click('button:has-text("Create workspace & sign in")');
  await page.waitForSelector('.home2__greeting', { timeout: 10000 });
  await page.evaluate(() => localStorage.setItem('mandate2:route', 'admin'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.click('.adm__nav-btn:has-text("Module data")');
  await page.click('button:has-text("Load prototype data")');
  await page.waitForSelector('.adm__msg--ok', { timeout: 60000 });
});

let totpSecret = null;
let recoveryCodes = null;
await step('Enable TOTP — call API directly to capture secret', async () => {
  // Setup
  const setup = await page.evaluate(async () => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    const r = await fetch('/api/auth/totp/setup', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    });
    return r.json();
  });
  if (!setup.secret) throw new Error('totp setup failed: ' + JSON.stringify(setup));
  totpSecret = setup.secret;
  log('totp secret length:', totpSecret.length, '· qr starts:', setup.qr?.slice(0, 30));

  // Generate code, call enable
  const code = authenticator.generate(totpSecret);
  const enable = await page.evaluate(async (code) => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    const r = await fetch('/api/auth/totp/enable', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ code }),
    });
    return r.json();
  }, code);
  if (!enable.ok) throw new Error('enable failed: ' + JSON.stringify(enable));
  recoveryCodes = enable.recoveryCodes;
  log('got', recoveryCodes.length, 'recovery codes');
  if (recoveryCodes.length !== 8) throw new Error('expected 8 recovery codes');
  if (!recoveryCodes[0].match(/^[a-f0-9]{4}-[a-f0-9]{4}$/)) throw new Error('bad recovery code shape');
});

await step('Sign out, then login WITHOUT 2FA → 401 requires_2fa', async () => {
  // Logout via API
  await page.evaluate(async () => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    return fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrf } });
  });

  // Try login without 2FA
  const r = await page.evaluate(async () => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    const resp = await fetch('/api/auth/login', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ email: 'sa@m.app', password: 'supersecret123' }),
    });
    return { status: resp.status, body: await resp.json() };
  });
  log('login without 2FA:', r.status, JSON.stringify(r.body));
  if (r.status !== 401) throw new Error(`expected 401, got ${r.status}`);
  if (!r.body.requires_2fa) throw new Error('expected requires_2fa: true');
});

await step('Login WITH 2FA code → 200', async () => {
  const code = authenticator.generate(totpSecret);
  const r = await page.evaluate(async (code) => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    const resp = await fetch('/api/auth/login', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ email: 'sa@m.app', password: 'supersecret123', totpCode: code }),
    });
    return { status: resp.status, body: await resp.json() };
  }, code);
  log('login with 2FA:', r.status);
  if (r.status !== 200) throw new Error(`expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  if (r.body.user.totpEnabled !== true) throw new Error('user object should reflect totpEnabled');
});

await step('Recovery code works once', async () => {
  // Logout
  await page.evaluate(async () => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    return fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrf } });
  });

  const code = recoveryCodes[0];
  const r = await page.evaluate(async (code) => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    const resp = await fetch('/api/auth/login', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ email: 'sa@m.app', password: 'supersecret123', totpCode: code }),
    });
    return { status: resp.status };
  }, code);
  log(`first use of recovery code "${code}":`, r.status);
  if (r.status !== 200) throw new Error('recovery code should work once');

  // Try the same recovery code again — should fail (already consumed)
  await page.evaluate(async () => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    return fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrf } });
  });
  const r2 = await page.evaluate(async (code) => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    const resp = await fetch('/api/auth/login', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ email: 'sa@m.app', password: 'supersecret123', totpCode: code }),
    });
    return { status: resp.status };
  }, code);
  log(`second use of same recovery code:`, r2.status);
  if (r2.status === 200) throw new Error('recovery code should NOT work twice');
});

await step('Sign in via UI with TOTP code → reach app', async () => {
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.auth-screen__title');
  await page.fill('input[type=email]', 'sa@m.app');
  await page.fill('input[type=password]', 'supersecret123');
  await page.click('button:has-text("Sign in")');
  // Should see the 2FA prompt
  await page.waitForSelector('input#totp', { timeout: 5000 });
  log('✓ 2FA prompt shown after first attempt');
  await page.fill('input#totp', authenticator.generate(totpSecret));
  await page.click('button.auth-form__btn');
  // Wait for either home greeting OR mdt__bar (any signed-in state)
  await page.waitForFunction(
    () => !!document.querySelector('.home2__greeting, .mdt__bar') && !document.querySelector('.auth-screen__title'),
    { timeout: 15000 }
  );
});

await step('Activity feed loads + has live indicator', async () => {
  await page.evaluate(() => localStorage.setItem('mandate2:route', 'admin'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.click('.adm__nav-btn:has-text("Activity")');
  await page.waitForSelector('.adm__activity', { timeout: 5000 });
  // Wait for live indicator
  await page.waitForFunction(() => {
    const el = document.querySelector('.adm__live-dot');
    return el && el.classList.contains('is-on');
  }, { timeout: 6000 });
  // Should have entries
  const rows = await page.$$('.adm__activity-row');
  log('activity rows:', rows.length);
  if (rows.length < 5) throw new Error('expected several activity rows');
});

await step('Per-bucket permissions: editor cannot write to locked bucket', async () => {
  // 1. Create an invite for an editor
  const inv = await page.evaluate(async () => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    const r = await fetch('/api/invites', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ email: 'editor@m.app', name: 'Test Editor', role: 'editor' }),
    });
    return r.json();
  });
  log('invite created:', inv.token.slice(0, 12) + '…');

  // 2. Set bucket permission: editor=read for ground.voter
  const upd = await page.evaluate(async () => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    const r = await fetch('/api/workspace', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({
        settings: {
          bucketPermissions: {
            'ground.voter': { editor: 'read' },
          },
        },
      }),
    });
    return r.json();
  });
  log('bucket perm updated, settings.bucketPermissions:', JSON.stringify(upd.workspace.settings.bucketPermissions));

  // 3. Sign out current super-admin, accept the invite as the new editor
  const ctxE = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageE = await ctxE.newPage();
  await pageE.goto(`http://localhost:5174/invite/${inv.token}`, { waitUntil: 'domcontentloaded' });
  await pageE.waitForSelector('.auth-screen__title:has-text("Welcome")', { timeout: 5000 });
  await pageE.fill('input[type=password]', 'editorpw1234');
  await pageE.click('button:has-text("Set password & sign in")');
  await pageE.waitForSelector('.home2__greeting, .mdt__bar', { timeout: 10000 });

  // 4. As editor, try to POST to ground/voter — should be 403
  const writeAttempt = await pageE.evaluate(async () => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    const r = await fetch('/api/data/ground/voter', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ id: 'X-1', first: 'Should', last: 'Fail' }),
    });
    return { status: r.status, body: await r.json() };
  });
  log('editor write to locked bucket:', writeAttempt.status, '·', writeAttempt.body.error);
  if (writeAttempt.status !== 403) throw new Error(`expected 403, got ${writeAttempt.status}`);
  if (!writeAttempt.body.error?.includes('cannot write')) throw new Error('expected explanatory error');

  // 5. Editor CAN still read
  const readAttempt = await pageE.evaluate(async () => {
    const r = await fetch('/api/data/ground/voter', { credentials: 'include' });
    return { status: r.status, count: (await r.json()).records?.length };
  });
  if (readAttempt.status !== 200) throw new Error('editor should still be able to read');
  log('editor read voter bucket:', readAttempt.status, `(${readAttempt.count} records)`);

  await ctxE.close();
});

console.log(`\nTotal page errors: ${errors.length}`);
errors.slice(0, 5).forEach(e => console.log(`  · ${e.slice(0, 200)}`));
await browser.close();
