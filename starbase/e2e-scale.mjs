// Rating scale E2E — one fresh in-memory campaign. A volunteer on a 390×844
// phone opens the map with signal (the default scale), then, with no signal,
// rates Maya "4 → Locke". Meanwhile the manager, at 1360px, opens Rating
// scale from the account menu, changes the words on 1 ("Definitely"),
// renames Annis, adds Bains (moved up) and takes Locke off the list (asked
// in place), checks the preview and saves. The volunteer's knock reaches the
// server afterwards and is kept (the volunteer tapped it while it was
// offered). The phone then shows the new buttons — and still does after a
// reload with no signal; Locke's old ratings read "4 · Locke (off the
// list)" on the profile, People, Today and the filters. SIMPLE checks on
// the new screen at 1360 and 390 (manager) and on the door card at 390
// (volunteer); volunteers never see the screen or its link; sign-out
// forgets the phone's copy; the books verify.
//
//   STARBASE_DATA=memory PORT=4212 node server/index.js &
//   BASE=http://127.0.0.1:4212 SHOTS=/tmp/scale node e2e-scale.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:3200';
const SHOTS = process.env.SHOTS || '/tmp/starbase-scale';
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
    lines.push(`<line x1="${i}" y1="0" x2="${i}" y2="256" stroke="#fff" stroke-width="${((x * 256 + i) / 32) % 4 === 0 ? 5 : 2}"/>`);
    lines.push(`<line x1="0" y1="${i}" x2="256" y2="${i}" stroke="#fff" stroke-width="${((y * 256 + i) / 32) % 4 === 0 ? 5 : 2}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e7e3d6"/>${lines.join('')}</svg>`;
};
const tiles = (ctx) => ctx.route(/tile\.openstreetmap\.org\/(\d+)\/(\d+)\/(\d+)\.png/, (route) => {
  const [, z, x, y] = route.request().url().match(/\/(\d+)\/(\d+)\/(\d+)\.png/);
  route.fulfill({ status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: tileSvg(+z, +x, +y) });
});

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const errors = [];
const helpers = (page, ctx, who) => {
  page.on('pageerror', (e) => errors.push(`[${who}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && /key|unique/i.test(m.text())) errors.push(`[${who}] ${m.text()}`); });
  return {
    shot: (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: false }),
    full: (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true }),
    text: async () => ((await page.innerText('body').catch(() => '')) || '').replace(/\s+/g, ' '),
    // Through the context's own cookies, outside the page (works while the page is offline).
    api: async (path, body) => {
      const r = body === undefined
        ? await ctx.request.get(`${BASE}/api${path}`)
        : await ctx.request.post(`${BASE}/api${path}`, { data: body });
      return { status: r.status(), json: await r.json().catch(() => null) };
    },
    go: async (path) => { await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' }); await sleep(1000); },
    chip: () => page.$eval('.offline-strip__chip', (el) => el.innerText.replace(/\s+/g, ' ').trim()).catch(() => ''),
    swReady: () => page.evaluate(() => navigator.serviceWorker.ready.then(() => Boolean(navigator.serviceWorker.controller))),
  };
};
// SIMPLE.md: words on the screen (not the nav/tab bar), yellow buttons,
// sideways scroll, and every button / input under 48px tall (or 44 wide).
const measure = (page, sel = 'main.page') => page.evaluate((s) => {
  const root = document.querySelector(s) || document.body;
  const vis = (el) => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
  const words = (root.innerText || '').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  const yellow = [...document.querySelectorAll('.btn-primary')].filter(vis).length;
  const overflow = document.documentElement.scrollWidth - window.innerWidth;
  const small = [...root.querySelectorAll('button, a.btn, input, select, textarea')].filter(vis)
    .map((el) => { const r = el.getBoundingClientRect(); return { t: (el.innerText || el.getAttribute('aria-label') || el.placeholder || el.tagName).trim().slice(0, 24), h: Math.round(r.height), w: Math.round(r.width) }; })
    .filter((x) => x.h < 48 || x.w < 44);
  // Words cut off with an ellipsis (a button too narrow for its word).
  const cut = [...root.querySelectorAll('.rb-btn__sub, .rb-who__name')].filter(vis).filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.innerText);
  return { words, yellow, overflow, small, cut };
}, sel);
const buttonsText = (page, scope) => page.evaluate((sc) => {
  const root = document.querySelector(sc);
  if (!root) return null;
  const row = [...root.querySelectorAll('.rb-row .rb-btn')].map((b) => b.innerText.replace(/\s+/g, ' ').trim());
  const who = [...root.querySelectorAll('.rb-who__btn')].map((b) => b.innerText.replace(/\s+/g, ' ').trim());
  return { row, who };
}, scope);

// ════════════════════════════════════════════════════════════════════════════
// 1. The manager and a small Surrey campaign (laptop)
// ════════════════════════════════════════════════════════════════════════════
const dctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, timezoneId: 'America/Vancouver' });
await tiles(dctx);
const page = await dctx.newPage();
const D = helpers(page, dctx, 'desk');
await D.go('/signup');
await page.fill('#su-name', 'Riley Manager');
await page.fill('#su-email', `riley+${tag}@scale.example`);
await page.fill('#su-password', 'surrey-forward-2026');
await page.fill('#su-workspace', 'Imagine Surrey');
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`, { timeout: 15000 });

const P = {};
const mk = async (key, data) => { P[key] = (await D.api('/actions/person.create', data)).json.person; };
await mk('lena', { name: 'Lena Example', phone: '604-555-0141', address: '12345 72 Ave', city: 'Surrey', lat: 49.1330, lng: -122.8510 });
await mk('maya', { name: 'Maya Example', phone: '604-555-0142', address: '12390 72 Ave', city: 'Surrey', lat: 49.1331, lng: -122.8495 });
await mk('tom', { name: 'Tom Example', phone: '604-555-0143', address: '7120 124 St', city: 'Surrey', lat: 49.1310, lng: -122.8520 });
await mk('ana', { name: 'Ana Example', phone: '604-555-0144', address: '7201 128 St', city: 'Surrey', lat: 49.1320, lng: -122.8480 });
const turf = (await D.api('/actions/turf.create', {
  name: 'Newton A', polygon: [[49.128, -122.856], [49.136, -122.856], [49.136, -122.844], [49.128, -122.844]],
})).json.turf;
check('seeded 4 doors and a turf', Object.values(P).every((p) => p?.id) && turf?.id);
check('Lena rated 4 → Locke before any change', (await D.api('/actions/contact.log', { person_id: P.lena.id, channel: 'door', outcome: 'contacted', rating: '4B' })).status === 200);

const s0 = (await D.api('/scale')).json?.scale;
check('a new campaign has the default scale',
  s0?.steps.map((x) => x.word).join('|') === 'Strong yes|Lean yes|Undecided|Opposed'
  && s0.candidates.map((c) => `${c.code}:${c.name}`).join('|') === '4D:McCallum|4B:Locke|4F:Annis|4N:van Vliet|4C:Randhawa',
  JSON.stringify(s0?.candidates));

// ════════════════════════════════════════════════════════════════════════════
// 2. A volunteer's phone, with signal: the default buttons
// ════════════════════════════════════════════════════════════════════════════
const volEmail = `jas+${tag}@scale.example`;
const inv = (await D.api('/actions/member.invite', { email: volEmail, role: 'volunteer' })).json;
const vctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/Vancouver' });
await tiles(vctx);
const vp = await vctx.newPage();
const V = helpers(vp, vctx, 'vol');
await vp.goto(inv.joinUrl.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'domcontentloaded' });
await vp.waitForSelector('#join-name', { timeout: 8000 });
await vp.fill('#join-name', 'Jas Volunteer');
await vp.fill('#join-password', 'knock-knock-2026');
await vp.click('button[type="submit"]');
await vp.waitForURL(`${BASE}/`, { timeout: 15000 }).catch(() => {});
const volId = (await V.api('/auth/me')).json.user.id;
check('volunteer joined and walks Newton A', (await D.api('/actions/turf.assign', { turf_id: turf.id, user_id: volId })).status === 200);
check('volunteers read the scale (their phone needs it)', (await V.api('/scale')).status === 200);
check('…but may not change it', (await V.api('/actions/scale.save', { words: { 1: 'Yes!' } })).status === 403);

await V.go(`/map?person=${P.maya.id}`);
await vp.waitForSelector('aside.door-card .rb-btn', { timeout: 10000 }).catch(() => {});
await V.swReady().catch(() => {});
await V.go(`/map?person=${P.maya.id}`);
await vp.waitForSelector('aside.door-card .rb-btn', { timeout: 10000 }).catch(() => {});
await sleep(1500); // the phone copies are written a moment after they load
let b = await buttonsText(vp, 'aside.door-card');
check('phone, default scale: 1 Strong yes · 2 Lean yes · 3 Undecided · 4 Opposed', b?.row.join(' | ') === '1 Strong yes | 2 Lean yes | 3 Undecided | 4 Opposed', JSON.stringify(b));
const kept0 = await vp.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('starbase:copy:') && k.endsWith(':scale')));
check('the phone keeps the scale with this sign-in’s copies', kept0.length === 1 && kept0[0].includes(`:${volId}:`), kept0.join(' | '));
// The Rating scale screen isn't theirs.
await vp.click('.acct-btn');
check('volunteer’s account menu: no Rating scale', !(await vp.$('.acct-panel a[href="/rating-scale"]')));
await vp.click('.acct-btn');
await V.go('/rating-scale');
check('volunteer typing /rating-scale lands on Today', new URL(vp.url()).pathname === '/', vp.url());

