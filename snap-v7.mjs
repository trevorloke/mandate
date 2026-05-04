import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto('http://localhost:5174/');
await page.waitForSelector('.auth-screen__title');

// Find a way to log in if we already signed up (try login first)
const isSignup = (await page.textContent('.auth-screen__title')).includes('First');
if (isSignup) {
  await page.fill('input[placeholder="Marcus Reyes"]', 'Marcus Reyes');
  await page.fill('input[placeholder="you@mandate.app"]', 'sa@m.app');
  await page.fill('input[placeholder="min 8 characters"]', 'supersecret123');
  await page.fill('input[placeholder="Meridian West — Assembly"]', 'Meridian West');
  await page.click('button:has-text("Create workspace & sign in")');
} else {
  await page.fill('input[type=email]', 'sa@m.app');
  await page.fill('input[type=password]', 'supersecret123');
  await page.click('button:has-text("Sign in")');
}
await page.waitForSelector('.home2__greeting', { timeout: 10000 });

// Go to admin
await page.evaluate(() => localStorage.setItem('mandate2:route', 'admin'));
await page.reload({ waitUntil: 'networkidle' });

// Voter bucket
await page.click('.adm__nav-btn:has-text("Module data")');
await page.waitForSelector('.adm__data-card');
await page.click('.adm__data-card:has-text("Voters")');
await page.waitForSelector('.adm__bucket-search');

// Apply a filter so we can show saved searches
await page.fill('.adm__bucket-search', 'housing');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/mandate-audit/v7-bucket-search.png', fullPage: false });

// Audit log
await page.click('.adm__back');
await page.click('.adm__nav-btn:has-text("Audit")');
await page.waitForSelector('.adm__log-row');
// Click first data.update row to expand
await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.adm__log-row'));
  const r = rows.find(x => x.textContent.includes('data.update'));
  if (r) r.click();
});
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/mandate-audit/v7-audit-diff.png', fullPage: false });

// Trash tab
await page.click('.adm__nav-btn:has-text("Trash")');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/mandate-audit/v7-trash.png', fullPage: false });

// Tokens tab
await page.click('.adm__nav-btn:has-text("API tokens")');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/mandate-audit/v7-tokens.png', fullPage: false });

await browser.close();
console.log('Screenshots written to /tmp/mandate-audit/');
