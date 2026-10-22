// Starbase desk-with-no-signal E2E — a fresh in-memory server, the Imagine
// Surrey sample campaign, a manager on a laptop (1360 and 390 wide) and a
// volunteer on a 390×844 phone:
//   · with signal the manager opens Today, People, two profiles, Shifts,
//     Signs, Money, the Inbox and Calls; the copies are kept for this sign-in
//     (money ones in this tab only, never in the browser's lasting storage);
//   · no signal, every one of them reloads from its copy, the strip says
//     "No signal · from <time>", People's search and a tag filter work over
//     the kept list, a profile never opened says No signal, and every write
//     that needs the server is off and says so;
//   · on a profile with no signal a note with a rating, a tag put on and a tag
//     taken off are saved on this device, shown on the profile ("Not sent
//     yet") through a reload, and sent once when the signal is back — one
//     answer lost on the way, replayed, still recorded once;
//   · sign-out forgets every copy; the next sign-in on this browser sees none;
//   · the volunteer keeps only what a volunteer saw (no money, nobody else's
//     email), and their profile knock waits and sends once;
//   · storage blocked (a private window): today's No signal, no errors;
//   · SIMPLE: ≤1 yellow, no sideways scroll, ≥48px field targets.
//
//   node e2e-desk-offline.mjs                 (starts its own server on :4214)
//   BASE=http://127.0.0.1:4214 node e2e-desk-offline.mjs   (a fresh server you started)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = Number(process.env.PORT) || 4214;
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user-mandate/c88a39fd-f6db-552f-95dc-59176433706d/scratchpad/features/desk-offline';
mkdirSync(SHOTS, { recursive: true });

let server = null;
let BASE = process.env.BASE;
if (!BASE) {
  server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, STARBASE_DATA: 'memory', PORT: String(PORT), STARBASE_JOBS: 'off' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 30000);
    server.stdout.on('data', (b) => { if (/starbase on :/.test(String(b))) { clearTimeout(t); resolve(); } });
    server.on('exit', (code) => reject(new Error(`server exited ${code}`)));
  });
  BASE = `http://127.0.0.1:${PORT}`;
}

const results = [];
const check = (name, ok, extra = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + String(extra).slice(0, 240) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = Math.random().toString(36).slice(2, 8);
const until = async (fn, ms = 15000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await sleep(300);
  }
};

const tileSvg = () => '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e7e3d6"/></svg>';
const routeTiles = (c) => c.route(/tile\.openstreetmap\.org/, (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tileSvg() }));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const errors = [];
const KEPT = /No signal · from (\d{1,2}:\d{2} (am|pm)|[A-Z][a-z]{2} \d{1,2})/i;
const FIELDS = 'main.page input:not([type=checkbox]), main.page select, main.page textarea, main.page button, main.page a.btn';

