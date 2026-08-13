// E2E — best-products release: activation checklist, ⌘K action palette,
// undo-toast delete, shortcuts overlay, N key, export endpoint.
// Run: node e2e-canon.mjs   (server must be up on PORT with a FRESH db)
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:3141';
const SHOTS = process.env.SHOTS || '/tmp/shots';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });
const hasText = async (sel, re) => {
  const els = await page.$$(sel);
  for (const el of els) {
    const t = (await el.innerText().catch(() => '')) || '';
    if (re.test(t)) return el;
  }
  return null;
};

// ── 1. Signup (first run → super_admin) ──
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.auth-form__input', { timeout: 15000 });
await page.fill('input[placeholder="Full name"]', 'Avery Chen');
await page.fill('input[placeholder="you@mandate.app"]', 'avery@example.org');
await page.fill('input[type="password"]', 'northshore2026');
await page.fill('input[placeholder^="Workspace name"]', 'North Shore 2026');
await page.fill('input[placeholder="Candidate name"]', 'Avery Chen');
await page.fill('input[placeholder="Party / banner"]', 'Independent');
await page.click('.auth-form__btn');

// ── 2. Onboarding — choose "start empty" when the starter step appears ──
for (let i = 0; i < 12; i++) {
  await sleep(700);
  if (await page.$('input[name="starter"]')) {
    const label = await hasText('.onb__choice', /empty/i);
    if (label) await label.click();
  }
  const btn = await page.$('.onb__btn:not(.onb__btn--ghost)');
  if (!btn) break;
  await btn.click().catch(() => {});
}
await sleep(1200);

// ── 3. Today: getting-started card ──
await page.waitForSelector('.gstart, [class*=gstart]', { timeout: 15000 }).catch(() => {});
const gstart = await page.$('[class*=gstart]');
check('activation card renders on Today', !!gstart);
const gsText = gstart ? (await gstart.innerText()).replace(/\s+/g, ' ') : '';
check('activation shows 0 of 5', /0\s*of\s*5/i.test(gsText), gsText.slice(0, 90));
await shot('1-today-getting-started');

// ── 4. "?" opens shortcuts overlay ──
await page.keyboard.press('?');
await sleep(300);
const sk = await page.$('.sk__modal, [class*=sk__]');
check('? opens shortcuts overlay', !!sk);
await shot('2-shortcuts-overlay');
await page.keyboard.press('Escape');
await sleep(200);

// ── 5. ⌘K default slate: Actions group + export ──
await page.keyboard.press('Control+k');
await sleep(400);
check('palette opens on Ctrl+K', !!(await page.$('.cp__modal')));
const cpText = ((await page.$('.cp__modal')) ? await (await page.$('.cp__modal')).innerText() : '').replace(/\s+/g, ' ');
check('palette default slate has Actions', /actions/i.test(cpText));
check('palette slate has a quick-add verb', /add a voter|log a gift/i.test(cpText));
check('palette slate has export', /export all data/i.test(cpText));
check('palette slate lists modules (Go to)', /go to/i.test(cpText));
await shot('3-palette-default-slate');

// ── 6. Palette action: type "gift" → Log a gift → QuickAdd preselected ──
await page.fill('.cp__input', 'gift');
await sleep(400);
const giftRow = await hasText('.cp__row', /log a gift/i);
check('typed query surfaces action row', !!giftRow);
await shot('4-palette-query-gift');
if (giftRow) await giftRow.click();
await sleep(500);
const qaSel = await page.$eval('.adm__field-select', el => el.value).catch(() => '');
check('action opens Quick Add on raise.gift', qaSel === 'raise.gift', qaSel);
await page.keyboard.press('Escape');
await sleep(300);

// ── 7. Activation step click → Quick Add on ground.voter; save a voter ──
const stepBtn = await hasText('[class*=gstart] button', /first voter/i);
check('activation has clickable voter step', !!stepBtn);
if (stepBtn) await stepBtn.click();
await sleep(500);
const qaSel2 = await page.$eval('.adm__field-select', el => el.value).catch(() => '');
check('voter step opens Quick Add on ground.voter', qaSel2 === 'ground.voter', qaSel2);
const fillField = async (label, val) => {
  const loc = page.locator(`.qa__modal .adm__field:has(label:text-is("${label}")) input`);
  if (await loc.count()) await loc.first().fill(val);
};
const idLoc = page.locator('.qa__modal .adm__field:has(label:text-is("ID")) input');
if (await idLoc.count() && !(await idLoc.first().inputValue())) await idLoc.first().fill('V-9001');
await fillField('First name', 'Bo');
await fillField('Last name', 'Lindqvist');
await page.click('.qa__modal button[type="submit"]');
await sleep(700);
check('voter saved via Quick Add', !!(await page.$('.qa__done')));
// close QuickAdd, reload → step flips
const doneBtn = await hasText('.qa__done button', /done/i);
if (doneBtn) await doneBtn.click();
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(1500);
const gs2 = await page.$('[class*=gstart]');
const gs2Text = gs2 ? (await gs2.innerText()).replace(/\s+/g, ' ') : '';
check('activation flips to 1 of 5 after first voter', /1\s*of\s*5/i.test(gs2Text), gs2Text.slice(0, 90));
await shot('5-today-one-of-five');

// ── 8. N key opens Quick Add ──
await page.keyboard.press('n');
await sleep(400);
check('N opens Quick Add', !!(await page.$('.qa__modal')));
await page.keyboard.press('Escape');
await sleep(200);

// ── 9. Simple view: single-click delete → undo toast → restore ──
await page.evaluate(() => localStorage.setItem('mandate2:route', 'ground'));
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(1500);
const rowCount = async () => (await page.$$('.sm__table tbody tr')).length;
const before = await rowCount();
check('simple view shows the voter', before >= 1, `rows=${before}`);
if (before >= 1) {
  await (await page.$$('.sm__table tbody tr'))[0].click();
  await sleep(400);
  const del = await hasText('.sm__overlay button', /delete/i);
  check('detail overlay has delete', !!del);
  if (del) await del.click();
  await sleep(600);
  const toast = await page.$('.sm__toast');
  check('undo toast appears after single-click delete', !!toast);
  check('overlay closed after delete', !(await page.$('.sm__overlay')));
  check('row removed from table', (await rowCount()) === before - 1);
  await shot('6-undo-toast');
  await page.click('.sm__toast-undo');
  await sleep(700);
  check('undo restores the record', (await rowCount()) === before, `rows=${await rowCount()}`);
  check('toast dismissed after undo', !(await page.$('.sm__toast')));
}
await shot('7-simple-restored');

// ── 10. Palette view toggle present on a module route ──
await page.keyboard.press('Control+k');
await sleep(400);
const togRow = await hasText('.cp__row', /switch to (full|simple) view/i);
check('palette offers Simple/Full toggle on module route', !!togRow);
await page.keyboard.press('Escape');

// ── 11. Export endpoint (admin, session cookie) ──
const exp = await page.evaluate(async () => {
  const r = await fetch('/api/workspace/backup/export');
  const j = await r.json().catch(() => null);
  return { status: r.status, format: j?.format, records: Array.isArray(j?.records) };
});
check('export endpoint returns snapshot', exp.status === 200 && exp.format === 'mandate-workspace-snapshot' && exp.records, JSON.stringify(exp));

await browser.close();
const fails = results.filter(r => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
