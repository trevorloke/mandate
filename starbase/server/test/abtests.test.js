// A/B subject lines with open and click tracking (server/ext/abtests):
// per-recipient tokens, the HTML part's pixel and tracked links, the click
// redirect that only goes where the send said, the untracked unsubscribe
// link, A/B group sizes, the winner job, and the not-connected path.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, Client } from './helpers.js';
import { app } from '../index.js';
import { runDueJobs } from '../lib/jobs.js';

const tag = Math.random().toString(36).slice(2, 8);
let db;

before(async () => {
  db = await freshDb();
});

// Stand in for the email provider: RESEND_API_KEY set and fetch answered
// here, both restored after. `fail` picks addresses the provider rejects.
const withEmail = async (fn, { fail = () => false } = {}) => {
  const sent = [];
  const realFetch = globalThis.fetch;
  const hadKey = Object.hasOwn(process.env, 'RESEND_API_KEY');
  const oldKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 'test-key';
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.resend.com/')) {
      const msg = JSON.parse(init.body);
      if (fail(msg.to[0])) return new Response('mailbox unavailable', { status: 500 });
      sent.push(msg);
      return new Response(JSON.stringify({ id: 'msg' }), { status: 200 });
    }
    return realFetch(url, init);
  };
  try {
    return await fn(sent);
  } finally {
    globalThis.fetch = realFetch;
    if (hadKey) process.env.RESEND_API_KEY = oldKey; else delete process.env.RESEND_API_KEY;
  }
};

// No provider, and fetch must not be called at all.
const withoutEmail = async (fn) => {
  const realFetch = globalThis.fetch;
  const hadKey = Object.hasOwn(process.env, 'RESEND_API_KEY');
  const oldKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.resend.com/')) calls += 1;
    return realFetch(url, init);
  };
  try {
    return await fn(() => calls);
  } finally {
    globalThis.fetch = realFetch;
    if (hadKey) process.env.RESEND_API_KEY = oldKey;
  }
};

const pub = (path) => app.request(path, { redirect: 'manual' });

const tokenOf = (msg) => (msg.html.match(/\/o\/([A-Za-z0-9_-]{24})\.gif/) || [])[1];
const linkOf = (msg, n) => {
  const m = msg.html.match(new RegExp(`href="([^"]*/c/[A-Za-z0-9_-]{24}/${n})"`));
  return m ? m[1] : null;
};
const pathOf = (url) => new URL(url, 'http://local').pathname;

const workspace = async (name, n, { media = 0 } = {}) => {
  const c = new Client();
  const r = await c.signup({ workspaceName: `${name} ${tag}`, email: `ab.${name.toLowerCase().replace(/\W+/g, '')}.${tag}@example.org` });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  for (let i = 0; i < n; i += 1) {
    const s = await c.action('subscription.add', { email: `reader${i}.${tag}@example.org`, name: `Reader ${i}` });
    assert.equal(s.status, 200);
  }
  for (let i = 0; i < media; i += 1) {
    await c.createPerson(`Desk ${i}`, { email: `desk${i}.${tag}@news.example`, tags: ['media'] });
  }
  return { c, ws: r.json.workspace.id };
};

const rows = async (blastId) => (await db.query(
  `select email, status, token, ab_group, opens, clicks, first_open_at, first_click_at
   from blast_recipients where blast_id = $1 order by email`, [blastId],
)).rows;
const events = async (c, action) => (await c.get('/api/events?since=0&limit=5000')).json.events.filter((e) => e.action === action);
const statsFor = async (c, id) => (await c.get('/api/blasts/stats')).json.stats.find((s) => s.id === id);
const dueNow = (ws) => db.query(`update jobs set run_at = now() where workspace_id = $1 and kind = 'abtests.winner' and status = 'pending'`, [ws]);

const BODY = 'Hello neighbours.\n\nRead the plan: https://imaginesurrey.example/plan.\nRSVP (https://imaginesurrey.example/rsvp?x=1) today!';

