// Surveys: the desk builds them (five kinds, reorder, edit, remove, archive),
// the field reads only the questions asked there, answers ride along with
// contact.log and are checked against their question, and results count each
// person's latest answer. Volunteers never read results or anyone's answers.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, Client } from './helpers.js';
import { getDb } from '../db/client.js';

const tag = Math.random().toString(36).slice(2, 8);
let desk, vol, other, ws;
let P = {};
let turfIn, turfOut;
let S; // the main survey
let Q = {}; // its questions by kind

const ok = (r, msg) => { assert.equal(r.status, 200, `${msg || ''} ${JSON.stringify(r.json)}`); return r.json; };

before(async () => {
  await freshDb();
  desk = new Client();
  const r = await desk.signup({ workspaceName: `Surveys WS ${tag}`, email: `sv-desk+${tag}@example.org`, jurisdiction: 'bc-municipal' });
  ws = r.json.workspace.id;

  vol = new Client();
  const v = await vol.signup({ workspaceName: `Temp ${tag}`, email: `sv-vol+${tag}@example.org` });
  const db = await getDb();
  await db.query('update memberships set workspace_id = $2, role = $3 where user_id = $1', [v.json.user.id, ws, 'volunteer']);
  await db.query('update sessions set workspace_id = $2 where user_id = $1', [v.json.user.id, ws]);

  other = new Client();
  await other.signup({ workspaceName: `Other ${tag}`, email: `sv-other+${tag}@example.org` });

  P.ana = await desk.createPerson('Ana Example', { phone: '604-555-0110', email: 'ana@example.org', address: '12345 72 Ave', lat: 49.133, lng: -122.851 });
  P.ben = await desk.createPerson('Ben Example', { phone: '604-555-0111', email: 'ben@example.org', address: '12390 72 Ave', lat: 49.1331, lng: -122.8495 });
  P.cy = await desk.createPerson('Cy Example', { phone: '604-555-0112', address: '7120 140 St', lat: 49.20, lng: -122.70 });
  P.dee = await desk.createPerson('=Dee, "Formula"', { phone: '604-555-0113' });

  turfIn = ok(await desk.action('turf.create', {
    name: 'Newton A', polygon: [[49.13, -122.86], [49.14, -122.86], [49.14, -122.84], [49.13, -122.84]],
  })).turf;
  turfOut = ok(await desk.action('turf.create', {
    name: 'Far away', polygon: [[49.0, -122.5], [49.01, -122.5], [49.01, -122.49], [49.0, -122.49]],
  })).turf;
});

test('the desk builds a survey: five kinds, checked choices, reorder, edit, remove', async () => {
  S = ok(await desk.action('survey.create', { name: 'Doorstep issues' })).survey;
  assert.equal(S.context, 'both', 'asked at the door and on calls by default');
  assert.equal(S.active, true);

  const add = (input) => desk.action('survey.question.add', { survey_id: S.id, ...input });
  Q.choice = ok(await add({ kind: 'choice', text: 'What matters most?', options: ['Transit', 'Housing', 'Safety'] })).question;
  Q.choices = ok(await add({ kind: 'choices', text: 'Which would you help with?', options: ['Lawn sign', 'Phone calls', 'Doorknocking'] })).question;
  Q.yesno = ok(await add({ kind: 'yesno', text: 'Will you vote early?' })).question;
  Q.scale = ok(await add({ kind: 'scale', text: 'How likely are you to vote?' })).question;
  Q.text = ok(await add({ kind: 'text', text: 'Anything else?' })).question;
  assert.deepEqual([Q.choice, Q.choices, Q.yesno, Q.scale, Q.text].map((q) => q.position), [0, 1, 2, 3, 4]);

  assert.equal((await add({ kind: 'choice', text: 'One?', options: ['Only'] })).status, 400, 'a choice needs two choices');
  assert.equal((await add({ kind: 'choice', text: 'Dupes?', options: ['Yes', 'yes'] })).status, 400, 'choices must differ');
  assert.equal((await add({ kind: 'yesno', text: 'Opts?', options: ['A', 'B'] })).status, 400, 'yes/no has no choices');
  assert.equal((await add({ kind: 'rating', text: 'Bad kind' })).status, 400);
  assert.equal((await desk.action('survey.create', { name: 'x', turf_ids: [P.ana.id] })).status, 400, 'turfs must be real turfs');

  // Reorder: every question, in the new order.
  const order = [Q.scale.id, Q.choice.id, Q.choices.id, Q.yesno.id, Q.text.id];
  ok(await desk.action('survey.question.reorder', { survey_id: S.id, ids: order }));
  const built = ok(await desk.get(`/api/surveys/${S.id}`));
  assert.deepEqual(built.questions.map((q) => q.id), order);
  assert.equal((await desk.action('survey.question.reorder', { survey_id: S.id, ids: order.slice(1) })).status, 409, 'a partial order is refused');

  // Edit text and choices; a removed question leaves the builder.
  const extra = ok(await add({ kind: 'yesno', text: 'Remove me' })).question;
  ok(await desk.action('survey.question.update', { id: Q.choice.id, text: 'What matters most to you?' }));
  ok(await desk.action('survey.question.remove', { id: extra.id }));
  const after = ok(await desk.get(`/api/surveys/${S.id}`));
  assert.equal(after.questions.length, 5);
  assert.equal(after.questions.find((q) => q.id === Q.choice.id).text, 'What matters most to you?');
  assert.ok(after.turfs.some((t) => t.id === turfIn.id), 'the builder lists turfs to pick from');
  assert.equal((await desk.action('survey.question.update', { id: extra.id, text: 'back?' })).status, 404);
});

