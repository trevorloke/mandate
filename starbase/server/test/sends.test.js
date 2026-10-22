// Newsletter / press sends and shift notices when the server dies midway
// (a deploy, a crash). blast.send and blast.resend commit the send and its
// list before any email goes, claim each row 'sending' before its email, and
// send outside the campaign lock: a crash leaves a true record — who has it,
// who might ("not sure", Try again with the same key) and who doesn't — and
// nobody gets a second copy by itself. shift.notify keys each email by shift,
// assignment and round, so Notify again after a crash mid-round is dropped
// by the email service for the ones that went.
//
// The crash: once `kill()` is called every database call fails, as if the
// process were gone — an open transaction rolls back, nothing more is
// written. `revive()` is the restart.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, Client } from './helpers.js';

const tag = Math.random().toString(36).slice(2, 8);
let db;
let dead = false;
const kill = () => { dead = true; };
const revive = () => { dead = false; };
const gone = () => Promise.reject(new Error('the server is gone'));

before(async () => {
  db = await freshDb();
  const realTx = db.transaction;
  const realQuery = db.query;
  db.transaction = (fn) => (dead ? gone() : realTx((tx) => fn({
    query: (sql, params) => (dead ? gone() : tx.query(sql, params)),
  })));
  db.query = (sql, params) => (dead ? gone() : realQuery(sql, params));
});

// Stand in for the email provider: RESEND_API_KEY set and fetch answered
// here, both restored after. Like Resend, a repeated Idempotency-Key is
// answered but not sent again (`dropped`), unless dedupe is off. `after(n)`
// runs once the nth email is taken (to crash right then); `delay` slows each.
const withEmail = async (fn, { dedupe = true, after = () => {}, delay = 0 } = {}) => {
  const sent = [];
  const keys = new Set();
  sent.dropped = 0;
  const realFetch = globalThis.fetch;
  const hadKey = Object.hasOwn(process.env, 'RESEND_API_KEY');
  const oldKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 'test-key';
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith('https://api.resend.com/')) return realFetch(url, init);
    if (delay) await new Promise((r) => setTimeout(r, delay));
    const msg = JSON.parse(init.body);
    msg.key = init.headers['Idempotency-Key'];
    if (dedupe && msg.key && keys.has(msg.key)) { sent.dropped += 1; return new Response('{"id":"msg"}', { status: 200 }); }
    if (msg.key) keys.add(msg.key);
    sent.push(msg);
    after(sent.length);
    return new Response('{"id":"msg"}', { status: 200 });
  };
  try {
    return await fn(sent);
  } finally {
    globalThis.fetch = realFetch;
    if (hadKey) process.env.RESEND_API_KEY = oldKey; else delete process.env.RESEND_API_KEY;
  }
};

const workspace = async (name, n) => {
  const c = new Client();
  const r = await c.signup({ workspaceName: `${name} ${tag}`, email: `sends.${name.toLowerCase().replace(/\W+/g, '')}.${tag}@example.org` });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const emails = [];
  for (let i = 0; i < n; i += 1) {
    const email = `${name.toLowerCase().replace(/\W+/g, '')}${i}.${tag}@example.org`;
    assert.equal((await c.action('subscription.add', { email, name: `Reader ${i}` })).status, 200);
    emails.push(email);
  }
  return { c, ws: r.json.workspace.id, emails };
};
const listed = async (c, id) => (await c.get('/api/blasts')).json.blasts.find((b) => b.id === id);
const counts = (b) => ({ sent: b.sent_count, sending: b.sending_count, queued: b.queued_count, failed: b.failed_count, retry: b.retry_count });
const people = (sent) => sent.map((m) => m.to[0]);
// Ten minutes on: the 'sending' rows never heard back, so Try again may reach them.
const aged = (id) => db.query(`update blast_recipients set sending_at = now() - interval '11 minutes' where blast_id = $1 and status = 'sending'`, [id]);

