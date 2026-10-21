// Shifts: create, assign (capacity, duplicates), status, notify with
// per-assignee email/text results that degrade to 'queued' without providers.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, Client } from './helpers.js';

let c;

before(async () => {
  await freshDb();
  delete process.env.RESEND_API_KEY;
  delete process.env.TWILIO_ACCOUNT_SID;
  c = new Client();
  await c.signup({ workspaceName: 'Shift WS' });
});

test('create a shift, assign volunteers, see fill count', async () => {
  const s = await c.action('shift.create', {
    title: 'Saturday canvass — Newton',
    role: 'doorknocking',
    location: 'Newton Rec Centre, 13730 72 Ave',
    starts_at: '2026-11-07T10:00:00-07:00',
    ends_at: '2026-11-07T13:00:00-07:00',
    instructions: 'Wear comfortable shoes. Meet at the north entrance.',
    link: 'https://imaginesurrey.ca/canvass',
    capacity: 2,
  });
  assert.equal(s.status, 200);
  const shift = s.json.shift;
  const a = await c.createPerson('Vol A', { email: 'a@example.org', phone: '604-555-0001' });
  const b = await c.createPerson('Vol B', { phone: '604-555-0002' });
  const d = await c.createPerson('Vol D');
  assert.equal((await c.action('shift.assign', { shift_id: shift.id, person_id: a.id })).status, 200);
  assert.equal((await c.action('shift.assign', { shift_id: shift.id, person_id: b.id })).status, 200);
  const dup = await c.action('shift.assign', { shift_id: shift.id, person_id: a.id });
  assert.equal(dup.status, 409, 'duplicate assignment refused');
  const full = await c.action('shift.assign', { shift_id: shift.id, person_id: d.id });
  assert.equal(full.status, 409, 'capacity enforced');
  const list = await c.get('/api/shifts');
  assert.equal(list.json.shifts[0].filled, 2);
});

test('notify records per-assignee channel outcomes and timestamps', async () => {
  const list = await c.get('/api/shifts');
  const shift = list.json.shifts[0];
  const n = await c.action('shift.notify', { shift_id: shift.id });
  assert.equal(n.status, 200);
  const byName = Object.fromEntries(n.json.notified.map((r) => [r.name, r]));
  assert.equal(byName['Vol A'].email, 'queued', 'has email, no provider → queued');
  assert.equal(byName['Vol A'].text, 'queued', 'has phone, no provider → queued');
  assert.equal(byName['Vol B'].email, 'skipped', 'no email on file');
  assert.equal(byName['Vol B'].text, 'queued');
  const detail = await c.get(`/api/shifts/${shift.id}`);
  assert.ok(detail.json.assignees.every((a) => a.notified_at));
  assert.equal(detail.json.assignees.find((a) => a.name === 'Vol A').notify_email, 'queued');
});

test('declining frees a capacity slot; status changes are recorded', async () => {
  const list = await c.get('/api/shifts');
  const shift = list.json.shifts[0];
  const detail = await c.get(`/api/shifts/${shift.id}`);
  const volB = detail.json.assignees.find((a) => a.name === 'Vol B');
  const dec = await c.action('shift.setStatus', { id: volB.assignment_id, status: 'declined' });
  assert.equal(dec.status, 200);
  const d = await c.createPerson('Vol D2');
  const now = await c.action('shift.assign', { shift_id: shift.id, person_id: d.id });
  assert.equal(now.status, 200, 'slot freed by the decline');
  const un = await c.action('shift.unassign', { id: volB.assignment_id });
  assert.equal(un.status, 200);
});

test('upcoming shifts surface on the brief; person profile lists their shifts', async () => {
  const brief = await c.get('/api/brief');
  assert.ok(brief.json.shifts.length >= 1);
  assert.equal(brief.json.shifts[0].title, 'Saturday canvass — Newton');
  const list = await c.get('/api/shifts');
  const detail = await c.get(`/api/shifts/${list.json.shifts[0].id}`);
  const volA = detail.json.assignees.find((a) => a.name === 'Vol A');
  const prof = await c.get(`/api/persons/${volA.id}`);
  assert.equal(prof.json.shifts.length, 1);
});

test('bad timestamps and unknown shifts are rejected', async () => {
  const bad = await c.action('shift.create', { title: 'x', starts_at: 'next tuesday' });
  assert.equal(bad.status, 400);
  const nope = await c.action('shift.notify', { shift_id: '99999999-9999-4999-8999-999999999999' });
  assert.equal(nope.status, 404);
});
