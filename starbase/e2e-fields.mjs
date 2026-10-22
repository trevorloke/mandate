// Profile fields E2E — one fresh in-memory campaign: a manager finds
// People → More → Profile fields, adds three fields (Pick one with choices
// and "Volunteers can see this", Yes/No, Text), reorders one; staff fill them
// in on a profile at 1360 and at 390 (tap buttons ≥ 48px, "✓ Saved");
// People filters by one behind Filter → More filters; a filled-in field's
// kind is fixed except to Text (the screen says why; the server refuses);
// taking one off keeps its values and "Bring back" restores it; the CSV
// import fills a field by its column name and refuses a bad cell with its
// row number; a volunteer on a phone sees only the filled-in field marked
// for volunteers, read-only, and can't reach the manager's screen. Every
// claim on a screen is checked against the API; each new screen is measured
// (visible words, yellow buttons, sideways scroll, 48px targets).
//
//   STARBASE_DATA=memory PORT=4213 node server/index.js &
//   BASE=http://127.0.0.1:4213 SHOTS=/tmp/fields node e2e-fields.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:3200';
const SHOTS = process.env.SHOTS || '/tmp/starbase-fields';
mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + String(extra).slice(0, 220) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = Date.now().toString(36);

const tileSvg = (z, x, y) => {
  const lines = [];
  for (let i = 0; i <= 256; i += 32) {
    const major = ((x * 256 + i) / 32) % 4 === 0;
    lines.push(`<line x1="${i}" y1="0" x2="${i}" y2="256" stroke="#fff" stroke-width="${major ? 5 : 2}"/>`);
  }
  for (let j = 0; j <= 256; j += 32) {
    const major = ((y * 256 + j) / 32) % 4 === 0;
    lines.push(`<line x1="0" y1="${j}" x2="256" y2="${j}" stroke="#fff" stroke-width="${major ? 5 : 2}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e7e3d6"/>${lines.join('')}</svg>`;
};
const tiles = (ctx) => ctx.route(/tile\.openstreetmap\.org\/(\d+)\/(\d+)\/(\d+)\.png/, (route) => {
  const [, z, x, y] = route.request().url().match(/\/(\d+)\/(\d+)\/(\d+)\.png/);
  route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tileSvg(+z, +x, +y) });
});

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const errors = [];
const helpers = (page, who) => {
  page.on('pageerror', (e) => errors.push(`[${who}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && /key|unique/i.test(m.text())) errors.push(`[${who}] ${m.text()}`); });
  return {
    shot: (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: false }),
    full: (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true }),
    text: async () => ((await page.innerText('body').catch(() => '')) || '').replace(/\s+/g, ' '),
    api: (path, body) => page.evaluate(async ([p, b]) => {
      const r = await fetch('/api' + p, b === undefined ? {} : {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b),
      });
      const raw = await r.text();
      let json = null;
      try { json = JSON.parse(raw); } catch { /* not json */ }
      return { status: r.status, json, raw };
    }, [path, body]),
    go: async (path) => { await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' }); await sleep(900); },
  };
};
// Simplicity: words on the screen (not the nav/tab bar), yellow buttons,
// sideways scroll, and the smallest tap target among `sel`.
const measure = (page, sel = null) => page.evaluate((targets) => {
  const main = document.querySelector('main.page') || document.body;
  const words = (main.innerText || '').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const yellow = [...document.querySelectorAll('.btn-primary')].filter(visible).length;
  const overflow = document.documentElement.scrollWidth - window.innerWidth;
  let minTap = null;
  if (targets) {
    for (const el of document.querySelectorAll(targets)) {
      if (!visible(el)) continue;
      const h = el.getBoundingClientRect().height;
      minTap = minTap == null ? h : Math.min(minTap, h);
    }
  }
  return { words, yellow, overflow, minTap };
}, sel);

// ── 1. A manager and a few people (public-building addresses, 555-01xx phones) ──
const dctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, timezoneId: 'America/Vancouver' });
await tiles(dctx);
const page = await dctx.newPage();
const D = helpers(page, 'manager');
await D.go('/signup');
await page.fill('#su-name', 'Riley Manager');
await page.fill('#su-email', `riley+${tag}@fields.example`);
await page.fill('#su-password', 'surrey-forward-2026');
await page.fill('#su-workspace', 'Imagine Surrey');
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`, { timeout: 15000 });
const P = {};
const mk = async (key, data) => { P[key] = (await D.api('/actions/person.create', data)).json.person; };
await mk('harjit', { name: 'Harjit Example', phone: '604-555-0141', email: 'harjit@example.org', address: '13450 104 Ave', city: 'Surrey' });
await mk('maya', { name: 'Maya Example', phone: '604-555-0142', address: '13730 72 Ave', city: 'Surrey' });
await mk('tom', { name: 'Tom Example', phone: '604-555-0143', address: '15105 105 Ave', city: 'Surrey' });
check('seeded 3 people', Object.values(P).every((p) => p?.id));

// ── 2. People → More → Profile fields ──
await D.go('/people');
await page.click('.pp-menu button:has-text("More")');
const link = await page.$('.pp-menu__panel a[href="/people/fields"]');
check('People → More lists "Profile fields" (managers)', !!link && /Profile fields/i.test(await link.innerText()));
await link.click();
await page.waitForURL(`${BASE}/people/fields`);
await sleep(600);
let m = await measure(page);
check('empty: one line, one yellow "Add a field"', /No fields yet\./.test(await D.text()) && m.yellow === 1 && /Add a field/i.test(await page.innerText('.btn-primary')), JSON.stringify(m));
console.log(`      words on /people/fields (empty): ${m.words}`);
await D.shot('01-fields-empty');

const addField = async ({ name, kind, choices = [], volunteers = false }) => {
  if (!(await page.$('form[aria-label="Add field"]'))) await page.click('.ops-head button:has-text("Add a field")');
  const form = 'form[aria-label="Add field"]';
  await page.fill(`${form} input[placeholder="Language at home"]`, name);
  await page.click(`${form} .sv-kind:has-text("${kind}")`);
  for (const [i, c] of choices.entries()) {
    const inputs = await page.$$(`${form} .sv-choice input`);
    if (!inputs[i]) await page.click(`${form} button:has-text("+ Add a choice")`);
    const all = await page.$$(`${form} .sv-choice input`);
    await all[i].fill(c);
  }
  const on = (await page.getAttribute(`${form} .fd-switch`, 'aria-checked')) === 'true';
  if (on !== volunteers) await page.click(`${form} .fd-switch`);
  await page.click(`${form} button[type="submit"]`);
  await sleep(800);
};

await page.click('.ops-head button:has-text("Add a field")');
const sw = await page.getAttribute('form[aria-label="Add field"] .fd-switch', 'aria-checked');
check('"Volunteers can see this" is off by default', sw === 'false', sw);
m = await measure(page, 'form[aria-label="Add field"] .sv-kind, form[aria-label="Add field"] .input, form[aria-label="Add field"] .btn, form[aria-label="Add field"] .fd-switch');
check('add form: one yellow (Add field), targets ≥ 48px', m.yellow === 1 && m.minTap >= 48 && /Add field/i.test(await page.innerText('.btn-primary')), JSON.stringify(m));
const kinds = await page.$$eval('form[aria-label="Add field"] .sv-kind', (els) => els.map((e) => e.innerText.trim()));
check('five types: Text · Yes/No · Pick one · Number · Date', kinds.join('|') === 'Text|Yes/No|Pick one|Number|Date', kinds.join('|'));
await D.shot('02-add-form');
await addField({ name: 'Language at home', kind: 'Pick one', choices: ['English', 'Punjabi', 'Mandarin'], volunteers: true });
await addField({ name: 'Strata council member', kind: 'Yes/No' });
await addField({ name: 'Union local', kind: 'Text' });
let list = (await D.api('/fields')).json.fields;
check('three fields saved as typed', list.map((f) => `${f.name}:${f.kind}:${f.volunteers}`).join('|')
  === 'Language at home:choice:true|Strata council member:yesno:false|Union local:text:false', list.map((f) => `${f.name}:${f.kind}:${f.volunteers}`).join('|'));
check('choices saved in order', JSON.stringify(list[0].choices) === '["English","Punjabi","Mandarin"]', JSON.stringify(list[0].choices));
const rowNames = await page.$$eval('ol[aria-label="Fields"] .ops-row__name', (els) => els.map((e) => e.textContent));
check('the list shows them in the API’s order', rowNames.join('|') === list.map((f) => f.name).join('|'), rowNames.join('|'));
check('row says the type and "Volunteers see it"', /Pick one · 0 filled in · Volunteers see it/.test(await page.innerText('ol[aria-label="Fields"] .ops-item:nth-child(1) .ops-row__sub')));

// Reorder: Union local up one.
await page.click('ol[aria-label="Fields"] .ops-row:has-text("Union local")');
await page.click('.fd-item[data-open] button:has-text("Move up")');
await sleep(700);
list = (await D.api('/fields')).json.fields;
check('Move up reorders on the server', list.map((f) => f.name).join('|') === 'Language at home|Union local|Strata council member', list.map((f) => f.name).join('|'));
const F = Object.fromEntries(list.map((f) => [f.name, f]));
m = await measure(page);
check('fields screen: one yellow button', m.yellow === 1, JSON.stringify(m));
await D.full('03-fields-desktop');

// ── 3. Staff fill them in on a profile, at a desk (1360) ──
const staffInvite = (await D.api('/actions/member.invite', { email: `sam+${tag}@fields.example`, role: 'staff' })).json;
const sctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, timezoneId: 'America/Vancouver' });
await tiles(sctx);
const spage = await sctx.newPage();
const S = helpers(spage, 'staff');
await S.go('/login');
const sj = await S.api('/auth/join', { token: staffInvite.joinUrl.split('/').pop(), name: 'Sam Staff', password: 'desk-work-2026' });
check('staff joined', sj.status === 200 && sj.json.role === 'staff', sj.status);
await S.go('/people');
await spage.click('.pp-menu button:has-text("More")');
check('staff: no "Profile fields" in More (a manager’s screen)', !(await spage.$('.pp-menu__panel a[href="/people/fields"]')));
await spage.keyboard.press('Escape');
await S.go(`/people/${P.harjit.id}`);
await spage.waitForSelector('.pf-sec__btn:has-text("More details")', { timeout: 8000 }).catch(() => {});
const sec = await spage.$('.pf-sec__btn:has-text("More details")');
check('profile: "More details", closed until tapped', !!sec && (await sec.getAttribute('aria-expanded')) === 'false');
const before = await measure(spage);
await sec.click();
await sleep(300);
const q = 'form[aria-label="More details"]';
const labels = await spage.$$eval(`${q} .fd-q__label`, (els) => els.map((e) => e.textContent));
check('each field, in order', labels.join('|') === 'Language at home|Union local|Strata council member', labels.join('|'));
check('Yes/No and Pick one are tap buttons, not selects', (await spage.$$(`${q} select`)).length === 0
  && (await spage.$$(`${q} .sv-q:has-text("Language at home") .sv-opt`)).length === 3 && (await spage.$$(`${q} .sv-q:has-text("Strata council member") .sv-opt`)).length === 2);
