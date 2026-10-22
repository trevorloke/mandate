// Starbase A/B subject lines + open/click tracking — browser check.
//
// Starts its own fresh in-memory server with a stand-in email provider
// (fetch to Resend is answered locally and each message written to a
// mailbox file), then, as a desk user: writes an A/B newsletter while email
// isn't connected (Saved — not sent), connects email, Send now (A and B
// only), opens and clicks from the real tracked emails, fast-forwards the
// wait so the winner job runs, and reads the result on screen — every
// number checked against the API. Then the small-list path on Press, the
// compose screen on a 390×844 phone (one yellow button, no sideways scroll,
// field targets ≥ 48px, word count), and a volunteer on a phone who can't
// reach any of it. Ends with /api/audit/verify.
//
//   npm run build  then  node e2e-abtests.mjs   (PORT, SHOTS optional)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PORT = Number(process.env.PORT) || 4104;
const CONTROL = PORT + 10000;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.SHOTS || '/tmp/starbase-abtests';
mkdirSync(SHOTS, { recursive: true });
const MAILBOX = `${SHOTS}/mailbox.jsonl`;
const STUB = `${SHOTS}/provider-stub.mjs`;
rmSync(MAILBOX, { force: true });

const results = [];
const check = (name, ok, extra = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + String(extra).slice(0, 200) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── The stand-in email provider + a test-only clock, loaded into the server ──
// /connect sets RESEND_API_KEY (email connected); /due makes pending jobs due
// now (the A/B wait is at least an hour). Both only exist in this check.
const serverDir = fileURLToPath(new URL('./server/', import.meta.url));
writeFileSync(STUB, `
import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';
const real = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.resend.com/')) {
    appendFileSync(${JSON.stringify(MAILBOX)}, init.body + '\\n');
    return new Response(JSON.stringify({ id: 'e2e' }), { status: 200 });
  }
  return real(url, init);
};
createServer(async (req, res) => {
  if (req.url === '/connect') process.env.RESEND_API_KEY = 'e2e-key';
  if (req.url === '/due') {
    const { getDb } = await import(${JSON.stringify(pathToFileURL(`${serverDir}db/client.js`).href)});
    await (await getDb()).query("update jobs set run_at = now() where status = 'pending'");
  }
  res.end('ok');
}).listen(${CONTROL}, '127.0.0.1');
`);
const env = { ...process.env, STARBASE_DATA: 'memory', PORT: String(PORT), STARBASE_JOBS_EVERY_MS: '500' };
delete env.RESEND_API_KEY;
delete env.STARBASE_PUBLIC_URL;
const server = spawn(process.execPath, ['--import', pathToFileURL(STUB).href, 'server/index.js'], {
  cwd: fileURLToPath(new URL('.', import.meta.url)), env, stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
process.on('exit', () => { try { server.kill('SIGTERM'); } catch { /* gone */ } });
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
for (let i = 0; i < 60; i += 1) {
  if (await fetch(`${BASE}/api/health`).then((r) => r.ok).catch(() => false)) break;
  await sleep(250);
}
const control = (path) => fetch(`http://127.0.0.1:${CONTROL}${path}`).then((r) => r.text());
// Newsletters and press releases only (an invite email has no HTML part).
const mailbox = () => (existsSync(MAILBOX) ? readFileSync(MAILBOX, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])
  .filter((x) => x.html);
const tokenOf = (m) => (m.html.match(/\/o\/([A-Za-z0-9_-]{24})\.gif/) || [])[1];
const linkOf = (m, n) => (m.html.match(new RegExp(`href="([^"]*/c/[A-Za-z0-9_-]{24}/${n})"`)) || [])[1];

// OSM tiles are unreachable from the test sandbox; serve a flat tile.
const tileSvg = () => '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e7e3d6"/></svg>';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const tiles = (ctx) => ctx.route(/tile\.openstreetmap\.org/, (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: tileSvg() }));
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, timezoneId: 'America/Vancouver' });
await tiles(ctx);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
const textOf = async (p) => ((await p.innerText('body').catch(() => '')) || '').replace(/\s+/g, ' ');
const apiOn = (p) => (path, body) => p.evaluate(async ([pp, b]) => {
  const r = await fetch('/api' + pp, b === undefined ? {} : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b),
  });
  return { status: r.status, json: await r.json().catch(() => null), raw: '' };
}, [path, body]);
const api = apiOn(page);
const act = (name, input) => api(`/actions/${name}`, input);
const go = async (p, path) => { await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' }); await sleep(900); };
const pct = (n, of) => (of > 0 ? Math.round((100 * n) / of) : 0);
const statOf = async (id) => (await api('/blasts/stats')).json.stats.find((s) => s.id === id);

// Simplicity on a screen: words in the page (not the nav), yellow buttons,
// sideways scroll, and the smallest field / disclosure tap target.
const measure = (p) => p.evaluate(() => {
  const main = document.querySelector('main.page') || document.body;
  const words = (main.innerText || '').split(/\s+/).filter(Boolean).length;
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const yellow = [...document.querySelectorAll('.btn-primary')].filter(visible).length;
  const fields = [...main.querySelectorAll('input:not([type=checkbox]):not([type=radio]), select, textarea, button.disclose')].filter(visible);
  const minTap = fields.length ? Math.min(...fields.map((el) => el.getBoundingClientRect().height)) : null;
  return { words, yellow, overflow: document.documentElement.scrollWidth - window.innerWidth, minTap, fields: fields.length };
});

// ── 1. A desk user and a list of 60 ──
await go(page, '/signup');
await page.fill('#su-name', 'Avery Desk');
await page.fill('#su-email', 'avery@abtests.example');
await page.fill('#su-password', 'surrey-forward-2026');
await page.fill('#su-workspace', 'Imagine Surrey');
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`, { timeout: 15000 });
for (let i = 0; i < 60; i += 1) await act('subscription.add', { email: `reader${i}@example.org`, name: `Reader ${i}` });
await act('person.create', { name: 'Lin Reporter', email: 'lin@surreynow.example', tags: ['media'] });
const subs = (await api('/subscriptions')).json.subscribed;
check('60 subscribers on the list', subs === 60, subs);

// ── 2. Write an A/B newsletter while email isn't connected ──
await go(page, '/outreach/newsletter');
await page.click('button:has-text("Write newsletter")');
await page.waitForSelector('#newsletter-subject', { timeout: 5000 });
await page.fill('#newsletter-subject', 'This week in Surrey');
await page.fill('#newsletter-body', 'Hello neighbours.\n\nRead the transit plan: https://imaginesurrey.example/plan.');
let t = await textOf(page);
check('compose: a quiet "Try two subject lines", no Subject B yet', /Try two subject lines/.test(t) && !(await page.$('#newsletter-ab-subject')));
await page.click('button.ab-toggle');
await page.waitForSelector('#newsletter-ab-subject', { timeout: 3000 });
await page.fill('#newsletter-ab-subject', 'Transit plan: what Newton told us');
await page.selectOption('#newsletter-ab-pct', '20');
await page.selectOption('#newsletter-ab-wait', '1');
await page.selectOption('#newsletter-ab-metric', 'opens');
t = await textOf(page);
check('compose: Subject A / Subject B, test group, wait, winner by', /Subject A/i.test(t) && /Subject B/i.test(t) && /Test group/i.test(t) && /Wait/i.test(t) && /Winner by/i.test(t));
let m = await measure(page);
check('compose (desk): one yellow button', m.yellow === 1, JSON.stringify(m));
await shot(page, '1-compose-ab-desk');
await page.click('form.ot-compose button[type="submit"]');
await sleep(300);
t = await textOf(page);
check('not connected: the confirm says save, and that nothing is sent', /Save for 60 subscribers\?/.test(t) && /Email isn’t connected — nothing is sent/.test(t), (t.match(/Save for.{0,80}/) || [''])[0]);
await page.click('button:has-text("Yes, save")');
await sleep(1200);
t = await textOf(page);
check('not connected: "Saved — not sent", and the test waits for Send now',
  /Saved for 60 subscribers — not sent/.test(t) && /The A\/B test starts on Send now/.test(t) && !/Testing/.test(t) && !/Sent to/.test(t), t.slice(0, 300));
const blastId = (await api('/blasts')).json.blasts[0].id;
let st = await statOf(blastId);
let listed = (await api('/blasts')).json.blasts[0];
check('API agrees: saved, 0 sent, test not started', listed.status === 'queued' && listed.sent_count === 0 && st.ab.status === 'saved' && st.ab.decide_at === null, JSON.stringify({ status: listed.status, sent: listed.sent_count, ab: st.ab.status }));
check('nothing reached the email service', mailbox().length === 0, mailbox().length);
await shot(page, '2-saved-not-sent');

// ── 3. Connect email, then Send now starts the test: A and B only ──
await control('/connect');
await go(page, '/outreach/newsletter');
t = await textOf(page);
check('Not sent row: A/B test, Send now for A and B only', /A\/B test · not sent/.test(t) && /Send now · 24/i.test(t), (t.match(/Not sent.{0,160}/) || [''])[0]);
await page.click('button:has-text("Send now")');
await sleep(300);
t = await textOf(page);
check('Send now asks once, with the split', /A to 12, B to 12 now · the winner to 36 after 1 hour\?/.test(t), (t.match(/A to.{0,80}/) || [''])[0]);
await page.click('button:has-text("Yes, send")');
await sleep(1500);
t = await textOf(page);
const sent1 = mailbox();
st = await statOf(blastId);
check('the email service got A and B only: 12 + 12', sent1.length === 24
  && sent1.filter((x) => x.subject === 'This week in Surrey').length === 12
  && sent1.filter((x) => x.subject === 'Transit plan: what Newton told us').length === 12, sent1.length);
check('each email: its own pixel, tracked link, untracked unsubscribe',
  new Set(sent1.map(tokenOf)).size === 24 && sent1.every((x) => linkOf(x, 1) && /\/u\/[0-9a-f-]{36}"/.test(x.html) && !/\/c\/[^"]*\/u\//.test(x.html)));
const decideAt = new Date(st.ab.decide_at);
const wait = decideAt.getTime() - Date.now();
check('API: testing, winner picked in 1 hour', st.ab.status === 'testing' && wait > 55 * 60e3 && wait <= 60 * 60e3, JSON.stringify({ status: st.ab.status, wait }));
// The screen's own rule (AbTests.jsx fmtTime): a bare time today, "tomorrow
// <time>" or "<Mon d>, <time>" otherwise — an hour's wait can cross midnight.
const shownTime = await page.evaluate((iso) => {
  const d = new Date(iso);
  const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return t;
  const next = new Date(now);
  next.setDate(now.getDate() + 1);
  if (d.toDateString() === next.toDateString()) return `tomorrow ${t}`;
  return `${d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}, ${t}`;
}, st.ab.decide_at);
check('result: "Testing · A 0% vs B 0% opened · winner picked <time>"',
  t.includes(`Testing · A 0% vs B 0% opened · winner picked ${shownTime}`) && /A and B went to 24 of 60 subscribers/.test(t), (t.match(/Testing.{0,120}/) || [''])[0]);
check('no "not sent" or Try again for the held 36', !/36 not sent/.test(t) && !/Try again/.test(t));
await shot(page, '3-testing-result');

// ── 4. Opens and clicks from the real emails ──
const A = sent1.filter((x) => x.subject === 'This week in Surrey');
const B = sent1.filter((x) => x.subject !== 'This week in Surrey');
const hit = (path, opts) => fetch(`${BASE}${path}`, { redirect: 'manual', ...opts });
for (const x of A.slice(0, 2)) await hit(new URL(`/o/${tokenOf(x)}.gif`, BASE).pathname);
for (const x of B.slice(0, 6)) await hit(`/o/${tokenOf(x)}.gif`);
await hit(`/o/${tokenOf(B[0])}.gif`); // a second open by the same reader
const click = await hit(new URL(linkOf(B[1], 1)).pathname);
check('a click goes to the stored link (302)', click.status === 302 && click.headers.get('location') === 'https://imaginesurrey.example/plan', `${click.status} ${click.headers.get('location')}`);
const bad = await hit(`/c/${tokenOf(B[1])}/2`);
const evil = await hit(`/c/${tokenOf(B[1])}/1?to=https://evil.example/`);
check('no open redirect: unknown link 404, extra params ignored', bad.status === 404 && !bad.headers.get('location') && evil.headers.get('location') === 'https://imaginesurrey.example/plan');
const pix = await hit('/o/nonsense.gif');
check('the pixel is a gif, never cached', pix.status === 200 && pix.headers.get('content-type') === 'image/gif' && /no-store/.test(pix.headers.get('cache-control')));
st = await statOf(blastId);
check('API: A 2 of 12 opened, B 6 of 12 opened, 1 clicked', st.ab.a.opened === 2 && st.ab.b.opened === 6 && st.ab.b.clicked === 1 && st.ab.a.delivered === 12, JSON.stringify(st.ab));
await go(page, '/outreach/newsletter');
t = await textOf(page);
const live = `Testing · A ${pct(st.ab.a.opened, st.ab.a.delivered)}% vs B ${pct(st.ab.b.opened, st.ab.b.delivered)}% opened · winner picked ${shownTime}`;
check('first look: the running test, its rates as the API counts them', t.includes(live) && /B · Transit plan: what Newton told us/.test(t), (t.match(/Testing.{0,140}/) || [''])[0]);
await shot(page, '4-testing-first-look');

// ── 5. The wait ends: the winner job sends B to the other 36 ──
await control('/due');
for (let i = 0; i < 40; i += 1) {
  st = await statOf(blastId);
  if (st.ab.status === 'decided') break;
  await sleep(250);
}
const sent2 = mailbox();
check('winner B picked (50% vs 17%)', st.ab.status === 'decided' && st.ab.winner === 'b', JSON.stringify({ status: st.ab.status, winner: st.ab.winner }));
check('the other 36 got subject B, everyone exactly once', sent2.length === 60
  && sent2.slice(24).every((x) => x.subject === 'Transit plan: what Newton told us')
  && new Set(sent2.map((x) => x.to[0])).size === 60, sent2.length);
listed = (await api('/blasts')).json.blasts.find((b) => b.id === blastId);
check('API: sent to all 60', listed.status === 'sent' && listed.sent_count === 60, JSON.stringify({ s: listed.status, n: listed.sent_count }));
await go(page, '/outreach/newsletter');
t = await textOf(page);
check('first look: no test running any more', !/Testing/.test(t));
await page.click('button.ot-more:has-text("More")');
await sleep(400);
t = await textOf(page);
const statLine = `Opened ${pct(st.opened, st.delivered)}% · Clicked ${pct(st.clicked, st.delivered)}%`;
check('past sends: "Winner B · sent to everyone"', /Winner B · sent to everyone/.test(t), (t.match(/Winner.{0,40}/) || [''])[0]);
check(`past sends: "${statLine}" — of delivered, as the API counts`, t.includes(statLine) && st.delivered === 60 && st.opened === 8 && st.clicked === 1, JSON.stringify({ d: st.delivered, o: st.opened, c: st.clicked }));
check('under More: one line on Apple Mail opens', /Apple Mail can open emails by itself, so opens run high\./.test(t));
await page.locator('section[aria-label="Past sends"]').screenshot({ path: `${SHOTS}/5-winner-past-sends.png` });

// ── 6. Small lists: Press with one media contact sends normally ──
await go(page, '/outreach/press');
await page.click('button:has-text("Write press release")');
await page.waitForSelector('#press-subject', { timeout: 5000 });
await page.click('button.ab-toggle');
await sleep(200);
t = await textOf(page);
check('small list: "A/B needs at least 50 media contacts — this sends normally"', /A\/B needs at least 50 media contacts — this sends normally/.test(t) && !(await page.$('#press-ab-subject')), (t.match(/A\/B.{0,80}/) || [''])[0]);
await shot(page, '6-press-small-list-note');
await page.fill('#press-subject', 'Imagine Surrey unveils transit plan');
await page.fill('#press-body', 'FOR IMMEDIATE RELEASE https://imaginesurrey.example/news');
await page.click('form.ot-compose button[type="submit"]');
await sleep(300);
t = await textOf(page);
check('small list: the confirm is a normal send', /Send to 1 media contact\?/.test(t), (t.match(/Send to.{0,40}/) || [''])[0]);
await page.click('button:has-text("Yes, send")');
await sleep(1200);
t = await textOf(page);
const press = mailbox().slice(60);
check('small list: sent normally, one subject, tracked', /Sent to 1 media contact/.test(t) && press.length === 1 && press[0].subject === 'Imagine Surrey unveils transit plan' && tokenOf(press[0]), press.length);
await shot(page, '6-press-small-list-sent');

// ── 7. The compose screen on a phone (desk user) ──
const phone = await browser.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/Vancouver',
  storageState: await ctx.storageState(),
});
await tiles(phone);
const pp = await phone.newPage();
pp.on('pageerror', (e) => errors.push('[phone] ' + e.message));
await go(pp, '/outreach/newsletter?new=1');
await pp.waitForSelector('#newsletter-subject', { timeout: 5000 });
const closed = await measure(pp);
await pp.tap('button.ab-toggle');
await sleep(300);
const open = await measure(pp);
check('phone compose: one yellow button, no sideways scroll', closed.yellow === 1 && open.yellow === 1 && closed.overflow <= 0 && open.overflow <= 0, JSON.stringify({ closed, open }));
check('phone compose: field tap targets ≥ 48px', open.minTap >= 48 && closed.minTap >= 48, JSON.stringify({ closed: closed.minTap, open: open.minTap, fields: open.fields }));
console.log(`      words on Write newsletter (phone): ${closed.words} closed → ${open.words} with two subject lines`);
await shot(pp, '7-phone-compose-ab');
await go(pp, '/outreach/newsletter');
await pp.tap('button.ot-more:has-text("More")');
await sleep(400);
const past = await measure(pp);
check('phone past sends: no sideways scroll, one yellow button', past.overflow <= 0 && past.yellow <= 1, JSON.stringify(past));
await pp.locator('section[aria-label="Past sends"]').screenshot({ path: `${SHOTS}/8-phone-past-sends.png` });
await phone.close();

