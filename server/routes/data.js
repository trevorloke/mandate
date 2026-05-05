// Generic per-module data CRUD.
// /api/data/:module/:kind         GET → list active (excludes soft-deleted)
// /api/data/:module/:kind         POST → create
// /api/data/:module/:kind/:id     GET / PUT / DELETE (DELETE is SOFT-delete; sets deleted_at)
// /api/data/:module/:kind/:id/restore  POST → un-set deleted_at
// /api/data/_trash                GET → list deleted records across all kinds in workspace
// /api/data/_trash/:id            DELETE → permanently delete
//
// Roles: viewer can read; editor+ can write. Token scopes enforced.
import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { db } from '../db/index.js';
import { moduleData, auditLog, recordShares, users } from '../db/schema.js';
import { and, eq, or, inArray, desc, isNull, isNotNull } from 'drizzle-orm';
import { requireAuth, requireRole, requireScope } from '../middleware/auth.js';
import { emitWebhook } from '../lib/webhooks.js';
import { broadcast } from '../lib/realtime.js';
import { workspaces } from '../db/schema.js';
import { assertQuota, QuotaError } from '../lib/plans.js';

const app = new Hono();
app.use('*', requireAuth);

// Per-bucket permission gate. Settings shape:
//   workspace.settings.bucketPermissions[`${module}.${kind}`] = {
//     viewer: 'read'|'none',   // default 'read'
//     editor: 'write'|'read'|'none',  // default 'write'
//   }
// (admin / super_admin always bypass — they can do anything.)
const ROLE_DEFAULTS = { viewer: 'read', editor: 'write', admin: 'write', super_admin: 'write' };

async function checkBucketPermission(c, requiredAction) {
  const me = c.get('user');
  if (me.role === 'admin' || me.role === 'super_admin') return null;
  const { module, kind } = c.req.param();
  if (!module || !kind) return null;

  const ws = (await db.select().from(workspaces).where(eq(workspaces.id, me.workspaceId)).limit(1))[0];
  let settings = {};
  try { settings = JSON.parse(ws?.settings || '{}'); } catch {}
  const perBucket = settings.bucketPermissions || {};
  const bucketRule = perBucket[`${module}.${kind}`] || {};
  const allowed = bucketRule[me.role] || ROLE_DEFAULTS[me.role] || 'none';

  // Compare allowed to required: write > read > none
  const rank = { none: 0, read: 1, write: 2 };
  if ((rank[allowed] || 0) < (rank[requiredAction] || 0)) {
    return c.json({ error: `your role (${me.role}) cannot ${requiredAction} ${module}.${kind} in this workspace`, allowed }, 403);
  }
  return null;
}

const requireBucket = (action) => async (c, next) => {
  const blocked = await checkBucketPermission(c, action);
  if (blocked) return blocked;
  await next();
};

const newId = () => 'd_' + randomBytes(12).toString('hex');
const audit = (userId, action, target, meta = {}) =>
  db.insert(auditLog).values({ id: 'a_' + randomBytes(12).toString('hex'), userId, action, target, meta: JSON.stringify(meta) });

// ── Per-record visibility ────────────────────────────────────────────────
// A record is VISIBLE to a user when ANY of:
//   - user is admin/super_admin
//   - record.viewerScope = 'workspace' (default — everyone in the workspace reads)
//   - user is the owner
//   - there's a record_shares entry for (record, user) at any level
// EDIT requires: admin, owner, or share with level='edit'.
async function recordIdsSharedWith(userId) {
  const rows = await db.select({ id: recordShares.recordId })
    .from(recordShares).where(eq(recordShares.userId, userId));
  return rows.map(r => r.id);
}

async function visibilityFilter(me) {
  if (me.role === 'admin' || me.role === 'super_admin') return undefined;
  const sharedIds = await recordIdsSharedWith(me.id);
  const clauses = [
    eq(moduleData.viewerScope, 'workspace'),
    eq(moduleData.ownerId, me.id),
  ];
  if (sharedIds.length) clauses.push(inArray(moduleData.id, sharedIds));
  return or(...clauses);
}