test('the field gets only the questions asked there — door, calls, turf, on/off', async () => {
  const doorOnly = ok(await desk.action('survey.create', { name: 'Door only', context: 'door' })).survey;
  ok(await desk.action('survey.question.add', { survey_id: doorOnly.id, kind: 'yesno', text: 'Sign?' }));
  const callsOnly = ok(await desk.action('survey.create', { name: 'Calls only', context: 'calls' })).survey;
  ok(await desk.action('survey.question.add', { survey_id: callsOnly.id, kind: 'yesno', text: 'Volunteer?' }));
  const inTurf = ok(await desk.action('survey.create', { name: 'Newton only', context: 'door', turf_ids: [turfIn.id] })).survey;
  ok(await desk.action('survey.question.add', { survey_id: inTurf.id, kind: 'yesno', text: 'Bus stop?' }));
  const off = ok(await desk.action('survey.create', { name: 'Off', active: false })).survey;
  ok(await desk.action('survey.question.add', { survey_id: off.id, kind: 'yesno', text: 'Off?' }));
  ok(await desk.action('survey.create', { name: 'Empty' })); // no questions: nothing to ask

  const names = (r) => r.surveys.map((s) => s.name).sort();
  const door = ok(await vol.get('/api/surveys/active?context=door'));
  assert.deepEqual(names(door), ['Door only', 'Doorstep issues', 'Newton only']);
  const newton = door.surveys.find((s) => s.name === 'Newton only');
  assert.deepEqual(newton.turf_ids, [turfIn.id]);
  assert.equal(newton.areas.length, 1, 'the turf outline rides along for an offline check');
  assert.deepEqual(Object.keys(newton).sort(), ['areas', 'id', 'limited', 'name', 'questions', 'turf_ids']);
  assert.deepEqual(Object.keys(newton.questions[0]).sort(), ['id', 'kind', 'options', 'text'], 'questions only — no counts, no answers');

  assert.deepEqual(names(ok(await vol.get('/api/surveys/active?context=calls'))), ['Calls only', 'Doorstep issues']);
  assert.deepEqual(names(ok(await vol.get(`/api/surveys/active?context=door&turf=${turfOut.id}`))), ['Door only', 'Doorstep issues'],
    'a survey kept to another turf is not asked here');
  assert.deepEqual(names(ok(await vol.get(`/api/surveys/active?context=door&turf=${turfIn.id}`))), ['Door only', 'Doorstep issues', 'Newton only']);
  assert.equal((await vol.get('/api/surveys/active?context=everywhere')).status, 400);

  // Turned off → gone from the field; on again → back.
  ok(await desk.action('survey.update', { id: doorOnly.id, active: false }));
  assert.ok(!names(ok(await vol.get('/api/surveys/active?context=door'))).includes('Door only'));
  ok(await desk.action('survey.update', { id: doorOnly.id, active: true, context: 'calls' }));
  assert.ok(names(ok(await vol.get('/api/surveys/active?context=calls'))).includes('Door only'));
  // Clean up so later tests only see the main survey in the field.
  for (const s of [doorOnly, callsOnly, inTurf]) ok(await desk.action('survey.archive', { id: s.id }));
  assert.deepEqual(names(ok(await vol.get('/api/surveys/active?context=door'))), ['Doorstep issues']);
});

