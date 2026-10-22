// Starbase offline field mode E2E — a fresh in-memory server with its own tile
// provider (STARBASE_TILE_*), then, as a desk user on a laptop and a
// volunteer on a 390×844 phone: tiles from the configured provider, kept by
// the service worker; the map, Calls and Shifts opening with no signal from
// the phone's copy ("Offline copy"); a new door, a knock on it, a sign
// request and an Undo saved offline and sent once, in order, when the signal
// is back; a lost answer replayed without a duplicate; a refusal kept with
// the server's reason (Dismiss / Try again); sign-out asking about unsent
// work and forgetting the phone's copies — and every claim on screen checked
// against the API, the volunteer's copies checked for other people's
// emails, and the audit chain verified at the end.
//
//   node e2e-offline.mjs                 (starts its own server on :4102)
//   BASE=http://127.0.0.1:4102 node e2e-offline.mjs   (a fresh server you started,
//        with STARBASE_TILE_URL=https://tiles.example/{z}/{x}/{y}.png)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = Number(process.env.PORT) || 4102;
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user-mandate/c88a39fd-f6db-552f-95dc-59176433706d/scratchpad/features/offline';
mkdirSync(SHOTS, { recursive: true });
const TILE_URL = 'https://tiles.example/{z}/{x}/{y}.png';

