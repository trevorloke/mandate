// In-app notifications for the current user.
import { Hono } from 'hono';
import { db } from '../db/index.js';
import { notifications } from '../db/schema.js';
import { and, eq, desc, isNull, count } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const app = new Hono();
app.use('*', requireAuth);

// GET /api/notifications  → recent 50 + unread count
app.get('/', async (c) => {
  const me = c.get('user');
  const rows = await db.select().from(notifications)
    .where(eq(notifications.userId, me.id))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
  const [{ unread }] = await db.select({ unread: count() }).from(notifications)
    .where(and(eq(notifications.userId, me.id), isNull(notifications.readAt)));
  return c.json({ notifications: rows, unread });
});

// POST /api/notifications/:id/read
app.post('/:id/read', async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, me.id)));
  return c.json({ ok: true });
});

// POST /api/notifications/_read_all
app.post('/_read_all', async (c) => {
  const me = c.get('user');
  await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.userId, me.id), isNull(notifications.readAt)));
  return c.json({ ok: true });
});

// DELETE /api/notifications/:id
app.delete('/:id', async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  await db.delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, me.id)));
  return c.json({ ok: true });
});

export default app;
