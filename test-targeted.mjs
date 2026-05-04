// Manually navigate Beacon → Boost tab and verify
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('pageerror', (err) => errors.push(err.message));

await page.goto('http://localhost:5174/');
await page.evaluate(() => localStorage.setItem('mandate2:route', 'beacon'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// Find all in-module tabs
const tabs = await page.$$eval('.beacon__tab', els =>
  els.map(e => ({ text: e.textContent.trim(), cls: e.className }))
);
console.log('Beacon tabs found:', tabs);

// Click each in turn and get a key signature of the rendered content
for (const tabInfo of tabs) {
  const buttons = await page.$$('.beacon__tab');
  const target = await page.evaluate(({ text, allTabs }) => {
    const btns = Array.from(document.querySelectorAll('.beacon__tab'));
    const idx = btns.findIndex(b => b.textContent.trim() === text);
    return idx;
  }, { text: tabInfo.text });

  if (target >= 0) {
    await buttons[target].click();
    await page.waitForTimeout(400);

    // Capture content signatures
    const sig = await page.evaluate(() => {
      const body = document.querySelector('.beacon__body, .beacon__body--full');
      const headers = Array.from(body?.querySelectorAll('h1,h2,h3,.b-stat,.beacon__h') || []).slice(0, 5).map(e => e.textContent.trim().slice(0, 40));
      const classes = Array.from(body?.children || []).slice(0, 5).map(e => (e.className || '').split(' ')[0]);
      return { hasBody: !!body, headers, classes };
    });
    console.log(`Tab "${tabInfo.text}":`, sig);
  }
}

console.log(`\nErrors: ${errors.length}`);
errors.forEach(e => console.log(`  · ${e}`));
await browser.close();
