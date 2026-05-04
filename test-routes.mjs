// Runtime verification: load each route, capture console errors, screenshot
import { chromium } from 'playwright-core';

const ROUTES = ['home', 'ground', 'beacon', 'raise', 'ledger', 'coalition', 'civic', 'opposition', 'site', 'events', 'academy', 'command'];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const results = {};
let currentRoute = null;
const allErrors = [];

page.on('pageerror', (err) => {
  if (currentRoute) {
    results[currentRoute].errors.push(err.message);
    allErrors.push({ route: currentRoute, msg: err.message });
  }
});
page.on('console', (msg) => {
  if (msg.type() === 'error' && currentRoute) {
    const text = msg.text();
    if (!text.includes('favicon') && !text.includes('DevTools')) {
      results[currentRoute].consoleErrors.push(text);
    }
  }
});

for (const route of ROUTES) {
  currentRoute = route;
  results[route] = { errors: [], consoleErrors: [], renderedNodes: 0 };

  try {
    // Set route in localStorage and reload
    await page.goto('http://localhost:5174/');
    await page.evaluate((r) => localStorage.setItem('mandate2:route', r), route);
    await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(800);

    // Count rendered nodes inside #root for sanity check
    const nodeCount = await page.evaluate(() => {
      const root = document.getElementById('root');
      return root ? root.querySelectorAll('*').length : 0;
    });
    results[route].renderedNodes = nodeCount;
  } catch (e) {
    results[route].errors.push(`Navigation failed: ${e.message}`);
  }
}

await browser.close();

// Print results
console.log('\n=== RUNTIME VERIFICATION ===\n');
let totalErrors = 0;
for (const route of ROUTES) {
  const r = results[route];
  const status = r.errors.length === 0 && r.consoleErrors.length === 0 ? 'OK' : 'FAIL';
  console.log(`${status.padEnd(6)} ${route.padEnd(12)} nodes=${String(r.renderedNodes).padEnd(5)} errors=${r.errors.length} consoleErrors=${r.consoleErrors.length}`);
  if (r.errors.length || r.consoleErrors.length) {
    totalErrors++;
    [...r.errors, ...r.consoleErrors].slice(0, 3).forEach(e => console.log(`         · ${e.substring(0, 200)}`));
  }
}

console.log(`\n${totalErrors === 0 ? 'ALL ROUTES PASS' : `${totalErrors} routes have errors`}`);
process.exit(totalErrors === 0 ? 0 : 1);