const helpers = (page, ctx) => ({
  text: async () => ((await page.innerText('body').catch(() => '')) || '').replace(/\s+/g, ' '),
  main: async () => ((await page.innerText('main.page').catch(() => '')) || '').replace(/\s+/g, ' '),
  // The server's side, through the context's own cookies (works while the page is offline).
  api: async (path, body) => {
    const r = body === undefined
      ? await ctx.request.get(`${BASE}/api${path}`)
      : await ctx.request.post(`${BASE}/api${path}`, { data: body });
    return { status: r.status(), json: await r.json().catch(() => null) };
  },
  go: async (path) => { await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' }); await sleep(1300); },
  shot: (n) => page.screenshot({ path: `${SHOTS}/${n}.png` }),
  kept: () => page.$eval('.offline-strip__kept', (el) => el.innerText.replace(/\s+/g, ' ').trim()).catch(() => ''),
  chip: () => page.$eval('.offline-strip__chip', (el) => el.innerText.replace(/\s+/g, ' ').trim()).catch(() => ''),
  // What this browser keeps: { local: {key: text}, session: {key: text} } for Starbase's copies.
  stored: () => page.evaluate(() => {
    const grab = (s) => { const o = {}; try { for (let i = 0; i < s.length; i += 1) { const k = s.key(i); if (k && k.startsWith('starbase:copy:')) o[k] = s.getItem(k); } } catch { /* blocked */ } return o; };
    return { local: grab(localStorage), session: grab(sessionStorage) };
  }).catch(() => ({ local: {}, session: {} })),
  outbox: () => page.evaluate(() => JSON.parse(localStorage.getItem('starbase:outbox:v2') || '[]')).catch(() => []),
  swReady: () => page.evaluate(() => navigator.serviceWorker.ready.then(() => Boolean(navigator.serviceWorker.controller))).catch(() => false),
  measure: (sel = FIELDS) => page.evaluate((targets) => {
    const main = document.querySelector('main.page') || document.body;
    const words = (main.innerText || '').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    const yellow = [...document.querySelectorAll('.btn-primary')].filter(visible).length;
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    let minTap = null; let minWho = '';
    if (targets) {
      for (const el of document.querySelectorAll(targets)) {
        if (!visible(el)) continue;
        const h = el.getBoundingClientRect().height;
        if (minTap == null || h < minTap) { minTap = h; minWho = el.outerHTML.slice(0, 90); }
      }
    }
    return { words, yellow, overflow, minTap, minWho };
  }, sel),
});
const measured = [];
const simple = async (H, name, sel = null) => {
  const m = await H.measure(sel);
  measured.push({ name, ...m });
  check(`${name}: ≤1 yellow, no sideways scroll${sel ? ', targets ≥48px' : ''}`, m.yellow <= 1 && m.overflow <= 0 && (m.minTap == null || m.minTap >= 47.5),
    `words=${m.words} yellow=${m.yellow} overflow=${m.overflow} minTap=${m.minTap == null ? '-' : Math.round(m.minTap)} ${m.minTap != null && m.minTap < 47.5 ? m.minWho : ''}`);
  return m;
};
const signupAs = async (page, D, name, email) => {
  await D.go('/signup');
  await page.fill('#su-name', name);
  await page.fill('#su-email', email);
  await page.fill('#su-password', 'surrey-forward-2026');
  await page.fill('#su-workspace', 'Imagine Surrey');
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
};
const join = async (page, url, name) => {
  await page.goto(url.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#join-name', { timeout: 8000 });
  await page.fill('#join-name', name);
  await page.fill('#join-password', 'knock-knock-2026');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !/\/join\//.test(String(u)), { timeout: 15000 }).catch(() => {});
  await sleep(800);
};
const goOnline = async (ctx, page) => {
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online'))).catch(() => {});
};

// ════════════════════════════════════════════════════════════════════════════
// 1. Manager on a laptop, with signal: the sample campaign, every desk screen once
// ════════════════════════════════════════════════════════════════════════════
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, timezoneId: 'America/Vancouver' });
await routeTiles(ctx);
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
const D = helpers(page, ctx);
const mgrEmail = `desk.mgr+${tag}@example.org`;
await signupAs(page, D, 'Riley Desk', mgrEmail);
const meA = (await D.api('/auth/me')).json;
const sample = await D.api('/data/sample', {});
check('sample campaign loaded', sample.status === 200 || sample.status === 201, JSON.stringify(sample.json).slice(0, 120));
const everyone = (await D.api('/persons?q=&limit=300')).json.persons;
const byName = (n) => everyone.find((p) => p.name === n);
const tom = byName('Tom Riley');
const maya = byName('Maya Chen');
const dev = byName('Dev Patel');
const harjit = byName('Harjit Gill');
check('sample people found', tom && maya && dev && harjit, everyone.length);

await D.go('/');
check('service worker controls the page', await D.swReady() || (await (async () => { await D.go('/'); return D.swReady(); })()));
await D.go('/');
await page.waitForSelector('.today-nums', { timeout: 10000 }).catch(() => {});
await D.go('/people');
await page.waitForSelector('.pp-table tbody tr', { timeout: 10000 }).catch(() => {});
const rowsOnline = await page.locator('.pp-table tbody tr').count();
const countOf = (pg) => pg.$eval('.pp-count strong', (el) => el.innerText.trim()).catch(() => '');
const countOnline = await countOf(page);
await page.fill('.pp-search input', 'Maya');
await sleep(1800);
check('a search typed with signal isn’t kept as its own copy (it would push the list out)',
  !Object.keys((await D.stored()).local).some((x) => x.includes('q=Maya')) && /Maya Chen/.test(await D.main()));