let T; // the tracked newsletter from the first test, reused below
test('every recipient gets its own token; the HTML part has a pixel and tracked links; the text part is unchanged', async () => {
  const { c, ws } = await workspace('Tracked', 3);
  await withEmail(async (sent) => {
    const r = await c.action('blast.send', { kind: 'newsletter', subject: 'Tracked news', body: BODY });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.blast.status, 'sent');
    assert.deepEqual(r.json.counts, { total: 3, sent: 3, failed: 0, queued: 0 });
    assert.equal(r.json.blast.ab, undefined, 'no test on a plain send');
    assert.equal(sent.length, 3);
    const subs = (await c.get('/api/subscriptions')).json.subscriptions;
    const tokens = sent.map(tokenOf);
    assert.ok(tokens.every(Boolean), 'each email has an open pixel');
    assert.equal(new Set(tokens).size, 3, 'tokens are unique per recipient');
    for (const m of sent) {
      assert.match(m.text, /^Hello neighbours\./, 'plain text part as before');
      assert.doesNotMatch(m.text, /\/c\/|\/o\//, 'the text part is not tracked');
      const sub = subs.find((s) => s.email === m.to[0]);
      assert.ok(m.text.includes(`/u/${sub.id}`));
      assert.match(m.html, /Hello neighbours\./);
      // Unsubscribe: the recipient's own /u/ link, never rewritten.
      assert.ok(m.html.includes(`/u/${sub.id}"`), 'html carries the own unsubscribe link');
      const t = tokenOf(m);
      assert.ok(linkOf(m, 1).endsWith(`/c/${t}/1`), 'link 1 rewritten');
      assert.ok(linkOf(m, 2).endsWith(`/c/${t}/2`), 'link 2 rewritten');
      assert.equal(linkOf(m, 3), null, 'only the two message links are tracked');
      assert.doesNotMatch(m.html, /href="https:\/\/imaginesurrey\.example/, 'no raw message links left');
      assert.ok(m.html.includes('>https://imaginesurrey.example/plan</a>.'), 'a sentence full stop stays out of the link');
    }
    const stored = (await db.query('select n, url from blast_links where blast_id = $1 order by n', [r.json.blast.id])).rows;
    assert.deepEqual(stored, [
      { n: 1, url: 'https://imaginesurrey.example/plan' },
      { n: 2, url: 'https://imaginesurrey.example/rsvp?x=1' },
    ]);
    const saved = await rows(r.json.blast.id);
    assert.deepEqual(saved.map((x) => x.token).sort(), [...tokens].sort(), 'tokens stored on the rows');
    T = { c, ws, id: r.json.blast.id, sent: [...sent], subs };
  });
});

test('the pixel records an open once: one event, later opens only counted', async () => {
  const { c, id, sent } = T;
  const tok = tokenOf(sent[0]);
  const first = await pub(`/o/${tok}.gif`);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('content-type'), 'image/gif');
  assert.match(first.headers.get('cache-control'), /no-store/);
  const gif = Buffer.from(await first.arrayBuffer());
  assert.equal(gif.subarray(0, 6).toString(), 'GIF89a');
  assert.deepEqual([gif.readUInt16LE(6), gif.readUInt16LE(8)], [1, 1], 'a 1×1 gif');
  await pub(`/o/${tok}.gif`);
  let row = (await rows(id)).find((x) => x.token === tok);
  assert.equal(row.opens, 1, 'a reload within 30 seconds is the same open');
  // Later opens are counted on the row.
  const firstAt = row.first_open_at;
  await db.query(`update blast_recipients set last_open_at = now() - interval '1 minute' where token = $1`, [tok]);
  await pub(`/o/${tok}.gif`);
  await db.query(`update blast_recipients set last_open_at = now() - interval '1 minute' where token = $1`, [tok]);
  await pub(`/o/${tok}.gif`);
  row = (await rows(id)).find((x) => x.token === tok);
  assert.equal(row.opens, 3);
  assert.equal(String(row.first_open_at), String(firstAt), 'the first open stays the first');
  const opens = await events(c, 'public.open');
  assert.equal(opens.length, 1, 'only the first open is an event');
  assert.equal(opens[0].actor_id, null);
  assert.equal(opens[0].payload.blast_id, id);
  assert.equal(JSON.stringify(opens[0].payload).includes('@'), false, 'no email in the event');

  // Nonsense tokens still get a gif and record nothing.
  assert.equal((await pub('/o/AAAAAAAAAAAAAAAAAAAAAAAA.gif')).status, 200);
  assert.equal((await pub('/o/not-a-token.gif')).status, 200);
  assert.equal((await events(c, 'public.open')).length, 1);

  const s = await statsFor(c, id);
  assert.deepEqual({ delivered: s.delivered, opened: s.opened, clicked: s.clicked }, { delivered: 3, opened: 1, clicked: 0 });
  assert.equal(s.ab, null);
});