// ── 8. A volunteer on a phone reaches none of it ──
const inv = await act('member.invite', { email: 'jas@example.org', role: 'volunteer' });
const vctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/Vancouver' });
await tiles(vctx);
const vp = await vctx.newPage();
vp.on('pageerror', (e) => errors.push('[vol] ' + e.message));
await vp.goto(inv.json.joinUrl.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'domcontentloaded' });
await vp.waitForSelector('#join-name', { timeout: 8000 });
await vp.fill('#join-name', 'Jas Volunteer');
await vp.fill('#join-password', 'knock-knock-2026');
await vp.click('button[type="submit"]');
await vp.waitForURL(`${BASE}/`, { timeout: 15000 }).catch(() => {});
check('volunteer joins on a phone', new URL(vp.url()).pathname === '/', vp.url());
await go(vp, '/outreach/newsletter');
check('volunteer typing /outreach lands on Today', new URL(vp.url()).pathname === '/', vp.url());
const vapi = apiOn(vp);
const vStats = await vapi('/blasts/stats');
const vBlasts = await vapi('/blasts');
const vSend = await vapi('/actions/blast.send', { kind: 'newsletter', subject: 'x', body: 'y', ab: { subject_b: 'z', pct: 10, wait_hours: 1, metric: 'opens' } });
check('volunteer refused stats, sends, and sending (403)', vStats.status === 403 && vBlasts.status === 403 && vSend.status === 403, `${vStats.status} ${vBlasts.status} ${vSend.status}`);
const seen = JSON.stringify(await vp.evaluate(async () => {
  const out = {};
  for (const p of ['/auth/me', '/persons?limit=500', '/brief', '/shifts', '/map/doors']) {
    out[p] = await fetch('/api' + p).then((r) => r.text()).catch(() => '');
  }
  return out;
}));
const tokens = mailbox().map(tokenOf);
check('no token or subscriber email in anything a volunteer receives', tokens.every((x) => !seen.includes(x)) && !/reader\d+@example\.org/.test(seen) && !/avery@abtests/.test(seen));
const vm = await measure(vp);
check('volunteer Today at 390px: no sideways scroll', vm.overflow <= 0, vm.overflow);
await shot(vp, '9-volunteer-today');
await vctx.close();

// ── 9. The books ──
const ev = (await api('/events?since=0&limit=5000')).json.events;
const count = (a) => ev.filter((e) => e.action === a).length;
check('event log: one open event per reader (8), one click, one winner', count('public.open') === 8 && count('public.click') === 1 && count('blast.ab_winner') === 1,
  JSON.stringify({ open: count('public.open'), click: count('public.click'), winner: count('blast.ab_winner') }));
const v = (await api('/audit/verify')).json;
check('hash chain verifies', v.ok === true && v.checked > 70, JSON.stringify(v));
check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.kill('SIGTERM');
const fails = results.filter((r) => !r).length;
if (fails) console.log(serverLog.slice(-2000));
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