m = await measure(spage, `${q} .sv-opt, ${q} input, ${q} .fd-save`);
check('profile at 1360: field targets ≥ 48px, no new yellow', m.minTap >= 48 && m.yellow === before.yellow && m.yellow <= 1, JSON.stringify(m));
check('Save is off until something changes', await spage.$eval(`${q} .fd-save`, (b) => b.disabled));
await spage.click(`${q} .sv-q:has-text("Language at home") .sv-opt:has-text("Punjabi")`);
await spage.click(`${q} .sv-q:has-text("Strata council member") .sv-opt:has-text("Yes")`);
await spage.fill(`${q} .sv-q:has-text("Union local") input`, 'CUPE 402');
await spage.click(`${q} .fd-save`);
await sleep(900);
const saidLine = await spage.innerText(`${q} .fd-said`).catch(() => '');
let vals = (await S.api(`/persons/${P.harjit.id}/fields`)).json.fields;
const byName = (list2) => Object.fromEntries(list2.map((f) => [f.name, f.value]));
check('"✓ Saved" — and the server has exactly that', saidLine.trim() === '✓ Saved'
  && JSON.stringify(byName(vals)) === JSON.stringify({ 'Language at home': 'Punjabi', 'Union local': 'CUPE 402', 'Strata council member': true }), `${saidLine} ${JSON.stringify(byName(vals))}`);