// No signal: Maya says she's voting Locke. Saved on the phone.
await V.go(`/map?person=${P.maya.id}`);
await vp.waitForSelector('aside.door-card .rb-btn', { timeout: 10000 }).catch(() => {});
await vctx.setOffline(true);
await vp.tap('aside.door-card button[aria-label^="4: Opposed"]').catch(() => vp.click('aside.door-card button[aria-label^="4: Opposed"]'));
await vp.tap('aside.door-card button[aria-label^="4B:"]').catch(() => vp.click('aside.door-card button[aria-label^="4B:"]'));
await sleep(500);
let t = await V.text();
check('offline: "Rated 4 · Locke · Saved offline"', /Rated 4 · Locke · Saved offline/.test(t), (t.match(/Rated[^✕]{0,50}/) || [''])[0]);

// ════════════════════════════════════════════════════════════════════════════
// 3. The manager changes the scale (laptop, 1360)
// ════════════════════════════════════════════════════════════════════════════
await D.go('/');
await page.click('.acct-btn');
const link = await page.$('.acct-panel a[href="/rating-scale"]');
check('manager’s account menu: Rating scale, beside Team', !!link && !!(await page.$('.acct-panel a[href="/team"]')));
await link.click();
await page.waitForURL(`${BASE}/rating-scale`);
await page.waitForSelector('.sc-page .rb-btn', { timeout: 8000 }).catch(() => {});
await sleep(500);
let m = await measure(page);
check('Rating scale at 1360: one yellow (Save, off until a change), no sideways scroll', m.yellow === 1 && m.overflow <= 0
  && await page.locator('.sc-save .btn-primary').isDisabled(), JSON.stringify({ y: m.yellow, o: m.overflow, w: m.words }));
