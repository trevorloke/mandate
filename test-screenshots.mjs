// Take screenshots of every module + try to discover and click in-module tabs
import { chromium } from 'playwright-core';
import fs from 'fs';

const ROUTES = ['home', 'ground', 'beacon', 'raise', 'ledger', 'coalition', 'civic', 'opposition', 'site', 'events', 'academy', 'command'];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

let currentRoute = null;
const allErrors = [];
page.on('pageerror', (err) => {
  allErrors.push({ route: currentRoute, msg: err.message });
});

const dir = '/tmp/mandate-screens';
fs.mkdirSync(dir, { recursive: true });

const findings = {};

for (const route of ROUTES) {
  currentRoute = route;
  findings[route] = { errors: [], tabsClicked: 0, screenshots: [] };

  await page.goto('http://localhost:5174/');
  await page.evaluate((r) => localStorage.setItem('mandate2:route', r), route);
  await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(800);

  await page.screenshot({ path: `${dir}/${route}.png`, fullPage: false });
  findings[route].screenshots.push(`${route}.png`);

  // Find in-module tabs only — these are buttons inside the .shell content area
  // but NOT in the shell nav (which has class containing "shell" or "nav")
  const inModuleTabs = await page.$$eval('button[class*="tab"], button[class*="Tab"]', (els) =>
    els.filter(e => {
      // Exclude shell/nav buttons
      let p = e.parentElement;
      while (p) {
        const cls = (p.className || '').toLowerCase();
        if (cls.includes('shell__nav') || cls.includes('shell-nav') || cls.includes('navmod') ||
            cls.includes('mod-rail') || cls.includes('shell__rail')) return false;
        p = p.parentElement;
      }
      return true;
    }).map((e, i) => ({ idx: i, text: (e.textContent || '').trim().slice(0, 30), cls: (e.className || '').slice(0, 60) }))
  );

  findings[route].tabsAvailable = inModuleTabs.length;
  findings[route].tabSamples = inModuleTabs.slice(0, 6);

  // Try clicking up to first 5 in-module tabs
  // Re-query each time to avoid stale references
  for (let i = 0; i < Math.min(inModuleTabs.length, 5); i++) {
    const errsBefore = allErrors.length;
    try {
      const buttons = await page.$$('button[class*="tab"], button[class*="Tab"]');
      const eligible = [];
      for (const b of buttons) {
        const inShell = await b.evaluate((el) => {
          let p = el.parentElement;
          while (p) {
            const cls = (p.className || '').toLowerCase();
            if (cls.includes('shell__nav') || cls.includes('shell-nav') || cls.includes('navmod') ||
                cls.includes('mod-rail') || cls.includes('shell__rail')) return true;
            p = p.parentElement;
          }
          return false;
        });
        if (!inShell) eligible.push(b);
      }
      if (i >= eligible.length) break;
      const text = (await eligible[i].textContent() || '').trim().slice(0, 40);
      await eligible[i].click({ timeout: 2000 });
      await page.waitForTimeout(300);
      findings[route].tabsClicked++;
      const newErrs = allErrors.slice(errsBefore);
      if (newErrs.length) {
        findings[route].errors.push({ tab: text, errs: newErrs.map(e => e.msg.slice(0, 150)) });
      }
      await page.screenshot({ path: `${dir}/${route}-tab${i}.png`, fullPage: false });
      findings[route].screenshots.push(`${route}-tab${i}.png`);
    } catch (e) {
      findings[route].errors.push({ tab: `[${i}]`, errs: [e.message.slice(0, 100)] });
    }
  }
}

await browser.close();

console.log('\n=== IN-MODULE INTERACTION AUDIT ===\n');
for (const r of ROUTES) {
  const f = findings[r];
  const ok = f.errors.length === 0;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${r.padEnd(12)} inModuleTabs=${f.tabsAvailable} clicked=${f.tabsClicked} errors=${f.errors.length}`);
  if (f.errors.length) {
    f.errors.forEach(e => console.log(`         ✗ "${e.tab}": ${e.errs[0]}`));
  }
}
console.log(`\nScreenshots: ${dir}/`);
fs.writeFileSync('/tmp/screenshot-audit.json', JSON.stringify({ findings, errors: allErrors }, null, 2));