check('the section counts what’s filled in: 3', (await spage.innerText('.pf-sec__btn:has-text("More details") .pf-sec__count')).trim() === '3');
const evs = (await D.api('/events?limit=500')).json.events.filter((e) => e.entity_type === 'person_field_value');
check('each value is on the event log (field.values.set)', evs.length === 3 && evs.every((e) => e.action === 'field.values.set'), evs.length);
await S.full('04-profile-desk');
// Tap a picked choice again to clear it, then put it back.
await spage.click(`${q} .sv-q:has-text("Strata council member") .sv-opt:has-text("Yes")`);
check('un-tapping a choice clears it (Save turns on, "✓ Saved" goes)', !(await spage.$eval(`${q} .fd-save`, (b) => b.disabled)) && !(await spage.innerText(`${q} .fd-said`)).trim());
await spage.click(`${q} .sv-q:has-text("Strata council member") .sv-opt:has-text("Yes")`);
check('…and tapping it back makes nothing to save', await spage.$eval(`${q} .fd-save`, (b) => b.disabled));

// ── 4. …and on a phone (390) ──
const sphone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/Vancouver' });
await sphone.addCookies((await sctx.cookies()).map((c) => ({ ...c })));
const ppage = await sphone.newPage();
const PH = helpers(ppage, 'staff-phone');
await PH.go(`/people/${P.maya.id}`);
await ppage.waitForSelector('.pf-sec__btn:has-text("More details")', { timeout: 8000 }).catch(() => {});
await ppage.click('.pf-sec__btn:has-text("More details")');
await sleep(300);
await ppage.click(`${q} .sv-q:has-text("Language at home") .sv-opt:has-text("Mandarin")`);
await ppage.click(`${q} .sv-q:has-text("Strata council member") .sv-opt:has-text("No")`);
m = await measure(ppage, `${q} .sv-opt, ${q} input, ${q} .fd-save, .pf-sec__btn`);
check('profile at 390: no sideways scroll, targets ≥ 48px, ≤ 1 yellow', m.overflow <= 0 && m.minTap >= 48 && m.yellow <= 1, JSON.stringify(m));
await ppage.$eval(`${q} .fd-save`, (el) => el.scrollIntoView({ block: 'center' }));
await PH.shot('05-profile-phone');
await ppage.click(`${q} .fd-save`);
await sleep(900);
vals = (await PH.api(`/persons/${P.maya.id}/fields`)).json.fields;
check('phone save: "✓ Saved" and the server agrees', (await ppage.innerText(`${q} .fd-said`)).trim() === '✓ Saved'
  && byName(vals)['Language at home'] === 'Mandarin' && byName(vals)['Strata council member'] === false && byName(vals)['Union local'] === null, JSON.stringify(byName(vals)));