console.log(`      words on the screen at 1360: ${m.words}`);
b = await buttonsText(page, '.sc-preview');
check('preview: the buttons volunteers see now, Voting for? open', b?.row.join(' | ') === '1 Strong yes | 2 Lean yes | 3 Undecided | 4 Opposed'
  && b.who.join(' | ') === 'McCallum | Locke | Annis | van Vliet | Randhawa | Not sure', JSON.stringify(b));
await D.shot('01-scale-desk');

// Words on 1; rename Annis; add Bains and move it up; take Locke off.
await page.fill('input[aria-label="Words for 1"]', 'Definitely');
const annis = page.locator('.sc-cand input[value="Annis"]');
await annis.fill('Linda Annis');
await page.fill('.sc-add input', 'Bains');
await page.click('.sc-add button:has-text("Add")');
await page.click('button[aria-label="Move Bains up"]');
check('Not saved yet, said by Save', /Not saved yet/.test(await D.text()) && await page.locator('.sc-save .btn-primary').isEnabled());
const lockeRow = page.locator('.sc-cand', { has: page.locator('input[value="Locke"]') });
await lockeRow.locator('button:has-text("Take off")').click();
t = await page.locator('.sc-confirm').innerText().catch(() => '');
check('take off asks in place: "Take Locke off the list? Yes · No"', /Take Locke off the list\?\s*Yes\s*No/i.test(t.replace(/\s+/g, ' ')), t);
m = await measure(page);
check('…still one yellow button while it asks', m.yellow === 1, m.yellow);
await page.locator('.sc-confirm button:has-text("No")').click();
check('No keeps Locke on the list', (await page.$$('.sc-cand input[value="Locke"]')).length === 1);
await lockeRow.locator('button:has-text("Take off")').click();
await page.locator('.sc-confirm button:has-text("Yes")').click();
t = await D.text();
check('Yes moves Locke under "Off the list" with how many have him, and Put back',
  /Off the list 1/i.test(t) && /Locke 1 rated Put back/i.test(t), (t.match(/Off the list.{0,90}/i) || [''])[0]);
