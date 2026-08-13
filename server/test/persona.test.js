// Persona layer — users.persona column, PUT validation, derivation rules,
// and persona flowing through /api/auth/me.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { setupDb } from './helpers.js';

const { db, schema } = await setupDb();
const usersApp = (await import('../routes/users.js')).default;
const authApp = (await import('../routes/auth.js')).default;
const { effectivePersona, PERSONAS } = await import('../lib/brief.js');

await db.insert(schema.workspaces).values({ id: 'ws_p', name: 'P', tz: 'PT', plan: 'enterprise' });
await db.insert(schema.users).values([
  { id: 'u_admin', email: 'admin@t.com', passwordHash: 'x', name: 'Admin', role: 'admin', workspaceId: 'ws_p' },
  { id: 'u_editor', email: 'editor@t.com', passwordHash: 'x', name: 'Editor', role: 'editor', workspaceId: 'ws_p' },
  { id: 'u_viewer', email: 'viewer@t.com', passwordHash: 'x', name: 'Viewer', role: 'viewer', workspaceId: 'ws_p' },
]);
await db.insert(schema.sessions).values([
  { id: 'sess_admin', userId: 'u_admin', expiresAt: new Date(Date.now() + 3600e3) },
  { id: 'sess_editor', userId: 'u_editor', expiresAt: new Date(Date.now() + 3600e3) },
  { id: 'sess_viewer', userId: 'u_viewer', expiresAt: new Date(Date.now() + 3600e3) },
]);

const put = (id, body, sess = 'sess_admin') => usersApp.request(`/${id}`, {
  method: 'PUT',
  headers: { Cookie: `mdt_session=${sess}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const userRow = async (id) => (await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1))[0];

test('effectivePersona: null persona derives from role', () => {
  assert.equal(effectivePersona({ role: 'super_admin', persona: null }), 'manager');
  assert.equal(effectivePersona({ role: 'admin', persona: null }), 'manager');
  assert.equal(effectivePersona({ role: 'editor', persona: null }), 'staff');
  assert.equal(effectivePersona({ role: 'viewer', persona: null }), 'volunteer');
});

test('effectivePersona: explicit persona wins; candidate only ever explicit', () => {
  assert.equal(effectivePersona({ role: 'admin', persona: 'candidate' }), 'candidate');
  assert.equal(effectivePersona({ role: 'viewer', persona: 'manager' }), 'manager');
  assert.equal(effectivePersona({ role: 'editor', persona: 'bogus' }), 'staff', 'unknown value falls back to role');
  assert.equal(effectivePersona(null), 'volunteer', 'null user is safe');
  assert.ok(!PERSONAS.map((p) => effectivePersona({ role: p })).includes('candidate'), 'no role derives candidate');
});

test('PUT /api/users/:id persona: valid value persists and is returned', async () => {
  const r = await put('u_viewer', { persona: 'candidate' });
  assert.equal(r.status, 200);
  const { user } = await r.json();
  assert.equal(user.persona, 'candidate');
  assert.equal((await userRow('u_viewer')).persona, 'candidate', 'persisted');
});

test('PUT persona rejects values outside the enum', async () => {
  const r = await put('u_viewer', { persona: 'wizard' });
  assert.equal(r.status, 400);
  assert.equal((await userRow('u_viewer')).persona, 'candidate', 'unchanged on rejection');
  const r2 = await put('u_viewer', { persona: 42 });
  assert.equal(r2.status, 400);
});

test('PUT persona null clears back to role-derived default', async () => {
  const r = await put('u_viewer', { persona: null });
  assert.equal(r.status, 200);
  const { user } = await r.json();
  assert.equal(user.persona, null);
  assert.equal(effectivePersona(await userRow('u_viewer')), 'volunteer');
});

test('editor cannot set personas (admin-only route)', async () => {
  const r = await put('u_viewer', { persona: 'staff' }, 'sess_editor');
  assert.equal(r.status, 403);
});

test('/api/auth/me includes persona', async () => {
  await put('u_viewer', { persona: 'candidate' });
  const r = await authApp.request('/me', { headers: { Cookie: 'mdt_session=sess_viewer' } });
  assert.equal(r.status, 200);
  const { user } = await r.json();
  assert.equal(user.persona, 'candidate');
  assert.equal(user.passwordHash, undefined, 'secrets still stripped');
});
