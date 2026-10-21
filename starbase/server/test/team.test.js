// Team: invites (new and existing accounts), roles, and token hygiene.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, Client } from './helpers.js';
import { getDb } from '../db/client.js';

let mgr;
const tokenOf = (joinUrl) => joinUrl.split('/join/')[1];

before(async () => {
  await freshDb();
  delete process.env.RESEND_API_KEY;
  mgr = new Client();
  await mgr.signup({ workspaceName: 'Imagine Surrey', jurisdiction: 'bc-municipal' });
});

test('manager invites a volunteer; the invitee joins with a new account in that role', async () => {
  const inv = await mgr.action('member.invite', { email: 'Jas@Example.org', role: 'volunteer' });
  assert.equal(inv.status, 200);
  assert.match(inv.json.joinUrl, /\/join\/[0-9a-f]{48}$/);
  assert.equal(inv.json.email, 'queued', 'emailed when a provider exists; queued otherwise');

  const anon = new Client();
  const look = await anon.get(`/api/auth/invite/${tokenOf(inv.json.joinUrl)}`);
  assert.equal(look.status, 200);
  assert.deepEqual(
    { email: look.json.email, role: look.json.role, ws: look.json.workspaceName, has: look.json.hasAccount },
    { email: 'jas@example.org', role: 'volunteer', ws: 'Imagine Surrey', has: false },
  );

  const joined = await anon.post('/api/auth/join', { token: tokenOf(inv.json.joinUrl), name: 'Jas Volunteer', password: 'knock-knock-2026' });
  assert.equal(joined.status, 200);
  assert.equal(joined.json.role, 'volunteer');
  assert.equal(joined.json.workspace.name, 'Imagine Surrey');
  assert.equal((await anon.get('/api/records/gift')).status, 403, 'joined as a volunteer, with volunteer limits');
  assert.equal((await anon.get('/api/map/doors')).status, 200);

  const reuse = await new Client().post('/api/auth/join', { token: tokenOf(inv.json.joinUrl), name: 'X', password: 'whatever-123' });
  assert.equal(reuse.status, 404, 'an invite works once');

  const relogin = new Client();
  const li = await relogin.post('/api/auth/login', { email: 'jas@example.org', password: 'knock-knock-2026' });
  assert.equal(li.status, 200);
  assert.equal(li.json.workspace.name, 'Imagine Surrey');
});

test('an existing Starbase user joins by proving their password', async () => {
  const other = new Client();
  await other.signup({ email: 'organizer@example.org', password: 'organizer-pass-1', workspaceName: 'Their Own Campaign' });
  const inv = await mgr.action('member.invite', { email: 'organizer@example.org', role: 'staff' });
  const t = tokenOf(inv.json.joinUrl);
  assert.equal((await new Client().get(`/api/auth/invite/${t}`)).json.hasAccount, true);
  const wrong = await new Client().post('/api/auth/join', { token: t, password: 'not-their-password' });
  assert.equal(wrong.status, 401);
  const ok = await new Client().post('/api/auth/join', { token: t, password: 'organizer-pass-1' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.role, 'staff');
  assert.equal(ok.json.workspace.name, 'Imagine Surrey');
});

test('team list, duplicate invite refused, role change, cannot demote yourself', async () => {
  const team = await mgr.get('/api/team');
  assert.equal(team.status, 200);
  assert.equal(team.json.members.length, 3);
  const jas = team.json.members.find((m) => m.email === 'jas@example.org');
  assert.equal(jas.role, 'volunteer');
  const dup = await mgr.action('member.invite', { email: 'jas@example.org', role: 'staff' });
  assert.equal(dup.status, 409);
  const promote = await mgr.action('member.setRole', { user_id: jas.id, role: 'staff' });
  assert.equal(promote.status, 200);
  const me = (await mgr.get('/api/auth/me')).json.user;
  const self = await mgr.action('member.setRole', { user_id: me.id, role: 'volunteer' });
  assert.equal(self.status, 400);
  const pending = await mgr.action('member.invite', { email: 'later@example.org', role: 'volunteer' });
  assert.equal(pending.status, 200);
  assert.ok((await mgr.get('/api/team')).json.invites.some((i) => i.email === 'later@example.org'));
});

test('only managers manage the team; tokens never enter the event log; expired invites fail', async () => {
  const inv = await mgr.action('member.invite', { email: 'expiring@example.org', role: 'volunteer' });
  const t = tokenOf(inv.json.joinUrl);
  const events = (await mgr.get('/api/events?since=0&limit=1000')).json.events;
  assert.ok(events.some((e) => e.entity_type === 'invite'));
  assert.ok(!JSON.stringify(events).includes(t), 'raw token absent from the log');

  const db = await getDb();
  await db.query(`update invites set expires_at = now() - interval '1 minute' where email = 'expiring@example.org'`);
  assert.equal((await new Client().get(`/api/auth/invite/${t}`)).status, 404);

  const staffInv = await mgr.action('member.invite', { email: 'staffer@example.org', role: 'staff' });
  const staff = new Client();
  await staff.post('/api/auth/join', { token: tokenOf(staffInv.json.joinUrl), name: 'Staffer', password: 'staffer-pass-1' });
  assert.equal((await staff.get('/api/team')).status, 403);
  assert.equal((await staff.action('member.invite', { email: 'x@example.org', role: 'volunteer' })).status, 403);
});