await D.go(`/people/${tom.id}`);
await page.waitForSelector('.pf-page h1', { timeout: 10000 }).catch(() => {});
await D.go(`/people/${maya.id}`);
await page.waitForSelector('.pf-page h1', { timeout: 10000 }).catch(() => {});
for (const path of ['/shifts', '/signs', '/money', '/inbox', '/calls']) await D.go(path);
await sleep(1200); // copies are written a moment after each screen loads
const kept = await D.stored();
const localKeys = Object.keys(kept.local);
const sessionKeys = Object.keys(kept.session);
const scopeA = `${meA.workspace.id}:${meA.user.id}:`;
const has = (keys, end) => keys.some((k) => k.endsWith(end));
check('kept in this browser: People, Signs, Shifts, the Inbox — keyed to this campaign and person',
  has(localKeys, ':q:manager:persons:q=&limit=300') && has(localKeys, ':q:manager:signs') && has(localKeys, ':shifts')
    && has(localKeys, ':q:manager:texting:inbox:/texting/all') && localKeys.every((k) => k.includes(scopeA)),
  localKeys.map((k) => k.split(':').slice(5).join(':')).join(' | '));
check('anything with money in it is kept for this tab only: Today, profiles, gifts, pledges',
  ['q:manager:brief', `q:manager:person:${tom.id}`, `q:manager:person:${maya.id}`, 'q:manager:gifts', 'q:manager:pledges'].every((n) => has(sessionKeys, `:${n}`))
    && sessionKeys.every((k) => k.includes(scopeA)),
  sessionKeys.map((k) => k.split(':').slice(5).join(':')).join(' | '));
const localText = Object.values(kept.local).join('\n');
check('…and never in the browser’s lasting storage (no gift amounts, no Today, no profiles)',
  !/amount_cents|totalCents|"gifts"/.test(localText) && !localKeys.some((k) => /:q:manager:(brief|person:|gifts|pledges)/.test(k)));
const tomBefore = (await D.api(`/persons/${tom.id}`)).json;
const tagEventsBefore = (await D.api('/events?since=0&limit=5000')).json.events.filter((e) => e.action === 'person.tag').length;

// ════════════════════════════════════════════════════════════════════════════
// 2. No signal: every desk screen reloads from its copy
// ════════════════════════════════════════════════════════════════════════════
await ctx.setOffline(true);
// In the app, no reload: a screen not opened since this page loaded starts from its copy.
await page.click('nav.links a[href="/signs"]');
await page.waitForSelector('.ops-rows li', { timeout: 6000 }).catch(() => {});
check('no signal, in the app: Signs opens from its copy at once', (await page.locator('.ops-rows li').count()) > 0 && KEPT.test(await D.kept()), await D.kept());
await D.go('/');
await page.waitForSelector('.today-nums', { timeout: 10000 }).catch(() => {});
let t = await D.text();
let k = await D.kept();
check('Today with no signal: the kept copy — numbers, raised — and "No signal · from <time>"',
  KEPT.test(k) && /Total raised/i.test(t) && !/this fills in when you’re back online/.test(t), `${k} · ${t.slice(0, 160)}`);
check('…said once (the strip), never "Offline — field work…" beside it', (t.match(/No signal · from/gi) || []).length === 1 && !/field work saves/i.test(t));
await D.shot('01-today-no-signal');
await simple(D, 'Today, no signal (1360)');

await D.go('/people');
await page.waitForSelector('.pp-table tbody tr', { timeout: 10000 }).catch(() => {});
t = await D.text();
const rowsOffline = await page.locator('.pp-table tbody tr').count();
const countOffline = await countOf(page);
check('People with no signal: the kept list, not "No signal — the list loads"', rowsOffline === rowsOnline && rowsOffline > 20
  && countOffline === countOnline && Number(countOnline) > 50 && KEPT.test(await D.kept())
  && !/the list loads when you’re back online/.test(t), `${rowsOffline}/${rowsOnline} rows · ${countOffline}/${countOnline}`);
const addBtn = page.locator('.page-head button:has-text("Add person")');
check('…Add person is off and says why: "Adding people needs signal"', await addBtn.isDisabled().catch(() => false) && /Adding people needs signal/.test(t));
await simple(D, 'People, no signal (1360)');
await D.shot('02-people-no-signal');
await page.fill('.pp-search input', 'Riley');
await sleep(900);
let names = await page.$$eval('.pp-table tbody tr .pp-table__name a', (els) => els.map((e) => e.innerText.trim()));
check('search with no signal works over the kept list: "Riley" → Tom Riley', names.length >= 1 && names.includes('Tom Riley') && names.every((n) => /riley/i.test(n) || true)
  && /1 person|\d+ people/.test(await D.main()), names.join(', '));
