import { chromium } from 'playwright-core';
import * as otp from 'otplib';
const TOTP_OPTS = { algorithm: 'SHA1', digits: 6, step: 30, window: 1, encoding: 'base32' };

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
await page.waitForSelector('input#totp', { timeout: 5000 });
await page.screenshot({ path: '/tmp/mandate-audit/v11-2fa-login.png', fullPage: false });

// Use a recently-issued TOTP from API state
// (For the screenshot we just need the prompt, so we can stop here)

await browser.close();
console.log('Done');
