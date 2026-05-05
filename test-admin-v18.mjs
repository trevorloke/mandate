// E2E v18: WebAuthn passkeys (register + sign in)
// Uses Chrome DevTools Protocol's WebAuthn domain to inject a virtual authenticator
// so the test can complete biometric/PIN ceremonies headlessly.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const log = (...x) => console.log('  ', ...x);
const step = async (n, fn) => { try { const r = await fn(); console.log(`OK   ${n}`); return r; } catch (e) { console.log(`FAIL ${n}\n     ${e.message.slice(0, 400)}`); throw e; } };

// Inject a virtual WebAuthn authenticator via CDP
const cdp = await ctx.newCDPSession(page);
await cdp.send('WebAuthn.enable', { enableUI: false });
const auth = await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: {
    protocol: 'ctap2',
    transport: 'internal',
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,        // simulates biometric "yes"
    automaticPresenceSimulation: true,
  },
});
log('virtual authenticator id:', auth.authenticatorId);

// Override window.alert/confirm/prompt so the PasskeyPanel's prompt() returns a label
await page.addInitScript(() => {
  window.confirm = () => true;
  window.prompt = (msg, dflt) => 'Test Device';
});

await step('Sign up + upgrade workspace to Pro (passkeys are gated on Free)', async () => {
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.auth-screen__title');
  await page.fill('input[placeholder="Marcus Reyes"]', 'Pass Key');
  await page.fill('input[placeholder="you@mandate.app"]', 'pk@m.app');
  await page.fill('input[placeholder="min 8 characters"]', 'pass1234');
  await page.fill('input[placeholder="Meridian West — Assembly"]', 'WS');
  await page.click('button:has-text("Create workspace & sign in")');
  await page.waitForSelector('.mdt__bar', { timeout: 10000 });
  // Passkeys require Pro+
  const csrf = await page.evaluate(() => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  });
  await page.evaluate(async ({ csrf }) => {
    await fetch('/api/workspace/plan', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ plan: 'pro' }),
    });
  }, { csrf });
});

await step('Open profile, register a passkey', async () => {
  await page.click('.usrm__avatar');
  await page.click('.usrm__item:has-text("Admin")');
  await page.waitForSelector('.adm__nav');
  await page.click('.adm__nav-btn:has-text("My account")');
  await page.waitForTimeout(400);
  // Wait for the passkey panel
  await page.waitForSelector('button:has-text("Register a passkey")', { timeout: 5000 });
  await page.click('button:has-text("Register a passkey")');
  // CDP virtual authenticator handles the ceremony; wait for the success toast.
  await page.waitForFunction(
    () => document.body.textContent.includes('Passkey registered'),
    { timeout: 8000 }
  );
});

await step('Listed passkey shows up in the table', async () => {
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('table tbody tr td b')).some(b => b.textContent === 'Test Device'),
    { timeout: 4000 }
  );
  // confirm one credential exists in the virtual authenticator
  const creds = await cdp.send('WebAuthn.getCredentials', { authenticatorId: auth.authenticatorId });
  if (!creds.credentials || creds.credentials.length !== 1) throw new Error('expected 1 stored credential; got ' + creds.credentials?.length);
  log('credentials in authenticator:', creds.credentials.length);
});

await step('Rename the passkey', async () => {
  await page.click('button:has-text("Rename")');
  // The rename input is the only one inside the table cell with autofocus.
  const input = page.locator('table tbody input.adm__field-input');
  await input.fill('Renamed Passkey');
  await page.click('table tbody button:has-text("Save")');
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('table tbody tr td b')).some(b => b.textContent === 'Renamed Passkey'),
    { timeout: 3000 }
  );
});

await step('Sign out, then sign in with a passkey', async () => {
  // Sign out
  await page.evaluate(async () => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    return fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrf } });
  });
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.auth-screen__title');
  // Fill email so the server can return allowCredentials matching our user
  await page.fill('input[type=email]', 'pk@m.app');
  await page.click('button:has-text("Sign in with a passkey")');
  // CDP authenticator signs the challenge → /complete sets the session cookie
  await page.waitForSelector('.mdt__bar', { timeout: 10000 });
  log('signed in via passkey ✓');
});

await step('Audit log records auth.passkey_login + passkey.register', async () => {
  const r = await page.evaluate(async () => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    return fetch('/api/audit?limit=200', { credentials: 'include', headers: { 'X-CSRF-Token': csrf } }).then(r => r.json());
  });
  const log_ = r.log || [];
  const reg = log_.find(l => l.action === 'passkey.register');
  const login = log_.find(l => l.action === 'auth.passkey_login');
  if (!reg) throw new Error('no passkey.register entry');
  if (!login) throw new Error('no auth.passkey_login entry');
  log('audit: ✓ register + login');
});

await step('Delete the passkey via UI', async () => {
  await page.click('.usrm__avatar');
  await page.click('.usrm__item:has-text("Admin")');
  await page.waitForSelector('.adm__nav');
  await page.click('.adm__nav-btn:has-text("My account")');
  await page.waitForTimeout(400);
  await page.click('button:has-text("Remove")');
  await page.waitForTimeout(500);
  // Should now be empty list
  const empty = await page.locator('.adm__empty:has-text("No passkeys yet")').isVisible();
  if (!empty) throw new Error('passkey list should be empty');
});

await step('After removal, audit chain still verifies', async () => {
  const r = await page.evaluate(() => fetch('/api/audit/verify', { credentials: 'include' }).then(r => r.json()));
  if (!r.ok) throw new Error('chain broken: ' + JSON.stringify(r));
  log('audit chain ok, length:', r.chainLength);
});

await page.screenshot({ path: '/tmp/mandate-audit/v18-passkeys.png', fullPage: true });

console.log(`\nTotal page errors: ${errors.length}`);
errors.slice(0, 5).forEach(e => console.log(`  · ${e.slice(0, 200)}`));

await browser.close();
console.log('\n✅ test-admin-v18 complete');
