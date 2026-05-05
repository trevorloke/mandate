// Verify the "Load sample data" branch of the wizard
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

await step('Sign up + walk wizard, pick Sample data', async () => {
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.auth-screen__title');
  await page.fill('input[placeholder="Marcus Reyes"]', 'Sample User');
  await page.fill('input[placeholder="you@mandate.app"]', 'sample@m.app');
  await page.fill('input[placeholder="min 8 characters"]', 'pass1234');
  await page.fill('input[placeholder="Meridian West — Assembly"]', 'SamCo');
  await page.click('button:has-text("Create workspace & sign in")');
  await page.waitForSelector('.onb');
  await page.click('button:has-text("Begin")');
  await page.waitForTimeout(200);
  await page.selectOption('.onb__input', 'PROVINCIAL · MLA');
  await page.fill('input[placeholder="Amara Tanaka"]', 'Test');
  await page.fill('input[placeholder="Meridian Forward"]', 'Test');
  await page.click('button:has-text("Next")');
  await page.waitForTimeout(200);
  await page.click('button:has-text("Next")');  // skip modules
  await page.waitForTimeout(200);
  await page.click('button:has-text("Next")');  // skip team
  await page.waitForTimeout(200);
  // Sample is the default — just click Finish
  await page.click('button:has-text("Finish setup")');
  await page.waitForSelector('.onb__step--done', { timeout: 15000 });
});

await step('Open Mandate, wait for sample seed to populate', async () => {
  await page.click('button:has-text("Open Mandate")');
  await page.waitForSelector('.mdt__bar', { timeout: 8000 });
  // Seed runs in the background. Wait up to 15s for records to appear.
  let count = 0;
  for (let i = 0; i < 15; i++) {
    const r = await page.evaluate(() => fetch('/api/data/raise/donor', { credentials: 'include' }).then(r => r.json()).catch(() => ({ records: [] })));
    count = r.records?.length || 0;
    if (count > 0) break;
    await page.waitForTimeout(1000);
  }
  if (count === 0) throw new Error('No donors seeded after 15s wait');
  log('seeded donor records:', count);
});

await step('Module page (Raise) renders the seeded records', async () => {
  await page.click('.mdt__tab:has-text("Raise")');
  await page.waitForTimeout(800);
  const html = await page.content();
  if (!/Anika Patel|Jordan Marsh|Theo Nakamura/.test(html)) {
    await page.screenshot({ path: '/tmp/mandate-audit/wiz-sample-fail.png' });
    throw new Error('Sample donor names not visible on Raise page');
  }
});

console.log(`\nTotal page errors: ${errors.length}`);
errors.slice(0, 5).forEach(e => console.log(`  · ${e.slice(0, 200)}`));

await browser.close();
console.log('\n✅ test-wizard-sample complete');