test('answers ride along with contact.log, checked against their question', async () => {
  const before = ok(await desk.get(`/api/persons/${P.ana.id}/answers`)).answers.length;
  const r = ok(await vol.action('contact.log', {
    person_id: P.ana.id, channel: 'door', outcome: 'contacted', rating: '1',
    answers: [
      { question_id: Q.choice.id, value: 'Transit' },
      { question_id: Q.choices.id, value: ['Lawn sign', 'Phone calls'] },
      { question_id: Q.yesno.id, value: true },
      { question_id: Q.scale.id, value: 5 },
      { question_id: Q.text.id, value: '  More buses on 72 Ave  ' },
    ],
  }), 'volunteer logs a knock with answers');
  assert.ok(r.contact.id);
  const mine = ok(await desk.get(`/api/persons/${P.ana.id}/answers`)).answers;
  assert.equal(mine.length - before, 5);
  const says = Object.fromEntries(mine.map((a) => [a.question_id, a.says]));
  assert.equal(says[Q.choice.id], 'Transit');
  assert.equal(says[Q.choices.id], 'Lawn sign, Phone calls');
  assert.equal(says[Q.yesno.id], 'Yes');
  assert.equal(says[Q.scale.id], '5');
  assert.equal(says[Q.text.id], 'More buses on 72 Ave', 'short answers are trimmed');
  assert.ok(mine.every((a) => a.channel === 'door' && a.at));

  // Answers only ("Save answers"): a talked contact, no rating.
  ok(await desk.action('contact.log', {
    person_id: P.ben.id, channel: 'phone', outcome: 'contacted',
    answers: [{ question_id: Q.choice.id, value: 'Housing' }, { question_id: Q.yesno.id, value: false }],
  }));
  const ben = ok(await desk.get(`/api/persons/${P.ben.id}`));
  assert.equal(ben.person.rating, null, 'no rating was given');
  assert.equal(ben.contacts[0].outcome, 'contacted');
});

test('an answer that does not fit refuses the whole knock — nothing half-saved', async () => {
  const db = await getDb();
  const count = async () => (await db.query('select count(*)::int as n from contacts where workspace_id = $1', [ws])).rows[0].n;
  const n0 = await count();
  const bad = [
    [{ question_id: Q.choice.id, value: 'Pizza' }, 'not one of the choices'],
    [{ question_id: Q.choice.id, value: ['Transit'] }, 'one choice is one string'],
    [{ question_id: Q.choices.id, value: [] }, 'several choices needs one or more'],
    [{ question_id: Q.choices.id, value: ['Lawn sign', 'Lawn sign'] }, 'no repeats'],
    [{ question_id: Q.yesno.id, value: 'yes' }, 'yes/no is a boolean'],
    [{ question_id: Q.scale.id, value: 6 }, 'scale is 1–5'],
    [{ question_id: Q.scale.id, value: 2.5 }, 'scale is whole'],
    [{ question_id: Q.text.id, value: '   ' }, 'an empty short answer'],
    [{ question_id: Q.text.id, value: 'x'.repeat(501) }, 'short answers are short'],
    [{ question_id: P.ana.id, value: 'Transit' }, 'not a question'],
  ];
  for (const [answer, why] of bad) {
    const r = await desk.action('contact.log', { person_id: P.cy.id, channel: 'door', outcome: 'contacted', rating: '2', answers: [answer] });
    assert.equal(r.status, 400, why);
  }
  const twice = await desk.action('contact.log', {
    person_id: P.cy.id, channel: 'door', outcome: 'contacted',
    answers: [{ question_id: Q.yesno.id, value: true }, { question_id: Q.yesno.id, value: false }],
  });
  assert.equal(twice.status, 400, 'one answer per question');
  assert.equal(await count(), n0, 'no contact was stored for any refused knock');
  assert.equal(ok(await desk.get(`/api/persons/${P.cy.id}`)).person.rating, null, 'and no rating either');

  // Another campaign's question is not this campaign's.
  const os = ok(await other.action('survey.create', { name: 'Theirs' })).survey;
  const oq = ok(await other.action('survey.question.add', { survey_id: os.id, kind: 'yesno', text: 'Theirs?' })).question;
  const cross = await desk.action('contact.log', { person_id: P.cy.id, channel: 'door', outcome: 'contacted', answers: [{ question_id: oq.id, value: true }] });
  assert.equal(cross.status, 400);
});

