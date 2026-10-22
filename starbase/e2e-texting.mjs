// Texting E2E — texts and calls through the campaign's Twilio number, against
// fresh in-memory servers this script starts itself (one after the other, on
// PORT) and a stub Twilio REST API it records:
//
//   1. Not connected: Calls → Text keeps the phone's own Messages (sms: link)
//      and says "Texting from the app needs Twilio" once; nothing reaches
//      Twilio; every webhook is refused.
//   2. Connected: a manager sets quiet hours on Texting settings and Calls
//      refuses to send inside them; the first text (their first name filled
//      in, editable) must name the campaign and goes out with "Reply STOP to
//      opt out" — exactly what the screen showed; a signed reply lands in the
//      Inbox ("Replies · 1"); unsigned ones are refused; the desk answers from
//      the thread; STOP opts the number out (tag, no Send, no card) and START
//      opts it back in. A volunteer on a 390×844 phone texts from the Calls
//      card, sees only their own conversation (screens and the JSON their
//      browser receives: no emails, nobody else's texts or phone), replies
//      from the Inbox, and calls through the campaign: "Calling your phone…",
//      Twilio's answer → press 1 → the person dialled with the campaign's
//      number as caller ID, the token spent once, the length recorded. The
//      desk sees every conversation, the profile's Texts link, and the books
//      verify. New screens are measured (words, yellow buttons, sideways
//      scroll, 48px field targets).
//
//   PORT=4105 SHOTS=/tmp/texting node e2e-texting.mjs     (after npm run build)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 4105;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.SHOTS || '/tmp/starbase-texting';
mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + String(extra).slice(0, 220) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = Date.now().toString(36);
const CAMPAIGN = 'Imagine Surrey';
const CAMPAIGN_NUMBER = '+16045550100';
const TOKEN = `e2e-auth-${tag}`;

// ── A stub Twilio REST API: records every request, accepts each one ──
const twilio = [];
let sidN = 0;
const stub = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const kind = req.url.endsWith('/Calls.json') ? 'call' : req.url.endsWith('/Messages.json') ? 'sms' : 'other';
    const sid = `${kind === 'call' ? 'CA' : 'SM'}e2e${tag}${++sidN}`;
    twilio.push({ kind, path: req.url, form: Object.fromEntries(new URLSearchParams(body)), sid, auth: req.headers.authorization || '' });
    res.writeHead(201, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ sid, status: 'queued' }));
  });
});
await new Promise((r) => stub.listen(0, '127.0.0.1', r));
const STUB = `http://127.0.0.1:${stub.address().port}`;
const texts = () => twilio.filter((r) => r.kind === 'sms');
const calls = () => twilio.filter((r) => r.kind === 'call');

// ── The Starbase server, fresh and in memory each time ──
const PROVIDER_ENV = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM', 'TWILIO_API_BASE', 'TWILIO_VOICE',
  'TWILIO_WORKSPACE', 'STARBASE_PUBLIC_URL', 'RESEND_API_KEY', 'MAIL_FROM', 'STRIPE_SECRET_KEY', 'DATABASE_URL'];
const serverLog = [];
const startServer = async (extra) => {
  const env = { ...process.env, STARBASE_DATA: 'memory', PORT: String(PORT), STARBASE_JOBS: 'off' };
  for (const k of PROVIDER_ENV) delete env[k];
  Object.assign(env, extra);
  const child = spawn(process.execPath, ['server/index.js'], { cwd: HERE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', (d) => serverLog.push(String(d)));
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`server did not start: ${serverLog.join('')}`)), 20000);
    child.stdout.on('data', (d) => { if (/starbase on/.test(String(d))) { clearTimeout(t); resolve(); } });
    child.once('exit', (code) => { clearTimeout(t); reject(new Error(`server exited ${code}: ${serverLog.join('')}`)); });
  });
  return child;
};
const stopServer = (child) => new Promise((r) => {
  if (child.exitCode !== null) { r(); return; }
  child.removeAllListeners('exit');
  child.once('exit', r);
  child.kill('SIGTERM');
});

// ── Twilio's side of the webhooks: signed as Twilio signs them ──
const sign = (token, url, params) => createHmac('sha1', token)
  .update(url + [...params].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => k + v).join(''))
  .digest('base64');
