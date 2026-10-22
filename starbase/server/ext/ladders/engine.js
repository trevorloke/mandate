// The ladder engine.
//
// Enrolling: the events hook sees every write's events before they are
// chained. From them it reads what just happened to whom — a petition signed,
// the newsletter joined, a volunteer signup, an RSVP, a first gift, a tag got,
// a 1 or 2 at the door / phone / text — and puts the person on every ladder
// that is on and starts that way: once per ladder (again only when the ladder
// allows it and their last run is over). Step 1 is scheduled in the same
// transaction, so enrolling commits with the write that caused it or not at
// all. Imports and the sample campaign never start a ladder.
//
// Running: each step is a 'ladder.step' job. The handler writes through
// runAction (system actor), so what a step did is on the hash chain, and it
// schedules the next step. A run carries a token; a job whose token, step or
// status no longer match (the ladder was turned off, the person was taken
// off, a duplicate) does nothing.
//
// Email steps skip people with no email, who unsubscribed, or are tagged
// do-not-contact — the reason goes in the run's log. With email not
// connected the run waits ("Waiting — email isn't connected") and a fresh job
// looks again every hour; nothing pretends to send, and no retry attempts
// are spent. A provider refusal is tried again hourly, three times in all,
// then logged as failed and the run moves on.
import { newId, runAction } from '../../lib/events.js';
import { enqueueJob, cancelJobs } from '../../lib/jobs.js';
import { emailConfigured, sendEmail } from '../../lib/notify.js';
import {
  parseJson, tagsOf, sameTag, isDnc, fillIn, waitMs,
} from './shape.js';

export const JOB = 'ladder.step';
export const STEP_ACTION = 'ladder.step';
const HOUR = 3600_000;
const EMAIL_TRIES = 3;
const LOG_KEEP = 50;
// Writes that never start a ladder.
const QUIET_ACTIONS = new Set(['sample.load', 'sample.clear', 'import.persons']);
const YES_RATINGS = new Set(['1', '2']);

const iso = (ms) => new Date(ms).toISOString();
const lower = (s) => String(s || '').trim().toLowerCase();

// ── Scheduling ──

// Put a run on `step` and schedule that step: now, or at `at` (ms since
// epoch). A new token retires every job scheduled for this run before.
export const schedule = async (tx, run, { step, at = null, wait = null }) => {
  const token = newId();
  await tx.query(
    `update ladder_runs set step = $3, status = 'active', wait = $4, next_at = $5, token = $6, updated_at = now()
     where id = $1 and workspace_id = $2`,
    [run.id, run.workspace_id, step, wait, at ? iso(at) : null, token],
  );
  await enqueueJob(tx, {
    workspaceId: run.workspace_id, kind: JOB, runAt: at ? iso(at) : null,
    payload: { run_id: run.id, ladder_id: run.ladder_id, step, token },
  });
  return token;
};

// Turning a ladder off: every run on it holds its place (step, and the end of
// a wait), and its pending jobs are cancelled.
export const pauseLadder = async (tx, workspaceId, ladderId) => {
  const paused = (await tx.query(
    `update ladder_runs set status = 'paused', token = null, updated_at = now()
     where workspace_id = $1 and ladder_id = $2 and status = 'active' returning id`,
    [workspaceId, ladderId],
  )).rows.length;
  await cancelJobs(tx, { workspaceId, kind: JOB, where: { ladder_id: ladderId } });
  return paused;
};

// Turning it back on: each paused run picks up at the same step — a wait
// that hasn't ended yet still ends when it would have.
export const resumeLadder = async (tx, workspaceId, ladderId) => {
  const runs = (await tx.query(
    `select id, workspace_id, ladder_id, step, wait, next_at from ladder_runs
     where workspace_id = $1 and ladder_id = $2 and status = 'paused'`,
    [workspaceId, ladderId],
  )).rows;
  for (const r of runs) {
    const end = r.next_at ? new Date(r.next_at).getTime() : 0;
    const later = r.wait === 'time' && end > Date.now();
    await schedule(tx, r, { step: r.step, at: later ? end : null, wait: later ? 'time' : r.wait === 'time' ? null : r.wait });
  }
  return runs.length;
};