test('a knock replayed from the outbox stores its answers once', async () => {
  const clientId = '2f1b8f9e-1111-4c4c-9a9a-0123456789ab';
  const knock = {
    person_id: P.cy.id, channel: 'door', outcome: 'contacted', rating: '3', client_id: clientId,
    answers: [{ question_id: Q.choice.id, value: 'Safety' }],
  };
  ok(await vol.action('contact.log', knock));
  const again = ok(await vol.action('contact.log', knock));
  assert.equal(again.duplicate, true);
  const cy = ok(await desk.get(`/api/persons/${P.cy.id}/answers`)).answers;
  assert.equal(cy.filter((a) => a.question_id === Q.choice.id).length, 1);
});

test('results: each person once (latest answer), counts, %, people, short answers', async () => {
  // Ana changes her mind on the phone: Housing now (latest counts once).
  ok(await desk.action('contact.log', {
    person_id: P.ana.id, channel: 'phone', outcome: 'contacted', answers: [{ question_id: Q.choice.id, value: 'Housing' }],
  }));
  ok(await desk.action('contact.log', {
    person_id: P.dee.id, channel: 'phone', outcome: 'contacted',
    answers: [{ question_id: Q.text.id, value: '=SUM(A1) "quoted", yes' }, { question_id: Q.scale.id, value: 3 }],
  }));
  const res = ok(await desk.get(`/api/surveys/${S.id}/results`));
  assert.equal(res.survey.people, 4, 'Ana, Ben, Cy and Dee answered something');
  const q = Object.fromEntries(res.questions.map((x) => [x.id, x]));
  const bar = (qid, label) => q[qid].options.find((o) => o.label === label);

  assert.equal(q[Q.choice.id].answered, 3, 'Ana, Ben, Cy');
  assert.deepEqual(q[Q.choice.id].options.map((o) => o.label), ['Transit', 'Housing', 'Safety'], 'every choice, in order');
  assert.equal(bar(Q.choice.id, 'Transit').count, 0, "Ana's old answer no longer counts");
  assert.equal(bar(Q.choice.id, 'Housing').count, 2);
  assert.equal(bar(Q.choice.id, 'Housing').pct, 67);
  assert.deepEqual(bar(Q.choice.id, 'Housing').people.map((p) => p.name), ['Ana Example', 'Ben Example']);
  assert.equal(bar(Q.choice.id, 'Safety').people[0].id, P.cy.id);

  assert.equal(bar(Q.choices.id, 'Lawn sign').count, 1);
  assert.equal(bar(Q.choices.id, 'Doorknocking').count, 0);
  assert.deepEqual(q[Q.yesno.id].options.map((o) => [o.label, o.count]), [['Yes', 1], ['No', 1]]);
  assert.deepEqual(q[Q.scale.id].options.map((o) => o.count), [0, 0, 1, 0, 1]);
  assert.equal(q[Q.scale.id].options[4].pct, 50);
  assert.equal(q[Q.text.id].answered, 2);
  assert.deepEqual(q[Q.text.id].answers.map((a) => a.value).sort(), ['=SUM(A1) "quoted", yes', 'More buses on 72 Ave']);

  // CSV: one row per person, one column per question, formulas defused.
  const csv = await desk.req('GET', `/api/surveys/${S.id}/results.csv`);
  assert.equal(csv.status, 200);
  const raw = await (await import('../index.js')).app.request(`/api/surveys/${S.id}/results.csv`, { headers: { cookie: desk.cookie } });
  assert.match(raw.headers.get('content-type'), /text\/csv/);
  assert.match(raw.headers.get('content-disposition'), /attachment; filename="survey-doorstep-issues\.csv"/);
  const body = await raw.text();
  const lines = body.trim().split('\r\n');
  assert.equal(lines.length, 5, 'a header and four people');
  assert.match(lines[0], /^Name,Phone,Email,Address,Last answer,How likely are you to vote\?,What matters most to you\?/);
  assert.ok(lines.some((l) => l.startsWith('"\'=Dee, ""Formula"""') && l.includes('"\'=SUM(A1) ""quoted"", yes"')), 'quotes and formulas are escaped');
  assert.ok(lines.some((l) => l.startsWith('Ana Example,604-555-0110,ana@example.org,12345 72 Ave') && l.includes(',Housing,')));
});