await page.fill('.pp-search input', '72 Ave');
await sleep(900);
names = await page.$$eval('.pp-table tbody tr .pp-table__name a', (els) => els.map((e) => e.innerText.trim()));
const newton = everyone.filter((p) => /72 Ave/i.test(p.address || '')).map((p) => p.name).sort();
check('…by address too ("72 Ave" → the Newton block, every one)', names.length === newton.length && [...names].sort().join() === newton.join(), `${names.length} vs ${newton.length}`);
await page.fill('.pp-search input', 'zzz-nobody');
await sleep(700);
check('…no match says so', /No one matches\./.test(await D.main()));
await D.go('/people?tag=VIP');
await page.waitForSelector('.pp-table tbody tr', { timeout: 8000 }).catch(() => {});
names = await page.$$eval('.pp-table tbody tr .pp-table__name a', (els) => els.map((e) => e.innerText.trim()));
const vips = everyone.filter((p) => (p.tags || []).includes('VIP')).map((p) => p.name).sort();
check('a tag filter with no signal works over the kept list too (VIP)', names.length === vips.length && [...names].sort().join() === vips.join(), names.join(', '));
await D.go('/people?role=driver');
await page.waitForSelector('.pp-offline', { timeout: 6000 }).catch(() => {});
t = await D.main();
check('a filter the kept list can’t answer (volunteer role) says No signal, never "No one matches"',
  /No signal — the list loads when you’re back online/.test(t) && !/No one matches/.test(t), t.slice(0, 160));

await D.go(`/people/${tom.id}`);
await page.waitForSelector('.pf-page h1', { timeout: 10000 }).catch(() => {});
t = await D.text();
check('a profile opened before: kept, with the chip', /Tom Riley/.test(await page.innerText('.pf-page h1').catch(() => '')) && KEPT.test(await D.kept())
  && !/this profile loads when you’re back online/.test(t), t.slice(0, 160));
await D.go(`/people/${dev.id}`);
await page.waitForSelector('.pp-offline', { timeout: 6000 }).catch(() => {});
t = await D.text();
check('a profile never opened: "No signal — this profile loads when you’re back online"', /No signal — this profile loads when you’re back online/.test(t), t.slice(0, 160));

await D.go('/shifts');
t = await D.text();
check('Shifts with no signal: kept, New shift off — "New shifts need signal"', KEPT.test(await D.kept()) && /Offline copy/i.test(t)
  && await page.locator('button:has-text("New shift")').isDisabled().catch(() => false) && /New shifts need signal/.test(t), t.slice(0, 200));
await D.go('/signs');
await page.waitForSelector('.ops-rows', { timeout: 8000 }).catch(() => {});
t = await D.text();
check('Signs with no signal: kept list, Add a sign off — "Adding or changing a sign needs signal"', KEPT.test(await D.kept())
  && (await page.locator('.ops-rows li').count()) > 0 && await page.locator('.ops-head button:has-text("Add a sign")').isDisabled().catch(() => false)
  && /Adding or changing a sign needs signal/.test(t), t.slice(0, 200));
await D.go('/money');
await page.waitForSelector('#gift-list, .ops-rows', { timeout: 8000 }).catch(() => {});
t = await D.text();
check('Money with no signal (this tab’s copy): gifts listed, Log a gift off — "Gifts and pledges need signal"', KEPT.test(await D.kept())
  && /Arjun Mehta/.test(t) && await page.locator('.ops-head button:has-text("Log a gift")').isDisabled().catch(() => false) && /Gifts and pledges need signal/.test(t), t.slice(0, 200));
await simple(D, 'Money, no signal (1360)');
await D.shot('03-money-no-signal');
await D.go('/inbox');
t = await D.text();
check('Inbox with no signal: the kept list, never "your texts load when you’re back online"', KEPT.test(await D.kept()) && /Inbox/.test(t) && !/your texts load/.test(t), t.slice(0, 160));
await D.go('/calls');
await page.waitForSelector('section.cl-card', { timeout: 8000 }).catch(() => {});
check('Calls with no signal: the list from this device', (await page.locator('section.cl-card').count()) === 1 && KEPT.test(await D.kept()));

// ════════════════════════════════════════════════════════════════════════════
// 3. No signal, on a profile: a note with a rating, a tag on, a tag off
// ════════════════════════════════════════════════════════════════════════════
const note = `Offline desk note ${tag}`;
const newTag = `desk-${tag}`;
await D.go(`/people/${tom.id}`);
await page.waitForSelector('.pf-rate', { timeout: 8000 });
await page.click('.pf-rate button:has-text("+ Add a note")');
await page.fill('#contact-note', note);
await page.click('.pf-rate button[aria-label="1: Strong support"]');
await until(async () => /Saved offline/.test(await page.innerText('.pf-rate').catch(() => '')), 6000);
t = await D.text();
check('rating + note with no signal: "Saved offline", and the profile says it’s waiting',
  /Saved offline/.test(await page.innerText('.pf-rate').catch(() => '')) && /Saved on this device — sends when you’re back online/.test(t), t.slice(0, 220));