test('a click redirects only to the link stored for that send, and counts once as an event', async () => {
  const { c, id, sent } = T;
  const m = sent[1];
  const tok = tokenOf(m);
  const res = await pub(pathOf(linkOf(m, 2)));
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), 'https://imaginesurrey.example/rsvp?x=1');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  // Anything added to the address is ignored: no open redirect.
  await db.query(`update blast_recipients set last_click_at = now() - interval '1 minute' where token = $1`, [tok]);
  const sneaky = await pub(`/c/${tok}/1?url=https://evil.example/&to=https://evil.example/`);
  assert.equal(sneaky.headers.get('location'), 'https://imaginesurrey.example/plan');
  for (const bad of [`/c/${tok}/3`, `/c/${tok}/0`, `/c/${tok}/1e0`, `/c/${tok}/-1`, '/c/AAAAAAAAAAAAAAAAAAAAAAAA/1', `/c/${tok.slice(1)}x/1`, '/c/https:%2F%2Fevil.example/1']) {
    const r = await pub(bad);
    assert.equal(r.status, 404, bad);
    assert.equal(r.headers.get('location'), null, `${bad} never redirects`);
  }
  // Another send's token can't reach this send's links (links are per send).
  const row = (await rows(id)).find((x) => x.token === tok);
  assert.equal(row.clicks, 2);
  const clicks = await events(c, 'public.click');
  assert.equal(clicks.length, 1, 'only the first click is an event');
  assert.equal(clicks[0].payload.clicked, 2);
  const s = await statsFor(c, id);
  assert.deepEqual({ delivered: s.delivered, opened: s.opened, clicked: s.clicked }, { delivered: 3, opened: 2, clicked: 1 },
    'a click counts as an open');
});

test('the unsubscribe link is never tracked and still works', async () => {
  const { c, id, sent, subs } = T;
  const m = sent[2];
  const sub = subs.find((s) => s.email === m.to[0]);
  const href = (m.html.match(/href="([^"]*\/u\/[0-9a-f-]{36})"/) || [])[1];
  assert.ok(href, 'unsubscribe link in the HTML');
  assert.ok(!href.includes('/c/'), 'not rewritten');
  const before = (await rows(id)).find((x) => x.email === m.to[0]);
  const res = await pub(pathOf(href));
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Unsubscribed/);
  const after = (await rows(id)).find((x) => x.email === m.to[0]);
  assert.equal(after.clicks, before.clicks, 'no click recorded');
  assert.equal(after.opens, before.opens);
  const now = (await c.get('/api/subscriptions')).json.subscriptions.find((s) => s.id === sub.id);
  assert.equal(now.status, 'unsubscribed');
  assert.equal((await c.get('/api/audit/verify')).json.ok, true);
});

