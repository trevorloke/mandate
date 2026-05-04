// Workspace settings — admin+ to edit, anyone to read
import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { db } from '../db/index.js';
import { workspaces, auditLog } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middleware/auth.js';

const app = new Hono();
app.use('*', requireAuth);

const newId = () => randomBytes(12).toString('hex');

// GET /api/workspace — current workspace
app.get('/', async (c) => {
  const me = c.get('user');
  const ws = (await db.select().from(workspaces).where(eq(workspaces.id, me.workspaceId)).limit(1))[0];
  if (!ws) return c.json({ workspace: null });
  // Parse settings JSON
  let settings = {};
  try { settings = JSON.parse(ws.settings || '{}'); } catch {}
  return c.json({ workspace: { ...ws, settings } });
});

// PUT /api/workspace — update workspace
app.put('/', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const updates = {};

  for (const k of ['name', 'kind', 'candidate', 'party', 'phase', 'tz']) {
    if (typeof body[k] === 'string') updates[k] = body[k];
  }
  if (typeof body.daysToVote === 'number') updates.daysToVote = body.daysToVote;
  if (typeof body.settings === 'object' && body.settings) updates.settings = JSON.stringify(body.settings);

  if (Object.keys(updates).length === 0) {
    const ws = (await db.select().from(workspaces).where(eq(workspaces.id, me.workspaceId)).limit(1))[0];
    return c.json({ ok: true, workspace: ws });
  }
  updates.updatedAt = new Date();
  await db.update(workspaces).set(updates).where(eq(workspaces.id, me.workspaceId));

  await db.insert(auditLog).values({ id: newId(), userId: me.id, action: 'workspace.update', target: me.workspaceId, meta: JSON.stringify(updates) });

  const fresh = (await db.select().from(workspaces).where(eq(workspaces.id, me.workspaceId)).limit(1))[0];
  let settings = {};
  try { settings = JSON.parse(fresh.settings || '{}'); } catch {}
  return c.json({ ok: true, workspace: { ...fresh, settings } });
});

export default app;
