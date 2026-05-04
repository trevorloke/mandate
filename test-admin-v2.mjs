// E2E v2: signup → seed demo → verify Ledger live-loads → invite user → accept invite → sign out everywhere
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
const step = async (name, fn) => { try { const r = await fn(); console.log(`OK   ${name}`); return r; } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); throw e; } };

await step('Sign up first super-admin', async () => {
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.auth-screen__title');
  await page.fill('input[placeholder="Marcus Reyes"]', 'Marcus Reyes');
  await page.fill('input[placeholder="you@mandate.app"]', 'marcus@mandate.app');
  await page.fill('input[placeholder="min 8 characters"]', 'supersecret123');
  await page.fill('input[placeholder="Meridian West — Assembly"]', 'Meridian West — Assembly');
  await page.fill('input[placeholder="Amara Tanaka"]', 'Amara Tanaka');
  await page.fill('input[placeholder="Meridian Forward"]', 'Meridian Forward');
  await page.click('button:has-text("Create workspace & sign in")');
  await page.waitForSelector('.home2__greeting', { timeout: 8000 });
});

await step('Open Admin → Module data', async () => {
  await page.click('.usrm__avatar');
  await page.click('.usrm__item:has-text("Admin")');
  await page.waitForSelector('.adm__title');
  await page.click('.adm__nav-btn:has-text("Module data")');
  await page.waitForSelector('.adm__data-card');
});

await step('Click "Load prototype data" and wait for completion', async () => {
  await page.click('button:has-text("Load prototype data")');
  // wait for success message
  await page.waitForSelector('.adm__msg--ok', { timeout: 60000 });
  const txt = await page.textContent('.adm__msg--ok');
  log('seed result:', txt);
  await page.screenshot({ path: '/tmp/mandate-audit/admin-v2-seeded.png' });
});

await step('Verify counts populated', async () => {
  // Wait for the counts to refresh after seeding (loadCounts runs N async fetches)
  await page.waitForFunction(() => {
    const counts = Array.from(document.querySelectorAll('.adm__data-card-count'));
    const nonzero = counts.filter(c => !c.textContent.startsWith('0 '));
    return nonzero.length >= 20;
  }, { timeout: 20000 });
  const counts = await page.$$eval('.adm__data-card-count', els => els.map(e => e.textContent));
  const nonzero = counts.filter(c => !c.startsWith('0 '));
  log(`buckets with data: ${nonzero.length}/${counts.length}`);
  log(`sample populated:`, nonzero.slice(0, 5).join(' · '));
});

await step('Navigate to Ledger and verify live data shows up', async () => {
  // Use shell nav to go to Ledger
  await page.click('button.mdt__nav-item:has-text("Ledger"), button.mdt__nav:has-text("Ledger"), nav button:has-text("Ledger")').catch(async () => {
    // fallback: localStorage
    await page.evaluate(() => localStorage.setItem('mandate2:route', 'ledger'));
    await page.reload({ waitUntil: 'networkidle' });
  });
  await page.waitForTimeout(1000);
  // Check journal table has rows
  const rowCount = await page.$$eval('.ljr__row', els => els.length);
  log(`ledger journal rows: ${rowCount}`);
  if (rowCount < 5) throw new Error(`expected ledger journal rows from DB, got ${rowCount}`);
  await page.screenshot({ path: '/tmp/mandate-audit/admin-v2-ledger-live.png' });
});

await step('Send invite link from admin', async () => {
  await page.click('.usrm__avatar');
  await page.click('.usrm__item:has-text("Admin")');
  await page.click('.adm__nav-btn:has-text("Users")');
  await page.click('button:has-text("Send invite link")');
  await page.waitForSelector('.adm__panel-title:has-text("Send invite link")');
  // Two .adm__field-row blocks: first row name+email, second row+role
  const inputs = await page.$$('.adm__field-input');
  await inputs[0].fill('Devon Park');
  await inputs[1].fill('devon@mandate.app');
  await page.selectOption('.adm__field-select', 'editor');
  await page.click('button:has-text("Save")');
  await page.waitForSelector('.adm__panel-title:has-text("Invite for Devon Park")', { timeout: 5000 });
  const url = await page.inputValue('input.adm__field-input[readonly]');
  log('invite url:', url);
  await page.screenshot({ path: '/tmp/mandate-audit/admin-v2-invite.png' });
  return url;
}).then(url => globalThis.__inviteUrl = url);

await step('Sign out, then accept invite as Devon', async () => {
  await page.click('.usrm__avatar');
  await page.click('.usrm__item:has-text("Sign out")');
  await page.waitForSelector('.auth-screen__title');

  await page.goto(globalThis.__inviteUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('.auth-screen__title:has-text("Welcome")', { timeout: 5000 });
  await page.fill('input[type=password]', 'newuser1234');
  await page.click('button:has-text("Set password & sign in")');
  // accept-invite returns ok + cookie + then refresh() reloads /me. Give it some time.
  await page.waitForFunction(() => !!document.querySelector('.home2__greeting, .mdt__bar'), { timeout: 15000 });
  // Confirm signed in as Devon
  await page.click('.usrm__avatar');
  const name = await page.textContent('.usrm__name');
  log('signed in as:', name);
  if (name !== 'Devon Park') throw new Error(`expected Devon Park, got ${name}`);
  await page.screenshot({ path: '/tmp/mandate-audit/admin-v2-devon.png' });
  await page.keyboard.press('Escape');
});

await step('Sign out everywhere via Account → Security', async () => {
  // Force-navigate to admin route to avoid menu race conditions
  await page.evaluate(() => localStorage.setItem('mandate2:route', 'admin'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.adm__title');
  await page.click('.adm__nav-btn:has-text("My account")');
  await page.waitForSelector('button:has-text("Sign out everywhere")');
  page.once('dialog', d => d.accept());
  await page.click('button:has-text("Sign out everywhere")');
  await page.waitForSelector('.auth-screen__title:has-text("Sign in")', { timeout: 8000 });
});

await step('Verify session was actually killed', async () => {
  // Try to call /api/auth/me — should return null user
  const me = await page.evaluate(() => fetch('/api/auth/me', { credentials: 'include' }).then(r => r.json()));
  if (me.user) throw new Error('session still alive after sign-out-all');
  log('me after logout:', me);
});

console.log(`\nTotal page errors: ${errors.length}`);
errors.slice(0, 5).forEach(e => console.log(`  · ${e}`));

await browser.close();