test('editing a live question: choices renamed keep older answers valid; kind locked once answered', async () => {
  ok(await desk.action('survey.question.update', { id: Q.choice.id, options: ['Transit', 'Housing', 'Parks'] }));
  // A knock saved offline before the edit still lands.
  ok(await vol.action('contact.log', {
    person_id: P.ben.id, channel: 'door', outcome: 'contacted', answers: [{ question_id: Q.choice.id, value: 'Safety' }],
  }), 'a retired choice is still accepted');
  const res = ok(await desk.get(`/api/surveys/${S.id}/results`));
  const choice = res.questions.find((x) => x.id === Q.choice.id);
  assert.deepEqual(choice.options.map((o) => [o.label, o.count, o.old]), [
    ['Transit', 0, false], ['Housing', 1, false], ['Parks', 0, false], ['Safety', 2, true],
  ], 'the old label keeps its bar after the current ones');
  assert.equal((await desk.action('survey.question.update', { id: Q.choice.id, kind: 'text' })).status, 409);
  const fresh = ok(await desk.action('survey.question.add', { survey_id: S.id, kind: 'yesno', text: 'Fresh?' })).question;
  const changed = ok(await desk.action('survey.question.update', { id: fresh.id, kind: 'choice', options: ['A', 'B'] }));
  assert.equal(changed.question.kind, 'choice', 'an unanswered question can change kind');
  ok(await desk.action('survey.question.remove', { id: fresh.id }));

  // A removed question's answers stay; a knock carrying one still lands.
  ok(await desk.action('survey.question.remove', { id: Q.text.id }));
  ok(await vol.action('contact.log', {
    person_id: P.cy.id, channel: 'door', outcome: 'contacted', answers: [{ question_id: Q.text.id, value: 'late but real' }],
  }));
  assert.ok(ok(await desk.get(`/api/persons/${P.cy.id}/answers`)).answers.some((a) => a.says === 'late but real'));
  assert.ok(!ok(await desk.get(`/api/surveys/${S.id}/results`)).questions.some((x) => x.id === Q.text.id));
});

test('volunteers never read results, the builder, or anyone’s answers', async () => {
  for (const path of [
    '/api/surveys', `/api/surveys/${S.id}`, `/api/surveys/${S.id}/results`, `/api/surveys/${S.id}/results.csv`,
    `/api/persons/${P.ana.id}/answers`,
  ]) {
    assert.equal((await vol.get(path)).status, 403, path);
  }
  for (const [name, input] of [
    ['survey.create', { name: 'Mine' }],
    ['survey.update', { id: S.id, active: false }],
    ['survey.archive', { id: S.id }],
    ['survey.question.add', { survey_id: S.id, kind: 'yesno', text: 'x' }],
    ['survey.question.remove', { id: Q.yesno.id }],
  ]) {
    assert.equal((await vol.action(name, input)).status, 403, name);
  }
  // The profile a volunteer reads carries no answers, and the event log is desk-only.
  const prof = ok(await vol.get(`/api/persons/${P.ana.id}`));
  assert.ok(!JSON.stringify(prof).includes('More buses'), 'no answers in a volunteer profile');
  assert.equal((await vol.get('/api/events')).status, 403);
  // Another campaign's desk cannot read this one's survey.
  assert.equal((await other.get(`/api/surveys/${S.id}/results`)).status, 404);
  assert.equal((await other.get(`/api/persons/${P.ana.id}/answers`)).json.answers.length, 0);
});

