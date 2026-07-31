// Lightweight metrics endpoint — admin+ for the current workspace.
import { Hono } from 'hono';
import { db } from '../db/index.js';
import { users, moduleData, auditLog, webhooks, webhookDeliveries, publicForms, sessions, apiTokens } from '../db/schema.js';
import { and, eq, count, isNull, isNotNull, gt } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { subscriberCount } from '../lib/realtime.js';

const app = new Hono();
app.use('*', requireAuth, requireRole('admin'));

app.get('/', async (c) => {
  const me = c.get('user');
  const ws = me.workspaceId;
  const now = Date.now();
  const dayAgo = new Date(now - 86400 * 1000);

  const [
    [{ activeRecords }],
    [{ trashedRecords }],
    [{ activeUsers }],
    [{ activeWebhooks }],
    [{ deliveries24h }],
    [{ failedDeliveries24h }],
    [{ activeForms }],
    [{ formSubmissions24h }],
    [{ liveSessions }],
    [{ activeTokens }],
  ] = await Promise.all([
    db.select({ activeRecords: count() }).from(moduleData)
      .where(and(eq(moduleData.workspaceId, ws), isNull(moduleData.deletedAt))),
    db.select({ trashedRecords: count() }).from(moduleData)
      .where(and(eq(moduleData.workspaceId, ws), isNotNull(moduleData.deletedAt))),
    db.select({ activeUsers: count() }).from(users)
      .where(and(eq(users.workspaceId, ws), eq(users.active, true))),
    db.select({ activeWebhooks: count() }).from(webhooks)
      .where(and(eq(webhooks.workspaceId, ws), eq(webhooks.active, true))),
    db.select({ deliveries24h: count() }).from(webhookDeliveries)
      .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
      .where(and(eq(webhooks.workspaceId, ws), gt(webhookDeliveries.createdAt, dayAgo))),
    db.select({ failedDeliveries24h: count() }).from(webhookDeliveries)
      .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
      .where(and(eq(webhooks.workspaceId, ws), gt(webhookDeliveries.createdAt, dayAgo), eq(webhookDeliveries.status, 'giving_up'))),
    db.select({ activeForms: count() }).from(publicForms)
      .where(and(eq(publicForms.workspaceId, ws), eq(publicForms.active, true))),
    db.select({ formSubmissions24h: count() }).from(auditLog)
      .where(and(eq(auditLog.action, 'form.submit'), gt(auditLog.createdAt, dayAgo))),
    db.select({ liveSessions: count() }).from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(users.workspaceId, ws), gt(sessions.expiresAt, new Date()))),
    db.select({ activeTokens: count() }).from(apiTokens)
      .innerJoin(users, eq(users.id, apiTokens.userId))
      .where(and(eq(users.workspaceId, ws), eq(apiTokens.revoked, false))),
  ]);

  return c.json({
    workspace: ws,
    at: new Date().toISOString(),
    metrics: {
      activeRecords, trashedRecords, activeUsers,
      activeWebhooks, deliveries24h, failedDeliveries24h,
      activeForms, formSubmissions24h,
      liveSessions, activeTokens,
      sseSubscribers: subscriberCount(ws),
      memoryUsage: {
        rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
      uptimeSeconds: Math.round(process.uptime()),
    },
  });
});

export default app;