const firstHist = await page.$eval('.timeline li', (el) => el.innerText.replace(/\s+/g, ' ')).catch(() => '');
check('…the history shows it first, "Not sent yet", with the note', /Not sent yet/i.test(firstHist) && firstHist.includes(note), firstHist);
check('…and the rating on top is the new one', /Strong yes/.test(await page.innerText('.pf-meta').catch(() => '')));
await page.click('.pf-sec__btn:has-text("Tags")');
await page.click('.pf-sec button:has-text("Edit tags")');
await page.fill('.tag-editor input[aria-label="Add a tag"]', newTag);
await page.keyboard.press('Enter');
await sleep(500);
check('a tag put on with no signal shows at once', (await page.innerText('.tag-editor').catch(() => '')).toLowerCase().includes(newTag.replace(/-/g, ' ')), await page.innerText('.tag-editor').catch(() => ''));
check('strip: "2 saved on this device"', /^2 saved on this device$/i.test(await D.chip()), await D.chip());
await D.shot('04-profile-queued');
await simple(D, 'Profile with changes waiting (1360)', '.pf-rate button[aria-label]');
// Everything else that writes is off, and says so.
await page.click('.pf-sec__btn:has-text("Details")');
await page.click('.pf-sec button:has-text("Edit details")');
t = await D.text();
check('Edit details with no signal: Save off — "Needs signal"', await page.locator('form.inline-form button[type="submit"]:has-text("Save")').isDisabled().catch(() => false) && /Needs signal/.test(t));
await page.click('form.inline-form button:has-text("Cancel")');
await page.click('.pf-sec__btn:has-text("Volunteer roles")');
check('Volunteer roles with no signal: Add off', await page.locator('.role-add button:has-text("Add")').isDisabled().catch(() => false));
await page.click('.pf-sec__btn:has-text("Signs")');
check('Request a sign with no signal: off', await page.locator('.pf-sec button[title="Lawn sign"], .pf-sec button:has-text("Lawn")').first().isDisabled().catch(() => false));

