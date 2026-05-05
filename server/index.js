// Mandate API server — Hono + SQLite
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { ensureTables } from './db/index.js';
import { startWebhookWorker } from './lib/webhooks.js';
import { startRetentionWorker } from './lib/retention.js';
import { startReportsWorker } from './lib/reports.js';
import { csrfMiddleware } from './middleware/csrf.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import workspaceRoutes from './routes/workspace.js';
import workspacesRoutes from './routes/workspaces.js';
import dataRoutes from './routes/data.js';
import auditRoutes from './routes/audit.js';
import inviteRoutes from './routes/invites.js';
import passwordResetRoutes from './routes/password-reset.js';
import tokenRoutes from './routes/tokens.js';
import webhookRoutes from './routes/webhooks.js';
import backupRoutes from './routes/backup.js';
import eventsRoutes from './routes/events.js';
import notificationsRoutes from './routes/notifications.js';
import totpRoutes from './routes/totp.js';
import formsAdminRoutes from './routes/forms-admin.js';
import formsPublicRoutes from './routes/forms-public.js';
import metricsRoutes from './routes/metrics.js';
import oauthAdminRoutes, { publicApp as oauthPublicRoutes } from './routes/oauth.js';
import commentsRoutes from './routes/comments.js';
import reportsRoutes from './routes/reports.js';
import passkeyRoutes from './routes/passkey.js';
import dashboardRoutes from './routes/dashboard.js';

ensureTables();
startWebhookWorker();
startRetentionWorker();
startReportsWorker();

const app = new Hono();

app.use('*', async (c, next) => {
  await next();
  if (!c.res.headers.get('content-type')) {
    c.res.headers.set('content-type', 'application/json');
  }
});

app.use('/api/*', csrfMiddleware);

// Health
app.get('/api/health', (c) => c.json({ ok: true, time: new Date().toISOString() }));

// Test-only: inspect captured emails. Enabled when MANDATE_EMAIL_BACKEND=capture.
if (process.env.MANDATE_EMAIL_BACKEND === 'capture') {
  app.get('/api/_test/emails', async (c) => {
    const { getCapturedEmails, clearCapturedEmails } = await import('./lib/email.js');
    const list = getCapturedEmails();
    if (c.req.query('clear') === '1') clearCapturedEmails();
    return c.json({ emails: list });
  });
}

app.route('/api/auth', authRoutes);
app.route('/api/users', userRoutes);
app.route('/api/workspace', workspaceRoutes);
app.route('/api/workspaces', workspacesRoutes);
app.route('/api/data', dataRoutes);
app.route('/api/audit', auditRoutes);
app.route('/api/invites', inviteRoutes);
app.route('/api/password-reset', passwordResetRoutes);
app.route('/api/tokens', tokenRoutes);
app.route('/api/webhooks', webhookRoutes);
app.route('/api/workspace/backup', backupRoutes);
app.route('/api/events', eventsRoutes);
app.route('/api/notifications', notificationsRoutes);
app.route('/api/auth/totp', totpRoutes);
app.route('/api/forms', formsAdminRoutes);
app.route('/api/public/forms', formsPublicRoutes);
app.route('/api/metrics', metricsRoutes);
app.route('/api/auth/oauth', oauthPublicRoutes);
app.route('/api/oauth-providers', oauthAdminRoutes);
app.route('/api/comments', commentsRoutes);
app.route('/api/reports', reportsRoutes);
app.route('/api/auth/passkey', passkeyRoutes);
app.route('/api/dashboard', dashboardRoutes);

app.onError((err, c) => {
  console.error('[server error]', err);
  return c.json({ error: err.message || 'internal error' }, 500);
});

const port = Number(process.env.PORT || 3000);
serve({ fetch: app.fetch, port });
console.log(`Mandate API → http://localhost:${port}/api`);
