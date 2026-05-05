// Custom dashboard widgets — per-user board rendered on the admin overview.
// Each widget has a kind (metric, list, audit, note) and stores kind-specific params;
// GET / returns all of the user's widgets *with* computed data so a single fetch
// is enough to render the board.
//
// Routes:
//   GET    /api/dashboard           list current user's widgets + their data
//   POST   /api/dashboard           create
//   PUT    /api/dashboard/:id       update title/params/width/position
//   PUT    /api/dashboard/_reorder  bulk re-order via [{ id, position }]
//   DELETE /api/dashboard/:id
import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { db } from '../db/index.js';
import { dashboardWidgets, moduleData, auditLog, users } from '../db/schema.js';
import { and, eq, desc, isNull, asc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const VALID_KINDS = ['metric', 'list', 'audit', 'note'];
const VALID_WIDTHS = ['third', 'half', 'full'];
const newId = () => 'wid_' + randomBytes(12).toString('hex');
function tryParse(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }

const app = new Hono();
app.use('*', requireAuth);

async function computeWidgetData(widget, me) {
  const params = tryParse(widget.params, {});
  switch (widget.kind) {
    case 'metric': {
      const { module, kind } = params;
      if (!module || !kind) return { error: 'metric needs params.module and params.kind' };
      const all = await db.select().from(moduleData).where(and(
        eq(moduleData.workspaceId, me.workspaceId),
        eq(moduleData.module, module),
        eq(moduleData.kind, kind),
        isNull(moduleData.deletedAt),
      ));
      const dayAgo = new Date(Date.now() - 86_400_000);
      const recent = all.filter(r => r.createdAt && r.createdAt >= dayAgo);
      return { count: all.length, delta24h: recent.length };
    }
    case 'list': {
      const { module, kind, limit = 5 } = params;
      if (!module || !kind) return { error: 'list needs params.module and params.kind' };
      const rows = await db.select().from(moduleData).where(and(
        eq(moduleData.workspaceId, me.workspaceId),
        eq(moduleData.module, module),
        eq(moduleData.kind, kind),
        isNull(moduleData.deletedAt),
      )).orderBy(desc(moduleData.updatedAt)).limit(Math.min(Number(limit) || 5, 25));
      return {
        records: rows.map(r => ({
          id: r.id,
          updatedAt: r.updatedAt,
          data: tryParse(r.data, {}),
        })),
      };
    }
    case 'audit': {
      const { limit = 8 } = params;
      const wsUsers = await db.select({ id: users.id, name: users.name })
        .from(users).where(eq(users.workspaceId, me.workspaceId));
      const userIds = new Set(wsUsers.map(u => u.id));
      const nameById = Object.fromEntries(wsUsers.map(u => [u.id, u.name]));
      const rows = await db.select().from(auditLog)
        .orderBy(desc(auditLog.createdAt)).limit(50);
      const ours = rows.filter(r => !r.userId || userIds.has(r.userId)).slice(0, Math.min(Number(limit) || 8, 25));
      return {
        entries: ours.map(r => ({
          id: r.id,
          action: r.action,
          target: r.target,
          userName: r.userId ? (nameById[r.userId] || 'someone') : 'system',
          createdAt: r.createdAt,
        })),
      };
    }
    case 'note':
      return { text: params.text || '' };
    default:
      return { error: `unknown widget kind: ${widget.kind}` };
  }
}

const present = (w) => ({
  id: w.id,
  kind: w.kind,
  title: w.title,
  params: tryParse(w.params, {}),
  position: w.position,
  width: w.width,
  createdAt: w.createdAt,
  updatedAt: w.updatedAt,
});

// GET /api/dashboard
app.get('/', async (c) => {
  const me = c.get('user');
  const rows = await db.select().from(dashboardWidgets)
    .where(eq(dashboardWidgets.userId, me.id))
    .orderBy(asc(dashboardWidgets.position));
  const out = [];
  for (const w of rows) {
    const data = await computeWidgetData(w, me).catch(e => ({ error: String(e.message || e).slice(0, 200) }));
    out.push({ ...present(w), data });
  }
  return c.json({ widgets: out });
});

// PUT /api/dashboard/_reorder — must be registered BEFORE /:id so the literal isn't matched as :id
app.put('/_reorder', async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];
  for (const item of items) {
    if (!item.id || typeof item.position !== 'number') continue;
    await db.update(dashboardWidgets)
      .set({ position: item.position, updatedAt: new Date() })
      .where(and(eq(dashboardWidgets.id, item.id), eq(dashboardWidgets.userId, me.id)));
  }
  return c.json({ ok: true });
});

// POST /api/dashboard
app.post('/', async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { kind, title, params = {}, width = 'half' } = body;
  if (!kind || !title) return c.json({ error: 'kind and title required' }, 400);
  if (!VALID_KINDS.includes(kind)) return c.json({ error: `kind must be one of ${VALID_KINDS.join(', ')}` }, 400);
  if (!VALID_WIDTHS.includes(width)) return c.json({ error: `width must be one of ${VALID_WIDTHS.join(', ')}` }, 400);

  const existing = await db.select({ position: dashboardWidgets.position })
    .from(dashboardWidgets).where(eq(dashboardWidgets.userId, me.id));
  const nextPos = existing.reduce((mx, e) => Math.max(mx, e.position), -1) + 1;

  const id = newId();
  await db.insert(dashboardWidgets).values({
    id, workspaceId: me.workspaceId, userId: me.id,
    kind, title: String(title).slice(0, 80),
    params: JSON.stringify(params),
    width, position: nextPos,
  });
  const fresh = (await db.select().from(dashboardWidgets).where(eq(dashboardWidgets.id, id)).limit(1))[0];
  const data = await computeWidgetData(fresh, me).catch(e => ({ error: e.message }));
  return c.json({ ok: true, widget: { ...present(fresh), data } });
});

// PUT /api/dashboard/:id
app.put('/:id', async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const row = (await db.select().from(dashboardWidgets)
    .where(and(eq(dashboardWidgets.id, id), eq(dashboardWidgets.userId, me.id))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);

  const updates = { updatedAt: new Date() };
  if (typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim().slice(0, 80);
  if (body.params && typeof body.params === 'object') updates.params = JSON.stringify(body.params);
  if (typeof body.width === 'string') {
    if (!VALID_WIDTHS.includes(body.width)) return c.json({ error: 'invalid width' }, 400);
    updates.width = body.width;
  }
  if (typeof body.position === 'number') updates.position = body.position;

  await db.update(dashboardWidgets).set(updates).where(eq(dashboardWidgets.id, id));
  const fresh = (await db.select().from(dashboardWidgets).where(eq(dashboardWidgets.id, id)).limit(1))[0];
  const data = await computeWidgetData(fresh, me).catch(e => ({ error: e.message }));
  return c.json({ ok: true, widget: { ...present(fresh), data } });
});

// DELETE /api/dashboard/:id
app.delete('/:id', async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const row = (await db.select().from(dashboardWidgets)
    .where(and(eq(dashboardWidgets.id, id), eq(dashboardWidgets.userId, me.id))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  await db.delete(dashboardWidgets).where(eq(dashboardWidgets.id, id));
  return c.json({ ok: true });
});

export default app;
