// Mandate API server — Hono + SQLite
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { bodyLimit } from 'hono/body-limit';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureTables } from './db/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');
const SERVE_STATIC = process.env.MANDATE_SERVE_STATIC === '1' || existsSync(DIST_DIR);
import { startWebhookWorker } from './lib/webhooks.js';
import { startRetentionWorker } from './lib/retention.js';
import { startReportsWorker } from './lib/reports.js';
import { startSocialWorker } from './lib/social-worker.js';
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
import businessMetricsRoutes from './routes/metrics-business.js';
import socialRoutes from './routes/social.js';
import linksRoutes from './routes/links.js';
import { startMetricsWorker } from './lib/metrics-compute.js';

ensureTables();
startWebhookWorker();
startRetentionWorker();
startReportsWorker();
startSocialWorker();
startMetricsWorker();

const app = new Hono();

app.use('*', async (c, next) => {
  await next();
  if (!c.res.headers.get('content-type')) {
    c.res.headers.set('content-type', 'application/json');
  }
});

// Body-size cap on /api/*. Default 1 MB; backup-import path raises to 25 MB.
const API_BODY_LIMIT    = Number(process.env.MANDATE_API_BODY_LIMIT    || 1_000_000);
const IMPORT_BODY_LIMIT = Number(process.env.MANDATE_IMPORT_BODY_LIMIT || 25_000_000);
const MEDIA_BODY_LIMIT  = Number(process.env.MANDATE_MEDIA_BODY_LIMIT  || 12_000_000);
app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const limit = path === '/api/workspace/backup/import' ? IMPORT_BODY_LIMIT
    : path === '/api/social/media' ? MEDIA_BODY_LIMIT
    : API_BODY_LIMIT;
  return bodyLimit({ maxSize: limit, onError: (c) => c.json({ error: 'request body too large' }, 413) })(c, next);
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
app.route('/api/business-metrics', businessMetricsRoutes);
app.route('/api/auth/oauth', oauthPublicRoutes);
app.route('/api/oauth-providers', oauthAdminRoutes);
app.route('/api/comments', commentsRoutes);
app.route('/api/reports', reportsRoutes);
app.route('/api/auth/passkey', passkeyRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/social', socialRoutes);
app.route('/l', linksRoutes);

// Static SPA serving (production deploys). When `dist/` exists OR
// MANDATE_SERVE_STATIC=1 is set, the API also serves the built frontend
// from the same origin. SPA fallback for client-side routes.
if (SERVE_STATIC) {
  app.use('/assets/*', serveStatic({ root: './dist' }));
  app.use('/favicon.ico', serveStatic({ root: './dist' }));
  // Anything not /api/* falls back to index.html so client-side routes work
  app.get('*', async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (path.startsWith('/api/')) return next();
    return serveStatic({ root: './dist', path: 'index.html' })(c, next);
  });
  console.log(`Static SPA: serving ${DIST_DIR}`);
}

app.onError((err, c) => {
  console.error('[server error]', err);
  return c.json({ error: err.message || 'internal error' }, 500);
});

const port = Number(process.env.PORT || 3000);
const host = process.env.MANDATE_HOST || '0.0.0.0';
const server = serve({ fetch: app.fetch, port, hostname: host });
console.log(`Mandate API → http://${host}:${port}/api`);

// Graceful shutdown — drain HTTP, then close DB.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received — draining HTTP…`);
  // Hard exit after 10s if drain stalls
  setTimeout(() => { console.warn('[shutdown] forced exit'); process.exit(1); }, 10_000).unref?.();
  await new Promise((resolve) => server.close(resolve));
  try {
    const { sqlite } = await import('./db/index.js');
    sqlite?.close?.();
  } catch {}
  console.log('[shutdown] done');
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