test('blast.send killed after the 8th of 20: the send is on record, 7 sent · 3 not sure · 10 not sent, and Try again reaches each person once', async () => {
  const { c, emails } = await workspace('Killed send', 20);
  await withEmail(async (sent) => {
    const r = await c.action('blast.send', { kind: 'newsletter', subject: 'Killed mid-send', body: 'Hello https://imaginesurrey.example/news' });
    assert.equal(r.status, 500, 'the server died');
    assert.equal(sent.length, 8, '8 people have it');
    revive();

    // After the restart the newsletter is there, and it says what is true.
    const blasts = (await c.get('/api/blasts')).json.blasts;
    assert.equal(blasts.length, 1, 'the send is on record');
    const b = blasts[0];
    assert.equal(b.subject, 'Killed mid-send');
    assert.notEqual(b.status, 'sent');
    assert.equal(b.audience_count, 20);
    assert.deepEqual(counts(b), { sent: 7, sending: 3, queued: 10, failed: 0, retry: 10 },
      'the 8th was answered but not written down: not sure, like the two claimed with it; the rest not sent');

    // Try again now: the 10 that never went. The not-sure ones wait.
    const again = await c.action('blast.resend', { id: b.id });
    assert.equal(again.status, 200, JSON.stringify(again.json));
    assert.deepEqual(again.json.resent, { sent: 10, failed: 0, skipped: 0 });
    assert.deepEqual(again.json.counts, { total: 20, sent: 17, failed: 0, queued: 0, sending: 3 });
    assert.equal(sent.length, 18);
    assert.equal(new Set(people(sent)).size, 18, 'nobody twice');

    // Ten minutes on: Try again reaches the not-sure three with the same keys —
    // the one the service already took is dropped there.
    await aged(b.id);
    assert.equal(counts(await listed(c, b.id)).retry, 3);
    const last = await c.action('blast.resend', { id: b.id });
    assert.deepEqual(last.json.counts, { total: 20, sent: 20, failed: 0, queued: 0 });
    assert.equal(last.json.blast.status, 'sent');
    assert.equal(sent.dropped, 1, 'the 8th is not sent again');
    assert.deepEqual(people(sent).sort(), [...emails].sort(), 'everyone exactly once');
  }, { after: (n) => { if (n === 8) kill(); } });

  // On the log: what was asked, each claim and answer, and how each run went.
  const evs = (await c.get('/api/events?since=0&limit=1000')).json.events;
  assert.equal(evs.filter((e) => e.action === 'blast.send').length, 1, 'the dead run never finished');
  assert.equal(evs.filter((e) => e.action === 'blast.deliver' && e.entity_type === 'blast_recipient').length, 7 + 10 + 3, 'each answer written down once');
  assert.equal((await c.get('/api/audit/verify')).json.ok, true);
});

test('…and with a provider that does not drop repeats, only the one it never heard back about could get two', async () => {
  const { c } = await workspace('No dedupe', 20);
  await withEmail(async (sent) => {
    assert.equal((await c.action('blast.send', { kind: 'press', subject: 'x', body: 'y' })).status, 400, 'no media contacts');
    const r = await c.action('blast.send', { kind: 'newsletter', subject: 'No dedupe', body: 'Hello' });
    assert.equal(r.status, 500);
    revive();
    const b = (await c.get('/api/blasts')).json.blasts[0];
    await aged(b.id);
    const again = await c.action('blast.resend', { id: b.id });
    assert.deepEqual(again.json.counts, { total: 20, sent: 20, failed: 0, queued: 0 });
    const twice = people(sent).filter((p, i, all) => all.indexOf(p) !== i);
    assert.equal(sent.length, 21);
    assert.equal(twice.length, 1, 'the 8th (answered, never written down) — not the other 19');
    assert.ok(sent.filter((m) => m.to[0] === twice[0]).every((m) => m.key === sent[7].key), 'with the same key both times');
  }, { dedupe: false, after: (n) => { if (n === 8) kill(); } });
});

