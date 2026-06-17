// In-process route tests: drive the social Hono router via app.request() with a
// forged session. Runs in this process, so a mocked global fetch lets us test
// the full publish lifecycle (compose → approve → publish) deterministically —
// something the spawned-server test can't do (real process, blocked hosts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, mockFetch, jsonResponse } from './helpers.js';

const { db, sqlite, schema } = await setupDb();
const { encryptJson } = await import('../lib/crypto.js');
const socialApp = (await import('../routes/social.js')).default;

const SID = 'sess_admin';
const VID = 'sess_viewer';
await db.insert(schema.workspaces).values({ id: 'ws_x', name: 'W', tz: 'PT' });
await db.insert(schema.users).values([
  { id: 'u_admin', email: 'a@t.com', passwordHash: 'x', name: 'Admin', role: 'super_admin', workspaceId: 'ws_x' },
  { id: 'u_view', email: 'v@t.com', passwordHash: 'x', name: 'View', role: 'viewer', workspaceId: 'ws_x' },
]);
await db.insert(schema.sessions).values([
  { id: SID, userId: 'u_admin', expiresAt: new Date(Date.now() + 3600e3) },
  { id: VID, userId: 'u_view', expiresAt: new Date(Date.now() + 3600e3) },
]);
await db.insert(schema.socialAccounts).values({
  id: 'sa_m', workspaceId: 'ws_x', platform: 'mastodon', handle: '@m', status: 'connected',
  credentials: encryptJson({ instanceUrl: 'https://inst', accessToken: 't' }),
});

function rq(method, path, body, sid = SID) {
  return socialApp.request(path, {
    method,
    headers: { Cookie: `mdt_session=${sid}`, 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  });
}
const grp = (id) => sqlite.prepare('SELECT status FROM social_posts WHERE group_id=?').all(id).map((r) => r.status);

test('publish-now goes through the adapter and marks published', async () => {
  const restore = mockFetch((url) => url.includes('/api/v1/statuses')
    ? jsonResponse({ id: '501', url: 'https://inst/@m/501' })
    : jsonResponse({}));
  try {
    const r = await rq('POST', '/posts', { body: 'live now', targets: ['sa_m'], publishNow: true });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.results[0].ok, true);
    assert.deepEqual(grp(j.groupId), ['published']);
  } finally { restore(); }
});

test('schedule stores a future scheduled post', async () => {
  const when = new Date(Date.now() + 3600e3).toISOString();
  const j = await (await rq('POST', '/posts', { body: 'later', targets: ['sa_m'], scheduledAt: when })).json();
  assert.deepEqual(grp(j.groupId), ['scheduled']);
});

test('draft → submit → approve publishes (admin)', async () => {
  const restore = mockFetch((url) => url.includes('/api/v1/statuses')
    ? jsonResponse({ id: '502', url: 'https://inst/@m/502' })
    : jsonResponse({}));
  try {
    const draft = await (await rq('POST', '/posts', { body: 'needs ok', targets: ['sa_m'], saveDraft: true })).json();
    assert.deepEqual(grp(draft.groupId), ['draft']);
    assert.equal((await rq('POST', `/posts/${draft.groupId}/submit`)).status, 200);
    assert.deepEqual(grp(draft.groupId), ['pending']);
    assert.equal((await rq('POST', `/posts/${draft.groupId}/approve`)).status, 200);
    assert.deepEqual(grp(draft.groupId), ['published']);
  } finally { restore(); }
});

test('reject moves a pending group to rejected', async () => {
  const draft = await (await rq('POST', '/posts', { body: 'no good', targets: ['sa_m'], saveDraft: true })).json();
  await rq('POST', `/posts/${draft.groupId}/submit`);
  await rq('POST', `/posts/${draft.groupId}/reject`, { reason: 'off message' });
  assert.deepEqual(grp(draft.groupId), ['rejected']);
});

test('bulk schedule matches accounts by platform', async () => {
  const r = await rq('POST', '/bulk', { rows: [{ body: 'bulk one', accounts: 'mastodon', scheduledAt: new Date(Date.now() + 7200e3).toISOString() }] });
  const j = await r.json();
  assert.equal(j.created, 1);
  assert.equal(j.results[0].ok, true);
});

test('role gate: a viewer cannot compose (403)', async () => {
  const r = await rq('POST', '/posts', { body: 'nope', targets: ['sa_m'], publishNow: true }, VID);
  assert.equal(r.status, 403);
});

test('unknown session is unauthorized (401)', async () => {
  const r = await socialApp.request('/posts', { method: 'POST', headers: { Cookie: 'mdt_session=bogus', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 401);
});