const fromTwilio = async (pathOrUrl, fields, { signed = true, token = TOKEN } = {}) => {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${BASE}${pathOrUrl}`;
  const params = new URLSearchParams(fields);
  const headers = { 'content-type': 'application/x-www-form-urlencoded' };
  if (signed) headers['x-twilio-signature'] = sign(token, url, params);
  const r = await fetch(url, { method: 'POST', headers, body: params.toString() });
  return { status: r.status, type: r.headers.get('content-type') || '', text: await r.text() };
};
let inN = 0;
const inbound = (from, body, opts) => fromTwilio('/api/public/twilio/sms',
  { From: from, To: CAMPAIGN_NUMBER, Body: body, MessageSid: `SMin${tag}${++inN}`, AccountSid: `ACe2e${tag}` }, opts);

// ── The browser ──
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
  page.on('console', (m) => { if (m.type() === 'error' && /key|unique|warning/i.test(m.text())) errors.push(`[${who}] ${m.text()}`); });
  return {
    shot: (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: false }),
    full: (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true }),
    text: async () => ((await page.innerText('main.page').catch(() => page.innerText('body').catch(() => ''))) || '').replace(/\s+/g, ' '),
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
const measure = (page, sel = null) => page.evaluate((targets) => {
  const main = document.querySelector('main.page') || document.body;
  const wc = (s) => String(s || '').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  // A closed select shows only its chosen option, not the whole list.
  const hidden = [...main.querySelectorAll('select')].reduce((n, s) => n + wc(s.innerText) - wc(s.selectedOptions[0]?.text), 0);
  const words = wc(main.innerText) - hidden;
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const yellow = [...document.querySelectorAll('.btn-primary')].filter(visible).length;
  const overflow = document.documentElement.scrollWidth - window.innerWidth;
  let minTap = null;
  let minWho = '';
  if (targets) {
    for (const el of document.querySelectorAll(targets)) {
      if (!visible(el)) continue;
      const h = el.getBoundingClientRect().height;
      if (minTap == null || h < minTap) { minTap = h; minWho = el.outerHTML.slice(0, 80); }
    }
  }
  return { words, yellow, overflow, minTap, minWho };
}, sel);
const FIELDS = 'main.page input:not([type=checkbox]), main.page select, main.page textarea, main.page button, main.page a.btn, main.page .tx-quiet, main.page .pp-row, main.page .tx-pflink';
const CARD = '.tx-send textarea, .tx-send button, .tx-call input, .tx-call button, .tx-done a, .tx-replies, .tx-quiet, .cl-rate button';
const measured = [];
const simple = async (page, name, sel = FIELDS) => {
  const m = await measure(page, sel);
  measured.push({ name, ...m });
  check(`${name}: ≤1 yellow, no sideways scroll, targets ≥48px`, m.yellow <= 1 && m.overflow <= 0 && (m.minTap == null || m.minTap >= 47.5),
    `words=${m.words} yellow=${m.yellow} overflow=${m.overflow} minTap=${m.minTap == null ? '-' : Math.round(m.minTap)} ${m.minTap < 47.5 ? m.minWho : ''}`);
  return m;
};
const until = async (fn, ms = 15000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await sleep(400);
  }
};
const count = (hay, needle) => hay.split(needle).length - 1;
const signup = async (page, D, name, email) => {
  await D.go('/signup');
  await page.fill('#su-name', name);
  await page.fill('#su-email', email);
  await page.fill('#su-password', 'surrey-forward-2026');
  await page.fill('#su-workspace', CAMPAIGN);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  return (await D.api('/auth/me')).json;
};

// ═════ 1. Twilio not connected ═════
let server = await startServer({ TWILIO_API_BASE: STUB });
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/Vancouver' });
  await tiles(ctx);
  const page = await ctx.newPage();
  const D = helpers(page, 'desk-off');
  const me = await signup(page, D, 'Riley Organizer', `riley.${tag}@example.org`);
  check('not connected: desk signed up', me?.workspace?.name === CAMPAIGN, me?.workspace?.name);
  const harjit = (await D.api('/actions/person.create', { name: 'Harjit Example', phone: '604-555-0141', city: 'Surrey' })).json.person;

  await D.go('/calls?channel=text&q=Harjit');
  await page.waitForSelector('.cl-card', { timeout: 8000 }).catch(() => {});
  let t = await D.text();
  const sms = await page.locator('.cl-card a.cl-call[href^="sms:"]').count();
  check('not connected: Text keeps the phone\'s own Messages (sms: link)', sms === 1 && (await page.locator('.tx-send').count()) === 0, `sms links=${sms}`);
  check('not connected: says "Texting from the app needs Twilio" once', count(t, 'Texting from the app needs Twilio') === 1, t.slice(0, 200));
  const status = (await D.api('/texting/status')).json;
  check('not connected: the server agrees (no texts, no calls)', status?.sms === false && status?.voice === false, JSON.stringify(status));
  const refused = await D.api('/actions/text.send', { person_id: harjit.id, body: `Hi Harjit, it's Riley with ${CAMPAIGN}.` });
  check('not connected: a send is refused, plainly', refused.status === 409 && /needs Twilio/.test(refused.json?.error), `${refused.status} ${refused.json?.error}`);
  await D.shot('01-calls-text-not-connected');
  await simple(page, 'Calls · Text, not connected (phone)', CARD + ', .cl-card a.cl-call');

  await D.go('/calls?q=Harjit');
  await page.waitForSelector('.cl-card', { timeout: 8000 }).catch(() => {});
  check('not connected: Call keeps the phone\'s own dialler (tel: link)',
    (await page.locator('.cl-card a.cl-call[href^="tel:"]').count()) === 1 && (await page.locator('.tx-call').count()) === 0);
  await D.go('/inbox');
  t = await D.text();
  check('not connected: Inbox says it once, with an empty list', count(t, 'Texting from the app needs Twilio') === 1 && /No texts yet\./.test(t), t.slice(0, 160));
  const hook = await inbound('+16045550141', 'hello', { token: 'any-token' });
  check('not connected: no webhook is accepted (nothing to verify it with)', hook.status === 403, hook.status);
  check('not connected: nothing reached Twilio', twilio.length === 0, twilio.length);
  await ctx.close();
}
await stopServer(server);

