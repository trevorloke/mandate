import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://localhost:5174/');
await page.evaluate(() => localStorage.setItem('mandate2:route', 'academy'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

await page.screenshot({ path: '/tmp/mandate-audit/academy-default.png' });

// Click on the featured course
const featured = await page.$('.lyc-feat');
if (featured) {
  await featured.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/mandate-audit/academy-course-detail.png' });
}

// Look for back button and click it
const backBtn = await page.evaluate(() => {
  const all = document.querySelectorAll('*');
  for (const el of all) {
    if ((el.textContent || '').trim().startsWith('← Library')) return true;
  }
  return false;
});
console.log('Back button found:', backBtn);

// Click back
await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('*'));
  const back = all.find(el => (el.textContent || '').trim().startsWith('← Library'));
  if (back) back.click();
});
await page.waitForTimeout(500);

// Now click an article (try to find a reading link)
const articleClicked = await page.evaluate(() => {
  const links = Array.from(document.querySelectorAll('.lyc-reading-card, [class*="reading"][class*="card"], [class*="article"]'));
  if (links.length > 0) { links[0].click(); return true; }
  return false;
});
console.log('Article clicked:', articleClicked);
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/mandate-audit/academy-article.png' });

console.log(`\nErrors: ${errors.length}`);
errors.forEach(e => console.log(`  · ${e}`));
await browser.close();
