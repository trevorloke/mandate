// Webhook management — admin only. Secret is shown once on creation.
import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { db } from '../db/index.js';
import { webhooks, webhookDeliveries, auditLog } from '../db/schema.js';
import { and, eq, desc } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { emitWebhook, retryDelivery, queueStats, processRetries } from '../lib/webhooks.js';

const newId = (p='') => p + randomBytes(12).toString('hex');

const app = new Hono();
app.use('*', requireAuth);

// Queue stats — registered before /:id so the literal `_queue` doesn't match :id.
app.get('/_queue', requireRole('admin'), async (c) => {
  return c.json(await queueStats());
});

// Trigger one processRetries tick on demand (admin) — useful for tests + ops.
app.post('/_queue/tick', requireRole('admin'), async (c) => {
  return c.json(await processRetries());
});

const sanitize = (w) => {
  if (!w) return null;
  const { secret, ...rest } = w;
  let events = ['*']; try { events = JSON.parse(w.events || '["*"]'); } catch {}
  return { ...rest, events, hasSecret: !!secret };
};

// GET /api/webhooks
app.get('/', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const rows = await db.select().from(webhooks)
    .where(eq(webhooks.workspaceId, me.workspaceId))
    .orderBy(desc(webhooks.createdAt));
  return c.json({ webhooks: rows.map(sanitize) });
});

// POST /api/webhooks
app.post('/', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { label, url, events } = body;
  if (!label?.trim()) return c.json({ error: 'label required' }, 400);
  if (!url?.match(/^https?:\/\//i)) return c.json({ error: 'url must be a valid http(s) URL' }, 400);

  const validEvents = Array.isArray(events) && events.length ? events : ['*'];
  const id = newId('wh_');
  const secret = `whsec_${randomBytes(24).toString('hex')}`;

  await db.insert(webhooks).values({
    id, workspaceId: me.workspaceId, label: label.trim(), url,
    secret, events: JSON.stringify(validEvents), active: true,
  });

  await db.insert(auditLog).values({
    id: newId('a_'), userId: me.id, action: 'webhook.create', target: id,
    meta: JSON.stringify({ label, url, events: validEvents }),
  });

  return c.json({ ok: true, id, secret });    // secret revealed ONCE
});

// PUT /api/webhooks/:id  — toggle active or change events
app.put('/:id', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const row = (await db.select().from(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.workspaceId, me.workspaceId))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);

  const updates = {};
  if (typeof body.label === 'string' && body.label.trim()) updates.label = body.label.trim();
  if (typeof body.url === 'string' && body.url.trim()) updates.url = body.url.trim();
  if (typeof body.active === 'boolean') updates.active = body.active;
  if (Array.isArray(body.events) && body.events.length) updates.events = JSON.stringify(body.events);
  if (Object.keys(updates).length === 0) return c.json({ ok: true });

  await db.update(webhooks).set(updates).where(eq(webhooks.id, id));
  await db.insert(auditLog).values({
    id: newId('a_'), userId: me.id, action: 'webhook.update', target: id, meta: JSON.stringify(updates),
  });
  return c.json({ ok: true });
});

// DELETE /api/webhooks/:id
app.delete('/:id', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const row = (await db.select().from(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.workspaceId, me.workspaceId))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  await db.delete(webhooks).where(eq(webhooks.id, id));
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'webhook.delete', target: id });
  return c.json({ ok: true });
});

// GET /api/webhooks/:id/deliveries — recent delivery log (paginated, 50 most recent)
app.get('/:id/deliveries', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const hook = (await db.select().from(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.workspaceId, me.workspaceId))).limit(1))[0];
  if (!hook) return c.json({ error: 'not found' }, 404);

  const rows = await db.select().from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, id))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(50);

  return c.json({
    deliveries: rows.map(r => ({
      id: r.id, eventId: r.eventId, event: r.event, attempt: r.attempt,
      status: r.status, httpStatus: r.httpStatus, error: r.error,
      nextRetryAt: r.nextRetryAt, createdAt: r.createdAt, completedAt: r.completedAt,
    })),
  });
});

// POST /api/webhooks/:id/deliveries/:deliveryId/retry — manual retry
app.post('/:id/deliveries/:deliveryId/retry', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const { id, deliveryId } = c.req.param();
  const hook = (await db.select().from(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.workspaceId, me.workspaceId))).limit(1))[0];
  if (!hook) return c.json({ error: 'not found' }, 404);
  try { await retryDelivery(deliveryId); }
  catch (e) { return c.json({ error: e.message }, 400); }
  await db.insert(auditLog).values({ id: 'a_' + randomBytes(12).toString('hex'), userId: me.id, action: 'webhook.retry', target: deliveryId });
  return c.json({ ok: true });
});

// POST /api/webhooks/:id/test  — fire a synthetic delivery so the user can verify their endpoint
app.post('/:id/test', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const row = (await db.select().from(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.workspaceId, me.workspaceId))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);

  await emitWebhook({
    workspaceId: me.workspaceId,
    event: 'test.ping',
    payload: { ping: 'hello from Mandate', actor: me.email, hookId: id },
  });

  // Re-fetch to get latest delivery status
  await new Promise(r => setTimeout(r, 200));
  const fresh = (await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1))[0];
  return c.json({
    ok: true,
    lastStatus: fresh.lastStatus,
    lastError: fresh.lastError,
    lastDeliveryAt: fresh.lastDeliveryAt,
  });
});

export default app;
