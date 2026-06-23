// Social analytics reporting — shared rows/CSV, the /analytics/export download,
// and the scheduled-report 'social_analytics' kind (emailed CSV attachment).
process.env.MANDATE_EMAIL_BACKEND = 'capture'; // before importing email-backed modules
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb } from './helpers.js';

const { db, schema } = await setupDb();
const report = await import('../lib/social/report.js');
const { runReport } = await import('../lib/reports.js');
const { getCapturedEmails, clearCapturedEmails } = await import('../lib/email.js');
const socialApp = (await import('../routes/social.js')).default;

await db.insert(schema.workspaces).values({ id: 'ws_rep', name: 'Rep WS' });
await db.insert(schema.users).values({ id: 'u_rep', email: 'rep@t.com', passwordHash: 'x', name: 'R', role: 'admin', workspaceId: 'ws_rep' });
await db.insert(schema.sessions).values({ id: 'sess_rep', userId: 'u_rep', expiresAt: new Date(Date.now() + 3600e3) });
await db.insert(schema.socialPosts).values([
  { id: 'rp1', workspaceId: 'ws_rep', groupId: 'g', platform: 'mastodon', body: 'big winner', status: 'published', publishedAt: new Date(), remoteUrl: 'https://m/1', metricsJson: JSON.stringify({ likes: 10, reposts: 5, replies: 2 }) },
  { id: 'rp2', workspaceId: 'ws_rep', groupId: 'g', platform: 'bluesky', body: 'quiet one', status: 'published', publishedAt: new Date(), remoteUrl: 'https://b/1', metricsJson: JSON.stringify({ likes: 1 }) },
  { id: 'rp3', workspaceId: 'ws_rep', groupId: 'g', platform: 'mastodon', body: 'unpublished draft', status: 'draft' },
]);

test('socialAnalyticsRows: only published posts, richest engagement first', async () => {
  const rows = await report.socialAnalyticsRows('ws_rep');
  assert.equal(rows.length, 2, 'draft excluded');
  assert.equal(rows[0].engagement, 17); // 10 + 5 + 2
  assert.equal(rows[1].engagement, 1);
  assert.equal(rows[0].platform, 'mastodon');
});

test('CSV has the header row and one line per published post', async () => {
  const csv = await report.socialAnalyticsCsv('ws_rep');
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], report.ANALYTICS_HEADERS.join(','));
  assert.equal(lines.length, 3); // header + 2 posts
});

test('GET /analytics/export streams a CSV attachment', async () => {
  const r = await socialApp.request('/analytics/export', { headers: { Cookie: 'mdt_session=sess_rep' } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /text\/csv/);
  assert.match(r.headers.get('content-disposition') || '', /attachment; filename=.*\.csv/);
  assert.match(await r.text(), /^publishedAt,platform,engagement/);
});

test('scheduled report kind social_analytics emails a CSV attachment', async () => {
  clearCapturedEmails();
  const res = await runReport({ id: 'r1', workspaceId: 'ws_rep', name: 'Weekly Social', kind: 'social_analytics', params: '{}', targetEmail: 'boss@t.com', lastRunAt: null });
  assert.equal(res.count, 2);
  const emails = getCapturedEmails();
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, 'boss@t.com');
  const att = emails[0].attachments?.[0];
  assert.ok(att && att.filename.endsWith('.csv'), 'CSV attached');
  assert.match(att.content, /publishedAt,platform,engagement/);
  assert.match(att.content, /big winner/);
});
