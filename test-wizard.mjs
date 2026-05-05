// Quick E2E for the onboarding wizard
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const log = (...x) => console.log('  ', ...x);
const step = async (n, fn) => { try { const r = await fn(); console.log(`OK   ${n}`); return r; } catch (e) { console.log(`FAIL ${n}\n     ${e.message.slice(0, 400)}`); throw e; } };

await step('Sign up creates workspace, lands on wizard welcome', async () => {
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.auth-screen__title', { timeout: 10000 });
  await page.fill('input[placeholder="Marcus Reyes"]', 'Test User');
  await page.fill('input[placeholder="you@mandate.app"]', 'wiz@m.app');
  await page.fill('input[placeholder="min 8 characters"]', 'pass1234');
  await page.fill('input[placeholder="Meridian West — Assembly"]', 'Test WS');
  await page.click('button:has-text("Create workspace & sign in")');
  await page.waitForSelector('.onb', { timeout: 10000 });
  const title = await page.textContent('.onb__title');
  if (!/welcome/i.test(title)) throw new Error('Expected welcome step; got: ' + title);
});

await step('Begin → Campaign basics step', async () => {
  await page.click('button:has-text("Begin")');
  await page.waitForTimeout(300);
  const title = await page.textContent('.onb__title');
  if (!/campaign basics/i.test(title)) throw new Error('Expected campaign step; got: ' + title);
});

await step('Fill campaign details, advance to Modules', async () => {
  await page.selectOption('.onb__input', 'PROVINCIAL · MLA');
  await page.fill('input[placeholder="Amara Tanaka"]', 'Test Candidate');
  await page.fill('input[placeholder="Meridian Forward"]', 'Test Party');
  await page.click('button:has-text("Next")');
  await page.waitForTimeout(300);
  const title = await page.textContent('.onb__title');
  if (!/modules/i.test(title)) throw new Error('Expected modules step; got: ' + title);
  const mods = await page.locator('.onb__mod').count();
  if (mods !== 11) throw new Error('Expected 11 modules; got ' + mods);
});

await step('Disable Academy, advance to Team', async () => {
  await page.click('.onb__mod:has-text("Academy") input');
  await page.click('button:has-text("Next")');
  await page.waitForTimeout(300);
  const title = await page.textContent('.onb__title');
  if (!/invite your team/i.test(title)) throw new Error('Expected team step; got: ' + title);
});

await step('Skip team, advance to Starter data', async () => {
  await page.click('button:has-text("Next")');
  await page.waitForTimeout(300);
  const title = await page.textContent('.onb__title');
  if (!/starter data/i.test(title)) throw new Error('Expected data step; got: ' + title);
  const choices = await page.locator('.onb__choice').count();
  if (choices !== 3) throw new Error('Expected 3 starter-data choices; got ' + choices);
});

await step('Pick "Start empty", finish setup', async () => {
  await page.click('.onb__choice:has-text("Start empty")');
  await page.click('button:has-text("Finish setup")');
  // Wait either for done OR for an error message
  await Promise.race([
    page.waitForSelector('.onb__step--done', { timeout: 10000 }),
    page.waitForSelector('.onb__err', { timeout: 10000 }),
  ]);
  const errVisible = await page.locator('.onb__err').isVisible().catch(() => false);
  if (errVisible) {
    const errText = await page.locator('.onb__err').textContent();
    await page.screenshot({ path: '/tmp/mandate-audit/wiz-err.png' });
    throw new Error('Wizard error: ' + errText);
  }
  const title = await page.textContent('.onb__title');
  if (!/you're set/i.test(title)) throw new Error('Expected done step; got: ' + title);
});

await step('Open Mandate → app loads, no wizard', async () => {
  await page.click('button:has-text("Open Mandate")');
  await page.waitForSelector('.mdt__bar', { timeout: 8000 });
  const wizardVisible = await page.locator('.onb').isVisible().catch(() => false);
  if (wizardVisible) throw new Error('Wizard still visible after completion');
  log('app loaded with wizard dismissed');
});

await step('Reload — wizard does not reappear (settings.onboarded persisted)', async () => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const wizardVisible = await page.locator('.onb').isVisible().catch(() => false);
  if (wizardVisible) throw new Error('Wizard reappeared after reload');
  await page.waitForSelector('.mdt__bar', { timeout: 5000 });
});

await step('Workspace settings reflect wizard choices', async () => {
  const r = await page.evaluate(() => fetch('/api/workspace', { credentials: 'include' }).then(r => r.json()));
  if (!r.workspace.settings.onboarded) throw new Error('onboarded flag not persisted');
  if (r.workspace.kind !== 'PROVINCIAL · MLA') throw new Error('kind not saved: ' + r.workspace.kind);
  if (r.workspace.candidate !== 'Test Candidate') throw new Error('candidate not saved');
  if (r.workspace.settings.modules?.academy !== false) throw new Error('academy disable not saved');
});

console.log(`\nTotal page errors: ${errors.length}`);
errors.slice(0, 5).forEach(e => console.log(`  · ${e.slice(0, 200)}`));

await browser.close();
console.log('\n✅ test-wizard complete');