b = await buttonsText(page, '.sc-preview');
check('preview follows: Definitely, Bains up, Linda Annis, no Locke', b?.row[0] === '1 Definitely'
  && b.who.join(' | ') === 'McCallum | Linda Annis | van Vliet | Bains | Randhawa | Not sure', JSON.stringify(b));
check('nothing saved yet', (await D.api('/scale')).json.scale.version === 0);
await D.full('02-scale-desk-edited');
await page.click('.sc-save .btn-primary');
await page.waitForSelector('.sc-save [role="status"]', { timeout: 6000 }).catch(() => {});
check('Save: "✓ Saved"', /✓ Saved/.test(await page.locator('.sc-save').innerText().catch(() => '')));
const s1 = (await D.api('/scale')).json.scale;
const by = Object.fromEntries(s1.candidates.map((c) => [c.code, c]));
check('server: words, rename kept the code, Bains got a new code, Locke off the list',
  s1.steps[0].word === 'Definitely' && by['4F']?.name === 'Linda Annis' && by['4BA']?.name === 'Bains' && by['4BA'].off === false
  && by['4B']?.off === true && s1.candidates.filter((c) => !c.off).map((c) => c.code).join(',') === '4D,4F,4N,4BA,4C',
  JSON.stringify(s1.candidates.map((c) => [c.code, c.name, c.off])));
await D.go('/rating-scale');
await page.waitForSelector('.sc-page .rb-btn', { timeout: 8000 }).catch(() => {});
check('reopened: as saved', await page.inputValue('input[aria-label="Words for 1"]') === 'Definitely'
  && (await page.$$eval('.sc-cand input', (els) => els.map((e) => e.value))).join('|') === 'McCallum|Linda Annis|van Vliet|Bains|Randhawa');

// ── The same screen on a phone (manager) ──
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/Vancouver', storageState: await dctx.storageState() });
await tiles(mctx);
const mp = await mctx.newPage();
const M = helpers(mp, mctx, 'mgr-phone');
await M.go('/rating-scale');
await mp.waitForSelector('.sc-page .rb-btn', { timeout: 8000 }).catch(() => {});
m = await measure(mp);
check('Rating scale at 390: one yellow, no sideways scroll, every control ≥ 48px', m.yellow === 1 && m.overflow <= 0 && m.small.length === 0, JSON.stringify({ y: m.yellow, o: m.overflow, small: m.small }));
check('…and no word cut off on the preview buttons', m.cut.length === 0, m.cut.join(', '));
console.log(`      words on the screen at 390: ${m.words}`);
await M.full('03-scale-phone');
// The longest words the screen takes still read whole on a phone's buttons.
await mp.fill('input[aria-label="Words for 2"]', 'Probably yes'.padEnd(12, 'x').slice(0, 12));
await mp.fill('.sc-add input', 'Abcdefghij Klmnop');
check('a name is held to 16 letters', (await mp.inputValue('.sc-add input')).length === 16);
await mp.click('.sc-add button:has-text("Add")');
m = await measure(mp);
check('longest words at 390: wrapped, never cut off, no sideways scroll', m.cut.length === 0 && m.overflow <= 0, JSON.stringify({ cut: m.cut, o: m.overflow }));
await M.shot('03b-scale-phone-long');
await mctx.close();

