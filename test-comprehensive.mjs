// Comprehensive audit: walk every primary tab inside every module
// Capture screenshots, errors, and node counts for each tab to find stubs/empty states
import { chromium } from 'playwright-core';
import fs from 'fs';

// Per-module: a list of in-module tab labels to click. From source code.
const MODULES = {
  home:    [],
  ground:  ['DESK','FIELD'],
  beacon:  ['CALENDAR','PUBLISHING','LISTENING','PERFORMANCE','BOOST','PRESS LIST'],
  raise:   ['HOME','GIFTS','LISTS','REPORTS'],
  ledger:  ['JOURNAL','BOOKS','RECONCILE','BILLS','FILINGS','COMPLIANCE','ASSETS','REPORTS'],
  coalition: ['LEDGER','GRAPH','DIRECTORY','ASKS','OPS','COMMS','EVENTS'],
  civic:   ['Today','Bills','Casework','Hansard','Committees','Promises','Community','Correspondence','Allowance','Staff','Insights'],
  opposition: ['Targets','Claims','Evidence','Leads','Rebuttals','Monitors','Sources'],
  site:    ['Pages','Builder','CMS','Experiments','Forms','Audience','Deploys'],
  events:  ['Schedule','Calendar','Spring Gala','Shifts','Venues','Hosts'],
  academy: ['Library','Learning Path','Faculty'],
  command: [],
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

let currentRoute = null;
let currentTab = null;
const allErrors = [];
page.on('pageerror', (err) => allErrors.push({ route: currentRoute, tab: currentTab, msg: err.message }));

const dir = '/tmp/mandate-audit';
fs.mkdirSync(dir, { recursive: true });

const findings = [];

for (const [route, tabs] of Object.entries(MODULES)) {
  currentRoute = route;
  await page.goto('http://localhost:5174/');
  await page.evaluate((r) => localStorage.setItem('mandate2:route', r), route);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Initial screenshot at the default tab
  currentTab = '(default)';
  const initErrs = allErrors.length;
  await page.screenshot({ path: `${dir}/${route}--00-default.png` });
  const bodyHasContent = await page.evaluate(() => {
    // Find the main content area (not the shell nav)
    const candidates = document.querySelectorAll('[class*="__body"], [class*="-body"], main, .lyc__body');
    for (const el of candidates) {
      if (el.children.length > 0 && el.offsetHeight > 100) {
        return { ok: true, h: el.offsetHeight, children: el.children.length };
      }
    }
    return { ok: false };
  });
  findings.push({ route, tab: '(default)', screenshot: `${route}--00-default.png`, content: bodyHasContent, errors: allErrors.slice(initErrs).map(e => e.msg.slice(0, 150)) });

  // Click each tab in turn
  for (let i = 0; i < tabs.length; i++) {
    const label = tabs[i];
    currentTab = label;
    const errsBefore = allErrors.length;
    let clicked = false;

    try {
      // Try to find a button containing the label text. Use case-insensitive.
      const btn = await page.evaluateHandle((lbl) => {
        const all = Array.from(document.querySelectorAll('button'));
        // Filter out shell nav (top nav for module switching)
        const candidates = all.filter(b => {
          let p = b.parentElement;
          while (p) {
            const cls = (p.className || '').toLowerCase();
            if (cls.includes('shell__nav') || cls.includes('mod-rail') || cls.includes('navmod') ||
                cls.includes('mdt__nav') || cls.includes('mdt__strip')) return false;
            p = p.parentElement;
          }
          return true;
        });
        // Match by text content — exact start preferred over loose contains
        const lc = lbl.toLowerCase();
        return candidates.find(b => (b.textContent || '').trim().toLowerCase() === lc) ||
               candidates.find(b => (b.textContent || '').trim().toLowerCase().startsWith(lc + ' ')) ||
               candidates.find(b => (b.textContent || '').trim().toLowerCase().startsWith(lc)) ||
               null;
      }, label);

      const handle = btn.asElement();
      if (handle) {
        await handle.click({ timeout: 2000 });
        clicked = true;
        await page.waitForTimeout(500);
      }
    } catch (e) {
      // ignore
    }

    const screenshotName = `${route}--${String(i+1).padStart(2,'0')}-${label.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    await page.screenshot({ path: `${dir}/${screenshotName}` });
    const newErrs = allErrors.slice(errsBefore).map(e => e.msg.slice(0, 150));

    // Check the visible content body for size & emptiness
    const stat = await page.evaluate(() => {
      const candidates = document.querySelectorAll('[class*="__body"], [class*="-body"], main, .lyc__body');
      let max = { children: 0, h: 0 };
      for (const el of candidates) {
        if (el.children.length > max.children) max = { h: el.offsetHeight, children: el.children.length };
      }
      return max;
    });

    findings.push({ route, tab: label, clicked, screenshot: screenshotName, content: stat, errors: newErrs });
  }
}

await browser.close();

// Print summary
console.log('\n=== COMPREHENSIVE AUDIT ===\n');
let issues = 0;
for (const f of findings) {
  const probablyEmpty = !f.content?.children || f.content.h < 100;
  const hasErrs = f.errors?.length > 0;
  const status = hasErrs ? 'ERR ' : (probablyEmpty ? 'EMPTY' : 'OK   ');
  console.log(`${status} ${f.route.padEnd(11)} ${(f.tab || '').padEnd(20)} children=${f.content?.children || 0} h=${f.content?.h || 0}px screenshot=${f.screenshot}`);
  if (hasErrs) {
    issues++;
    f.errors.forEach(e => console.log(`         ✗ ${e}`));
  }
}

console.log(`\nTotal findings: ${findings.length} | issues: ${issues}`);
fs.writeFileSync('/tmp/audit-results.json', JSON.stringify(findings, null, 2));