test('archive keeps every answer; an archived survey is off the field and locked until brought back', async () => {
  const listBefore = ok(await desk.get('/api/surveys')).surveys.find((s) => s.id === S.id);
  assert.equal(listBefore.people, 4);
  ok(await desk.action('survey.archive', { id: S.id }));
  assert.equal(ok(await vol.get('/api/surveys/active?context=door')).surveys.length, 0);
  const row = ok(await desk.get('/api/surveys')).surveys.find((s) => s.id === S.id);
  assert.equal(row.archived, true);
  assert.equal(row.active, false);
  assert.equal(row.people, 4, 'answers kept');
  assert.equal(ok(await desk.get(`/api/surveys/${S.id}/results`)).survey.people, 4);
  assert.equal((await desk.action('survey.update', { id: S.id, active: true })).status, 409);
  assert.equal((await desk.action('survey.question.add', { survey_id: S.id, kind: 'yesno', text: 'x' })).status, 409);
  const back = ok(await desk.action('survey.archive', { id: S.id, restore: true }));
  assert.equal(back.survey.archived, false);
  assert.equal(back.survey.active, false, 'back on the list, still off');
  ok(await desk.action('survey.update', { id: S.id, active: true }));
  assert.equal(ok(await vol.get('/api/surveys/active?context=door')).surveys.length, 1);
});

test('"answered" is one count on the list, the builder and results; any answer fixes the kind', async () => {
  const s2 = ok(await desk.action('survey.create', { name: `Counts ${tag}`, context: 'calls' })).survey;
  const keep = ok(await desk.action('survey.question.add', { survey_id: s2.id, kind: 'yesno', text: 'Keep?' })).question;
  const drop = ok(await desk.action('survey.question.add', { survey_id: s2.id, kind: 'yesno', text: 'Drop?' })).question;
  const eve = await desk.createPerson('Eve Example', { phone: '604-555-0114' });
  const fay = await desk.createPerson('Fay Example', { phone: '604-555-0115' });
  ok(await desk.action('contact.log', { person_id: eve.id, channel: 'phone', outcome: 'contacted', answers: [{ question_id: drop.id, value: true }] }));
  ok(await desk.action('contact.log', { person_id: fay.id, channel: 'phone', outcome: 'contacted', answers: [{ question_id: keep.id, value: false }] }));
  const counts = async () => [
    ok(await desk.get('/api/surveys')).surveys.find((x) => x.id === s2.id).people,
    ok(await desk.get(`/api/surveys/${s2.id}`)).survey.people,
    ok(await desk.get(`/api/surveys/${s2.id}/results`)).survey.people,
  ];
  assert.deepEqual(await counts(), [2, 2, 2]);
  ok(await desk.action('survey.question.remove', { id: drop.id }));
  assert.deepEqual(await counts(), [1, 1, 1], "Eve only answered the removed question");
  const b = ok(await desk.get(`/api/surveys/${s2.id}`)).questions.find((x) => x.id === keep.id);
  assert.equal(b.answered, 1);
  assert.equal(b.locked, true);
  ok(await desk.action('survey.archive', { id: s2.id }));
});

test('every survey write is on the hash chain', async () => {
  const events = ok(await desk.get('/api/events?limit=1000')).events;
  const types = new Set(events.map((e) => e.entity_type));
  for (const t of ['survey', 'survey_question', 'survey_response']) assert.ok(types.has(t), t);
  const resp = events.filter((e) => e.entity_type === 'survey_response');
  assert.ok(resp.every((e) => e.action === 'contact.log'), 'answers are written by the knock that carried them');
  const v = ok(await desk.get('/api/audit/verify'));
  assert.equal(v.ok, true);
});
