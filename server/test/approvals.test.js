// Approval notifications: approvers are alerted when a post goes pending; the
// author is alerted on approve/reject.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, mockFetch, jsonResponse } from './helpers.js';

const { db, sqlite, schema } = await setupDb();
const { encryptJson } = await import('../lib/crypto.js');
const socialApp = (await import('../routes/social.js')).default;

const EID = 'sess_editor', AID = 'sess_admin';
await db.insert(schema.workspaces).values({ id: 'ws_ap', name: 'W' });
await db.insert(schema.users).values([
  { id: 'u_editor', email: 'e@t.com', passwordHash: 'x', name: 'Edie Editor', role: 'editor', workspaceId: 'ws_ap' },
  { id: 'u_admin', email: 'a@t.com', passwordHash: 'x', name: 'Adam Admin', role: 'super_admin', workspaceId: 'ws_ap' },
  { id: 'u_admin2', email: 'a2@t.com', passwordHash: 'x', name: 'Ada Admin2', role: 'admin', workspaceId: 'ws_ap' },
]);
await db.insert(schema.sessions).values([
  { id: EID, userId: 'u_editor', expiresAt: new Date(Date.now() + 3600e3) },
  { id: AID, userId: 'u_admin', expiresAt: new Date(Date.now() + 3600e3) },
]);
await db.insert(schema.socialAccounts).values({ id: 'sa_ap', workspaceId: 'ws_ap', platform: 'mastodon', handle: '@m', status: 'connected', credentials: encryptJson({ instanceUrl: 'https://i', accessToken: 't' }) });

const rq = (sid, method, path, body) => socialApp.request(path, {
  method, headers: { Cookie: `mdt_session=${sid}`, 'Content-Type': 'application/json' },
  body: body != null ? JSON.stringify(body) : undefined,
});
const notifs = (uid, kind) => sqlite.prepare('SELECT title, body FROM notifications WHERE user_id=? AND kind=?').all(uid, kind);

test('submitting for approval notifies all approvers but not the submitter', async () => {
  const draft = await (await rq(EID, 'POST', '/posts', { body: 'please review this', targets: ['sa_ap'], saveDraft: true })).json();
  await rq(EID, 'POST', `/posts/${draft.groupId}/submit`);
  assert.equal(notifs('u_admin', 'social.approval').length, 1, 'super_admin notified');
  assert.equal(notifs('u_admin2', 'social.approval').length, 1, 'admin notified');
  assert.equal(notifs('u_editor', 'social.approval').length, 0, 'submitter not notified');
});

test('compose submitForApproval also notifies approvers', async () => {
  await rq(EID, 'POST', '/posts', { body: 'direct to approval', targets: ['sa_ap'], submitForApproval: true });
  assert.equal(notifs('u_admin', 'social.approval').length, 2, 'second approval alert');
});

test('approving notifies the author', async () => {
  const draft = await (await rq(EID, 'POST', '/posts', { body: 'approve me', targets: ['sa_ap'], saveDraft: true })).json();
  await rq(EID, 'POST', `/posts/${draft.groupId}/submit`);
  const restore = mockFetch((url) => url.includes('/api/v1/statuses') ? jsonResponse({ id: '1', url: 'https://i/1' }) : jsonResponse({}));
  try {
    await rq(AID, 'POST', `/posts/${draft.groupId}/approve`);
  } finally { restore(); }
  assert.equal(notifs('u_editor', 'social.approved').length, 1, 'author told it was approved');
});

test('rejecting notifies the author with the reason', async () => {
  const draft = await (await rq(EID, 'POST', '/posts', { body: 'reject me', targets: ['sa_ap'], saveDraft: true })).json();
  await rq(EID, 'POST', `/posts/${draft.groupId}/submit`);
  await rq(AID, 'POST', `/posts/${draft.groupId}/reject`, { reason: 'off message' });
  const rej = notifs('u_editor', 'social.rejected');
  assert.equal(rej.length, 1);
  assert.match(rej[0].body, /off message/);
});
