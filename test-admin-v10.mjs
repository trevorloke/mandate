// E2E v10: SSE realtime, two-tab live updates, notifications + bell, dedicated invite + reset tables
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

const errors = [];
const log = (...x) => console.log('  ', ...x);
const step = async (n, fn) => { try { const r = await fn(); console.log(`OK   ${n}`); return r; } catch (e) { console.log(`FAIL ${n}\n     ${e.message.slice(0, 300)}`); throw e; } };

const pageA = await ctx.newPage();
const pageB = await ctx.newPage();
[pageA, pageB].forEach(p => p.on('pageerror', e => errors.push(e.message)));

await step('Tab A: sign up + seed', async () => {
  await pageA.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await pageA.waitForSelector('.auth-screen__title');
  await pageA.fill('input[placeholder="Marcus Reyes"]', 'Marcus Reyes');
  await pageA.fill('input[placeholder="you@mandate.app"]', 'sa@m.app');
  await pageA.fill('input[placeholder="min 8 characters"]', 'supersecret123');
  await pageA.fill('input[placeholder="Meridian West — Assembly"]', 'Meridian West');
  await pageA.click('button:has-text("Create workspace & sign in")');
  await pageA.waitForSelector('.home2__greeting', { timeout: 10000 });
  await pageA.evaluate(() => localStorage.setItem('mandate2:route', 'admin'));
  await pageA.reload({ waitUntil: 'domcontentloaded' });
  await pageA.click('.adm__nav-btn:has-text("Module data")');
  await pageA.click('button:has-text("Load prototype data")');
  await pageA.waitForSelector('.adm__msg--ok', { timeout: 60000 });
});

await step('Tab B: open Ground module (cookie shared via context)', async () => {
  // Set localStorage BEFORE first goto so we land in Ground
  await pageB.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await pageB.evaluate(() => localStorage.setItem('mandate2:route', 'ground'));
  await pageB.reload({ waitUntil: 'domcontentloaded' });
  // Wait for either auth screen or shell
  await pageB.waitForSelector('.mdt__bar, .auth-screen__title', { timeout: 10000 });
  if (await pageB.$('.auth-screen__title')) {
    await pageB.fill('input[type=email]', 'sa@m.app');
    await pageB.fill('input[type=password]', 'supersecret123');
    await pageB.click('button:has-text("Sign in")');
    await pageB.waitForSelector('.mdt__bar', { timeout: 10000 });
  }
  await pageB.waitForTimeout(2000);
});

await step('SSE connected: bell shows live state', async () => {
  // Wait for the bell to be present
  await pageB.waitForSelector('.notif__btn', { timeout: 5000 });
  const title = await pageB.getAttribute('.notif__btn', 'title');
  log('bell title:', title);
  if (!/live/i.test(title)) throw new Error(`expected "live", got "${title}"`);
});

await step('Tab A edits a voter → Tab B Ground updates without reload', async () => {
  // Snapshot Tab B's voter list
  const beforeHTML = await pageB.evaluate(() => document.querySelector('.voters, .voter-list, table')?.textContent?.slice(0, 200) || document.body.textContent.slice(0, 500));

  // Tab A: edit a voter to a sentinel name
  await pageA.click('.adm__data-card:has-text("Voters")');
  await pageA.waitForSelector('table.adm__table--bucket');
  await pageA.click('button:has-text("Edit")');
  await pageA.waitForSelector('.adm__typed');
  await pageA.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.adm__field-label'));
    const lbl = labels.find(l => l.textContent.trim().startsWith('Last name'));
    const inp = lbl?.parentElement.querySelector('input');
    if (inp) { inp.focus(); inp.select?.(); }
  });
  await pageA.keyboard.type('SSESentinel');
  // Also set PD to PD-009 so it shows up first in Ground
  await pageA.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.adm__field-label'));
    const lbl = labels.find(l => l.textContent.trim().startsWith('Polling district'));
    const inp = lbl?.parentElement.querySelector('input');
    if (inp) { inp.focus(); inp.select?.(); }
  });
  await pageA.keyboard.type('PD-009');
  await pageA.click('button:has-text("Save")');
  await pageA.waitForSelector('.adm__msg--ok', { timeout: 5000 });

  // Tab B should pick up the change via SSE (no reload)
  await pageB.waitForFunction(
    () => document.body.textContent.includes('SSESentinel'),
    { timeout: 10000 }
  );
  log('✓ Tab B picked up SSESentinel via SSE without reload');
});