// ════════════════════════════════════════════════════════════════════════════
// 4. Back to the volunteer's phone
// ════════════════════════════════════════════════════════════════════════════
await vctx.setOffline(false);
await vp.evaluate(() => window.dispatchEvent(new Event('online')));
for (let i = 0; i < 24 && /saved on this phone/i.test(await V.chip()); i += 1) await sleep(250);
const strip = await vp.innerText('.offline-strip').catch(() => '');
check('back online: the knock goes, "1 sent" (nothing refused)', /✓ 1 sent/i.test(strip) && !/refused/i.test(strip), strip.replace(/\s+/g, ' '));
let maya = (await D.api(`/persons/${P.maya.id}`)).json;
check('server kept the knock made while Locke was on the list: Maya 4B, once', maya.person.rating === '4B'
  && maya.contacts.filter((c) => c.rating === '4B').length === 1, JSON.stringify(maya.contacts.map((c) => c.rating)));
check('a new 4B from the desk is refused now', (await D.api('/actions/contact.log', { person_id: P.tom.id, channel: 'door', outcome: 'contacted', rating: '4B' })).status === 400);

// With signal: the new buttons.
await V.go(`/map?person=${P.tom.id}`);
await vp.waitForSelector('aside.door-card .rb-btn', { timeout: 10000 }).catch(() => {});
await sleep(800);
b = await buttonsText(vp, 'aside.door-card');
check('phone: 1 Definitely · 2 Lean yes · 3 Undecided · 4 Opposed', b?.row.join(' | ') === '1 Definitely | 2 Lean yes | 3 Undecided | 4 Opposed', JSON.stringify(b));
await vp.tap('aside.door-card button[aria-label^="4: Opposed"]').catch(() => vp.click('aside.door-card button[aria-label^="4: Opposed"]'));
await sleep(300);
b = await buttonsText(vp, 'aside.door-card');
check('Voting for? McCallum · Linda Annis · van Vliet · Bains · Randhawa · Not sure (no Locke)',
  b?.who.join(' | ') === 'McCallum | Linda Annis | van Vliet | Bains | Randhawa | Not sure', JSON.stringify(b?.who));
m = await measure(vp, 'aside.door-card');
const rbSmall = await vp.$$eval('aside.door-card .rb-btn, aside.door-card .rb-who__btn', (els) => els.map((e) => e.getBoundingClientRect().height).filter((h) => h < 48));
check('door card at 390: rating buttons ≥ 48px, no sideways scroll, no word cut off', rbSmall.length === 0 && m.overflow <= 0 && m.cut.length === 0, JSON.stringify({ rbSmall, o: m.overflow, cut: m.cut }));
await V.shot('04-vol-new-buttons');
await vp.tap('aside.door-card button[aria-label^="4BA:"]').catch(() => vp.click('aside.door-card button[aria-label^="4BA:"]'));
await sleep(600);
check('tap Bains: "Rated 4 · Bains"', /Rated 4 · Bains/.test(await V.text()));
check('server: Tom 4BA', (await D.api(`/persons/${P.tom.id}`)).json.person.rating === '4BA');

// Old ratings: Maya's 4 reads Locke; her profile says off the list.
await V.go(`/map?person=${P.maya.id}`);
await vp.waitForSelector('aside.door-card .rb-btn', { timeout: 10000 }).catch(() => {});
b = await buttonsText(vp, 'aside.door-card');
check('Maya’s door: 4 shows her old pick, Locke', b?.row[3] === '4 Locke', JSON.stringify(b?.row));
await V.go(`/people/${P.maya.id}`);
await vp.waitForSelector('.pf-meta .rb-chip', { timeout: 8000 }).catch(() => {});
t = await vp.innerText('.pf-meta').catch(() => '');
check('profile: "4 · Locke (off the list)"', /4 · Locke \(off the list\)/.test(t), t);
check('history line: "Rated 4 · Locke (off the list)"', /Locke \(off the list\)/.test(await V.text()));