// Take one person off a ladder (desk) or end a run (Stop, last step).
export const endRun = async (tx, run) => {
  await tx.query(
    `update ladder_runs set status = 'done', wait = null, next_at = null, token = null,
       finished_at = now(), updated_at = now()
     where id = $1 and workspace_id = $2`,
    [run.id, run.workspace_id],
  );
  await cancelJobs(tx, { workspaceId: run.workspace_id, kind: JOB, where: { run_id: run.id } });
};

export const appendLog = async (tx, run, entry) => {
  const log = [...parseJson(run.log, []), { ...entry, at: new Date().toISOString() }].slice(-LOG_KEEP);
  run.log = log;
  await tx.query('update ladder_runs set log = $3, updated_at = now() where id = $1 and workspace_id = $2',
    [run.id, run.workspace_id, JSON.stringify(log)]);
};

// ── Enrolling (the events hook) ──

const findPerson = async (tx, ws, { email, phone, name }) => {
  const em = lower(email);
  if (em) {
    return (await tx.query(
      'select id from persons where workspace_id = $1 and lower(email) = $2 and deleted_at is null order by created_at limit 1',
      [ws, em],
    )).rows[0]?.id || null;
  }
  if (phone && name) {
    return (await tx.query(
      `select id from persons where workspace_id = $1 and phone = $2 and lower(name) = lower($3) and deleted_at is null
       order by created_at limit 1`,
      [ws, phone, name],
    )).rows[0]?.id || null;
  }
  return null;
};

// A signer who ticked "Email me updates" joins the list in the signature's
// write, before they exist as a person; the person comes a moment later.
const justSubscribed = async (tx, ws, email) => {
  const em = lower(email);
  if (!em) return false;
  return (await tx.query(
    `select 1 from subscriptions where workspace_id = $1 and email = $2 and status = 'subscribed'
       and created_at > now() - interval '1 hour'`,
    [ws, em],
  )).rows.length > 0;
};

const firstGift = async (tx, ws, personId, giftId) => (await tx.query(
  'select count(*)::int as n from gifts where workspace_id = $1 and person_id = $2 and deleted_at is null and id <> $3',
  [ws, personId, giftId],
)).rows[0].n === 0;

// Tags people got in this transaction (noted by the persons trigger), plus a
// sweep of any an untracked write left behind.
const takeTagChanges = async (tx, ws) => (await tx.query(
  `delete from ladder_tag_changes
   where workspace_id = $1 and (tx = txid_current() or created_at < now() - interval '1 hour')
   returning person_id, added, (tx = txid_current()) as mine`,
  [ws],
)).rows.filter((r) => r.mine).map((r) => ({ personId: r.person_id, added: parseJson(r.added, []) }));

// What just happened, as { personId, kind, ref } facts.
const factsOf = async (tx, meta, events, kinds) => {
  const ws = meta.workspaceId;
  const out = [];
  const add = (personId, kind, ref = null) => {
    if (personId && kinds.has(kind)) out.push({ personId, kind, ref: ref == null ? null : String(ref) });
  };
  for (const e of events) {
    const p = e.payload || {};
    if (p.sample) continue;
    if (e.entityType === 'petition_signature' && e.op === 'create') {
      // A new signer isn't a person yet: the 'public.signup' create below
      // (tagged petition:<slug>) enrolls them instead.
      if (kinds.has('petition')) add(await findPerson(tx, ws, p), 'petition', p.petition || null);
    } else if (e.entityType === 'subscription'
        && ((e.op === 'create' && p.status !== 'unsubscribed') || (e.op === 'update' && p.status === 'subscribed'))) {
      if (kinds.has('newsletter') && p.email) add(await findPerson(tx, ws, { email: p.email }), 'newsletter');
    } else if (e.entityType === 'person' && e.op === 'create') {
      const tags = Array.isArray(p.tags) ? p.tags.map(String) : [];
      if (meta.action === 'public.signup') {
        for (const t of tags) if (t.startsWith('petition:')) add(e.entityId, 'petition', t.slice('petition:'.length));
        if (kinds.has('newsletter') && (tags.includes('newsletter') || await justSubscribed(tx, ws, p.email))) add(e.entityId, 'newsletter');
        if (tags.includes('volunteer-prospect')) add(e.entityId, 'volunteer');
      }
      for (const t of tags) add(e.entityId, 'tag', t);
    } else if (e.entityType === 'person' && e.op === 'update' && p.source === 'public' && p.added_note) {
      add(e.entityId, 'volunteer'); // the volunteer page with a note and no roles ticked
    } else if (e.entityType === 'volunteer_role' && e.op === 'create' && p.source === 'public') {
      add(p.person_id, 'volunteer');
    } else if (e.entityType === 'rsvp' && e.op === 'create') {
      add(p.person_id, 'rsvp', p.event_id);
    } else if (e.entityType === 'gift' && e.op === 'create' && p.person_id) {
      if (kinds.has('donation') && await firstGift(tx, ws, p.person_id, e.entityId)) add(p.person_id, 'donation');
    } else if (e.entityType === 'contact' && e.op === 'create' && YES_RATINGS.has(String(p.rating))) {
      add(p.person_id, 'rating');
    }
  }
  if (kinds.has('tag') && events.some((e) => e.entityType === 'person' && e.op === 'update')) {
    for (const r of await takeTagChanges(tx, ws)) for (const t of r.added) add(r.personId, 'tag', t);
  }
  return out;
};

