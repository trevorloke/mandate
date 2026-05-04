import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.auth-screen__title');
await page.waitForTimeout(800);   // give /api/auth/oauth/providers time
await page.screenshot({ path: '/tmp/mandate-audit/v13-login-with-sso.png', fullPage: false });

// Sign in as admin to grab the SSO admin tab screenshot
await page.fill('input[type=email]', 'sa@m.app');
await page.fill('input[type=password]', 'supersecret123');
await page.click('button:has-text("Sign in")');
await page.waitForSelector('.mdt__bar', { timeout: 10000 });
await page.evaluate(() => localStorage.setItem('mandate2:route', 'admin'));
await page.reload({ waitUntil: 'domcontentloaded' });

await page.click('.adm__nav-btn:has-text("SSO")');
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/mandate-audit/v13-sso-admin.png', fullPage: false });

await browser.close();
console.log('Done');