test('A/B: 20% each to A and B now, the rest held; Send now never reaches the held ones', async () => {
  const { c, ws } = await workspace('Split', 60);
  await withEmail(async (sent) => {
    const r = await c.action('blast.send', {
      kind: 'newsletter', subject: 'Subject A here', body: 'Read https://imaginesurrey.example/a',
      ab: { subject_b: 'Subject B here', pct: 20, wait_hours: 4, metric: 'opens' },
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(r.json.counts, { total: 60, sent: 24, failed: 0, queued: 36 });
    assert.equal(r.json.blast.status, 'queued', 'not everyone has it yet');
    assert.equal(r.json.blast.ab.status, 'testing');
    const wait = new Date(r.json.blast.ab.decide_at).getTime() - Date.now();
    assert.ok(wait > 3.9 * 3600e3 && wait <= 4 * 3600e3, `winner picked in 4 hours (${wait})`);
    assert.equal(sent.length, 24);
    assert.equal(sent.filter((m) => m.subject === 'Subject A here').length, 12);
    assert.equal(sent.filter((m) => m.subject === 'Subject B here').length, 12);
    const saved = await rows(r.json.blast.id);
    const by = (g) => saved.filter((x) => x.ab_group === g);
    assert.equal(by('a').length, 12);
    assert.equal(by('b').length, 12);
    assert.equal(by('rest').length, 36);
    assert.ok(by('rest').every((x) => x.status === 'queued'), 'the rest are held');
    assert.ok([...by('a'), ...by('b')].every((x) => x.status === 'sent'));
    assert.equal(new Set(saved.map((x) => x.token)).size, 60, 'every row has its own token');

    const again = await c.action('blast.resend', { id: r.json.blast.id });
    assert.equal(again.status, 200);
    assert.deepEqual(again.json.resent, { sent: 0, failed: 0, skipped: 0 });
    assert.equal(sent.length, 24, 'held rows are never sent before the winner');
    // A held row's token records nothing (it was never sent).
    assert.equal((await pub(`/o/${by('rest')[0].token}.gif`)).status, 200);
    assert.equal((await rows(r.json.blast.id)).find((x) => x.token === by('rest')[0].token).opens, 0);

    const s = await statsFor(c, r.json.blast.id);
    assert.equal(s.ab.status, 'testing');
    assert.deepEqual(s.ab.rest, { total: 36, sent: 0, failed: 0, held: 36 });
    assert.deepEqual(s.ab.a, { total: 12, delivered: 12, opened: 0, clicked: 0 });

    const ev = (await events(c, 'blast.send')).at(-1);
    assert.deepEqual(ev.payload.ab, { subject_b: 'Subject B here', pct: 20, wait_hours: 4, metric: 'opens', status: 'testing' });
    const jobs = (await db.query(`select status, payload from jobs where workspace_id = $1 and kind = 'abtests.winner'`, [ws])).rows;
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].payload.blast_id, r.json.blast.id);
  });
  for (const [pct, size] of [[10, 6], [30, 18]]) {
    await withEmail(async (sent) => {
      const r = await c.action('blast.send', {
        kind: 'newsletter', subject: `A ${pct}`, body: 'Hi', ab: { subject_b: `B ${pct}`, pct, wait_hours: 1, metric: 'clicks' },
      });
      assert.equal(sent.length, size * 2, `${pct}%: ${size} each`);
      assert.deepEqual(r.json.counts, { total: 60, sent: size * 2, failed: 0, queued: 60 - size * 2 });
    });
  }
});