// A value that doesn't fit is refused in the server's words, nothing saved.
const refused = await PH.api('/actions/field.values.set', { person_id: P.tom.id, values: [{ field_id: F['Language at home'].id, value: 'Klingon' }] });
check('the server refuses a value that isn’t a choice, with the field’s name', refused.status === 400 && /“Language at home”: “Klingon” isn’t one of the choices/.test(refused.json.error), refused.raw);

// ── 5. People: filter by a field (behind More filters) ──
await S.go('/people');
await spage.click('.pp-filterbtn');
await sleep(300);
let sheet = await spage.innerText('.pp-sheet');
check('Filter’s first look: no field groups (they wait under More filters)', !/Language at home/i.test(sheet) && /More filters/i.test(sheet));
await spage.click('.pp-morefilters');
await sleep(400);
sheet = await spage.innerText('.pp-sheet');
check('More filters: a group per field — choices, Yes/No, common words', /Language at home/i.test(sheet) && /Strata council member/i.test(sheet) && /Union local/i.test(sheet) && /CUPE 402/i.test(sheet), sheet.slice(-300));
m = await measure(spage, '.pp-sheet .pp-pick');
check('filter chips ≥ 48px', m.minTap >= 48, JSON.stringify(m));
await spage.click('.pp-sheet fieldset:has(legend:text-is("Language at home")) .pp-pick:has-text("Punjabi")');
await sleep(900);
const url = new URL(spage.url());
check('the URL carries the filter (?field=<id>:Punjabi)', url.searchParams.get('field') === `${F['Language at home'].id}:Punjabi`, url.search);
await spage.click('.pp-sheet button:has-text("Done")');
await sleep(400);
const chip = await spage.innerText('.pp-chips .pp-fchip').catch(() => '');
const apiList = (await S.api(`/persons?field=${encodeURIComponent(`${F['Language at home'].id}:Punjabi`)}`)).json.persons;
const shownNames = await spage.$$eval('.pp-table__name a', (els) => els.map((e) => e.textContent));
check('chip "Language at home: Punjabi"; the list is the server’s (Harjit)', /Language at home: Punjabi/.test(chip)
  && shownNames.join('|') === apiList.map((p) => p.name).join('|') && shownNames.join('|') === 'Harjit Example', `${chip} · ${shownNames.join('|')}`);