const matches = (ladder, fact) => {
  if (ladder.trigger_kind !== fact.kind) return false;
  if (!ladder.trigger_ref) return fact.kind !== 'tag';
  return fact.kind === 'tag' ? sameTag(ladder.trigger_ref, fact.ref) : ladder.trigger_ref === fact.ref;
};

const enroll = async (tx, meta, ladder, fact, emits) => {
  const prev = (await tx.query(
    `select status from ladder_runs where workspace_id = $1 and ladder_id = $2 and person_id = $3
     order by started_at desc limit 1`,
    [meta.workspaceId, ladder.id, fact.personId],
  )).rows[0];
  // Once per ladder; again only if the ladder allows it, their last run is
  // over, and it wasn't a ladder's own step that would put them back on.
  if (prev && (prev.status !== 'done' || !ladder.reentry || meta.action === STEP_ACTION)) return;
  const person = (await tx.query(
    'select id from persons where id = $1 and workspace_id = $2 and deleted_at is null',
    [fact.personId, meta.workspaceId],
  )).rows[0];
  if (!person) return;
  const id = newId();
  const token = newId();
  await tx.query(
    `insert into ladder_runs (id, workspace_id, ladder_id, person_id, step, status, token, trigger_note)
     values ($1, $2, $3, $4, 0, 'active', $5, $6)`,
    [id, meta.workspaceId, ladder.id, fact.personId, token, fact.ref ? `${fact.kind}:${fact.ref}` : fact.kind],
  );
  await enqueueJob(tx, {
    workspaceId: meta.workspaceId, kind: JOB,
    payload: { run_id: id, ladder_id: ladder.id, step: 0, token },
  });
  emits.push(['ladder_run', id, 'create', {
    ladder_id: ladder.id, person_id: fact.personId, trigger: fact.kind, ref: fact.ref, again: Boolean(prev),
  }]);
};

const enrollAll = async (tx, meta, events, ladders) => {
  const facts = await factsOf(tx, meta, events, new Set(ladders.map((l) => l.trigger_kind)));
  const emits = [];
  const seen = new Set();
  for (const fact of facts) {
    for (const ladder of ladders) {
      const key = `${ladder.id}|${fact.personId}`;
      if (seen.has(key) || !matches(ladder, fact)) continue;
      seen.add(key);
      await enroll(tx, meta, ladder, fact, emits);
    }
  }
  return emits;
};