test('the winner is picked when the wait ends and sent once to everyone else', async () => {
  const { c, ws } = await workspace('Winner', 50);
  await withEmail(async (sent) => {
    const r = await c.action('blast.send', {
      kind: 'newsletter', subject: 'Plain subject', body: 'See https://imaginesurrey.example/x',
      ab: { subject_b: 'Better subject', pct: 10, wait_hours: 1, metric: 'opens' },
    });
    const id = r.json.blast.id;
    assert.equal(sent.length, 10);
    // B opens better: 3 of 5 vs 1 of 5.
    const a = sent.filter((m) => m.subject === 'Plain subject');
    const b = sent.filter((m) => m.subject === 'Better subject');
    await pub(`/o/${tokenOf(a[0])}.gif`);
    for (const m of b.slice(0, 3)) await pub(`/o/${tokenOf(m)}.gif`);
    const live = await statsFor(c, id);
    assert.deepEqual([live.ab.a.opened, live.ab.b.opened, live.ab.a.delivered], [1, 3, 5]);

    // Not due yet: nothing happens.
    await runDueJobs(db, { workspaceId: ws });
    assert.equal(sent.length, 10);
    await dueNow(ws);
    const ran = await runDueJobs(db, { workspaceId: ws });
    assert.deepEqual(ran, { ran: 1, failed: 0 });
    assert.equal(sent.length, 50);
    const rest = sent.slice(10);
    assert.ok(rest.every((m) => m.subject === 'Better subject'), 'the rest get the winner');
    const to = sent.map((m) => m.to[0]);
    assert.equal(new Set(to).size, 50, 'everyone exactly once');
    assert.ok(rest.every((m) => tokenOf(m)), 'the rest are tracked too');

    const blasts = (await c.get('/api/blasts')).json.blasts;
    const row = blasts.find((x) => x.id === id);
    assert.equal(row.status, 'sent');
    assert.equal(row.sent_count, 50);
    assert.ok(row.sent_at);
    const s = await statsFor(c, id);
    assert.equal(s.ab.status, 'decided');
    assert.equal(s.ab.winner, 'b');
    assert.ok(s.ab.decided_at);
    assert.deepEqual(s.ab.rest, { total: 40, sent: 40, failed: 0, held: 0 });
    const ev = await events(c, 'blast.ab_winner');
    assert.equal(ev.length, 1);
    assert.equal(ev[0].actor_id, null);
    assert.equal(ev[0].payload.ab_winner, 'b');
    assert.deepEqual(ev[0].payload.b, { delivered: 5, opened: 3, clicked: 0 });
    assert.equal(ev[0].payload.sent, 40);

    // The job never runs twice; Send now has nothing left to send.
    await db.query(`update jobs set status = 'pending', run_at = now() where workspace_id = $1 and kind = 'abtests.winner'`, [ws]);
    await runDueJobs(db, { workspaceId: ws });
    assert.equal(sent.length, 50, 'a decided test is never sent again');
    assert.equal((await events(c, 'blast.ab_winner')).length, 1, 'and logs nothing');
    const again = await c.action('blast.resend', { id });
    assert.deepEqual(again.json.resent, { sent: 0, failed: 0, skipped: 0 });
    assert.equal(sent.length, 50);
  });
  assert.equal((await c.get('/api/audit/verify')).json.ok, true);
});

test('a tie goes to A; winner by clicks; someone who unsubscribed while held is left off', async () => {
  const { c, ws } = await workspace('Tie', 50);
  await withEmail(async (sent) => {
    const r = await c.action('blast.send', {
      kind: 'newsletter', subject: 'Tie A', body: 'Go https://imaginesurrey.example/go',
      ab: { subject_b: 'Tie B', pct: 10, wait_hours: 2, metric: 'clicks' },
    });
    const id = r.json.blast.id;
    // B opens more, but by clicks they tie (one each) → A.
    const a = sent.filter((m) => m.subject === 'Tie A');
    const b = sent.filter((m) => m.subject === 'Tie B');
    for (const m of b) await pub(`/o/${tokenOf(m)}.gif`);
    await pub(pathOf(linkOf(a[0], 1)));
    await pub(pathOf(linkOf(b[0], 1)));
    // One held reader leaves the list before the winner goes out.
    const held = (await rows(id)).find((x) => x.ab_group === 'rest');
    const sub = (await c.get('/api/subscriptions')).json.subscriptions.find((s) => s.email === held.email);
    await c.action('subscription.remove', { id: sub.id });

    await dueNow(ws);
    await runDueJobs(db, { workspaceId: ws });
    const s = await statsFor(c, id);
    assert.equal(s.ab.winner, 'a', 'a tie goes to A');
    assert.equal(sent.length, 49);
    assert.ok(sent.slice(10).every((m) => m.subject === 'Tie A'));
    assert.ok(!sent.some((m) => m.to[0] === held.email), 'the unsubscribed reader is never emailed');
    const blast = (await c.get('/api/blasts')).json.blasts.find((x) => x.id === id);
    assert.equal(blast.status, 'sent');
    assert.equal(blast.audience_count, 49);
  });
});

