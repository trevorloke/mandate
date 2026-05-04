// Lightweight screenshot capture for v14 UI
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1500 } });
const page = await ctx.newPage();

await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.auth-screen__title');
await page.fill('input[type=email]', 'sa@m.app');
await page.fill('input[type=password]', 'supersecret123');
await page.click('button:has-text("Sign in")');
await page.waitForSelector('.mdt__bar', { timeout: 8000 });

// Screenshot 1: comment thread inside record
await page.click('.usrm__avatar');
await page.click('.usrm__item:has-text("Admin")');
await page.waitForSelector('.adm__nav');
await page.click('.adm__nav-btn:has-text("Module data")');
await page.waitForTimeout(500);
const cards = await page.$$('.adm__data-card');
for (const c of cards) {
  const t = (await c.textContent()) || '';
  if (/donor/i.test(t)) { await c.click(); break; }
}
await page.waitForTimeout(500);
const editBtn = await page.$('table tbody tr button:has-text("Edit"), table tbody tr button:has-text("View")');
await editBtn?.click();
await page.waitForSelector('.cmt');
await page.locator('.cmt').scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/mandate-audit/v14-comment-thread.png', fullPage: true });
console.log('saved v14-comment-thread.png');

// Screenshot 2: bulk invite UI
await page.click('.adm__nav-btn:has-text("Users")');
await page.waitForTimeout(400);
await page.click('button:has-text("Bulk CSV invite")');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/mandate-audit/v14-bulk-invite.png', fullPage: false });
console.log('saved v14-bulk-invite.png');

// Screenshot 3: bulk results panel — submit it
await page.click('button:has-text("Send invites")');
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/mandate-audit/v14-bulk-results.png', fullPage: false });
console.log('saved v14-bulk-results.png');

await browser.close();
