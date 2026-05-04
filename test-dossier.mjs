import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://localhost:5174/');
await page.evaluate(() => localStorage.setItem('mandate2:route', 'home'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

// Click the ObjRef span
const refClicked = await page.evaluate(() => {
  const spans = Array.from(document.querySelectorAll('span'));
  const ref = spans.find(s => (s.textContent || '').includes('Vance housing quote'));
  if (ref) { ref.click(); return true; }
  return false;
});
console.log('Clicked ObjRef:', refClicked);
await page.waitForTimeout(500);

// Check if drawer opened
const drawerInfo = await page.evaluate(() => {
  const drawer = document.querySelector('[class*="dossier"], [class*="dsr"], aside.fabric, .obj-drawer');
  if (!drawer) {
    // Look for any new aside that appeared
    const asides = Array.from(document.querySelectorAll('aside'));
    return { classes: asides.map(a => a.className) };
  }
  return { className: drawer.className, width: drawer.offsetWidth, content: drawer.textContent.slice(0, 200) };
});
console.log('Drawer info:', drawerInfo);

await page.screenshot({ path: '/tmp/mandate-audit/dossier-drawer-real.png' });

console.log(`Errors: ${errors.length}`);
errors.forEach(e => console.log(`  · ${e}`));
await browser.close();