// Every write passes through here, so a campaign with no ladder on costs one
// small read. A fault past that must never cost anyone their door knock or
// signature: enrolling runs under a savepoint, and its events join the chain
// only if it all went through. (Tags noted by an import or the sample load
// are never read as "got a tag"; the next read sweeps them after an hour.)
export const onEvents = async (tx, meta, events) => {
  if (QUIET_ACTIONS.has(meta.action)) return;
  const ladders = (await tx.query(
    `select id, trigger_kind, trigger_ref, reentry from ladders
     where workspace_id = $1 and active and deleted_at is null order by created_at`,
    [meta.workspaceId],
  )).rows;
  if (ladders.length === 0) return;
  await tx.query('savepoint ladders_enroll');
  try {
    const emits = await enrollAll(tx, meta, events, ladders);
    await tx.query('release savepoint ladders_enroll');
    for (const e of emits) meta.emit(...e);
  } catch (err) {
    await tx.query('rollback to savepoint ladders_enroll');
    await tx.query('release savepoint ladders_enroll');
    console.error('ladders: enrolling skipped —', err.message);
  }
};

// ── Running a step (the job) ──

const loadStepContext = async (tx, job) => {
  const { run_id: runId, step, token } = job.payload || {};
  const run = (await tx.query(
    'select * from ladder_runs where id = $1 and workspace_id = $2 for update',
    [runId, job.workspace_id],
  )).rows[0];
  if (!run || run.status !== 'active' || Number(run.step) !== Number(step) || String(run.token) !== String(token)) return null;
  const ladder = (await tx.query(
    `select l.*, w.name as campaign from ladders l join workspaces w on w.id = l.workspace_id
     where l.id = $1 and l.workspace_id = $2`,
    [run.ladder_id, job.workspace_id],
  )).rows[0];
  if (!ladder || ladder.deleted_at || !ladder.active) return null;
  const person = (await tx.query(
    'select id, name, email, tags from persons where id = $1 and workspace_id = $2 and deleted_at is null',
    [run.person_id, job.workspace_id],
  )).rows[0];
  return { run, ladder, person, steps: parseJson(ladder.steps, []), step: Number(step) };
};

const record = async (c, entry) => {
  await appendLog(c.tx, c.run, { step: c.step, ...entry });
  c.emit('ladder_run', c.run.id, 'update', {
    ladder_id: c.run.ladder_id, person_id: c.run.person_id, step: c.step, ...entry,
  });
};

const finish = async (c, reason) => {
  await endRun(c.tx, c.run);
  await appendLog(c.tx, c.run, { step: c.step, kind: 'end', result: reason });
  c.emit('ladder_run', c.run.id, 'update', {
    ladder_id: c.run.ladder_id, person_id: c.run.person_id, status: 'done', reason,
  });
  return { done: reason };
};

// On to the next step, now — or finish if this was the last one.
const next = async (c) => {
  const n = c.step + 1;
  if (n >= c.steps.length) return finish(c, 'finished');
  await schedule(c.tx, c.run, { step: n });
  return { next: n };
};