// ═════ 2. Twilio connected ═════
server = await startServer({
  TWILIO_ACCOUNT_SID: `ACe2e${tag}`, TWILIO_AUTH_TOKEN: TOKEN, TWILIO_FROM: CAMPAIGN_NUMBER,
  STARBASE_PUBLIC_URL: BASE, TWILIO_API_BASE: STUB,
});
const deskCtx = await browser.newContext({ viewport: { width: 1360, height: 900 }, timezoneId: 'America/Vancouver' });
await tiles(deskCtx);
const page = await deskCtx.newPage();
const D = helpers(page, 'desk');
const me = await signup(page, D, 'Riley Organizer', `riley.${tag}@example.org`);
check('connected: desk signed up', me?.workspace?.name === CAMPAIGN);
const P = {};
const mk = async (key, data) => { P[key] = (await D.api('/actions/person.create', { city: 'Surrey', ...data })).json.person; };
await mk('harjit', { name: 'Harjit Example', phone: '604-555-0141' });
await mk('maya', { name: 'Maya Example', phone: '(604) 555-0142' });
await mk('grace', { name: 'Grace Example', phone: '604 555 0143', email: `grace.${tag}@example.org` });
await mk('dev', { name: 'Dev Example', phone: '604-555-0144', email: `dev.${tag}@example.org` });
check('connected: four people with phones', Object.values(P).every((p) => p?.id));
const status = (await D.api('/texting/status')).json;
check('connected: texts and calls on', status?.sms === true && status?.voice === true, JSON.stringify(status));

// ── Texting settings: quiet hours are the server's ──
const vanHour = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver', hour: 'numeric', hourCycle: 'h23' }).format(new Date())) % 24;
const [qFrom, qUntil] = vanHour + 2 <= 24 ? [vanHour + 1, vanHour + 2] : [0, 1];
await D.go('/inbox');
await page.locator('main.page').getByRole('button', { name: 'More' }).click();
await page.getByRole('link', { name: 'Texting settings' }).click();
await page.waitForURL(`${BASE}/inbox/settings`, { timeout: 8000 }).catch(() => {});
await sleep(600);
let t = await D.text();
check('settings: says what is connected', /Texts\s*On · 604-555-0100/i.test(t) && /Calls\s*Through the campaign/i.test(t), t.slice(0, 200));
await simple(page, 'Texting settings (desk)');
await D.shot('02-settings');
await page.getByLabel('Texts and calls from').selectOption(String(qFrom));
await page.getByLabel('Until', { exact: true }).selectOption(String(qUntil));
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForSelector('text=✓ Saved', { timeout: 8000 }).catch(() => {});
const saved = (await D.api('/texting/settings')).json;
check('settings: Saved means saved', /✓ Saved/.test(await D.text()) && saved.settings.allow_from === qFrom && saved.settings.allow_until === qUntil,
  JSON.stringify(saved.settings));
