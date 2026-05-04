import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERR:', m.text().slice(0, 200)); });

// Get a fresh invite from the API
const sup = await fetch('http://localhost:3000/api/auth/me', { credentials: 'include' });

// Sign in as super admin first
await page.goto('http://localhost:5174/');
await page.waitForSelector('.auth-screen__title');
const isSignup = (await page.textContent('.auth-screen__title')).includes('First');
if (isSignup) {
  console.log('Need to sign up first');
  process.exit(0);
}
await page.fill('input[type=email]', 'marcus@mandate.app');
await page.fill('input[type=password]', 'supersecret123');
await page.click('button:has-text("Sign in")');
await page.waitForSelector('.home2__greeting');

// Make an invite via API
const r = await page.evaluate(async () => {
  const resp = await fetch('/api/invites', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@test.com', name: 'Test User', role: 'editor' }),
  });
  return resp.json();
});
console.log('invite created:', r);

// Sign out, then visit invite link
await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }));
await page.goto(`http://localhost:5174${r.inviteUrl}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

const hasWelcome = await page.$('.auth-screen__title');
console.log('found welcome heading:', hasWelcome ? await hasWelcome.textContent() : 'NO');

await page.fill('input[type=password]', 'mypass1234');
await page.click('button:has-text("Set password")');
await page.waitForTimeout(2000);

const url = page.url();
console.log('final url:', url);
const bodyText = await page.evaluate(() => document.body.textContent.slice(0, 200));
console.log('body preview:', bodyText);

await browser.close();
