import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5174/');
await page.waitForSelector('.auth-screen__title');
await page.fill('input[type=email]', 'sa@m.app');
await page.fill('input[type=password]', 'supersecret123');
await page.click('button:has-text("Sign in")');
await page.waitForSelector('.home2__greeting', { timeout: 10000 });
await page.evaluate(() => localStorage.setItem('mandate2:route', 'admin'));
await page.reload({ waitUntil: 'networkidle' });

// Voter bucket with advanced filters showing
await page.click('.adm__nav-btn:has-text("Module data")');
await page.click('.adm__data-card:has-text("Voters")');
await page.waitForSelector('.adm__bucket-search');
await page.click('button:has-text("Advanced filters")');
await page.click('button:has-text("+ Add condition")');
await page.waitForTimeout(200);
const sels = await page.$$('.adm__adv .adm__filter-chip');
await sels[0].selectOption('support');
await page.waitForTimeout(150);
const sels2 = await page.$$('.adm__adv .adm__filter-chip');
await sels2[1].selectOption('gte');
await page.waitForTimeout(150);
const sels3 = await page.$$('.adm__adv .adm__filter-chip');
await sels3[2].fill('0.7');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/mandate-audit/v9-adv-filters.png', fullPage: false });

// Workspaces with clone available
await page.click('.adm__back');
await page.click('.adm__nav-btn:has-text("Workspaces")');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/mandate-audit/v9-workspaces.png', fullPage: false });

// Workspace settings showing retention + backup
await page.click('.adm__nav-btn:has-text("Workspace")');
await page.waitForTimeout(500);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 1200));
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/mandate-audit/v9-retention.png', fullPage: false });

await browser.close();
console.log('Done');