// No signal, reload: still the campaign's buttons.
await V.go(`/map?person=${P.ana.id}`);
await vp.waitForSelector('aside.door-card .rb-btn', { timeout: 10000 }).catch(() => {});
await sleep(1500);
await vctx.setOffline(true);
await vp.reload({ waitUntil: 'domcontentloaded' });
await vp.waitForSelector('aside.door-card .rb-btn', { timeout: 15000 }).catch(() => {});
await sleep(800);
b = await buttonsText(vp, 'aside.door-card');
check('offline reload: 1 Definitely … (the phone’s copy)', b?.row.join(' | ') === '1 Definitely | 2 Lean yes | 3 Undecided | 4 Opposed', JSON.stringify(b));
await vp.tap('aside.door-card button[aria-label^="4: Opposed"]').catch(() => vp.click('aside.door-card button[aria-label^="4: Opposed"]'));
await sleep(300);
b = await buttonsText(vp, 'aside.door-card');
check('offline reload: Voting for? has Bains and Linda Annis, no Locke', b?.who.join(' | ') === 'McCallum | Linda Annis | van Vliet | Bains | Randhawa | Not sure', JSON.stringify(b?.who));
await V.shot('05-vol-offline-reload');
await vp.tap('aside.door-card button[aria-label^="4F:"]').catch(() => vp.click('aside.door-card button[aria-label^="4F:"]'));
await sleep(500);
check('offline knock: "Rated 4 · Linda Annis · Saved offline"', /Rated 4 · Linda Annis · Saved offline/.test(await V.text()));
await vctx.setOffline(false);
await vp.evaluate(() => window.dispatchEvent(new Event('online')));
for (let i = 0; i < 24 && /saved on this phone/i.test(await V.chip()); i += 1) await sleep(250);
check('sent: Ana 4F', (await D.api(`/persons/${P.ana.id}`)).json.person.rating === '4F');

// ════════════════════════════════════════════════════════════════════════════
// 5. The desk reads old ratings
// ════════════════════════════════════════════════════════════════════════════
await D.go('/people');
await page.waitForSelector('.pp-rtag, .rb-chip', { timeout: 8000 }).catch(() => {});
t = await D.text();
check('People: Lena and Maya "4 · Locke (off the list)", Tom "4 · Bains"', (t.match(/4 · Locke \(off the list\)/g) || []).length === 2 && /4 · Bains/.test(t), (t.match(/4 · [^·]{0,30}/g) || []).join(' | '));
await page.click('.pp-filterbtn');
await page.click('.pp-morefilters');
await page.waitForSelector('.pp-sheet__more', { timeout: 4000 }).catch(() => {});
const whoChips = await page.$$eval('.pp-sheet__more fieldset:first-child .pp-pick', (els) => els.map((e) => e.innerText.trim()));
check('Voting for… filter: the list, then Locke (off the list)', whoChips.join(' | ').toLowerCase() === 'mccallum | linda annis | van vliet | bains | randhawa | locke (off the list)', whoChips.join(' | '));
await page.click('.pp-sheet__more .pp-pick:has-text("Locke")');
await sleep(800);
await page.click('.pp-sheet__head button:has-text("Done")');
await sleep(500);
const UUID_LINK = /^\/people\/[0-9a-f-]{36}$/;
const listed = () => page.$$eval('main.page a[href^="/people/"]', (els) => els.map((e) => e.getAttribute('href'))).then((h) => [...new Set(h.filter((x) => UUID_LINK.test(x)))]);
const rows = await listed();
check('…finds the two people who backed Locke', rows.length === 2 && rows.includes(`/people/${P.lena.id}`) && rows.includes(`/people/${P.maya.id}`), rows.join(' '));
await page.click('.pp-filterbtn');
await page.click('.pp-sheet .pp-pick:text-is("Opposed")');
await sleep(800);
await page.click('.pp-sheet__head button:has-text("Done")');
await sleep(500);
const opposed = (await listed()).length;
check('Opposed band reaches every code, old and new (Lena, Maya, Tom, Ana)', opposed === 4, opposed);
// The same list on the manager's phone: the long chip never pushes the page sideways.
const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/Vancouver', storageState: await dctx.storageState() });
const pp = await pctx.newPage();
const PP = helpers(pp, pctx, 'mgr-phone-2');
await PP.go('/people');
await pp.waitForSelector('.rb-chip', { timeout: 8000 }).catch(() => {});
m = await measure(pp);
check('People at 390 with “4 · Locke (off the list)”: no sideways scroll', m.overflow <= 0 && /Locke \(off the list\)/i.test(await PP.text()), m.overflow);
await PP.go(`/people/${P.lena.id}`);
await pp.waitForSelector('.pf-meta .rb-chip', { timeout: 8000 }).catch(() => {});
m = await measure(pp);
check('Lena’s profile at 390: no sideways scroll', m.overflow <= 0, m.overflow);
await pctx.close();

