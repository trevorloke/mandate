import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.auth-screen__title');
await page.fill('input[type=email]', 'sa@m.app');
await page.fill('input[type=password]', 'supersecret123');
await page.click('button:has-text("Sign in")');
await page.waitForSelector('.mdt__bar', { timeout: 10000 });
await page.evaluate(() => localStorage.setItem('mandate2:route', 'home'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
// Open the bell
await page.click('.notif__btn');
await page.waitForSelector('.notif__pop');
await page.screenshot({ path: '/tmp/mandate-audit/v10-notif-open.png', fullPage: false });
await browser.close();
console.log('Done');
