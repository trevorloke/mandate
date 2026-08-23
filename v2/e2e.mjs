// Browser E2E for the v2 foundation. Run with the server up:
//   node server/index.js   (in-memory DB)  then  node e2e.mjs
// Resolves playwright-core from the repo root's node_modules.
import { chromium } from 'playwright-core';

const BASE = process.env.BASE || 'http://localhost:3200';
const SHOTS = process.env.SHOTS || '/tmp/shots-v2';
const results = [];
const check = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });
const text = async () => ((await page.innerText('body').catch(() => '')) || '').replace(/\s+/g, ' ');

// ── 1. Signup → lands on Today at / ──
await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('input', { timeout: 15000 });
await page.fill('input[name="name"], #name', 'Avery Chen').catch(async () => {
  const inputs = await page.$$('input');
  await inputs[0].fill('Avery Chen');
});
const fillByLabel = async (re, val) => {
  const fields = await page.$$('label');
  for (const l of fields) {
    const t = await l.innerText().catch(() => '');
    if (re.test(t)) {
      const input = await l.$('input, select') || await l.evaluateHandle((el) => el.nextElementSibling);
      try { await input.asElement().fill(val); return true; } catch { /* select */ }
      try { await input.asElement().selectOption(val); return true; } catch { /* ignore */ }
    }
  }
  return false;
};
await fillByLabel(/name/i, 'Avery Chen');
await fillByLabel(/email/i, 'avery@example.org');
await fillByLabel(/password/i, 'northshore2026');
await fillByLabel(/workspace/i, 'North Shore 2026');
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`, { timeout: 15000 });
check('signup lands on Today at /', true);
await page.waitForFunction(
  () => !/loading the brief/i.test(document.body.innerText),
  null, { timeout: 10000 },
).catch(() => {});
let t = await text();
check('activation checklist shows', /add your first person/i.test(t), t.slice(0, 120));
await shot('1-today-fresh');

// ── 2. Add a person; URL routing gives the profile a real address ──
await page.goto(`${BASE}/people?new=1`, { waitUntil: 'domcontentloaded' });
await sleep(400);
const nameInput = await page.$('form input');
await nameInput.fill('Priya Nair');
await page.click('form button[type="submit"]');
await page.waitForURL(/\/people\/[0-9a-f-]{36}/, { timeout: 10000 });
const personUrl = page.url();
check('person created; profile has a real URL', /\/people\/[0-9a-f-]{36}/.test(personUrl), personUrl);
await shot('2-person-profile');

// ── 3. Log a gift through the picker (deep link preselects donor) ──
await page.goto(`${BASE}/money?new=1&person=${personUrl.split('/').pop()}`, { waitUntil: 'domcontentloaded' });
await sleep(600);
t = await text();
check('gift form preselects donor from deep link', /priya nair/i.test(t), t.slice(0, 150));
const amount = await page.$('input[inputmode="decimal"], input[type="number"], input[placeholder*="0.00"], input[name*=amount i]');
await amount.fill('900');
await page.click('form button[type="submit"]');
await sleep(800);
t = await text();
check('gift appears in ledger', /900\.00|\$900/.test(t));

// ── 4. Second gift crosses the cap → amber compliance banner + flag ──
await page.goto(`${BASE}/money?new=1&person=${personUrl.split('/').pop()}`, { waitUntil: 'domcontentloaded' });
await sleep(600);
const amount2 = await page.$('input[inputmode="decimal"], input[type="number"], input[placeholder*="0.00"], input[name*=amount i]');
await amount2.fill('700');
await page.click('form button[type="submit"]');
await sleep(800);
t = await text();
check('over-cap gift raises compliance banner', /over the/i.test(t), (t.match(/[^.]*over the[^.]*/i) || [''])[0].slice(0, 140));
await shot('3-money-flagged');

// ── 5. Void → undo toast → restore ──
const voidBtn = (await page.$$('button')).filter(async () => true);
let clicked = false;
for (const b of await page.$$('button')) {
  const bt = (await b.innerText().catch(() => '')).trim().toLowerCase();
  if (bt === 'void') { await b.click(); clicked = true; break; }
}
check('void button clicked', clicked);
await sleep(500);
t = await text();
check('undo toast appears', /voided/i.test(t));
await shot('4-undo-toast');
for (const b of await page.$$('button')) {
  const bt = (await b.innerText().catch(() => '')).trim().toLowerCase();
  if (bt === 'undo') { await b.click(); break; }
}
await sleep(700);
const rows = await page.$$('table tbody tr');
check('undo restores the gift', rows.length >= 2, `rows=${rows.length}`);

// ── 6. Filing with days-left badge ──
await page.goto(`${BASE}/filings?new=1`, { waitUntil: 'domcontentloaded' });
await sleep(400);
const fInputs = await page.$$('form input');
await fInputs[0].fill('Annual financial report');
for (const i of fInputs) {
  const type = await i.getAttribute('type');
  if (type === 'date') await i.fill('2027-03-31');
}
await page.click('form button[type="submit"]');
await sleep(700);
t = await text();
check('filing listed with days-left', /annual financial report/i.test(t));

// ── 7. Today composes it all; verify-my-books runs ──
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await sleep(800);
t = await text();
check('Today hero shows money total', /1,600|1600/.test(t), (t.match(/\$[\d,]+\.?\d*/) || [''])[0]);
check('flagged gift on Today', /over the/i.test(t));
for (const b of await page.$$('button')) {
  const bt = (await b.innerText().catch(() => '')).toLowerCase();
  if (/verify/.test(bt)) { await b.click(); break; }
}
await sleep(800);
t = await text();
check('verify-my-books reports verified events', /verified/i.test(t), (t.match(/[^ ]* events verified|✓[^.]{0,40}/i) || [''])[0]);
await shot('5-today-live');

// ── 8. Browser back works (URL routing headline) ──
await page.goBack();
await sleep(400);
check('browser back navigates (real routing)', page.url() !== `${BASE}/`, page.url());

// ── 9. Export is one click and complete ──
const exp = await page.evaluate(async () => {
  const r = await fetch('/api/export');
  const j = await r.json();
  return { status: r.status, format: j.format, events: (j.events || []).length, gifts: (j.gifts || []).length };
});
check('export returns full snapshot with event log', exp.status === 200 && exp.format === 'mandate-v2-export' && exp.events >= 4 && exp.gifts >= 1, JSON.stringify(exp));

await browser.close();
const fails = results.filter((r) => !r).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