// Import: the campaign's codes and words, any case; what isn't on the list is named.
await D.go('/people/import');
await page.click('button:has-text("Paste text")');
await page.fill('#imp-paste', [
  'Name,Phone,Support',
  'Rae Example,604-555-0151,definitely',
  'Sol Example,604-555-0152,BAINS',
  'Kit Example,604-555-0153,locke',
  'Ola Example,604-555-0154,7',
  'Ida Example,604-555-0155,4ba',
].join('\n'));
await page.click('button:has-text("Use this text")');
await page.waitForSelector('#imp-col-2', { timeout: 6000 }).catch(() => {});
// 2 of 5 off the scale is too many to guess "Rating" from: pick it.
if (await page.inputValue('#imp-col-2') !== 'rating') await page.selectOption('#imp-col-2', 'rating');
await page.waitForSelector('.imp-map__note.is-warn', { timeout: 6000 }).catch(() => {});
t = await page.innerText('.imp-map__note.is-warn').catch(() => '');
check('import: “2 ratings aren’t on the scale (“locke” (off the list), “7”)”', /2 ratings aren’t on the scale \(“locke” \(off the list\), “7”\) — they come in unrated/.test(t), t);
await page.click('button.disclose:has-text("Preview")').catch(() => {});
await page.waitForSelector('.imp-preview__table', { timeout: 4000 }).catch(() => {});
const chips = await page.$$eval('.imp-preview__table .rb-chip', (els) => els.map((e) => e.innerText.trim().toLowerCase()));
check('…the rest read in the campaign’s words: 1, 4 · Bains, 4 · Bains', chips.join(' | ') === '1 | 4 · bains | 4 · bains', chips.join(' | '));
await D.go('/');
await page.click('button.today-num[aria-controls]').catch(() => {});
await sleep(400);
const variants = await page.$$eval('.today-variants li', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
check('Today: opposed by candidate still counts Locke', variants.some((v) => /^Locke 2$/.test(v)) && variants.some((v) => /^Bains 1$/.test(v)), variants.join(' | '));

// ════════════════════════════════════════════════════════════════════════════
// 6. Sign-out forgets the phone's copy; the books verify
// ════════════════════════════════════════════════════════════════════════════
await V.go('/');
await vp.click('.acct-btn');
await vp.click('.acct-panel button:has-text("Sign out")');
await vp.waitForURL(`${BASE}/login`, { timeout: 8000 }).catch(() => {});
await sleep(500);
const left = await vp.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('starbase:copy:') || k.startsWith('starbase:me:')));
check('signed out: the scale copy (and the rest) are gone from the phone', left.length === 0, left.join(' | '));
await vctx.close();

const ev = (await D.api('/events?since=0&limit=5000')).json.events.filter((e) => e.action === 'scale.save');
check('the change is on the log, once', ev.length === 1 && ev[0].payload?.changes?.off?.includes('4B'), ev.length);
const v = (await D.api('/audit/verify')).json;
check('hash chain verifies', v.ok === true, JSON.stringify(v));
check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
const fails = results.filter((r) => !r).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