test('not connected: the whole A/B send is saved, nothing sends, and the test starts only on Send now', async () => {
  const { c, ws } = await workspace('Saved', 50);
  const r = await withoutEmail(async (calls) => {
    const res = await c.action('blast.send', {
      kind: 'newsletter', subject: 'Saved A', body: 'Hi https://imaginesurrey.example/s',
      ab: { subject_b: 'Saved B', pct: 20, wait_hours: 12, metric: 'opens' },
    });
    assert.equal(calls(), 0, 'nothing is sent');
    return res;
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.blast.status, 'queued');
  assert.deepEqual(r.json.counts, { total: 50, sent: 0, failed: 0, queued: 50 });
  assert.match(r.json.blast.provider_note, /no email provider/);
  assert.equal(r.json.blast.ab.status, 'saved');
  assert.equal(r.json.blast.ab.decide_at, null, 'no winner time until it starts');
  const id = r.json.blast.id;
  assert.equal((await db.query(`select count(*)::int as n from jobs where workspace_id = $1`, [ws])).rows[0].n, 0, 'no job scheduled');
  // Its tokens record nothing: nobody has the email.
  const tok = (await rows(id))[0].token;
  await pub(`/o/${tok}.gif`);
  assert.equal((await rows(id)).find((x) => x.token === tok).opens, 0);

  await withoutEmail(async () => {
    const refused = await c.action('blast.resend', { id });
    assert.equal(refused.status, 409, 'Send now refused while not connected');
  });
  assert.equal((await statsFor(c, id)).ab.status, 'saved');

  await withEmail(async (sent) => {
    const go = await c.action('blast.resend', { id });
    assert.equal(go.status, 200, JSON.stringify(go.json));
    assert.deepEqual(go.json.resent, { sent: 20, failed: 0, skipped: 0 }, 'only A and B go out');
    assert.equal(go.json.blast.ab.status, 'testing');
    const wait = new Date(go.json.blast.ab.decide_at).getTime() - Date.now();
    assert.ok(wait > 11.9 * 3600e3 && wait <= 12 * 3600e3, 'the wait starts on Send now');
    assert.equal(sent.length, 20);
    assert.deepEqual(sent.map((m) => m.subject).sort(), [...Array(10).fill('Saved A'), ...Array(10).fill('Saved B')]);
    const ev = (await events(c, 'blast.resend')).at(-1);
    assert.equal(ev.payload.ab, 'testing');

    const twice = await c.action('blast.resend', { id });
    assert.deepEqual(twice.json.resent, { sent: 0, failed: 0, skipped: 0 });
    assert.equal((await db.query(`select count(*)::int as n from jobs where workspace_id = $1 and kind = 'abtests.winner'`, [ws])).rows[0].n, 1, 'one winner job');

    await dueNow(ws);
    await runDueJobs(db, { workspaceId: ws });
    assert.equal(sent.length, 50);
    assert.equal(new Set(sent.map((m) => m.to[0])).size, 50);
  });
});

test('the winner goes out while email is disconnected: the rest stay saved, then Send now sends them the winner', async () => {
  const { c, ws } = await workspace('Unplugged', 50);
  let id;
  await withEmail(async () => {
    const r = await c.action('blast.send', {
      kind: 'newsletter', subject: 'Unplugged A', body: 'Hi', ab: { subject_b: 'Unplugged B', pct: 10, wait_hours: 1, metric: 'opens' },
    });
    id = r.json.blast.id;
  });
  await withoutEmail(async (calls) => {
    await dueNow(ws);
    await runDueJobs(db, { workspaceId: ws });
    assert.equal(calls(), 0);
  });
  const s = await statsFor(c, id);
  assert.equal(s.ab.status, 'decided');
  assert.equal(s.ab.winner, 'a');
  assert.deepEqual(s.ab.rest, { total: 40, sent: 0, failed: 0, held: 0 }, 'released, not held');
  const listed = (await c.get('/api/blasts')).json.blasts.find((x) => x.id === id);
  assert.match(listed.provider_note, /no email provider/);
  await withEmail(async (sent) => {
    const go = await c.action('blast.resend', { id });
    assert.deepEqual(go.json.resent, { sent: 40, failed: 0, skipped: 0 });
    assert.ok(sent.every((m) => m.subject === 'Unplugged A'));
    assert.equal(go.json.blast.status, 'sent');
  });
});

test('small lists send normally: A/B needs at least 50', async () => {
  const { c } = await workspace('Small', 49, { media: 2 });
  await withEmail(async (sent) => {
    const r = await c.action('blast.send', {
      kind: 'newsletter', subject: 'Small A', body: 'Hi', ab: { subject_b: 'Small B', pct: 30, wait_hours: 1, metric: 'opens' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.ab_skipped, 'A/B needs at least 50');
    assert.equal(r.json.blast.ab, undefined);
    assert.equal(r.json.blast.status, 'sent');
    assert.equal(sent.length, 49);
    assert.ok(sent.every((m) => m.subject === 'Small A'));
    assert.equal((await statsFor(c, r.json.blast.id)).ab, null);
    sent.length = 0;
    const press = await c.action('blast.send', {
      kind: 'press', subject: 'Release A', body: 'FOR IMMEDIATE RELEASE https://imaginesurrey.example/news',
      ab: { subject_b: 'Release B', pct: 10, wait_hours: 1, metric: 'clicks' },
    });
    assert.equal(press.json.ab_skipped, 'A/B needs at least 50');
    assert.equal(sent.length, 2);
    for (const m of sent) {
      assert.ok(tokenOf(m), 'press is tracked too');
      assert.ok(linkOf(m, 1));
      assert.doesNotMatch(m.html, /\/u\//, 'press carries no unsubscribe link');
      assert.match(m.text, /FOR IMMEDIATE RELEASE/);
    }
  });
});

test('A/B input is checked; stats are desk-only and carry no emails or tokens', async () => {
  const { c, ws } = await workspace('Checks', 50);
  const same = await c.action('blast.send', { kind: 'newsletter', subject: 'Same', body: 'x', ab: { subject_b: 'Same', pct: 10, wait_hours: 1, metric: 'opens' } });
  assert.equal(same.status, 400);
  for (const ab of [
    { subject_b: 'B', pct: 15, wait_hours: 1, metric: 'opens' },
    { subject_b: 'B', pct: 10, wait_hours: 3, metric: 'opens' },
    { subject_b: 'B', pct: 10, wait_hours: 1, metric: 'replies' },
    { subject_b: '', pct: 10, wait_hours: 1, metric: 'opens' },
  ]) {
    assert.equal((await c.action('blast.send', { kind: 'newsletter', subject: 'A', body: 'x', ab })).status, 400, JSON.stringify(ab));
  }
  let id;
  await withEmail(async () => {
    id = (await c.action('blast.send', { kind: 'newsletter', subject: 'Desk A', body: 'x', ab: { subject_b: 'Desk B', pct: 10, wait_hours: 1, metric: 'opens' } })).json.blast.id;
  });
  const stats = await c.get('/api/blasts/stats');
  assert.equal(stats.status, 200);
  const raw = JSON.stringify(stats.json);
  assert.doesNotMatch(raw, /@/, 'no email addresses');
  for (const r of await rows(id)) assert.ok(!raw.includes(r.token), 'no tokens');
  assert.deepEqual(stats.json.ab, { min: 50, pcts: [10, 20, 30], waits: [1, 2, 4, 12, 24] });

  // A volunteer gets neither the stats nor the sends.
  const inv = await c.action('member.invite', { email: `vol.${tag}@example.org`, role: 'volunteer' });
  assert.equal(inv.status, 200, JSON.stringify(inv.json));
  const v = new Client();
  const joined = await v.post('/api/auth/join', { token: inv.json.joinUrl.split('/join/')[1], name: 'Vol', password: 'knock-knock-2026' });
  assert.equal(joined.status, 200, JSON.stringify(joined.json));
  assert.equal((await v.get('/api/blasts/stats')).status, 403);
  assert.equal((await v.get('/api/blasts')).status, 403);
  assert.equal((await v.action('blast.send', { kind: 'newsletter', subject: 'x', body: 'y' })).status, 403);

  // Another campaign can't see this one's stats.
  const other = new Client();
  await other.signup({ workspaceName: `Other ${tag}`, email: `ab.other.${tag}@example.org` });
  assert.deepEqual((await other.get('/api/blasts/stats')).json.stats, []);
  assert.equal((await c.get('/api/audit/verify')).json.ok, true);
  assert.ok(ws);
});
