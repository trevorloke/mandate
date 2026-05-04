// E2E v3: signup → seed → admin edit a voter → verify it shows in Ground → password reset flow
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
const step = async (name, fn) => { try { const r = await fn(); console.log(`OK   ${name}`); return r; } catch (e) { console.log(`FAIL ${name}\n     ${e.message.slice(0, 300)}`); throw e; } };

await step('Sign up super admin + seed prototype data', async () => {
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.auth-screen__title');
  await page.fill('input[placeholder="Marcus Reyes"]', 'Marcus Reyes');
  await page.fill('input[placeholder="you@mandate.app"]', 'marcus@mandate.app');
  await page.fill('input[placeholder="min 8 characters"]', 'supersecret123');
  await page.fill('input[placeholder="Meridian West — Assembly"]', 'Meridian West');
  await page.fill('input[placeholder="Amara Tanaka"]', 'Amara Tanaka');
  await page.fill('input[placeholder="Meridian Forward"]', 'Meridian Forward');
  await page.click('button:has-text("Create workspace & sign in")');
  await page.waitForSelector('.home2__greeting', { timeout: 10000 });

  // Seed
  await page.evaluate(() => localStorage.setItem('mandate2:route', 'admin'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('.adm__nav-btn:has-text("Module data")');
  await page.click('button:has-text("Load prototype data")');
  await page.waitForSelector('.adm__msg--ok', { timeout: 60000 });
});

await step('Edit voter record in admin → verify Ground shows it', async () => {
  // Drill into ground.voter bucket
  await page.click('.adm__data-card:has-text("Voters")');
  await page.waitForSelector('table');

  // Open the first record for editing
  await page.click('button:has-text("Edit")');
  await page.waitForSelector('textarea.adm__field-textarea');

  // Read current data, change last-name to a unique sentinel and set pd to PD-009 (default in Ground)
  const current = await page.inputValue('textarea.adm__field-textarea');
  const data = JSON.parse(current);
  data.last = 'AdminEditSentinel';
  data.pd = 'PD-009';
  await page.fill('textarea.adm__field-textarea', JSON.stringify(data, null, 2));
  await page.click('button:has-text("Save")');
  await page.waitForSelector('.adm__msg--ok', { timeout: 5000 });

  // Navigate to Ground module
  await page.evaluate(() => localStorage.setItem('mandate2:route', 'ground'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Look for the sentinel in the rendered DOM
  const html = await page.content();
  if (!html.includes('AdminEditSentinel')) {
    await page.screenshot({ path: '/tmp/mandate-audit/v3-fail-ground.png' });
    throw new Error('Edited voter last name not visible in Ground module');
  }
  log('✓ admin edit visible in Ground module');
  await page.screenshot({ path: '/tmp/mandate-audit/v3-ground-with-edit.png' });
});

await step('Sign out, request password reset for marcus@', async () => {
  await page.click('.usrm__avatar');
  await page.click('.usrm__item:has-text("Sign out")');
  await page.waitForSelector('.auth-screen__title:has-text("Sign in")');

  // Click "Forgot password?"
  await page.click('button:has-text("Forgot password?")');
  await page.waitForSelector('.auth-screen__title:has-text("Reset")');
  await page.fill('input[type=email]', 'marcus@mandate.app');
  await page.click('button:has-text("Send reset link")');
  await page.waitForSelector('.auth-form__error', { timeout: 5000 });
  const msg = await page.textContent('.auth-form__error');
  log('reset response:', msg.slice(0, 100));

  // Extract URL
  const m = msg.match(/(http:\/\/[^\s]+\/reset-password\/[a-f0-9]+)/);
  if (!m) throw new Error('No reset URL in response');
  return m[1];
}).then(url => globalThis.__resetUrl = url);

await step('Visit reset link, set new password, verify signed in', async () => {
  await page.goto(globalThis.__resetUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('.auth-screen__title:has-text("Set a")', { timeout: 5000 });
  await page.fill('input.auth-form__input[type=password]', 'NewPass1234');
  await page.fill('input.auth-form__input[type=password] >> nth=1', 'NewPass1234');
  await page.click('button:has-text("Set password")');
  await page.waitForSelector('.home2__greeting, .mdt__bar', { timeout: 10000 });
  log('✓ logged in via reset password');
});

await step('Verify can sign in with new password', async () => {
  // Sign out
  await page.click('.usrm__avatar');
  await page.click('.usrm__item:has-text("Sign out")');
  await page.waitForSelector('.auth-screen__title:has-text("Sign in")');

  // Try OLD password — should fail
  await page.fill('input[type=email]', 'marcus@mandate.app');
  await page.fill('input[type=password]', 'supersecret123');  // old
  await page.click('button:has-text("Sign in")');
  await page.waitForSelector('.auth-form__error', { timeout: 5000 });

  // Now use NEW password — should succeed. Clear field first.
  const pw = await page.$('input[type=password]');
  await pw.click({ clickCount: 3 });
  await pw.fill('NewPass1234');
  await page.click('button:has-text("Sign in")');
  await page.waitForFunction(() => !!document.querySelector('.home2__greeting, .mdt__bar') && !document.querySelector('.auth-screen__title'), { timeout: 15000 });
});

await step('Verify Civic, Events, Site live-load', async () => {
  for (const r of ['civic', 'events', 'site', 'raise', 'opposition', 'coalition', 'beacon']) {
    await page.evaluate((rr) => localStorage.setItem('mandate2:route', rr), r);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const errsBefore = errors.length;
    // Just check page rendered without error
    const rendered = await page.evaluate(() => document.getElementById('root')?.querySelectorAll('*').length || 0);
    log(`${r.padEnd(10)} → ${rendered} nodes, ${errors.length - errsBefore} new errors`);
  }
});

console.log(`\nTotal page errors: ${errors.length}`);
errors.slice(0, 5).forEach(e => console.log(`  · ${e.slice(0, 200)}`));

await browser.close();