const STEPS = {
  wait: async (c, s) => {
    const until = Date.now() + waitMs(s);
    await record(c, { kind: 'wait', result: 'waiting', until: iso(until) });
    await schedule(c.tx, c.run, { step: c.step + 1, at: until, wait: 'time' });
    return { waitUntil: iso(until) };
  },

  email: async (c, s, attempt) => {
    const { tx, run, person } = c;
    const sub = person.email ? (await tx.query(
      'select id, status from subscriptions where workspace_id = $1 and email = $2',
      [run.workspace_id, lower(person.email)],
    )).rows[0] : null;
    const skip = !person.email ? 'no_email'
      : sub?.status === 'unsubscribed' ? 'unsubscribed'
      : isDnc(person) ? 'do_not_contact' : null;
    if (skip) {
      await record(c, { kind: 'email', result: 'skipped', reason: skip });
      return next(c);
    }
    const again = (ms, extra = {}) => enqueueJob(tx, {
      workspaceId: run.workspace_id, kind: JOB, runAt: iso(Date.now() + ms),
      payload: { run_id: run.id, ladder_id: run.ladder_id, step: c.step, token: run.token, ...extra },
    });
    if (!emailConfigured()) {
      // Logged once, when the run starts waiting; the hourly looks write nothing.
      if (run.wait !== 'email') {
        await tx.query("update ladder_runs set wait = 'email', next_at = null where id = $1", [run.id]);
        await record(c, { kind: 'email', result: 'waiting', reason: 'email_not_connected' });
      }
      await again(HOUR);
      return { waiting: 'email' };
    }
    const base = (process.env.STARBASE_PUBLIC_URL || c.ladder.public_url || '').replace(/\/$/, '');
    const fill = { person, campaign: c.ladder.campaign };
    // Every ladder email says who sent it and carries the reader's own
    // one-click unsubscribe (it takes them off the newsletter too).
    const text = `${fillIn(s.body, fill)}\n\n—\nSent by ${c.ladder.campaign}.\nUnsubscribe: ${base}/lu/${run.id}`;
    const res = await sendEmail({ to: person.email, subject: fillIn(s.subject, fill), text });
    if (res.status === 'sent') {
      await tx.query('update ladder_runs set wait = null where id = $1', [run.id]);
      await record(c, { kind: 'email', result: 'sent' });
      return next(c);
    }
    const tries = attempt + 1;
    const detail = String(res.detail || res.status).slice(0, 200);
    if (tries < EMAIL_TRIES) {
      await tx.query("update ladder_runs set wait = 'retry' where id = $1", [run.id]);
      await record(c, { kind: 'email', result: 'failed', reason: 'will_retry', detail, tries });
      await again(HOUR, { attempt: tries });
      return { failed: tries };
    }
    await tx.query('update ladder_runs set wait = null where id = $1', [run.id]);
    await record(c, { kind: 'email', result: 'failed', reason: 'gave_up', detail, tries });
    return next(c);
  },

  tag: async (c, s) => {
    const tags = tagsOf(c.person);
    if (!tags.some((t) => sameTag(t, s.tag))) {
      const nextTags = [...tags, s.tag];
      await c.tx.query('update persons set tags = $3, updated_at = now() where id = $1 and workspace_id = $2',
        [c.person.id, c.run.workspace_id, JSON.stringify(nextTags)]);
      c.emit('person', c.person.id, 'update', { tags: nextTags, source: 'ladder', ladder_id: c.run.ladder_id });
    }
    await record(c, { kind: 'tag', result: 'done', tag: s.tag });
    return next(c);
  },

  untag: async (c, s) => {
    const tags = tagsOf(c.person);
    if (tags.some((t) => sameTag(t, s.tag))) {
      const nextTags = tags.filter((t) => !sameTag(t, s.tag));
      await c.tx.query('update persons set tags = $3, updated_at = now() where id = $1 and workspace_id = $2',
        [c.person.id, c.run.workspace_id, JSON.stringify(nextTags)]);
      c.emit('person', c.person.id, 'update', { tags: nextTags, source: 'ladder', ladder_id: c.run.ladder_id });
    }
    await record(c, { kind: 'untag', result: 'done', tag: s.tag });
    return next(c);
  },

  followup: async (c, s) => {
    if (isDnc(c.person)) {
      await record(c, { kind: 'followup', result: 'skipped', reason: 'do_not_contact' });
      return next(c);
    }
    const id = newId();
    const text = fillIn(s.text, { person: c.person, campaign: c.ladder.campaign });
    await c.tx.query(
      `insert into ladder_followups (id, workspace_id, ladder_id, run_id, person_id, text)
       values ($1, $2, $3, $4, $5, $6)`,
      [id, c.run.workspace_id, c.run.ladder_id, c.run.id, c.person.id, text],
    );
    c.emit('ladder_followup', id, 'create', {
      ladder_id: c.run.ladder_id, run_id: c.run.id, person_id: c.person.id, text,
    });
    await record(c, { kind: 'followup', result: 'done', followup_id: id });
    return next(c);
  },

  stop: async (c) => finish(c, 'stopped'),
};

export const runStepJob = async (db, job) => {
  await runAction(db, { workspaceId: job.workspace_id, actorId: null, action: STEP_ACTION }, async (tx, emit) => {
    const loaded = await loadStepContext(tx, job);
    if (!loaded) return { stale: true };
    const c = { tx, emit, ...loaded };
    if (!c.person) return finish(c, 'person_removed');
    if (c.step >= c.steps.length) return finish(c, 'finished');
    const s = c.steps[c.step];
    const fn = STEPS[s?.kind];
    if (!fn) return finish(c, 'unknown_step');
    return fn(c, s, Number(job.payload?.attempt) || 0);
  });
};
