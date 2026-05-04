// Click every tab/button in every module, capture errors and rendered content
import { chromium } from 'playwright-core';
import fs from 'fs';

const ROUTES = ['home', 'ground', 'beacon', 'raise', 'ledger', 'coalition', 'civic', 'opposition', 'site', 'events', 'academy', 'command'];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const allFindings = [];
let currentRoute = null;
const allErrors = [];

page.on('pageerror', (err) => {
  allErrors.push({ route: currentRoute, msg: err.message });
});

for (const route of ROUTES) {
  currentRoute = route;
  await page.goto('http://localhost:5174/');
  await page.evaluate((r) => localStorage.setItem('mandate2:route', r), route);
  await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(600);

  // Find all clickable elements that look like tabs (buttons with tab-ish class names)
  const tabSelectors = [
    'button[class*="tab"]:not([disabled])',
    'button[class*="Tab"]:not([disabled])',
    '[role="tab"]:not([disabled])',
  ];
  const tabs = await page.$$eval(tabSelectors.join(', '), (els) =>
    els.map(e => ({
      text: (e.textContent || '').trim().slice(0, 40),
      cls: e.className,
    }))
  );

  // Click each tab once and check for new errors
  let errorBaseline = allErrors.length;
  const tabResults = [];

  // Limit to first ~12 tabs per module to avoid runaway
  for (let i = 0; i < Math.min(tabs.length, 15); i++) {
    const errsBefore = allErrors.length;
    try {
      const buttons = await page.$$(tabSelectors.join(', '));
      if (i < buttons.length) {
        const text = await buttons[i].textContent();
        await buttons[i].click({ timeout: 2000 });
        await page.waitForTimeout(200);
        const errsAfter = allErrors.length;
        const newErrors = allErrors.slice(errsBefore, errsAfter);
        tabResults.push({
          idx: i,
          text: (text || '').trim().slice(0, 40),
          errors: newErrors.map(e => e.msg.slice(0, 150)),
        });
      }
    } catch (e) {
      tabResults.push({ idx: i, error: e.message.slice(0, 100) });
    }
  }

  const nodeCount = await page.evaluate(() => document.getElementById('root')?.querySelectorAll('*').length || 0);
  allFindings.push({ route, tabsFound: tabs.length, tabResults, nodeCount });
}

await browser.close();

console.log('\n=== INTERACTION AUDIT ===\n');
for (const f of allFindings) {
  const failedTabs = f.tabResults.filter(t => t.errors?.length || t.error);
  const status = failedTabs.length === 0 ? 'OK' : 'FAIL';
  console.log(`${status.padEnd(6)} ${f.route.padEnd(12)} tabs=${f.tabsFound} tested=${f.tabResults.length} failed=${failedTabs.length} nodes=${f.nodeCount}`);
  for (const t of f.tabResults) {
    if (t.errors?.length) {
      console.log(`         ✗ tab[${t.idx}] "${t.text}": ${t.errors[0]}`);
    } else if (t.error) {
      console.log(`         ✗ tab[${t.idx}]: ${t.error}`);
    }
  }
}

console.log(`\nTotal page errors across all modules: ${allErrors.length}`);
fs.writeFileSync('/tmp/interaction-audit.json', JSON.stringify({ findings: allFindings, errors: allErrors }, null, 2));
console.log('Full results: /tmp/interaction-audit.json');
