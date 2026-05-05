import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// Sign up + walk wizard → Start empty
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.auth-screen__title', { timeout: 10000 });
await page.fill('input[placeholder="Marcus Reyes"]', 'Empty Test');
await page.fill('input[placeholder="you@mandate.app"]', 'empty@m.app');
await page.fill('input[placeholder="min 8 characters"]', 'pass1234');
await page.fill('input[placeholder="Meridian West — Assembly"]', 'Empty WS');
await page.click('button:has-text("Create workspace & sign in")');
await page.waitForSelector('.onb', { timeout: 10000 });
console.log('OK   Wizard appeared');

await page.click('button:has-text("Begin")');
await page.waitForTimeout(200);
await page.selectOption('.onb__input', 'PROVINCIAL · MLA');
await page.fill('input[placeholder="Amara Tanaka"]', 'Test');
await page.fill('input[placeholder="Meridian Forward"]', 'Test');
await page.click('button:has-text("Next")');
await page.waitForTimeout(200);
await page.click('button:has-text("Next")');
await page.waitForTimeout(200);
await page.click('button:has-text("Next")');
await page.waitForTimeout(200);
await page.click('.onb__choice:has-text("Start empty")');
await page.click('button:has-text("Finish setup")');
await page.waitForSelector('.onb__step--done', { timeout: 10000 });
await page.click('button:has-text("Open Mandate")');
await page.waitForSelector('.mdt__bar', { timeout: 8000 });
console.log('OK   Past wizard onto home');

// HOME — should show empty state, NOT static dummy "Mandate Index 592"
await page.waitForTimeout(800);
const homeText = await page.textContent('.home2');
const hasIndex592 = homeText.includes('592');
const hasDummyMarcus = homeText.includes('Vance housing quote');
const hasEmptyMsg = homeText.includes('no records yet');
console.log('OK   home shows empty:', hasEmptyMsg, '· no dummy 592:', !hasIndex592, '· no dummy story:', !hasDummyMarcus);

// Visit each module — should show EmptyModule
for (const mod of ['Ground', 'Beacon', 'Raise', 'Ledger', 'Coalition', 'Civic', 'Opposition', 'Site', 'Events', 'Academy']) {
  const tab = await page.locator(`.mdt__tab:has-text("${mod}")`).first();
  if (!(await tab.isVisible())) continue;
  await tab.click();
  await page.waitForTimeout(400);
  const empty = await page.locator('.empty-mod').isVisible();
  console.log((empty ? 'OK   ' : 'FAIL ') + mod + ' empty state');
}

await page.screenshot({ path: '/tmp/mandate-audit/empty-final.png', fullPage: true });
console.log('\nPage errors:', errors.length);
errors.slice(0, 3).forEach(e => console.log(' ·', e.slice(0,120)));
await browser.close();