check('the count says 1 person', /\b1 person\b/.test(await spage.innerText('.pp-count')));
await S.shot('06-people-filtered');
// More → Call list keeps the filter.
await spage.click('.pp-menu button:has-text("More")');
const callHref = await spage.getAttribute('.pp-menu__panel a:has-text("Call list")', 'href');
check('Call list carries the field filter', new URLSearchParams(callHref.split('?')[1]).get('field') === `${F['Language at home'].id}:Punjabi`, callHref);
await spage.keyboard.press('Escape');
await spage.click('.pp-chips .pp-fchip');
await sleep(800);
check('removing the chip shows everyone again', (await spage.$$('.pp-table__name a')).length === 3 && !new URL(spage.url()).searchParams.get('field'));
// Yes/No filter on a phone.
await PH.go(`/people?field=${F['Strata council member'].id}:no`);
check('phone: "Strata council member: No" → Maya', /Strata council member: No/.test(await ppage.innerText('.pp-chips').catch(() => ''))
  && (await ppage.$$eval('.pp-row__name', (els) => els.map((e) => e.textContent))).join('|') === 'Maya Example');
m = await measure(ppage);
check('People at 390 with the filter: no sideways scroll, ≤ 1 yellow', m.overflow <= 0 && m.yellow <= 1, JSON.stringify(m));
await PH.shot('07-people-filtered-phone');

