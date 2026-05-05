// Multi-workspace management — super_admin only.
// GET    /api/workspaces           → list all workspaces (super_admin)
// POST   /api/workspaces           → create new workspace
// POST   /api/workspaces/switch/:id → move current user to that workspace
import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { db } from '../db/index.js';
import { workspaces, users, moduleData, recordShares, auditLog } from '../db/schema.js';
import { and, eq, count, isNull, inArray } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middleware/auth.js';

const newId = (p='') => p + randomBytes(12).toString('hex');

const app = new Hono();
app.use('*', requireAuth);

// List all workspaces with user counts (super_admin only)
app.get('/', requireRole('super_admin'), async (c) => {
  const rows = await db.select().from(workspaces);
  // Count users per workspace
  const userCounts = await db.select({
    workspaceId: users.workspaceId,
    n: count(),
  }).from(users).groupBy(users.workspaceId);
  const countMap = Object.fromEntries(userCounts.map(r => [r.workspaceId, r.n]));
  return c.json({
    workspaces: rows.map(w => ({ ...w, userCount: countMap[w.id] || 0 })),
  });
});

// Create a new workspace (super_admin)
app.post('/', requireRole('super_admin'), async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { name, kind, candidate, party, phase, daysToVote, tz } = body;
  if (!name) return c.json({ error: 'name required' }, 400);
  const id = newId('ws_');
  await db.insert(workspaces).values({
    id, name,
    kind: kind || 'PROVINCIAL · MLA',
    candidate: candidate || '',
    party: party || '',
    phase: phase || 'Pre-launch',
    daysToVote: typeof daysToVote === 'number' ? daysToVote : 365,
    tz: tz || 'PT',
    settings: '{}',
  });
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'workspace.create', target: id, meta: JSON.stringify({ name }) });
  const fresh = (await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1))[0];
  return c.json({ ok: true, workspace: fresh });
});

// Switch the current user to a different workspace (super_admin)
app.post('/switch/:id', requireRole('super_admin'), async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const target = (await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1))[0];
  if (!target) return c.json({ error: 'workspace not found' }, 404);
  await db.update(users).set({ workspaceId: id, updatedAt: new Date() }).where(eq(users.id, me.id));
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'workspace.switch', target: id });
  return c.json({ ok: true, workspace: target });
});

// Clone an existing workspace — copies identity + all active records into a new tenant.
// Useful for templates / staging copies. The current user stays in their original workspace.
app.post('/:id/clone', requireRole('super_admin'), async (c) => {
  const me = c.get('user');
  const sourceId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const newName = (body.name || '').trim();
  if (!newName) return c.json({ error: 'name required' }, 400);

  const source = (await db.select().from(workspaces).where(eq(workspaces.id, sourceId)).limit(1))[0];
  if (!source) return c.json({ error: 'source workspace not found' }, 404);

  const newWsId = newId('ws_');
  await db.insert(workspaces).values({
    id: newWsId,
    name: newName,
    kind: source.kind,
    candidate: source.candidate,
    party: source.party,
    phase: 'Pre-launch',     // a clone starts in pre-launch
    daysToVote: source.daysToVote,
    tz: source.tz,
    settings: source.settings,
  });

  // Copy active records
  const records = await db.select().from(moduleData)
    .where(and(eq(moduleData.workspaceId, sourceId), isNull(moduleData.deletedAt)));
  for (const r of records) {
    await db.insert(moduleData).values({
      id: 'd_' + randomBytes(12).toString('hex'),
      workspaceId: newWsId,
      module: r.module,
      kind: r.kind,
      data: r.data,
    });
  }

  await db.insert(auditLog).values({
    id: newId(), userId: me.id, action: 'workspace.clone',
    target: newWsId, meta: JSON.stringify({ source: sourceId, name: newName, recordsCopied: records.length }),
  });

  return c.json({ ok: true, workspace: { id: newWsId, name: newName }, recordsCopied: records.length });
});

// Delete a workspace (super_admin) — only if empty (no users)
app.delete('/:id', requireRole('super_admin'), async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  if (id === me.workspaceId) return c.json({ error: 'cannot delete your current workspace' }, 400);
  const [{ n }] = await db.select({ n: count() }).from(users).where(eq(users.workspaceId, id));
  if (n > 0) return c.json({ error: `workspace has ${n} users — remove them first` }, 400);
  // Clean up record_shares first — no FK on record_id, so they'd orphan after the cascade.
  const recordIds = (await db.select({ id: moduleData.id }).from(moduleData).where(eq(moduleData.workspaceId, id))).map(r => r.id);
  if (recordIds.length) await db.delete(recordShares).where(inArray(recordShares.recordId, recordIds));
  await db.delete(workspaces).where(eq(workspaces.id, id));
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'workspace.delete', target: id });
  return c.json({ ok: true });
});

export default app;