await D.go('/calls?channel=text&q=Harjit');
await page.waitForSelector('.tx-send', { timeout: 8000 }).catch(() => {});
t = await D.text();
const sendBtn = page.locator('.tx-send button.tx-go');
check('quiet hours: the card says so and Send is off', /Quiet hours · texts go out/.test(t) && await sendBtn.isDisabled().catch(() => false), t.slice(0, 220));
const n0 = twilio.length;
const quiet = await D.api('/actions/text.send', { person_id: P.harjit.id, body: `Hi Harjit, it's Riley with ${CAMPAIGN}.` });
check('quiet hours: the server refuses, nothing reaches Twilio', quiet.status === 409 && /Quiet hours/.test(quiet.json?.error) && twilio.length === n0,
  `${quiet.status} ${quiet.json?.error}`);
await D.shot('03-calls-quiet-hours');
check('settings: any time, for the rest of this run', (await D.api('/actions/texting.settings', { allow_from: 0, allow_until: 24 })).status === 200);

// ── The first text, from the Calls card ──
await D.go('/calls?channel=text&q=Harjit');
await page.waitForSelector('.tx-send textarea', { timeout: 8000 }).catch(() => {});
const prefilled = await page.locator('.tx-send textarea').inputValue().catch(() => '');
check('card: the message is filled in with their first name', /^Hi Harjit, it's Riley with Imagine Surrey\./.test(prefilled), prefilled);
check('card: the first text shows the line it will end with', (await page.locator('.tx-foot').innerText().catch(() => '')) === 'Reply STOP to opt out');
check('card: no sms: link once Twilio is connected', (await page.locator('.cl-card a[href^="sms:"]').count()) === 0);
await page.locator('.tx-send textarea').fill('Hi Harjit, can we count on you?');
t = await D.text();
check('card: a first text must name the campaign (Send off until it does)', /Say it’s Imagine Surrey in the first text/.test(t) && await sendBtn.isDisabled(), t.slice(0, 200));
const typed = "Hi Harjit, it's Riley with Imagine Surrey. Can we count on your support?";
await page.locator('.tx-send textarea').fill(typed);
await simple(page, 'Calls · Text card, connected (desk)', CARD);
await D.shot('04-calls-text-card');
await sendBtn.click();
await page.waitForSelector('.tx-done', { timeout: 8000 }).catch(() => {});
const doneText = await page.locator('.tx-done').innerText().catch(() => '');
const first = texts().at(-1);
const card = (await D.api(`/texting/people/${P.harjit.id}`)).json;
const harjitConv = card?.conversation?.id;
let thread = (await D.api(`/texting/conversations/${harjitConv}`)).json;
check('first text: from the campaign number, to Harjit, ends with the STOP line',
  first?.form.To === '+16045550141' && first.form.From === CAMPAIGN_NUMBER && first.form.Body === `${typed}\nReply STOP to opt out`, JSON.stringify(first?.form));
check('first text: the screen says Sent only because the server sent it', /Sent to Harjit/.test(doneText)
  && thread?.messages?.[0]?.status === 'sent' && thread.messages[0].body === first.form.Body && thread.messages[0].first === true, doneText);
check('first text: one tap, one text', texts().length === 1, texts().length);
check('first text: Twilio is told where to report delivery',
  first?.form.StatusCallback === `${BASE}/api/public/twilio/sms-status/${thread?.messages?.[0]?.id}`, first?.form.StatusCallback);
await D.shot('05-calls-text-sent');

// ── A reply comes in (signed); unsigned ones are refused ──
const before = (await D.api(`/texting/conversations/${harjitConv}`)).json.messages.length;
const unsigned = await inbound('+16045550141', 'forged reply', { signed: false });
const forged = await inbound('+16045550141', 'forged reply', { token: 'not-the-token' });
check('webhook: unsigned and wrongly signed replies are refused', unsigned.status === 403 && forged.status === 403, `${unsigned.status} ${forged.status}`);
const reply = await inbound('+16045550141', 'Yes, put me down for a sign');
check('webhook: a signed reply is taken, and nothing is sent back', reply.status === 200 && /text\/xml/.test(reply.type) && /<Response><\/Response>/.test(reply.text), reply.text);
thread = (await D.api(`/texting/conversations/${harjitConv}`)).json;
check('webhook: the reply landed once in Harjit\'s conversation', thread.messages.length === before + 1 && thread.messages.at(-1).direction === 'in'
  && !thread.messages.some((m) => /forged/.test(m.body)));
const delivered = await fromTwilio(`/api/public/twilio/sms-status/${thread.messages[0].id}`, { MessageSid: first.sid, MessageStatus: 'delivered' });
check('webhook: the delivery report is recorded', delivered.status === 204
  && (await D.api(`/texting/conversations/${harjitConv}`)).json.messages[0].status === 'delivered', delivered.status);

await D.go('/calls?channel=text&q=Harjit');
await page.waitForSelector('.tx-replies', { timeout: 8000 }).catch(() => {});
const replies = (await page.locator('.tx-replies').innerText().catch(() => '')).replace(/\s+/g, ' ');
check('Calls: a quiet "Replies · 1" link', /^Replies · 1$/i.test(replies), replies);
await page.locator('.tx-replies').click();
await page.waitForURL(`${BASE}/inbox`, { timeout: 8000 }).catch(() => {});
await page.waitForSelector('.tx-row', { timeout: 8000 }).catch(() => {});
t = await D.text();
check('Inbox: Harjit, new, with his reply', (await page.locator('.tx-row.is-new').count()) === 1 && /Harjit Example/.test(t) && /Yes, put me down for a sign/.test(t), t.slice(0, 200));
await simple(page, 'Inbox (desk)');
await D.shot('06-inbox-desk');
await page.locator('.tx-row').first().click();
await page.waitForURL(`${BASE}/inbox/${harjitConv}`, { timeout: 8000 }).catch(() => {});
await page.waitForSelector('.tx-bubble', { timeout: 8000 }).catch(() => {});
await sleep(800);
t = await D.text();
check('thread: both texts, the first one Delivered', (await page.locator('.tx-bubble').count()) === 2 && /Delivered/.test(t), t.slice(0, 240));
const st = (await D.api('/texting/status')).json;
check('thread: opening it marks the reply read', st.unread === 0, JSON.stringify(st));
const answer = 'Great, we will bring it Saturday.';
await page.locator('.tx-reply textarea').fill(answer);
await simple(page, 'Thread (desk)');
await page.locator('.tx-reply .btn-primary').click();
await until(async () => (await page.locator('.tx-bubble').count()) === 3, 8000);
check('thread: the reply went out as typed (no footer after the first)', texts().at(-1)?.form.Body === answer && (await page.locator('.tx-bubble').count()) === 3
  && /Sent/.test(await page.locator('.tx-bubble').last().innerText()), texts().at(-1)?.form.Body);
await D.shot('07-thread-desk');

// ── STOP and START ──
const mayaFirst = await D.api('/actions/text.send', { person_id: P.maya.id, body: `Hi Maya, it's Riley with ${CAMPAIGN}.` });
check('Maya: first text sent', mayaFirst.json?.sent === true, JSON.stringify(mayaFirst.json));
const mayaConv = mayaFirst.json?.conversation_id;
const nStop = twilio.length;
check('STOP: taken', (await inbound('+16045550142', 'Stop')).status === 200);
let maya = (await D.api(`/persons/${P.maya.id}`)).json.person;
const again = await D.api('/actions/text.send', { person_id: P.maya.id, body: 'One more?' });
check('STOP: tagged do-not-text, and the server refuses to text her', maya.tags.includes('do-not-text') && again.status === 409, `${maya.tags} ${again.status}`);
check('STOP: nothing went out — not even an automatic reply', twilio.length === nStop, twilio.length - nStop);
await D.go('/calls?channel=text&q=Maya');
t = await D.text();
check('STOP: she drops off the text list', /No one to text yet\./.test(t) && (await page.locator('.tx-send').count()) === 0, t.slice(0, 160));
await D.go(`/inbox/${mayaConv}`);
await page.waitForSelector('.tx-bubble', { timeout: 8000 }).catch(() => {});
t = await D.text();
check('STOP: the thread says so, with no reply box', /Opted out — no more texts/.test(t) && (await page.locator('.tx-reply textarea').count()) === 0, t.slice(-160));
await D.shot('08-thread-stop');
check('START: taken', (await inbound('+16045550142', 'START')).status === 200);
maya = (await D.api(`/persons/${P.maya.id}`)).json.person;
check('START: opted back in', !maya.tags.includes('do-not-text') && (await D.api(`/texting/people/${P.maya.id}`)).json.opted_out === false, maya.tags);

// ── The desk places a call too (so a volunteer must never see this phone) ──
const deskCall = await D.api('/actions/call.start', { person_id: P.harjit.id, my_phone: '604-555-0178' });
check('desk call: rings the desk member first', deskCall.json?.call?.status === 'calling_you' && calls().at(-1)?.form.To === '+16045550178', JSON.stringify(deskCall.json));

// ═════ 3. A volunteer on a phone ═════
const invite = await D.api('/actions/member.invite', { email: `val.${tag}@example.org`, role: 'volunteer' });
check('invite: a join link', /\/join\/[0-9a-f]{48}$/.test(invite.json?.joinUrl || ''), invite.json?.joinUrl);
const volCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/Vancouver' });
await tiles(volCtx);
const vPage = await volCtx.newPage();
const V = helpers(vPage, 'vol');
const received = [];
vPage.on('response', async (r) => {
  if (!r.url().includes('/api/')) return;
  try { received.push({ url: r.url(), body: await r.text() }); } catch { /* redirects, aborted */ }
});
await V.go(new URL(invite.json.joinUrl).pathname);
await vPage.fill('#join-name', 'Val Volunteer');
await vPage.fill('#join-password', 'knock-knock-2026');
await vPage.click('button[type="submit"]');
await vPage.waitForURL(`${BASE}/`, { timeout: 15000 }).catch(() => {});
check('volunteer: joined', new URL(vPage.url()).pathname === '/', vPage.url());

await V.go('/calls?channel=text&q=Grace');
await vPage.waitForSelector('.tx-send textarea', { timeout: 8000 }).catch(() => {});
const vPre = await vPage.locator('.tx-send textarea').inputValue().catch(() => '');
check('volunteer card: filled in with Grace and their own name', /^Hi Grace, it's Val with Imagine Surrey\./.test(vPre), vPre);
check('volunteer: no "Replies" link before any conversation', (await vPage.locator('.tx-replies').count()) === 0);
await simple(vPage, 'Calls · Text card (volunteer, 390px)', CARD);
await V.shot('09-vol-calls-text');
await vPage.locator('.tx-send button.tx-go').click();
await vPage.waitForSelector('.tx-done', { timeout: 8000 }).catch(() => {});
const vDone = await vPage.locator('.tx-done').innerText().catch(() => '');
const graceText = texts().at(-1);
check('volunteer: Sent to Grace — from the campaign number, with the STOP line', /Sent to Grace/.test(vDone)
  && graceText?.form.To === '+16045550143' && graceText.form.From === CAMPAIGN_NUMBER && /\nReply STOP to opt out$/.test(graceText.form.Body), vDone);
await V.shot('10-vol-text-sent');

const mine = (await V.api('/texting/mine')).json;
const graceConv = mine?.conversations?.[0]?.id;
check('volunteer: their inbox holds only their own conversation', mine?.conversations?.length === 1 && mine.conversations[0].person_name === 'Grace Example',
  JSON.stringify(mine?.conversations?.map((c) => c.person_name)));
const vAll = await V.api('/texting/all');
const vOther = await V.api(`/texting/conversations/${harjitConv}`);
const vSettings = await V.api('/texting/settings');
const vProfile = await V.api(`/texting/people/${P.harjit.id}/conversations`);
const vReply = await V.api('/actions/text.reply', { conversation_id: harjitConv, body: 'hi' });
check('volunteer: refused every conversation but their own', vAll.status === 403 && vOther.status === 404 && vSettings.status === 403
  && vProfile.status === 403 && vReply.status === 404, `${vAll.status} ${vOther.status} ${vSettings.status} ${vProfile.status} ${vReply.status}`);
await V.go('/inbox/settings');
check('volunteer: Texting settings is desk-only (back to Today)', new URL(vPage.url()).pathname === '/', vPage.url());

check('a reply from Grace', (await inbound('+16045550143', 'Who is this?')).status === 200);
await V.go('/calls?channel=text&q=Grace');
await vPage.waitForSelector('.tx-replies', { timeout: 8000 }).catch(() => {});
const vReplies = (await vPage.locator('.tx-replies').innerText().catch(() => '')).replace(/\s+/g, ' ');
check('volunteer Calls: "Replies · 1"', /^Replies · 1$/i.test(vReplies), vReplies);
await vPage.locator('.tx-replies').click();
await vPage.waitForURL(`${BASE}/inbox`, { timeout: 8000 }).catch(() => {});
await vPage.waitForSelector('.tx-row', { timeout: 8000 }).catch(() => {});
t = await V.text();
check('volunteer Inbox: only Grace', (await vPage.locator('.tx-row').count()) === 1 && /Grace Example/.test(t) && !/Harjit|Maya/.test(t), t.slice(0, 200));
await simple(vPage, 'Inbox (volunteer, 390px)');
await V.shot('11-vol-inbox');
await vPage.locator('.tx-row').first().click();
await vPage.waitForURL(`${BASE}/inbox/${graceConv}`, { timeout: 8000 }).catch(() => {});
await vPage.waitForSelector('.tx-reply textarea', { timeout: 8000 }).catch(() => {});
const vAnswer = "It's Val, a volunteer with Imagine Surrey.";
await vPage.locator('.tx-reply textarea').fill(vAnswer);
await simple(vPage, 'Thread (volunteer, 390px)');
await vPage.locator('.tx-reply .btn-primary').click();
await until(async () => (await vPage.locator('.tx-bubble').count()) === 3, 8000);
check('volunteer: replied from the Inbox', texts().at(-1)?.form.Body === vAnswer && texts().at(-1).form.To === '+16045550143'
  && (await vPage.locator('.tx-bubble').count()) === 3, texts().at(-1)?.form.Body);
await V.shot('12-vol-thread');

// ── Call through the campaign ──
await V.go('/calls?q=Dev');
await vPage.waitForSelector('.tx-call', { timeout: 8000 }).catch(() => {});
const callBtn = vPage.locator('.tx-call button.cl-call');
check('volunteer call: asks for their own phone once, Call off until then',
  (await vPage.getByLabel('Your phone').count()) === 1 && await callBtn.isDisabled().catch(() => false) && (await vPage.locator('.cl-card a[href^="tel:"]').count()) === 0);
await vPage.getByLabel('Your phone').fill('604-555-0177');
await simple(vPage, 'Calls · Phone card (volunteer, 390px)', CARD);
await V.shot('13-vol-call-card');
const nCalls = calls().length;
await callBtn.click();
await vPage.waitForSelector('.tx-live', { timeout: 8000 }).catch(() => {});
t = await V.text();
const ring = calls().at(-1);
check('call: "Calling your phone… answer and press 1 to connect"', /Calling your phone… answer and press 1 to connect/.test(t), t.slice(0, 200));
check('call: Twilio rings the volunteer\'s phone from the campaign number', calls().length === nCalls + 1 && ring.form.To === '+16045550177'
  && ring.form.From === CAMPAIGN_NUMBER && new RegExp(`^${BASE}/api/public/twilio/voice/[0-9a-f]{48}$`).test(ring.form.Url), JSON.stringify(ring?.form));
await V.shot('14-vol-calling-your-phone');
const callId = ring.form.StatusCallback.split('/').pop();
const answered = await fromTwilio(ring.form.Url, { CallSid: ring.sid, CallStatus: 'in-progress', AccountSid: `ACe2e${tag}` });
check('call: they answer — asked to press 1, nobody dialled yet', /<Gather numDigits="1"/.test(answered.text) && !/6045550144/.test(answered.text), answered.text);
const noSig = await fromTwilio(`${ring.form.Url}/connect`, { CallSid: ring.sid, Digits: '1' }, { signed: false });
check('call: an unsigned connect is refused', noSig.status === 403, noSig.status);
const connected = await fromTwilio(`${ring.form.Url}/connect`, { CallSid: ring.sid, Digits: '1', AccountSid: `ACe2e${tag}` });
check('call: press 1 → Dev is dialled with the campaign number as caller ID', new RegExp(`<Dial callerId="\\${CAMPAIGN_NUMBER}"`).test(connected.text)
  && /<Number>\+16045550144<\/Number>/.test(connected.text) && !/5550177/.test(connected.text), connected.text);
const reused = await fromTwilio(`${ring.form.Url}/connect`, { CallSid: ring.sid, Digits: '1', AccountSid: `ACe2e${tag}` });
check('call: the token works once', !/<Dial/.test(reused.text) && /<Hangup\/>/.test(reused.text), reused.text);
const connecting = await until(async () => /Connecting you to Dev…/.test(await V.text()), 8000);
check('call: the screen follows ("Connecting you to Dev…")', !!connecting, (await V.text()).slice(0, 200));
await fromTwilio(`/api/public/twilio/voice-dial/${callId}`, { CallSid: ring.sid, DialCallStatus: 'completed', DialCallDuration: '95' });
await fromTwilio(`/api/public/twilio/voice-status/${callId}`, { CallSid: ring.sid, CallStatus: 'completed', CallDuration: '110' });
const endedLine = await until(async () => /Call ended · 2 min/.test(await V.text()), 8000);
const callRow = (await V.api(`/texting/calls/${callId}`)).json?.call;
check('call: ended, length recorded, and the screen says what the server has', !!endedLine && callRow?.status === 'talked' && callRow.talk_s === 95 && callRow.call_s === 110,
  JSON.stringify(callRow));
check('call: rate after the call — the rating buttons are right there', (await vPage.locator('.cl-rate button').count()) >= 4);
await V.shot('15-vol-call-ended');

// ── What the volunteer's browser received ──
const all = received.map((r) => r.body).join('\n');
const textingBodies = received.filter((r) => r.url.includes('/api/texting/')).map((r) => r.body).join('\n');
check('volunteer JSON: no emails in anything texting sent them', !textingBodies.includes('@'), textingBodies.match(/.{20}@.{20}/)?.[0]);
check('volunteer JSON: nobody else\'s conversations or texts', !all.includes(harjitConv) && !all.includes(mayaConv) && !all.includes('put me down for a sign') && !all.includes(answer));
check('volunteer JSON: nobody else\'s own phone', !all.includes('5550178') && !all.includes('555-0178'));
check('volunteer JSON: no other person\'s email anywhere', !all.includes(`grace.${tag}@`) && !all.includes(`dev.${tag}@`));

// ═════ 4. The desk sees it all ═════
await D.go('/inbox');
await page.waitForSelector('.tx-row', { timeout: 8000 }).catch(() => {});
t = await D.text();
check('desk Inbox: every conversation, the volunteer\'s too', (await page.locator('.tx-row').count()) === 3 && /Grace Example/.test(t) && /Maya Example/.test(t), t.slice(0, 240));
await D.go(`/inbox/${graceConv}`);
await page.waitForSelector('.tx-bubble', { timeout: 8000 }).catch(() => {});
check('desk thread: says whose conversation it is', /604-555-0143\s*·\s*Val/.test(await D.text()), (await D.text()).slice(0, 160));
await D.go('/people');
await page.locator('main.page').getByRole('button', { name: 'More' }).click();
check('People → More → Inbox', await page.getByRole('link', { name: 'Inbox' }).isVisible().catch(() => false));
await D.go(`/people/${P.harjit.id}`);
const pf = page.locator('.tx-pflink');
check('profile: a Texts link with the count', /Texts\s*3/.test(await pf.innerText().catch(() => '')), await pf.innerText().catch(() => ''));
await pf.click();
await page.waitForURL(`${BASE}/inbox/${harjitConv}`, { timeout: 8000 }).catch(() => {});
check('profile: the link opens Harjit\'s conversation', page.url() === `${BASE}/inbox/${harjitConv}`, page.url());
await D.go('/inbox/settings');
await page.getByRole('button', { name: /Callers’ phones/ }).click();
t = await D.text();
check('settings: a manager sees callers\' phones', /Val Volunteer\s*604-555-0177/.test(t) && /Riley Organizer\s*604-555-0178/.test(t), t.slice(-200));
await D.shot('16-settings-callers');

const audit = (await D.api('/audit/verify')).json;
check('the books verify after every text, reply and call', audit?.ok === true, JSON.stringify(audit));
check('no page errors', errors.length === 0, errors.join(' | '));

console.log('\nScreens measured:');
for (const m of measured) console.log(`  ${m.name}: words=${m.words} yellow=${m.yellow} overflow=${m.overflow} minTap=${m.minTap == null ? '-' : Math.round(m.minTap)}`);
await browser.close();
await stopServer(server);
stub.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
