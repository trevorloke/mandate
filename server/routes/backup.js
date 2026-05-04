// Workspace backup/restore — full JSON snapshot of all module data + workspace settings.
// admin+ to export; super_admin to import.
import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { db } from '../db/index.js';
import { workspaces, moduleData, auditLog } from '../db/schema.js';
import { and, eq, isNull } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middleware/auth.js';

const newId = () => 'd_' + randomBytes(12).toString('hex');

const app = new Hono();
app.use('*', requireAuth);

// GET /api/workspace/backup/export  → JSON snapshot
app.get('/export', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const ws = (await db.select().from(workspaces).where(eq(workspaces.id, me.workspaceId)).limit(1))[0];
  const records = await db.select().from(moduleData)
    .where(and(eq(moduleData.workspaceId, me.workspaceId), isNull(moduleData.deletedAt)));

  const snapshot = {
    format: 'mandate-workspace-snapshot',
    version: 1,
    exportedAt: new Date().toISOString(),
    workspace: {
      name: ws?.name,
      kind: ws?.kind,
      candidate: ws?.candidate,
      party: ws?.party,
      phase: ws?.phase,
      daysToVote: ws?.daysToVote,
      tz: ws?.tz,
      settings: ws?.settings ? JSON.parse(ws.settings) : {},
    },
    records: records.map(r => ({
      module: r.module,
      kind: r.kind,
      data: JSON.parse(r.data),
    })),
  };

  await db.insert(auditLog).values({
    id: 'a_' + randomBytes(12).toString('hex'),
    userId: me.id, action: 'workspace.export',
    target: me.workspaceId,
    meta: JSON.stringify({ recordCount: records.length }),
  });

  c.header('content-disposition', `attachment; filename="mandate-${(ws?.name || 'workspace').replace(/[^\w-]/g, '_')}-${new Date().toISOString().slice(0, 10)}.json"`);
  return c.json(snapshot);
});

// POST /api/workspace/backup/import  → upload snapshot
// Body: { snapshot: <object>, mode: 'append' | 'replace' }
app.post('/import', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { snapshot, mode = 'append' } = body;
  if (!snapshot || snapshot.format !== 'mandate-workspace-snapshot') {
    return c.json({ error: 'invalid snapshot file' }, 400);
  }
  if (!Array.isArray(snapshot.records)) return c.json({ error: 'snapshot has no records' }, 400);

  if (mode === 'replace') {
    // Delete all existing records (hard) for this workspace
    await db.delete(moduleData).where(eq(moduleData.workspaceId, me.workspaceId));
  }

  // Insert all records
  for (const r of snapshot.records) {
    if (!r.module || !r.kind) continue;
    await db.insert(moduleData).values({
      id: newId(),
      workspaceId: me.workspaceId,
      module: r.module,
      kind: r.kind,
      data: JSON.stringify(r.data || {}),
    });
  }

  // Optionally apply workspace settings (only if super_admin or same workspace owner)
  if (snapshot.workspace) {
    const updates = {};
    for (const k of ['name', 'kind', 'candidate', 'party', 'phase', 'tz']) {
      if (typeof snapshot.workspace[k] === 'string') updates[k] = snapshot.workspace[k];
    }
    if (typeof snapshot.workspace.daysToVote === 'number') updates.daysToVote = snapshot.workspace.daysToVote;
    if (snapshot.workspace.settings) updates.settings = JSON.stringify(snapshot.workspace.settings);
    if (Object.keys(updates).length) {
      updates.updatedAt = new Date();
      await db.update(workspaces).set(updates).where(eq(workspaces.id, me.workspaceId));
    }
  }

  await db.insert(auditLog).values({
    id: 'a_' + randomBytes(12).toString('hex'),
    userId: me.id, action: 'workspace.import',
    target: me.workspaceId,
    meta: JSON.stringify({ mode, recordCount: snapshot.records.length }),
  });

  return c.json({ ok: true, recordsImported: snapshot.records.length, mode });
});

export default app;