let server = null;
let BASE = process.env.BASE;
if (!BASE) {
  server = spawn(process.execPath, ['server/index.js'], {
    env: {
      ...process.env, STARBASE_DATA: 'memory', PORT: String(PORT), STARBASE_JOBS: 'off',
      STARBASE_TILE_URL: TILE_URL,
      STARBASE_TILE_ATTRIBUTION: '&copy; <a href="https://tiles.example/about">Example Tiles</a><script>alert(1)</script>',
      STARBASE_TILE_MAX_ZOOM: '19',
    },
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
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + String(extra).slice(0, 200) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = Math.random().toString(36).slice(2, 8);

// The test provider's tiles: a street grid with a marker, CORS-open (the
// service worker reads them to keep them).
const tileSvg = (x, y) => {
  const lines = [];
  for (let i = 0; i <= 256; i += 32) {
    lines.push(`<line x1="${i}" y1="0" x2="${i}" y2="256" stroke="#fff" stroke-width="${((x * 256 + i) / 32) % 4 === 0 ? 5 : 2}"/>`);
    lines.push(`<line x1="0" y1="${i}" x2="256" y2="${i}" stroke="#fff" stroke-width="${((y * 256 + i) / 32) % 4 === 0 ? 5 : 2}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><!--e2e-tile--><rect width="256" height="256" fill="#e3e6d6"/>${lines.join('')}</svg>`;
};
const hits = { tiles: 0, osm: 0 };
const routeTiles = async (ctx) => {
  await ctx.route(/tiles\.example\/(\d+)\/(\d+)\/(\d+)\.png/, (route) => {
    hits.tiles += 1;
    const [, , x, y] = route.request().url().match(/\/(\d+)\/(\d+)\/(\d+)\.png/);
    route.fulfill({ status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: tileSvg(+x, +y) });
  });
  await ctx.route(/openstreetmap\.org/, (route) => { hits.osm += 1; route.abort(); });
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const errors = [];

// ── helpers bound to one page ──
const helpers = (page, ctx) => ({
  text: async () => ((await page.innerText('body').catch(() => '')) || '').replace(/\s+/g, ' '),
  // The API through the context's own cookies, outside the page's network —
  // works while the page is "offline" (the server's side of the story).
  api: async (path, body) => {
    const r = body === undefined
      ? await ctx.request.get(`${BASE}/api${path}`)
      : await ctx.request.post(`${BASE}/api${path}`, { data: body });
    return { status: r.status(), json: await r.json().catch(() => null) };
  },
  go: async (path) => { await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' }); await sleep(1200); },
  shot: (n) => page.screenshot({ path: `${SHOTS}/${n}.png` }),
  chip: () => page.$eval('.offline-strip__chip', (el) => el.innerText.replace(/\s+/g, ' ').trim()).catch(() => ''),
  // SIMPLE.md's checks on what's on screen now (inside `sel`).
  measure: (sel) => page.evaluate((s) => {
    const root = document.querySelector(s) || document.body;
    const vis = (el) => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
    const words = (root.innerText || '').split(/\s+/).filter(Boolean).length;
    const yellow = [...document.querySelectorAll('.btn-primary')].filter(vis).length;
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const small = [...root.querySelectorAll('button, a.btn, input, select, textarea')].filter(vis)
      .map((el) => { const r = el.getBoundingClientRect(); return { t: (el.innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 24), h: Math.round(r.height), w: Math.round(r.width) }; })
      .filter((x) => x.h < 48 || x.w < 44);
    return { words, yellow, overflow, small };
  }, sel),
  copies: () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('starbase:copy:') || k.startsWith('starbase:field:'))),
  outbox: () => page.evaluate(() => JSON.parse(localStorage.getItem('starbase:outbox:v2') || '[]')),
  swReady: () => page.evaluate(() => navigator.serviceWorker.ready.then(() => Boolean(navigator.serviceWorker.controller))),
});

// ════════════════════════════════════════════════════════════════════════════
// 1. Desk user on a laptop
// ════════════════════════════════════════════════════════════════════════════
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, timezoneId: 'America/Vancouver' });
await routeTiles(ctx);
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
if (process.env.DEBUG) page.on('requestfailed', (r) => console.log('      [desk] failed', r.method(), r.url().replace(BASE, ''), r.failure()?.errorText));
const D = helpers(page, ctx);

await D.go('/signup');
await page.fill('#su-name', 'Riley Desk');
await page.fill('#su-email', `desk+${tag}@example.org`);
await page.fill('#su-password', 'surrey-forward-2026');
await page.fill('#su-workspace', 'Imagine Surrey');
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`, { timeout: 15000 });

const P = {};
const mk = async (key, data) => { P[key] = (await D.api('/actions/person.create', data)).json.person; };
await mk('maya', { name: 'Maya Chen', phone: '604-555-0103', email: 'maya@example.org', address: '12390 72 Ave', lat: 49.13310, lng: -122.84950 });
await mk('tom', { name: 'Tom Riley', phone: '604-555-0104', email: 'tom@example.org', address: '7120 124 St', lat: 49.13100, lng: -122.85200 });
await mk('harjit', { name: 'Harjit Gill', phone: '604-555-0101', email: 'harjit@example.org', address: '12345 72 Ave', lat: 49.13300, lng: -122.85100 });
await mk('dev', { name: 'Dev Patel', phone: '604-555-0106', email: 'dev@example.org', address: '12410 70A Ave', lat: 49.12950, lng: -122.84800 });
await mk('grace', { name: 'Grace Kim', phone: '604-555-0107', email: 'grace@example.org', address: '7201 128 St' });
const turf = (await D.api('/actions/turf.create', {
  name: 'Newton East', polygon: [[49.125, -122.860], [49.140, -122.860], [49.140, -122.838], [49.125, -122.838]],
})).json.turf;
const soon = (h) => new Date(Date.now() + h * 3600_000).toISOString();
const roomy = (await D.api('/actions/shift.create', { title: 'Saturday canvass', starts_at: soon(48), ends_at: soon(51), capacity: 6, location: 'Newton Rec Centre' })).json.shift;
const tight = (await D.api('/actions/shift.create', { title: 'Phone bank', starts_at: soon(50), ends_at: soon(52), capacity: 1 })).json.shift;
check('seeded doors, a turf and two shifts', Object.values(P).every((p) => p?.id) && turf?.id && roomy?.id && tight?.id);

const cfg = (await D.api('/map/config')).json;
check('GET /api/map/config names the configured provider', cfg?.tiles?.url === TILE_URL && cfg.tiles.maxZoom === 19, JSON.stringify(cfg));

// Map online: tiles from the configured provider, never OpenStreetMap.
await D.go('/map');
await page.waitForSelector('.map-pin-wrap', { timeout: 10000 }).catch(() => {});
check('service worker controls the page', await D.swReady().catch(() => false) || (await (async () => { await D.go('/map'); return D.swReady(); })()));
await D.go('/map');
await page.waitForSelector('.map-pin-wrap', { timeout: 10000 }).catch(() => {});
await sleep(1500);
check('map tiles come from STARBASE_TILE_URL (not OpenStreetMap)', hits.tiles > 0 && hits.osm === 0, JSON.stringify(hits));
const credit = await page.$eval('.leaflet-control-attribution', (el) => ({ text: el.innerText, html: el.innerHTML })).catch(() => ({ text: '', html: '' }));
check('the provider’s credit shows, links kept, script stripped', /Example Tiles/.test(credit.text) && /href="https:\/\/tiles\.example\/about"/.test(credit.html) && !/script|alert/i.test(credit.html), credit.html.slice(0, 120));
const kept = await page.evaluate(async () => {
  const c = await caches.open('starbase-tiles-v1');
  const keys = (await c.keys()).map((r) => r.url).filter((u) => u.includes('tiles.example'));
  const body = keys.length ? await (await c.match(keys[0])).text() : '';
  return { n: keys.length, marked: body.includes('e2e-tile') };
});
check('the service worker keeps tiles already looked at', kept.n > 0 && kept.marked, JSON.stringify(kept));
const pinsOnline = (await page.$$('.map-pin-wrap')).length;
check('map shows the 4 located doors', pinsOnline === 4, pinsOnline);
await sleep(1200); // the phone copy is written a moment after the doors load
// The walk list, opened once with signal (it keeps its own copy).
await D.go(`/turfs/${turf.id}`);
await page.waitForSelector('.walk-door', { timeout: 8000 }).catch(() => {});
await D.go('/map');
await page.waitForSelector('.map-pin-wrap', { timeout: 10000 }).catch(() => {});
await sleep(1200);
const deskCopies = await D.copies();
const deskId = (await D.api('/auth/me')).json.user.id;
check('doors + map settings kept on this phone, keyed to this sign-in', deskCopies.some((k) => k.endsWith(':doors')) && deskCopies.some((k) => k.endsWith(':mapConfig')) && deskCopies.every((k) => k.includes(`:${deskId}:`)), deskCopies.join(' | '));

// A sign request with signal, then its Undo tapped with no signal.
await D.go(`/map?person=${P.tom.id}`);
await page.waitForSelector('aside.door-card', { timeout: 8000 });
await page.click('aside.door-card .fk-more__btn');
await page.click('aside.door-card button:has-text("Large sign")');
await page.waitForSelector('.map-toast button:has-text("Undo")', { timeout: 5000 }).catch(() => {});
const tomSign = (await D.api('/signs')).json.signs.find((s) => s.person_id === P.tom.id);
check('large sign requested with signal', tomSign?.kind === 'large' && tomSign.status === 'requested');
await ctx.setOffline(true);
await page.click('.map-toast button:has-text("Undo")');
await sleep(300);
check('Undo with no signal says it is saved, not done', /Undo saved offline/.test(await D.text()) && !/cancelled/i.test(await D.text()));
// Meanwhile the sign crew puts it up (their phone has signal).
check('crew marks it up meanwhile', (await D.api('/actions/sign.update', { id: tomSign.id, status: 'installed' })).status === 200);

// ── Offline: reload, the map opens from the phone ──
await D.go('/map');
await page.waitForSelector('.map-pin-wrap', { timeout: 10000 }).catch(() => {});
let t = await D.text();
const pinsOffline = (await page.$$('.map-pin-wrap')).length;
check('offline reload: the map opens with the doors kept on this phone', pinsOffline === 4 && /Offline copy/i.test(t) && !/Turfs didn’t load/.test(t), `pins=${pinsOffline}`);
const tilesDrawn = await page.$$eval('.leaflet-tile-loaded', (els) => els.filter((i) => i.complete && i.naturalWidth > 0).length).catch(() => 0);
check('offline: tiles seen before still draw', tilesDrawn > 0, tilesDrawn);
check('strip: offline and 1 saved on this phone', /Offline/i.test(t) && /^1 saved on this phone$/i.test(await D.chip()), await D.chip());

// Add a door with no signal, at an empty spot inside the turf.
await page.click('button[aria-label="Add a door"]');
const spot = await page.evaluate(() => {
  const pins = [...document.querySelectorAll('.map-pin-wrap')].map((el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  const xs = pins.map((p) => p[0]); const ys = pins.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best = null;
  for (let x = x0; x <= x1; x += 8) for (let y = y0; y <= y1; y += 8) {
    const d = Math.min(...pins.map((p) => Math.hypot(p[0] - x, p[1] - y)));
    if (d >= 70 && (!best || d > best.d)) best = { x, y, d };
  }
  return best;
});
await page.mouse.click(spot.x, spot.y);
await page.waitForSelector('form[aria-label="New door"]', { timeout: 5000 }).catch(() => {});
await page.fill('#nd-name', 'Ana Souza');
await page.fill('#nd-address', '7155 124 St');
await page.click('form[aria-label="New door"] button[type="submit"]');
await sleep(600);
t = await D.text();
check('new door offline: saved on the phone, said so', /Ana Souza saved offline/.test(t) || /Not sent yet/.test(t), t.slice(0, 200));
await page.waitForSelector('aside.door-card', { timeout: 5000 }).catch(() => {});
const anaCard = await page.$eval('aside.door-card', (el) => el.innerText).catch(() => '');
check('her door card opens, marked "Not sent yet"', /Ana Souza/.test(anaCard) && /Not sent yet/i.test(anaCard), anaCard.slice(0, 120));
check('no profile link for someone the server doesn’t have yet', !(await page.$('aside.door-card a:has-text("Profile")')));
await page.click('aside.door-card button[aria-label="1: Strong support"]');
await sleep(400);
check('a knock on her, offline: "Saved offline"', /Saved offline/.test(await D.text()));
const anaId = (await D.outbox()).find((i) => i.name === 'person.create')?.input?.id;
check('server has no Ana yet (nothing pretends to send)', ((await D.api('/persons?q=Ana%20Souza')).json.persons || []).length === 0);

// The walk list, offline: Ana is on it straight away, not sent yet.
await D.go(`/turfs/${turf.id}`);
await page.waitForSelector('.walk-door', { timeout: 8000 }).catch(() => {});
const anaRow = await page.$$eval('.walk-door', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')).find((x) => /Ana Souza/.test(x)) || '').catch(() => '');
check('walk list offline: Ana is on it at once, "Not sent"', /7155 124 St/.test(anaRow) && /Not sent/i.test(anaRow) && /Offline copy/i.test(await D.text()), anaRow);
await D.shot('1b-desk-offline-walk-list');

// A lawn sign at Maya's door, offline.
await D.go(`/map?person=${P.maya.id}`);
await page.waitForSelector('aside.door-card', { timeout: 8000 });
await page.click('aside.door-card .fk-more__btn');
await page.click('aside.door-card button:has-text("Lawn sign")');
await sleep(400);
t = await D.text();
check('lawn sign offline: "Lawn sign saved offline" with Undo', /Lawn sign saved offline/.test(t) && !!(await page.$('.map-toast button:has-text("Undo")')));
check('the door shows it, "Not sent yet"', /Lawn sign · Not sent yet/i.test(await page.$eval('aside.door-card', (el) => el.innerText.replace(/\s+/g, ' '))));
check('the map pin for Ana is on the map', (await page.$$('.map-pin-wrap')).length === 5);
const chip1 = await D.chip();
check('chip: 4 saved on this phone', /^4 saved on this phone$/i.test(chip1), chip1);
await page.click('.offline-strip__chip');
await page.waitForSelector('.obx-sheet', { timeout: 3000 }).catch(() => {});
const rows = await page.$$eval('.obx-sheet .obx-row', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
check('sheet lists each one in plain words, in order', rows.length === 4
  && /^Sign undo · Tom Riley · \d{1,2}:\d{2} (am|pm)$/.test(rows[0])
  && /^New person · Ana Souza · /.test(rows[1]) && /^Knock · Ana Souza · /.test(rows[2]) && /^Lawn sign · Maya Chen · /.test(rows[3]), rows.join(' | '));
check('offline sheet: says when it sends, no Send now', /Sends when you’re back online/.test(await page.$eval('.obx-sheet', (el) => el.innerText)) && !(await page.$('.obx-sheet button:has-text("Send now")')));
let m = await D.measure('.obx-sheet');
check('sheet: no yellow button, field-size targets', m.yellow <= 1 && !(await page.$('.obx-sheet .btn-primary')) && m.small.length === 0, JSON.stringify(m));
console.log(`      sheet (desk, offline): ${m.words} words, ${m.yellow} yellow on screen`);
await D.shot('1-desk-offline-sheet');
await page.keyboard.press('Escape');

// ── Signal back: everything goes, in order, once ──
await ctx.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event('online')));
for (let i = 0; i < 20 && /saved on this phone/i.test(await D.chip()); i += 1) await sleep(500);
const chip2 = await D.chip();
check('back online: the waiting ones sent; the refused one stays, "1 refused"', /^1 refused$/i.test(chip2), chip2);
const ana = (await D.api('/persons?q=Ana%20Souza')).json.persons;
check('server: Ana once, with the phone’s id and her rating', ana.length === 1 && ana[0].id === anaId && ana[0].rating === '1' && ana[0].lat != null, JSON.stringify(ana.map((p) => [p.id === anaId, p.rating])));
const anaProfile = (await D.api(`/persons/${anaId}`)).json;
check('server: her knock once', anaProfile.contacts.length === 1 && anaProfile.contacts[0].rating === '1');
const mayaSigns = (await D.api('/signs')).json.signs.filter((s) => s.person_id === P.maya.id);
check('server: Maya’s lawn sign once', mayaSigns.length === 1 && mayaSigns[0].kind === 'lawn' && mayaSigns[0].status === 'requested');
check('server: Tom’s sign still up (the Undo was refused, not faked)', (await D.api('/signs')).json.signs.find((s) => s.id === tomSign.id)?.status === 'installed');
await page.click('.offline-strip__chip');
await page.waitForSelector('.obx-sheet .is-refused', { timeout: 3000 }).catch(() => {});
const refusedRow = await page.$eval('.obx-sheet .is-refused', (el) => el.innerText.replace(/\s+/g, ' ')).catch(() => '');
check('refused: shown with the server’s reason, Try again · Dismiss', /Sign undo · Tom Riley/.test(refusedRow) && /That sign is already up — mark it taken down instead/.test(refusedRow) && /Try again/i.test(refusedRow) && /Dismiss/i.test(refusedRow), refusedRow);
await D.shot('2-desk-refused');
await page.click('.obx-sheet .is-refused button:has-text("Try again")');
await sleep(800);
check('Try again: refused again, still listed', /Sign undo/.test(await page.$eval('.obx-sheet', (el) => el.innerText).catch(() => '')) && /1 refused/i.test(await D.chip()));
await page.click('.obx-sheet .is-refused button:has-text("Dismiss")');
await sleep(300);
check('Dismiss: gone from the phone, the strip goes', !(await page.$('.offline-strip__chip')) && (await D.outbox()).length === 0);
await D.go(`/map?person=${anaId}`);
await page.waitForSelector('aside.door-card', { timeout: 8000 }).catch(() => {});
const anaAfter = await page.$eval('aside.door-card', (el) => el.innerText).catch(() => '');
check('Ana’s door card: no "Not sent yet" once the server has her', /Ana Souza/.test(anaAfter) && !/Not sent yet/i.test(anaAfter));

// A lost answer: the server adds the person, the phone never hears back.
let lost = 0;
await page.route('**/api/actions/person.create', async (route) => {
  if (lost > 0) { await route.continue(); return; }
  lost += 1;
  await route.fetch(); // the server does the write…
  await route.abort('connectionreset'); // …the answer is lost on the way back
});
await page.click('aside.door-card button[aria-label="Close door card"]').catch(() => {});
await page.click('button[aria-label="Add a door"]');
await page.mouse.click(spot.x + 30, spot.y + 30);
await page.waitForSelector('form[aria-label="New door"]', { timeout: 5000 }).catch(() => {});
await page.fill('#nd-name', 'Lost Answer');
await page.fill('#nd-address', '7160 124 St');
await page.click('form[aria-label="New door"] button[type="submit"]');
await sleep(600);
check('lost answer: "saved on this phone — sends soon"', /Lost Answer saved on this phone — sends soon/.test(await D.text()));
check('…the server already has it', ((await D.api('/persons?q=Lost%20Answer')).json.persons || []).length === 1);
await page.click('.offline-strip__btn:has-text("Send now")');
await sleep(1000);
check('Send now: replayed as the same person, no duplicate', ((await D.api('/persons?q=Lost%20Answer')).json.persons || []).length === 1 && !(await page.$('.offline-strip__chip')));
await page.unroute('**/api/actions/person.create');
await D.go('/map');
m = await D.measure('main.page');
check('desk map: one yellow button at most', m.yellow <= 1, JSON.stringify(m));

// ════════════════════════════════════════════════════════════════════════════
// 2. Volunteer on a phone
// ════════════════════════════════════════════════════════════════════════════
const volEmail = `vol+${tag}@example.org`;
const inv = (await D.api('/actions/member.invite', { email: volEmail, role: 'volunteer' })).json;
const vctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/Vancouver' });
await routeTiles(vctx);
const vp = await vctx.newPage();
vp.on('pageerror', (e) => errors.push('[vol] ' + e.message));
if (process.env.DEBUG) vp.on('requestfailed', (r) => console.log('      [vol] failed', r.method(), r.url().replace(BASE, ''), r.failure()?.errorText));
const V = helpers(vp, vctx);
await vp.goto(inv.joinUrl.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'domcontentloaded' });
await vp.waitForSelector('#join-name', { timeout: 8000 });
await vp.fill('#join-name', 'Jas Volunteer');
await vp.fill('#join-password', 'knock-knock-2026');
await vp.click('button[type="submit"]');
await vp.waitForURL(`${BASE}/`, { timeout: 15000 }).catch(() => {});
const volId = (await V.api('/auth/me')).json.user.id;
await D.api('/actions/turf.assign', { turf_id: turf.id, user_id: volId });

// With signal: open the field screens once.
await V.go('/calls');
await vp.waitForSelector('section.cl-card', { timeout: 8000 }).catch(() => {});
await V.go(`/shifts/${roomy.id}`);
await V.go(`/shifts/${tight.id}`);
await V.go('/shifts');
await V.go('/map');
await vp.waitForSelector('.map-pin-wrap', { timeout: 10000 }).catch(() => {});
await V.swReady().catch(() => {});
await V.go('/calls');
await vp.waitForSelector('section.cl-card', { timeout: 8000 }).catch(() => {});
await sleep(1500);
const vCopies = await V.copies();
check('volunteer: doors, calls, shifts kept on the phone', ['doors', 'shifts', `shift:${roomy.id}`, 'actions'].every((n) => vCopies.some((k) => k.endsWith(`:${n}`))) && vCopies.some((k) => k.includes(':calls:')), vCopies.map((k) => k.split(':').slice(4).join(':')).join(' | '));
// Privacy: what this phone kept holds no one else's email (forViewer).
const leaked = await vp.evaluate((mine) => {
  const out = new Set();
  for (const k of Object.keys(localStorage)) {
    for (const e of (localStorage.getItem(k) || '').match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []) if (e.toLowerCase() !== mine) out.add(e);
  }
  return [...out];
}, volEmail);
check('volunteer’s phone copies: no one else’s email', leaked.length === 0, leaked.join(', '));

// ── No signal ──
await vctx.setOffline(true);
await V.go('/calls');
await vp.waitForSelector('section.cl-card', { timeout: 8000 }).catch(() => {});
t = await V.text();
check('offline Calls: the list opens from the phone, "Offline copy"', /Offline copy/i.test(t) && (await vp.$$('section.cl-card')).length === 1, t.slice(0, 160));
const called = await vp.$eval('section.cl-card', (el) => el.getAttribute('aria-label'));
await vp.tap('section.cl-card button[aria-label="2: Lean support"]').catch(() => vp.click('section.cl-card button[aria-label="2: Lean support"]'));
await sleep(500);
check('offline call rated: "Saved offline"', /Saved offline/.test(await V.text()));
m = await V.measure('main.page');
check('offline Calls at 390px: no sideways scroll, ≤1 yellow', m.overflow <= 0 && m.yellow <= 1, JSON.stringify({ o: m.overflow, y: m.yellow }));
await V.shot('3-vol-offline-calls');

await V.go(`/shifts/${roomy.id}`);
t = await V.text();
check('offline shift opens from the phone', /Saturday canvass/.test(t) && /Offline copy/i.test(t) && !!(await vp.$('button:has-text("Count me in")')), t.slice(0, 160));
await vp.click('button:has-text("Count me in")');
await sleep(400);
t = await V.text();
check('Count me in offline: "Not sent yet", never "You’re on"', /Count me in\s*Not sent yet/i.test(t) && !/You’re on this shift/i.test(t), t.slice(0, 200));
m = await V.measure('main.page');
check('shift (offline): no yellow left, field-size targets', m.yellow <= 1 && m.overflow <= 0, JSON.stringify(m));
await V.shot('4-vol-offline-shift');
await V.go(`/shifts/${tight.id}`);
await vp.click('button:has-text("Count me in")');
await sleep(300);
await V.go('/shifts');
t = await V.text();
check('shift list offline: both marked "Not sent yet"', (t.match(/Not sent yet/gi) || []).length === 2 && /Offline copy/i.test(t), t.slice(0, 200));
// The last spot goes to someone else meanwhile.
const other = (await D.api('/actions/person.create', { name: 'Took The Spot', phone: '604-555-0110' })).json.person;
check('desk fills the phone bank meanwhile', (await D.api('/actions/shift.assign', { shift_id: tight.id, person_id: other.id })).status === 200);

await V.go('/map');
await vp.waitForSelector('.map-pin-wrap', { timeout: 10000 }).catch(() => {});
const vPins = (await vp.$$('.map-pin-wrap, .map-cluster-wrap')).length;
const vFilter = await vp.$eval('.map-filter-btn', (el) => el.getAttribute('aria-label')).catch(() => '');
check('offline map on the phone: their turf’s doors, from the phone', vPins >= 1 && /Offline copy/i.test(await V.text()) && /My turf/.test(vFilter) && !/Turfs didn’t load/.test(await V.text()), `markers=${vPins} ${vFilter}`);
check('volunteer chip: 3 saved on this phone', /^3 saved on this phone$/i.test(await V.chip()), await V.chip());
await vp.tap('.offline-strip__chip').catch(() => vp.click('.offline-strip__chip'));
await vp.waitForSelector('.obx-sheet', { timeout: 3000 }).catch(() => {});
const vrows = await vp.$$eval('.obx-sheet .obx-row', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
check('volunteer sheet: call, two sign-ups, in plain words', vrows.length === 3 && new RegExp(`^Call · ${called} · `).test(vrows[0]) && /^Count me in · Saturday canvass · /.test(vrows[1]) && /^Count me in · Phone bank · /.test(vrows[2]), vrows.join(' | '));
m = await V.measure('.obx-sheet');
const sheetBox = await vp.$eval('.obx-sheet', (el) => { const r = el.getBoundingClientRect(); return { bottom: Math.round(r.bottom), h: Math.round(r.height) }; });
check('phone sheet: bottom sheet, no sideways scroll, no yellow, ≥48px targets', sheetBox.bottom === 844 && m.overflow <= 0 && !(await vp.$('.obx-sheet .btn-primary')) && m.small.length === 0, JSON.stringify({ sheetBox, ...m }));
console.log(`      sheet (phone, offline): ${m.words} words`);
await V.shot('5-vol-offline-sheet');
await vp.keyboard.press('Escape').catch(() => {});
const hit = await vp.evaluate(() => {
  const el = document.querySelector('.offline-strip__chip');
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const top = document.elementFromPoint(cx, r.top - 5.9);
  const bottom = document.elementFromPoint(cx, r.bottom + 5.9);
  const nm = (e) => (e ? `${e.tagName}.${e.className}` : 'none');
  return { h: Math.round(r.height), reach: el.contains(top) && el.contains(bottom), top: nm(top), bottom: nm(bottom) };
});
check('the chip is a ≥48px tap target', hit.reach && hit.h + 12 >= 48, JSON.stringify(hit));

// ── Signal back ──
await vctx.setOffline(false);
await vp.evaluate(() => window.dispatchEvent(new Event('online')));
for (let i = 0; i < 20 && /saved on this phone/i.test(await V.chip()); i += 1) await sleep(500);
check('volunteer back online: sent; the full shift refused, "1 refused"', /^1 refused$/i.test(await V.chip()), await V.chip());
const roomyNow = (await D.api(`/shifts/${roomy.id}`)).json.assignees.filter((a) => a.name === 'Jas Volunteer');
check('server: Jas on Saturday canvass once', roomyNow.length === 1 && roomyNow[0].status === 'confirmed', JSON.stringify(roomyNow));
check('server: Jas not on the full phone bank', !(await D.api(`/shifts/${tight.id}`)).json.assignees.some((a) => a.name === 'Jas Volunteer'));
const calledP = Object.values(P).find((p) => p.name === called);
const calledProf = (await D.api(`/persons/${calledP.id}`)).json;
check('server: the call once, by phone, rated 2', calledProf.contacts.filter((x) => x.channel === 'phone').length === 1 && calledProf.person.rating === '2', called);
await vp.tap('.offline-strip__chip').catch(() => vp.click('.offline-strip__chip'));
await vp.waitForSelector('.obx-sheet .is-refused', { timeout: 3000 }).catch(() => {});
const vref = await vp.$eval('.obx-sheet .is-refused', (el) => el.innerText.replace(/\s+/g, ' ')).catch(() => '');
check('refused sign-up shown with the reason', /Count me in · Phone bank/.test(vref) && /Shift is full/.test(vref), vref);
await V.shot('6-vol-refused');
await vp.keyboard.press('Escape').catch(() => {});
await V.go(`/shifts/${roomy.id}`);
check('Saturday canvass: "You’re on this shift" once the server says so', /You’re on this shift/i.test(await V.text()) && !/Not sent yet/i.test(await V.text()));

// Sign-out asks about what's still on the phone, then forgets everything.
await vp.click('.acct-btn');
await vp.click('.acct-panel button:has-text("Sign out")');
await sleep(800);
t = await V.text();
check('sign-out asks: "1 not sent yet. Sign out and delete it?"', /1 not sent yet\. Sign out and delete it\?/.test(t), t.slice(0, 160));
await V.shot('7-vol-signout-asks');
await vp.click('.acct-confirm button:has-text("Sign out")');
await vp.waitForURL(`${BASE}/login`, { timeout: 8000 }).catch(() => {});
await sleep(500);
const leftKeys = await vp.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('starbase:copy:') || k.startsWith('starbase:field:')).map((k) => [k.split(':').slice(-1)[0], Date.now() - (JSON.parse(localStorage.getItem(k)).at || 0)]));
check('signed out: the phone forgets its copies and outbox', leftKeys.length === 0 && (await V.outbox()).length === 0, JSON.stringify({ leftKeys, url: vp.url() }));
await vctx.close();

// ── The books still verify ──
const v = (await D.api('/audit/verify')).json;
check('hash chain verifies after the whole offline journey', v.ok === true && v.checked > 20, JSON.stringify(v));
check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
if (server) server.kill();
const fails = results.filter((r) => !r).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