async function canAccessRecord(me, row, action) {
  if (me.role === 'admin' || me.role === 'super_admin') return true;
  if (row.ownerId === me.id) return true;
  if (action === 'read' && row.viewerScope === 'workspace') return true;
  const share = (await db.select().from(recordShares)
    .where(and(eq(recordShares.recordId, row.id), eq(recordShares.userId, me.id)))
    .limit(1))[0];
  if (!share) return false;
  return action === 'read' ? true : share.level === 'edit';
}

// Fire-and-forget: caller should not await.
const fireWebhook = (workspaceId, event, payload) => {
  emitWebhook({ workspaceId, event, payload }).catch(() => {});
};

// Realtime broadcast to SSE subscribers in this workspace
const fireRealtime = (workspaceId, event, payload) => {
  try { broadcast(workspaceId, event, { ...payload, at: new Date().toISOString() }); } catch {}
};

// ── Per-record share endpoints (registered before /:module/:kind/:id catch-alls) ──

// GET /api/data/_record/:id/shares — list shares for a record (admin or owner)
app.get('/_record/:id/shares', async (c) => {
  const me = c.get('user');
  const { id } = c.req.param();
  const row = (await db.select().from(moduleData)
    .where(and(eq(moduleData.id, id), eq(moduleData.workspaceId, me.workspaceId)))
    .limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  if (me.role !== 'admin' && me.role !== 'super_admin' && row.ownerId !== me.id) {
    return c.json({ error: 'only owner or admin can view shares' }, 403);
  }
  const shares = await db.select({
    id: recordShares.id,
    userId: recordShares.userId,
    level: recordShares.level,
    grantedById: recordShares.grantedById,
    createdAt: recordShares.createdAt,
    userEmail: users.email,
    userName: users.name,
    userInitials: users.initials,
  })
    .from(recordShares)
    .leftJoin(users, eq(users.id, recordShares.userId))
    .where(eq(recordShares.recordId, id));
  return c.json({
    record: { id: row.id, ownerId: row.ownerId, viewerScope: row.viewerScope },
    shares,
  });
});

// POST /api/data/_record/:id/shares  { userId, level } — grant access (admin or owner)
app.post('/_record/:id/shares', requireScope('write'), async (c) => {
  const me = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  const { userId, level = 'view' } = body;
  if (!userId || !['view', 'edit'].includes(level)) {
    return c.json({ error: 'userId required; level must be view or edit' }, 400);
  }
  const row = (await db.select().from(moduleData)
    .where(and(eq(moduleData.id, id), eq(moduleData.workspaceId, me.workspaceId)))
    .limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  if (me.role !== 'admin' && me.role !== 'super_admin' && row.ownerId !== me.id) {
    return c.json({ error: 'only owner or admin can share' }, 403);
  }
  // verify target user is in same workspace
  const target = (await db.select().from(users)
    .where(and(eq(users.id, userId), eq(users.workspaceId, me.workspaceId))).limit(1))[0];
  if (!target) return c.json({ error: 'user not in this workspace' }, 400);

  // Upsert: delete any existing then insert
  await db.delete(recordShares)
    .where(and(eq(recordShares.recordId, id), eq(recordShares.userId, userId)));
  const shareId = 's_' + randomBytes(12).toString('hex');
  await db.insert(recordShares).values({
    id: shareId, recordId: id, userId, level, grantedById: me.id,
  });
  await audit(me.id, 'record.share', id, { userId, level });
  fireRealtime(me.workspaceId, 'record.share', { recordId: id, userId, level });
  return c.json({ ok: true, shareId });
});

// DELETE /api/data/_record/:id/shares/:userId — revoke access
app.delete('/_record/:id/shares/:userId', requireScope('write'), async (c) => {
  const me = c.get('user');
  const { id, userId } = c.req.param();
  const row = (await db.select().from(moduleData)
    .where(and(eq(moduleData.id, id), eq(moduleData.workspaceId, me.workspaceId)))
    .limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  if (me.role !== 'admin' && me.role !== 'super_admin' && row.ownerId !== me.id) {
    return c.json({ error: 'only owner or admin can revoke shares' }, 403);
  }
  await db.delete(recordShares)
    .where(and(eq(recordShares.recordId, id), eq(recordShares.userId, userId)));
  await audit(me.id, 'record.share_revoke', id, { userId });
  fireRealtime(me.workspaceId, 'record.share_revoke', { recordId: id, userId });
  return c.json({ ok: true });
});

// PUT /api/data/_record/:id/scope  { scope: 'workspace'|'private' } — change viewer scope
app.put('/_record/:id/scope', requireScope('write'), async (c) => {
  const me = c.get('user');
  const { id } = c.req.param();
  const { scope } = await c.req.json().catch(() => ({}));
  if (!['workspace', 'private'].includes(scope)) return c.json({ error: 'scope must be workspace or private' }, 400);
  const row = (await db.select().from(moduleData)
    .where(and(eq(moduleData.id, id), eq(moduleData.workspaceId, me.workspaceId)))
    .limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  if (me.role !== 'admin' && me.role !== 'super_admin' && row.ownerId !== me.id) {
    return c.json({ error: 'only owner or admin can change scope' }, 403);
  }
  await db.update(moduleData).set({ viewerScope: scope }).where(eq(moduleData.id, id));
  await audit(me.id, 'record.scope', id, { scope });
  fireRealtime(me.workspaceId, 'record.scope', { recordId: id, scope });
  return c.json({ ok: true });
});

// ── Trash listing/operations come first, so /_trash isn't matched as :module ──

// GET /api/data/_trash → list all soft-deleted in workspace
app.get('/_trash', async (c) => {
  const me = c.get('user');
  const rows = await db.select().from(moduleData)
    .where(and(eq(moduleData.workspaceId, me.workspaceId), isNotNull(moduleData.deletedAt)))
    .orderBy(desc(moduleData.deletedAt));
  return c.json({ records: rows.map(parse) });
});

// DELETE /api/data/_trash/:id → permanent delete (super_admin or owner of soft delete)
app.delete('/_trash/:id', requireRole('admin'), requireScope('write'), async (c) => {
  const me = c.get('user');
  const { id } = c.req.param();
  const row = (await db.select().from(moduleData)
    .where(and(eq(moduleData.id, id), eq(moduleData.workspaceId, me.workspaceId), isNotNull(moduleData.deletedAt)))
    .limit(1))[0];
  if (!row) return c.json({ error: 'not found in trash' }, 404);
  // Clean up orphaned record_shares — there's no FK to cascade them.
  await db.delete(recordShares).where(eq(recordShares.recordId, id));
  await db.delete(moduleData).where(eq(moduleData.id, id));
  await audit(me.id, 'data.purge', id, { module: row.module, kind: row.kind });
  return c.json({ ok: true });
});

// POST /api/data/_trash/_empty → permanent delete ALL soft-deleted (admin+)
app.post('/_trash/_empty', requireRole('admin'), requireScope('write'), async (c) => {
  const me = c.get('user');
  const trash = await db.select().from(moduleData)
    .where(and(eq(moduleData.workspaceId, me.workspaceId), isNotNull(moduleData.deletedAt)));
  for (const r of trash) {
    await db.delete(recordShares).where(eq(recordShares.recordId, r.id));
    await db.delete(moduleData).where(eq(moduleData.id, r.id));
  }
  await audit(me.id, 'data.purge_all', '_trash', { count: trash.length });
  return c.json({ ok: true, count: trash.length });
});

// GET /api/data/:module/:kind → list active records (filtered by per-record visibility)
app.get('/:module/:kind', requireBucket('read'), async (c) => {
  const me = c.get('user');
  const { module, kind } = c.req.param();
  const visClause = await visibilityFilter(me);
  const baseClauses = [
    eq(moduleData.workspaceId, me.workspaceId),
    eq(moduleData.module, module),
    eq(moduleData.kind, kind),
    isNull(moduleData.deletedAt),
  ];
  if (visClause) baseClauses.push(visClause);
  const rows = await db.select().from(moduleData)
    .where(and(...baseClauses))
    .orderBy(desc(moduleData.updatedAt));
  return c.json({ records: rows.map(parse) });
});

// Bulk replace: PUT /api/data/:module/:kind/_bulk  → replaces all records of this kind
// MUST be registered before /:module/:kind/:id so the literal `_bulk` doesn't get matched as `:id`.
app.put('/:module/:kind/_bulk', requireRole('editor'), requireScope('write'), requireBucket('write'), async (c) => {
  const me = c.get('user');
  const { module, kind } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  const records = Array.isArray(body) ? body : (body.records || []);

  // Quota: count current total minus what's about to be replaced + the new size.
  const currentBucket = (await db.select().from(moduleData).where(and(
    eq(moduleData.workspaceId, me.workspaceId), eq(moduleData.module, module), eq(moduleData.kind, kind),
  ))).length;
  const currentTotal = (await db.select().from(moduleData).where(and(
    eq(moduleData.workspaceId, me.workspaceId), isNull(moduleData.deletedAt),
  ))).length;
  const projected = currentTotal - currentBucket + records.length;
  const { planFor } = await import('../lib/plans.js');
  const plan = await planFor(me.workspaceId);
  const limit = plan.limits.records;
  if (limit !== Infinity && projected > limit) {
    return c.json({
      error: `Bulk replace would exceed plan limit for records: ${projected}/${limit}. Upgrade or reduce payload.`,
      code: 'QUOTA_EXCEEDED', quota: 'records', limit, current: projected,
    }, 402);
  }

  await db.delete(moduleData)
    .where(and(eq(moduleData.workspaceId, me.workspaceId), eq(moduleData.module, module), eq(moduleData.kind, kind)));
  for (const r of records) {
    await db.insert(moduleData).values({
      id: newId(), workspaceId: me.workspaceId, module, kind,
      data: JSON.stringify(r),
      ownerId: me.id,
    });
  }
  await audit(me.id, 'data.bulk_replace', `${module}.${kind}`, { count: records.length });
  return c.json({ ok: true, count: records.length });
});

// POST /api/data/:module/:kind
app.post('/:module/:kind', requireRole('editor'), requireScope('write'), requireBucket('write'), async (c) => {
  const me = c.get('user');
  const { module, kind } = c.req.param();
  const data = await c.req.json().catch(() => ({}));
  try { await assertQuota(me.workspaceId, 'records'); }
  catch (e) { if (e instanceof QuotaError) return c.json({ error: e.message, code: e.code, quota: e.quota, limit: e.limit, current: e.current }, 402); throw e; }
  const id = newId();
  await db.insert(moduleData).values({
    id, workspaceId: me.workspaceId, module, kind,
    data: JSON.stringify(data),
    ownerId: me.id,
    viewerScope: 'workspace',
  });
  await audit(me.id, 'data.create', id, { module, kind });
  fireWebhook(me.workspaceId, 'data.create', { id, module, kind, data });
  fireRealtime(me.workspaceId, 'data.create', { id, module, kind });
  const fresh = (await db.select().from(moduleData).where(eq(moduleData.id, id)).limit(1))[0];
  return c.json({ ok: true, record: parse(fresh) });
});

// GET /api/data/:module/:kind/:id
app.get('/:module/:kind/:id', async (c) => {
  const me = c.get('user');
  const { id } = c.req.param();
  const row = (await db.select().from(moduleData)
    .where(and(eq(moduleData.id, id), eq(moduleData.workspaceId, me.workspaceId), isNull(moduleData.deletedAt))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  if (!(await canAccessRecord(me, row, 'read'))) return c.json({ error: 'not found' }, 404);
  return c.json({ record: parse(row) });
});

// PUT /api/data/:module/:kind/:id  (PRE: previous version captured into audit meta for diff)
// NOTE: role/bucket gate is checked inside — an explicit edit-share overrides them.
app.put('/:module/:kind/:id', requireScope('write'), async (c) => {
  const me = c.get('user');
  const { id } = c.req.param();
  const data = await c.req.json().catch(() => ({}));
  const row = (await db.select().from(moduleData)
    .where(and(eq(moduleData.id, id), eq(moduleData.workspaceId, me.workspaceId), isNull(moduleData.deletedAt))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  if (!(await canAccessRecord(me, row, 'edit'))) {
    // Private records are owner+share+admin only — bucket permission can't override.
    if (row.viewerScope === 'private') return c.json({ error: 'private record — owner or admin only' }, 403);
    if (me.role === 'viewer') return c.json({ error: 'no edit access' }, 403);
    const blocked = await checkBucketPermission(c, 'write');
    if (blocked) return blocked;
  }
  // Capture previous version for diff
  let prev = {}; try { prev = JSON.parse(row.data); } catch {}
  await db.update(moduleData)
    .set({ data: JSON.stringify(data), updatedAt: new Date() })
    .where(eq(moduleData.id, id));
  await audit(me.id, 'data.update', id, { module: row.module, kind: row.kind, prev, next: data });
  fireWebhook(me.workspaceId, 'data.update', { id, module: row.module, kind: row.kind, prev, next: data });
  fireRealtime(me.workspaceId, 'data.update', { id, module: row.module, kind: row.kind });
  const fresh = (await db.select().from(moduleData).where(eq(moduleData.id, id)).limit(1))[0];
  return c.json({ ok: true, record: parse(fresh) });
});

// DELETE /api/data/:module/:kind/:id  →  SOFT-delete (set deletedAt)
app.delete('/:module/:kind/:id', requireScope('write'), async (c) => {
  const me = c.get('user');
  const { id } = c.req.param();
  const row = (await db.select().from(moduleData)
    .where(and(eq(moduleData.id, id), eq(moduleData.workspaceId, me.workspaceId), isNull(moduleData.deletedAt))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  if (!(await canAccessRecord(me, row, 'edit'))) {
    if (row.viewerScope === 'private') return c.json({ error: 'private record — owner or admin only' }, 403);
    if (me.role === 'viewer') return c.json({ error: 'no edit access' }, 403);
    const blocked = await checkBucketPermission(c, 'write');
    if (blocked) return blocked;
  }
  await db.update(moduleData)
    .set({ deletedAt: new Date() })
    .where(eq(moduleData.id, id));
  await audit(me.id, 'data.delete', id, { module: row.module, kind: row.kind });
  fireWebhook(me.workspaceId, 'data.delete', { id, module: row.module, kind: row.kind });
  fireRealtime(me.workspaceId, 'data.delete', { id, module: row.module, kind: row.kind });
  return c.json({ ok: true });
});

// POST /api/data/:module/:kind/:id/restore
app.post('/:module/:kind/:id/restore', requireRole('editor'), requireScope('write'), async (c) => {
  const me = c.get('user');
  const { id } = c.req.param();
  const row = (await db.select().from(moduleData)
    .where(and(eq(moduleData.id, id), eq(moduleData.workspaceId, me.workspaceId), isNotNull(moduleData.deletedAt))).limit(1))[0];
  if (!row) return c.json({ error: 'not in trash' }, 404);
  await db.update(moduleData)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(moduleData.id, id));
  await audit(me.id, 'data.restore', id, { module: row.module, kind: row.kind });
  const fresh = (await db.select().from(moduleData).where(eq(moduleData.id, id)).limit(1))[0];
  return c.json({ ok: true, record: parse(fresh) });
});

function parse(row) {
  if (!row) return null;
  let data = {};
  try { data = JSON.parse(row.data); } catch {}
  return {
    id: row.id, module: row.module, kind: row.kind, data,
    ownerId: row.ownerId,
    viewerScope: row.viewerScope || 'workspace',
    deletedAt: row.deletedAt,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

export default app;