// ── 6. Kind: fixed once filled in, except to Text — the screen says why ──
await D.go('/people/fields');
await page.click('ol[aria-label="Fields"] .ops-row:has-text("Language at home")');
await sleep(300);
const open = '.fd-item[data-open]';
const disabled = await page.$$eval(`${open} .sv-kind`, (els) => els.filter((e) => e.disabled).map((e) => e.innerText.trim()));
const why = await page.innerText(`${open} .fd-why`).catch(() => '');
check('filled in: only Text stays open, and the line says why', disabled.join('|') === 'Yes/No|Number|Date' && why === 'Filled in for 2 people — it can only become Text', `${disabled.join('|')} · ${why}`);
const refuse = await D.api('/actions/field.update', { id: F['Language at home'].id, kind: 'number' });
check('the server refuses it too, saying why', refuse.status === 409 && /filled in for 2 people — it can only become Text now/.test(refuse.json.error), refuse.raw);
// A used choice can't be removed: it shows its count, no ✕.
const kept = await page.$$eval(`${open} .fd-choice--kept`, (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
check('used choices are kept, with their counts', kept.join('|') === 'Punjabi 1 filled in|Mandarin 1 filled in', kept.join('|'));
// Add a choice, then volunteers off→on stays; Save.
await page.click(`${open} button:has-text("+ Add a choice")`);
const inputs = await page.$$(`${open} .sv-choice input`);
await inputs[inputs.length - 1].fill('Tagalog');
await page.click(`${open} button[type="submit"]`);
await sleep(800);
list = (await D.api('/fields')).json.fields;
check('a choice added: "✓ Saved", in order', JSON.stringify(list[0].choices) === '["English","Punjabi","Mandarin","Tagalog"]' && /✓ Saved/.test(await D.text()), JSON.stringify(list[0].choices));
// Rename.
await page.click('ol[aria-label="Fields"] .ops-row:has-text("Union local")');
await page.fill(`${open} input[placeholder="Language at home"]`, 'Union local #');
await page.click(`${open} button[type="submit"]`);
await sleep(700);
check('rename', (await D.api('/fields')).json.fields.some((f) => f.name === 'Union local #'));
const pm = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/Vancouver' });
await pm.addCookies((await dctx.cookies()).map((c) => ({ ...c })));
const mpage = await pm.newPage();
const MP = helpers(mpage, 'manager-phone');
await MP.go('/people/fields');
m = await measure(mpage, '.btn, .ops-row, .fd-switch, .sv-kind, .disclose');
check('/people/fields at 390: ≤ 1 yellow, no sideways scroll, targets ≥ 48px', m.yellow <= 1 && m.overflow <= 0 && m.minTap >= 48, JSON.stringify(m));
console.log(`      words on /people/fields at 390: ${m.words}`);
await mpage.click('ol[aria-label="Fields"] .ops-row:has-text("Language at home")');
await sleep(300);
m = await measure(mpage, '.fd-item[data-open] .btn, .fd-item[data-open] .input, .fd-item[data-open] .sv-kind, .fd-item[data-open] .fd-switch');
check('field editor at 390: targets ≥ 48px, no sideways scroll', m.minTap >= 48 && m.overflow <= 0, JSON.stringify(m));
await MP.full('08-field-editor-phone');

// ── 7. Take off keeps everything; Bring back ──
await page.click('ol[aria-label="Fields"] .ops-row:has-text("Union local #")');
await page.click(`${open} button:has-text("Take off")`);
check('take off asks in place: "Take off? Everything filled in is kept."', /Take off\? Everything filled in is kept\./.test(await D.text()));
await page.click(`${open} .ops-confirm button:has-text("Yes")`);
await sleep(800);
list = (await D.api('/fields')).json.fields;
const off = list.find((f) => f.name === 'Union local #');
check('taken off on the server, its value kept', off.retired === true && off.filled === 1, JSON.stringify(off));
check('"Taken off · 1" under the list', /Taken off · 1/.test(await D.text()));
const harjitFields = (await S.api(`/persons/${P.harjit.id}/fields`)).json.fields;
check('gone from the profile', !harjitFields.some((f) => f.name === 'Union local #'));
const exp = (await D.api('/export')).json;
check('still in the export, with its value', exp.person_fields.some((f) => f.name === 'Union local #' && f.retired_at)
  && exp.person_field_values.some((v) => v.field_id === off.id && v.value === 'CUPE 402'));
await page.click('button.ops-more:has-text("Taken off")');
await page.click('#fd-off button:has-text("Bring back")');
await sleep(800);
check('Bring back: on the profile again with its value', (await S.api(`/persons/${P.harjit.id}/fields`)).json.fields.some((f) => f.name === 'Union local #' && f.value === 'CUPE 402'));

// ── 8. Import: a column fills a field by its name; a bad cell is refused by row ──
await S.go('/people/import');
await spage.click('button:has-text("Paste text")');
await spage.fill('#imp-paste', `Name,Phone,Language at home,strata council member\nNew Example,604-555-0151,punjabi,yes\nBad Example,604-555-0152,Klingon,no`);
await spage.click('button:has-text("Use this text")');
await sleep(500);
const sel = await spage.$$eval('.imp-map__select', (els) => els.map((e) => e.options[e.selectedIndex].text));
check('columns matched to fields by name (any case)', sel.join('|') === 'Full name|Phone|Language at home|Strata council member', sel.join('|'));
await S.shot('09-import-mapping');
await spage.click('button:has-text("Check 2 rows")');
await sleep(1200);
const invalid = await spage.innerText('.imp-invalid').catch(() => '');
check('a bad cell is refused with its row number', /Row 3/.test(invalid) && /Klingon/.test(invalid) && /isn’t one of the choices/.test(invalid), invalid);
await spage.click('button:has-text("Import 1 person")');
await sleep(1500);
const neu = (await S.api('/persons?q=New%20Example')).json.persons[0];
const nv = neu ? byName((await S.api(`/persons/${neu.id}/fields`)).json.fields) : {};
check('imported with its fields: Punjabi (the choice’s own words), Yes', nv['Language at home'] === 'Punjabi' && nv['Strata council member'] === true, JSON.stringify(nv));

// ── 9. A volunteer on a phone ──
const invite = (await D.api('/actions/member.invite', { email: `jas+${tag}@fields.example`, role: 'volunteer' })).json;
const vctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/Vancouver' });
await tiles(vctx);
const vpage = await vctx.newPage();
const V = helpers(vpage, 'vol');
await V.go('/login');
const joined = await V.api('/auth/join', { token: invite.joinUrl.split('/').pop(), name: 'Jas Volunteer', password: 'knock-knock-2026' });
check('volunteer joined', joined.status === 200 && joined.json.role === 'volunteer', joined.status);
const vf = await V.api(`/persons/${P.harjit.id}/fields`);
check('volunteer reads only the filled-in field marked for volunteers, words only',
  vf.status === 200 && JSON.stringify(vf.json.fields) === JSON.stringify([{ id: F['Language at home'].id, name: 'Language at home', kind: 'choice', value: 'Punjabi' }]) && !vf.raw.includes('CUPE'), vf.raw);
check('volunteer refused the list of fields', (await V.api('/fields')).status === 403);
check('volunteer may not fill one in', (await V.api('/actions/field.values.set', { person_id: P.harjit.id, values: [{ field_id: F['Language at home'].id, value: 'English' }] })).status === 403);
check('volunteer’s list never matches on a hidden field', (await V.api(`/persons?field=${F['Strata council member'].id}:yes`)).json.persons.length === 0);
await V.go(`/people/${P.harjit.id}`);
await vpage.waitForSelector('.pf-sec__btn:has-text("More details")', { timeout: 8000 }).catch(() => {});
await vpage.click('.pf-sec__btn:has-text("More details")');
await sleep(300);
const vsec = await vpage.innerText('.pf-sec:has(.pf-sec__btn:has-text("More details")) .pf-sec__body').catch(() => '');
check('volunteer profile: "More details" shows Language at home: Punjabi — nothing else', /Language at home/i.test(vsec) && /Punjabi/.test(vsec) && !/Strata|Union|CUPE/i.test(vsec), vsec);
check('…read-only: no inputs, no buttons, no Save', (await vpage.$$('.pf-sec:has(.pf-sec__btn:has-text("More details")) .pf-sec__body :is(input, button)')).length === 0);
m = await measure(vpage);
check('volunteer profile at 390: no sideways scroll, ≤ 1 yellow', m.overflow <= 0 && m.yellow <= 1, JSON.stringify(m));
await V.shot('10-volunteer-profile-phone');
await V.go(`/people/${P.tom.id}`);
await vpage.waitForSelector('.pf-rate', { timeout: 8000 }).catch(() => {});
await sleep(400);
check('nothing filled in for them: no "More details" at all', !(await vpage.$('.pf-sec__btn:has-text("More details")')));
await V.go('/people/fields');
check('volunteer typing /people/fields lands on Today', new URL(vpage.url()).pathname === '/', vpage.url());

// ── 10. The books still verify ──
const v = (await D.api('/audit/verify')).json;
check('hash chain verifies after the whole journey', v.ok === true && v.checked > 20, JSON.stringify(v));
check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
const fails = results.filter((r) => !r).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