test('Send now killed after the 5th: never back to "not sent" — 4 sent · 6 not sure · 10 not sent', async () => {
  const { c, emails } = await workspace('Killed resend', 20);
  delete process.env.RESEND_API_KEY;
  const saved = await c.action('blast.send', { kind: 'newsletter', subject: 'Saved then killed', body: 'Hello' });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.json.counts, { total: 20, sent: 0, failed: 0, queued: 20 });
  assert.match(saved.json.blast.provider_note, /no email provider/);
  const id = saved.json.blast.id;

  await withEmail(async (sent) => {
    assert.equal((await c.action('blast.resend', { id })).status, 500, 'the server died');
    assert.equal(sent.length, 5);
    revive();
    const b = await listed(c, id);
    assert.deepEqual(counts(b), { sent: 4, sending: 6, queued: 10, failed: 0, retry: 10 });
    assert.ok(b.sent_count > 0 || b.sending_count > 0, 'not "Not sent · Send now · 20"');

    await c.action('blast.resend', { id });
    await aged(id);
    const done = await c.action('blast.resend', { id });
    assert.deepEqual(done.json.counts, { total: 20, sent: 20, failed: 0, queued: 0 });
    assert.equal(sent.dropped, 1);
    assert.deepEqual(people(sent).sort(), [...emails].sort(), 'everyone exactly once');
  }, { after: (n) => { if (n === 5) kill(); } });
  assert.equal((await c.get('/api/audit/verify')).json.ok, true);
});

test('a send goes out without holding the campaign lock: a door knock mid-send is not kept waiting', async () => {
  const { c } = await workspace('Busy send', 20);
  const p = await c.createPerson('Kim Door', { phone: '604-555-0142' });
  await withEmail(async (sent) => {
    const sending = c.action('blast.send', { kind: 'newsletter', subject: 'Busy', body: 'Hi' });
    while (sent.length < 5) await new Promise((r) => setTimeout(r, 5));
    const t0 = Date.now();
    const knock = await c.action('contact.log', { person_id: p.id, channel: 'door', outcome: 'contacted', rating: '1' });
    const took = Date.now() - t0;
    assert.equal(knock.status, 200, JSON.stringify(knock.json));
    assert.ok(sent.length < 20, `the knock went through while the rest were still going out (${sent.length} sent)`);
    assert.ok(took < 800, `the knock took ${took} ms`);
    const r = await sending;
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(r.json.counts, { total: 20, sent: 20, failed: 0, queued: 0 });
    assert.equal(r.json.blast.status, 'sent');
  }, { delay: 40 });
});

test('shift.notify killed after the 3rd of 5 emails: Notify again is the same round, so nobody gets it twice', async () => {
  const c = new Client();
  await c.signup({ workspaceName: `Notify K ${tag}`, email: `sends.notify.${tag}@example.org` });
  const s = (await c.action('shift.create', { title: 'Notify K', starts_at: '2030-06-01T10:00:00-07:00', location: 'Newton' })).json.shift;
  const vols = [];
  for (let i = 0; i < 5; i += 1) {
    const v = await c.createPerson(`Notify Vol ${i}`, { email: `notifyk${i}.${tag}@example.org` });
    assert.equal((await c.action('shift.assign', { shift_id: s.id, person_id: v.id })).status, 200);
    vols.push(v.email);
  }
  await withEmail(async (sent) => {
    assert.equal((await c.action('shift.notify', { shift_id: s.id })).status, 500, 'the server died');
    assert.equal(sent.length, 3);
    revive();
    const before = (await c.get(`/api/shifts/${s.id}`)).json.assignees;
    assert.ok(before.every((a) => !a.notified_at), 'nothing was written: the round rolled back');

    const again = await c.action('shift.notify', { shift_id: s.id });
    assert.equal(again.status, 200, JSON.stringify(again.json));
    assert.ok(again.json.notified.every((n) => n.email === 'sent'));
    assert.equal(sent.dropped, 3, 'the three that went are dropped by the email service');
    assert.deepEqual(people(sent).sort(), [...vols].sort(), 'each volunteer exactly once');
    assert.ok(sent.every((m) => m.subject === 'Your shift: Notify K'));

    // A round that went through: Notify again is a new round, sent again.
    const third = await c.action('shift.notify', { shift_id: s.id });
    assert.ok(third.json.notified.every((n) => n.email === 'sent'));
    assert.equal(sent.length, 10, 'everyone again, on purpose');
    assert.equal(new Set(sent.map((m) => m.key)).size, 10, 'a new key per person per round');
  }, { after: (n) => { if (n === 3) kill(); } });
  const evs = (await c.get('/api/events?since=0&limit=1000')).json.events.filter((e) => e.action === 'shift.notify');
  assert.deepEqual(evs.map((e) => e.payload.round), [1, 2]);
});
