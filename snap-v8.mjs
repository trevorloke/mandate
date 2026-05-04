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

// Webhooks tab
await page.click('.adm__nav-btn:has-text("Webhooks")');
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/mandate-audit/v8-webhooks.png', fullPage: false });

// Workspace tab — show backup section
await page.click('.adm__nav-btn:has-text("Workspace")');
await page.waitForTimeout(500);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/mandate-audit/v8-backup.png', fullPage: false });

await browser.close();
console.log('Done');