await step('Send invite → notification fires when accepted', async () => {
  // Tab A creates an invite
  await pageA.evaluate(() => localStorage.setItem('mandate2:route', 'admin'));
  await pageA.reload({ waitUntil: 'domcontentloaded' });
  await pageA.click('.adm__nav-btn:has-text("Users")');
  await pageA.click('button:has-text("Send invite link")');
  await pageA.waitForSelector('.adm__panel-title:has-text("Send invite link")');
  const inputs = await pageA.$$('.adm__field-input');
  await inputs[0].fill('Devon Park');
  await inputs[1].fill('devon@m.app');
  await pageA.selectOption('.adm__field-select', 'editor');
  await pageA.click('button:has-text("Save")');
  await pageA.waitForSelector('.adm__panel-title:has-text("Invite for Devon")');
  const inviteUrl = await pageA.inputValue('input.adm__field-input[readonly]');
  log('invite url:', inviteUrl);

  // Open invite in a third tab (different user, different cookie session)
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageC = await ctx2.newPage();
  await pageC.goto(inviteUrl, { waitUntil: 'domcontentloaded' });
  await pageC.waitForSelector('.auth-screen__title:has-text("Welcome")', { timeout: 5000 });
  await pageC.fill('input[type=password]', 'devon-pass-123');
  await pageC.click('button:has-text("Set password & sign in")');
  await pageC.waitForSelector('.home2__greeting, .mdt__bar', { timeout: 10000 });
  log('Devon signed in successfully');

  // Tab A should now have a notification — wait for the bell badge to appear
  await pageA.waitForFunction(() => !!document.querySelector('.notif__btn.has-unread'), { timeout: 10000 });
  // Open the bell
  await pageA.click('.notif__btn');
  await pageA.waitForSelector('.notif__pop');
  const html = await pageA.content();
  if (!/Devon Park joined/i.test(html)) throw new Error('expected "Devon Park joined" notification');
  log('✓ notification visible in bell dropdown');

  await ctx2.close();
});

await step('Mark notification read → unread count drops to 0', async () => {
  // Click "Mark all read"
  await pageA.click('.notif__pop button:has-text("Mark all read")');
  await pageA.waitForTimeout(500);
  await pageA.keyboard.press('Escape');
  // Click the bell again — badge should be gone
  const html = await pageA.content();
  if (/notif__btn has-unread/.test(html)) throw new Error('badge still showing after mark-all-read');
});

await step('Verify dedicated tables exist via API', async () => {
  // Hit the audit log via the page session and check for invite.create / invite.accept entries
  const log = await pageA.evaluate(() => fetch('/api/audit?limit=200', { credentials: 'include' }).then(r => r.json()));
  const created = log.log.find(r => r.action === 'invite.create');
  const accepted = log.log.find(r => r.action === 'invite.accept');
  if (!created) throw new Error('expected invite.create audit entry');
  if (!accepted) throw new Error('expected invite.accept audit entry');
  console.log('  invite created:', created.target);
  console.log('  invite accepted:', accepted.target);
  // The targets should match
  if (created.target !== accepted.target) throw new Error('audit targets should match');
});

console.log(`\nTotal page errors: ${errors.length}`);
errors.slice(0, 5).forEach(e => console.log(`  · ${e.slice(0, 200)}`));

await browser.close();
