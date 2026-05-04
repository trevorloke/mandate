// E2E v4: typed forms, admin dashboard, multi-workspace switcher, rate-limit
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const log = (...x) => console.log('  ', ...x);
const step = async (name, fn) => { try { const r = await fn(); console.log(`OK   ${name}`); return r; } catch (e) { console.log(`FAIL ${name}\n     ${e.message.slice(0, 300)}`); throw e; } };

await step('Sign up super admin + seed', async () => {
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.auth-screen__title');
  await page.fill('input[placeholder="Marcus Reyes"]', 'Marcus Reyes');
  await page.fill('input[placeholder="you@mandate.app"]', 'super@mandate.app');
  await page.fill('input[placeholder="min 8 characters"]', 'supersecret123');
  await page.fill('input[placeholder="Meridian West — Assembly"]', 'Meridian West');
  await page.fill('input[placeholder="Amara Tanaka"]', 'Amara Tanaka');
  await page.fill('input[placeholder="Meridian Forward"]', 'Meridian Forward');
  await page.click('button:has-text("Create workspace & sign in")');
  await page.waitForSelector('.home2__greeting', { timeout: 10000 });

  await page.evaluate(() => localStorage.setItem('mandate2:route', 'admin'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('.adm__nav-btn:has-text("Module data")');
  await page.click('button:has-text("Load prototype data")');
  await page.waitForSelector('.adm__msg--ok', { timeout: 60000 });
});

await step('Visit Overview tab — see stats and activity', async () => {
  await page.click('.adm__nav-btn:has-text("Overview")');
  await page.waitForSelector('.adm__stats');
  const stats = await page.$$eval('.adm__stat-v', els => els.map(e => e.textContent.trim()));
  log('stats:', stats);
  // Should have records, users, workspace, role
  if (stats.length < 4) throw new Error('expected 4 stat cards');
  await page.screenshot({ path: '/tmp/mandate-audit/v4-home.png' });
});

await step('Edit voter via TYPED form (not JSON)', async () => {
  await page.click('.adm__nav-btn:has-text("Module data")');
  await page.click('.adm__data-card:has-text("Voters")');
  await page.waitForSelector('table');
  // Click "Edit" on first record
  await page.click('button:has-text("Edit")');
  await page.waitForSelector('.adm__typed', { timeout: 5000 });

  // Should be in fields mode by default. Verify a few labeled inputs are visible
  const labels = await page.$$eval('.adm__typed .adm__field-label', els => els.map(e => e.textContent.trim()));
  log('typed form fields:', labels.slice(0, 6).join(', '), '...');
  if (!labels.some(l => l.startsWith('First name'))) throw new Error('typed form missing First name');

  // Find the Last name input (second .adm__field--half) and edit it
  await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.adm__field-label'));
    const lbl = labels.find(l => l.textContent.trim().startsWith('Last name'));
    if (lbl) {
      const input = lbl.parentElement.querySelector('input');
      input.focus();
    }
  });
  // Use a deterministic selector
  const lastNameInput = await page.evaluateHandle(() => {
    const labels = Array.from(document.querySelectorAll('.adm__field-label'));
    const lbl = labels.find(l => l.textContent.trim().startsWith('Last name'));
    return lbl ? lbl.parentElement.querySelector('input') : null;
  });
  await lastNameInput.asElement().click({ clickCount: 3 });
  await lastNameInput.asElement().fill('TypedFormSentinel');

  // Toggle to JSON mode and back to verify round-trip
  await page.click('.adm__mode-toggle button:has-text("JSON")');
  await page.waitForSelector('.adm__field-textarea');
  const json = await page.inputValue('.adm__field-textarea');
  if (!json.includes('TypedFormSentinel')) throw new Error('Field edit did not persist into JSON');
  await page.click('.adm__mode-toggle button:has-text("Fields")');
  await page.waitForSelector('.adm__typed');

  // Save
  await page.click('button:has-text("Save")');
  await page.waitForSelector('.adm__msg--ok', { timeout: 5000 });

  // Reload Ground module to check edit propagated
  await page.evaluate(() => localStorage.setItem('mandate2:route', 'ground'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const html = await page.content();
  if (!html.includes('TypedFormSentinel')) throw new Error('Typed edit not visible in Ground');
  log('✓ typed form edit propagates to Ground');
  await page.screenshot({ path: '/tmp/mandate-audit/v4-typed-form-applied.png' });
});

await step('Multi-workspace: create new workspace, switch, switch back', async () => {
  await page.evaluate(() => localStorage.setItem('mandate2:route', 'admin'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('.adm__nav-btn:has-text("Workspaces")');
  await page.waitForSelector('.adm__title');
  // Create new
  await page.click('button:has-text("+ New workspace")');
  await page.waitForSelector('input[placeholder*="Burnaby"]');
  await page.fill('input[placeholder*="Burnaby"]', 'Burnaby South — Federal');
  await page.click('button:has-text("Create workspace")');
  await page.waitForSelector('.adm__msg--ok', { timeout: 5000 });
  // Verify it appears
  const html = await page.content();
  if (!html.includes('Burnaby South')) throw new Error('New workspace not in list');

  // Switch to it (auto-confirm dialog)
  page.once('dialog', d => d.accept());
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const switchBtn = btns.find(b => b.textContent.trim() === 'Switch');
    if (switchBtn) switchBtn.click();
  });
  await page.waitForLoadState('networkidle', { timeout: 10000 });
  await page.waitForSelector('.adm__title, .home2__greeting', { timeout: 10000 });

  // Verify the workspace name in user menu
  await page.click('.usrm__avatar');
  await page.waitForSelector('.usrm__pop');
  const menuTxt = await page.textContent('.usrm__role');
  log('menu after switch:', menuTxt);
  if (!menuTxt.includes('Burnaby')) throw new Error('Did not switch to Burnaby');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: '/tmp/mandate-audit/v4-switched.png' });
});

await step('Verify workspace data isolation: new workspace is empty', async () => {
  // Go to Module data — should show 0 records (new workspace, not seeded)
  await page.evaluate(() => localStorage.setItem('mandate2:route', 'admin'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('.adm__nav-btn:has-text("Overview")');
  await page.waitForSelector('.adm__stats');
  const recordsText = await page.textContent('.adm__stat-v');
  log('records in new workspace:', recordsText);
  if (recordsText !== '0') throw new Error(`expected 0 records in fresh workspace, got ${recordsText}`);
});

await step('Rate limit: spam login, expect 429', async () => {
  // Sign out first
  await page.click('.usrm__avatar');
  await page.click('.usrm__item:has-text("Sign out")');
  await page.waitForSelector('.auth-screen__title:has-text("Sign in")');

  // Hit /api/auth/login many times
  let last = null;
  for (let i = 0; i < 12; i++) {
    last = await page.evaluate(() => fetch('/api/auth/login', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'badpassbad' }),
    }).then(r => ({ status: r.status, body: r.json() })));
  }
  log('after 12 attempts: status=' + last.status);
  if (last.status !== 429) throw new Error(`expected 429 on excessive attempts, got ${last.status}`);
});

console.log(`\nTotal page errors: ${errors.length}`);
errors.slice(0, 5).forEach(e => console.log(`  · ${e.slice(0, 200)}`));

await browser.close();