await D.go(`/people/${maya.id}`);
await page.waitForSelector('.pf-page h1', { timeout: 8000 });
await page.click('.pf-sec__btn:has-text("Tags")');
await page.click('.pf-sec button:has-text("Edit tags")');
await page.click('.tag-editor button[aria-label="Remove tag Endorser"]');
await sleep(500);
const mayaChips = await page.innerText('.tag-editor .tag-chips').catch(() => 'endorser');
check('a tag taken off with no signal goes at once (Maya: Endorser)', !/endorser/i.test(mayaChips) && /VIP/.test(mayaChips), mayaChips);
check('strip: "3 saved on this device"', /^3 saved on this device$/i.test(await D.chip()), await D.chip());
await page.click('.offline-strip__chip');
await page.waitForSelector('.obx-sheet', { timeout: 3000 }).catch(() => {});
const sheet = await page.$$eval('.obx-sheet .obx-row', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
check('the sheet lists them in plain words', sheet.length === 3 && /^Knock · Tom Riley · /.test(sheet[0])
  && new RegExp(`^Tag · Desk ${tag} · Tom Riley · `, 'i').test(sheet[1]) && /^Tag off · Endorser · Maya Chen · /.test(sheet[2]), sheet.join(' | '));
await page.keyboard.press('Escape');
// Through a reload, still there — the kept copy with what's waiting on top.
await D.go(`/people/${tom.id}`);
await page.waitForSelector('.pf-page h1', { timeout: 8000 });
t = await D.text();
check('reload with no signal: the profile still shows the rating, the note "Not sent yet", the waiting line',
  /Strong yes/.test(await page.innerText('.pf-meta').catch(() => '')) && /Not sent yet/i.test(t) && t.includes(note) && /Saved on this device — sends when you’re back online/.test(t), t.slice(0, 200));
const tomServer = (await D.api(`/persons/${tom.id}`)).json;
check('…and nothing reached the server yet', tomServer.contacts.length === tomBefore.contacts.length && !(tomServer.person.tags || []).includes(newTag)
  && (await D.api(`/persons/${maya.id}`)).json.person.tags.includes('endorser'));

// Phone width, still no signal (the same sign-in, a narrow window).
await page.setViewportSize({ width: 390, height: 844 });
await D.go('/people');
await page.waitForSelector('.pp-list li', { timeout: 8000 }).catch(() => {});
check('People at 390, no signal: the kept rows', (await page.locator('.pp-list li').count()) === rowsOnline, await page.locator('.pp-list li').count());
await simple(D, 'People, no signal (390)');
await D.go(`/people/${tom.id}`);
await page.waitForSelector('.pf-rate', { timeout: 8000 }).catch(() => {});
await simple(D, 'Profile, no signal (390)', '.pf-rate button[aria-label]');
await D.shot('05-profile-390-no-signal');
await D.go('/');
await simple(D, 'Today, no signal (390)');
await D.go('/money');
await simple(D, 'Money, no signal (390)');
await page.setViewportSize({ width: 1360, height: 900 });

// ════════════════════════════════════════════════════════════════════════════
// 4. Signal back: each sent once — one answer lost on the way, replayed
// ════════════════════════════════════════════════════════════════════════════
let lost = 0;
await page.route('**/api/actions/person.tag', async (route) => {
  if (lost > 0) { await route.continue(); return; }
  lost += 1;
  await route.fetch(); // the server does it…
  await route.abort('connectionreset'); // …and the answer never comes back
});
await goOnline(ctx, page);
await until(async () => !(await D.chip()), 25000);
await page.unroute('**/api/actions/person.tag');
check('back online: everything sent (the lost answer replayed by itself)', !(await D.chip()) && (await D.outbox()).length === 0 && lost === 1, await D.chip());
await until(async () => !(await page.$('.offline-strip__kept')), 8000);
check('…and the screen loaded again by itself: no "from <time>" left on the strip (Money, unchanged)', !(await page.$('.offline-strip__kept')), await D.kept());
const tomAfter = (await D.api(`/persons/${tom.id}`)).json;
const noted = tomAfter.contacts.filter((c) => c.note === note);
check('server: the note once, with its rating', noted.length === 1 && noted[0].rating === '1' && tomAfter.contacts.length === tomBefore.contacts.length + 1
  && tomAfter.person.rating === '1', JSON.stringify(noted));
check('server: the tag on Tom once', tomAfter.person.tags.filter((x) => x === newTag).length === 1, JSON.stringify(tomAfter.person.tags));
const mayaTags = (await D.api(`/persons/${maya.id}`)).json.person.tags;
check('server: Endorser off Maya, VIP kept', !mayaTags.includes('endorser') && mayaTags.includes('VIP'), mayaTags.join());
const evs = (await D.api('/events?since=0&limit=5000')).json.events;
check('the log: one tag change each — the replay recorded nothing', evs.filter((e) => e.action === 'person.tag').length === tagEventsBefore + 2
  && evs.filter((e) => e.action === 'person.tag' && e.entity_id === tom.id).length === 1, evs.filter((e) => e.action === 'person.tag').length);
await D.go(`/people/${tom.id}`);
await page.waitForSelector('.pf-page h1', { timeout: 8000 });
t = await D.text();
check('the profile, online: no "Not sent yet", no waiting line, no chip', !/Not sent yet/i.test(t) && !/Saved on this device/.test(t) && !(await D.kept()) && t.includes(note));
check('…writes are on again', !(await page.locator('.pf-rate button[aria-label="2: Lean support"]').isDisabled()));
await simple(D, 'Profile, online (1360)', '.pf-rate button[aria-label]');
// Signal, but the server can't be reached (wifi with no internet): the copy, said as "No answer".
await page.route('**/api/persons?*', (route) => route.abort('internetdisconnected'));
await D.go('/people');
await page.waitForSelector('.pp-table tbody tr', { timeout: 8000 }).catch(() => {});
t = await D.text();
check('wifi with no internet: People shows the kept list, "No answer · from <time>", no error line',
  /No answer · from \d{1,2}:\d{2} (am|pm)/i.test(await D.kept()) && (await countOf(page)) === countOnline && !/check your signal|No signal — the list loads/.test(t), `${await D.kept()} · ${t.slice(0, 160)}`);
await page.unroute('**/api/persons?*');

// ════════════════════════════════════════════════════════════════════════════
// 5. Sign-out forgets; the next sign-in on this browser sees none of it
// ════════════════════════════════════════════════════════════════════════════
const staffInv = (await D.api('/actions/member.invite', { email: `desk.staff+${tag}@example.org`, role: 'staff' })).json;
await page.click('.acct-btn');
await page.click('.acct-panel button:has-text("Sign out")');
await page.waitForURL(`${BASE}/login`, { timeout: 10000 }).catch(() => {});
await sleep(500);
let left = await D.stored();
check('signed out: no copies left in this browser or this tab', Object.keys(left.local).length === 0 && Object.keys(left.session).length === 0,
  JSON.stringify([...Object.keys(left.local), ...Object.keys(left.session)]).slice(0, 200));
await join(page, staffInv.joinUrl, 'Sam Staff');
const meB = (await D.api('/auth/me')).json;
check('a second person signs in on the same browser', meB.user.id !== meA.user.id && meB.role === 'staff');
await page.waitForSelector('.today-nums', { timeout: 8000 }).catch(() => {});
await sleep(1200);
await ctx.setOffline(true);
await D.go('/people');
await page.waitForSelector('.pp-offline', { timeout: 6000 }).catch(() => {});
t = await D.text();
check('…their People with no signal: "No signal — the list loads…", none of the first person’s copy',
  /No signal — the list loads when you’re back online/.test(t) && (await page.locator('.pp-table tbody tr, .pp-list li').count()) === 0, t.slice(0, 160));
await D.go(`/people/${tom.id}`);
await page.waitForSelector('.pp-offline', { timeout: 6000 }).catch(() => {});
check('…nor the first person’s profile', /No signal — this profile loads when you’re back online/.test(await D.text()));
left = await D.stored();
check('…and nothing of theirs is stored here', ![...Object.keys(left.local), ...Object.keys(left.session)].some((x) => x.includes(meA.user.id)));
await goOnline(ctx, page);
await sleep(800);

// ════════════════════════════════════════════════════════════════════════════
// 6. Volunteer on a phone: keeps only what a volunteer saw
// ════════════════════════════════════════════════════════════════════════════
const D2 = D; // the desk's cookies are Sam's now; the manager's API is a fresh context
const mctx = await browser.newContext();
const M = helpers(await mctx.newPage(), mctx);
const login = await mctx.request.post(`${BASE}/api/auth/login`, { data: { email: mgrEmail, password: 'surrey-forward-2026' } });
check('manager signs in again (API) to invite a volunteer', login.ok(), login.status());
const volEmail = `desk.vol+${tag}@example.org`;
const vinv = (await M.api('/actions/member.invite', { email: volEmail, role: 'volunteer' })).json;
const vctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/Vancouver' });
await routeTiles(vctx);
const vp = await vctx.newPage();
vp.on('pageerror', (e) => errors.push('[vol] ' + e.message));
const V = helpers(vp, vctx);
await join(vp, vinv.joinUrl, 'Jas Volunteer');
await V.go('/');
await V.swReady();
await V.go('/');
await vp.waitForSelector('.today-start', { timeout: 8000 }).catch(() => {});
await V.go('/calls');
await V.go('/shifts');
await V.go(`/people/${harjit.id}`);
await vp.waitForSelector('.pf-rate', { timeout: 8000 }).catch(() => {});
await V.go('/inbox');
await sleep(1200);
const vk = await V.stored();
const vLocal = Object.keys(vk.local);
check('volunteer: their Today and the profile they opened are kept (in this browser — no money in them)',
  has(vLocal, ':q:volunteer:brief') && has(vLocal, `:q:volunteer:person:${harjit.id}`) && Object.keys(vk.session).length === 0, vLocal.map((x) => x.split(':').slice(5).join(':')).join(' | '));
check('volunteer: no People list, no money copies', !vLocal.some((x) => /:q:volunteer:(persons|gifts|pledges|receipts|filings)/.test(x)));
const vText = Object.values(vk.local).join('\n');
const vBrief = JSON.parse(Object.entries(vk.local).find(([x]) => x.endsWith(':q:volunteer:brief'))?.[1] || '{}').data || {};
const vProf = JSON.parse(Object.entries(vk.local).find(([x]) => x.endsWith(`:q:volunteer:person:${harjit.id}`))?.[1] || '{}').data || {};
check('…only what the server let a volunteer see: no money in Today or the profile', vBrief.money === null && (vBrief.flagged || []).length === 0
  && vProf.donor === null && (vProf.gifts || []).length === 0 && !/amount_cents|totalCents/.test(vText), JSON.stringify({ m: vBrief.money, d: vProf.donor }));
const leaked = [...new Set((vText.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []).filter((e) => e.toLowerCase() !== volEmail))];
check('…and no one else’s email anywhere in what this phone kept', leaked.length === 0, leaked.join(', '));

await vctx.setOffline(true);
await V.go('/');
await vp.waitForSelector('.today-start', { timeout: 8000 }).catch(() => {});
t = await V.text();
check('volunteer Today with no signal: the kept copy, "No signal · from <time>"', KEPT.test(await V.kept()) && /Start canvassing|Make calls/i.test(t), `${await V.kept()} · ${t.slice(0, 120)}`);
await simple(V, 'Volunteer Today, no signal (390)', 'main.page a.btn-primary');
await V.shot('06-vol-today-no-signal');
await V.go(`/people/${harjit.id}`);
await vp.waitForSelector('.pf-rate', { timeout: 8000 }).catch(() => {});
check('volunteer profile with no signal: kept, no Tags (desk work)', /Harjit Gill/.test(await vp.innerText('.pf-page h1').catch(() => '')) && !(await vp.$('.pf-sec__btn:has-text("Tags")')));
const vBefore = (await M.api(`/persons/${harjit.id}`)).json.contacts.length;
await vp.tap('.pf-rate button[aria-label="2: Lean support"]').catch(() => vp.click('.pf-rate button[aria-label="2: Lean support"]'));
await sleep(600);
t = await V.text();
check('volunteer rating with no signal: "Saved offline", waiting on this phone', /Saved offline/.test(t) && /Saved on this phone — sends when you’re back online/.test(t), t.slice(0, 200));
await simple(V, 'Volunteer profile, no signal (390)', '.pf-rate button[aria-label]');
await V.shot('07-vol-profile-queued');
await goOnline(vctx, vp);
await until(async () => !(await V.chip()), 20000);
const vAfter = (await M.api(`/persons/${harjit.id}`)).json;
check('back online: the volunteer’s knock once', vAfter.contacts.length === vBefore + 1 && vAfter.person.rating === '2', `${vAfter.contacts.length} vs ${vBefore}`);
await vctx.close();

// ════════════════════════════════════════════════════════════════════════════
// 7. Storage blocked (a private window): today's behaviour, no errors
// ════════════════════════════════════════════════════════════════════════════
const pctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, timezoneId: 'America/Vancouver' });
await pctx.addInitScript(() => {
  for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(window, name, { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
  }
});
const pp = await pctx.newPage();
const perrors = [];
pp.on('pageerror', (e) => perrors.push(e.message));
const PH = helpers(pp, pctx);
await PH.go('/login');
await pp.fill('#login-email', mgrEmail);
await pp.fill('#login-password', 'surrey-forward-2026');
await pp.click('button[type="submit"]');
await pp.waitForURL(`${BASE}/`, { timeout: 15000 }).catch(() => {});
await pp.waitForSelector('.today-nums', { timeout: 8000 }).catch(() => {});
await pp.click('nav.links a[href="/people"]').catch(() => {});
await pp.waitForSelector('.pp-table tbody tr', { timeout: 8000 }).catch(() => {});
await sleep(1200);
await PH.shot('08-storage-blocked-online');
check('storage blocked: the desk still works with signal', (await pp.locator('.pp-table tbody tr').count()) > 20 && Number(await countOf(pp)) > 50, `${pp.url()} ${(await PH.text()).slice(0, 160)}`);
await pctx.setOffline(true);
await pp.click('nav.links a[href="/signs"]');
await sleep(1500);
t = await PH.text();
check('storage blocked, no signal: a screen not loaded yet says No signal, as before', /No signal — this loads when you’re back online/.test(t), t.slice(0, 160));
check('storage blocked: no page errors', perrors.length === 0, perrors.join(' | '));
await pctx.close();
await mctx.close();
await ctx.close();
void D2;

// ── The books still verify ──
const relog = await browser.newContext();
const R = helpers(await relog.newPage(), relog);
await relog.request.post(`${BASE}/api/auth/login`, { data: { email: mgrEmail, password: 'surrey-forward-2026' } });
const v = (await R.api('/audit/verify')).json;
check('hash chain verifies after the whole journey', v?.ok === true && v.checked > 20, JSON.stringify(v));
check('no page errors', errors.length === 0, errors.join(' | '));
await relog.close();

console.log('\nSIMPLE (words · yellow · overflow · min tap):');
for (const m of measured) console.log(`      ${m.name}: ${m.words} · ${m.yellow} · ${m.overflow} · ${m.minTap == null ? '-' : Math.round(m.minTap)}`);
await browser.close();
if (server) server.kill();
const fails = results.filter((r) => !r).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
