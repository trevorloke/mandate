// Cross-module entity routes — the canonical people/orgs/places that every
// module links to.
//   GET    /api/entities[?q=&type=]     search canonical entities
//   POST   /api/entities                create (editor+)
//   GET    /api/entities/:id            the 360° profile (all module touchpoints)
//   PUT    /api/entities/:id[?sync=1]   edit; sync=1 propagates to linked records
//   DELETE /api/entities/:id            soft-delete (editor+)
//   POST   /api/entities/rebuild        resolve every module record into entities
//   POST   /api/entities/:id/links      attach a module record (editor+)
//   GET    /api/entities/by-record/:module/:kind/:recordId   reverse lookup
import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { entities, entityLinks, auditLog } from '../db/schema.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  rebuildFromModuleData, entityProfile, entityForRecord, syncEntityToLinks,
  listEntities, createEntity, updateEntity, addLink,
} from '../lib/entities.js';

const app = new Hono();
const newId = (p) => p + randomBytes(9).toString('hex');
const audit = (userId, action, target, meta) =>
  db.insert(auditLog).values({ id: newId('a_'), userId, action, target, meta: meta ? JSON.stringify(meta) : null }).catch(() => {});

app.use('*', requireAuth);

app.get('/', requireRole('viewer'), async (c) => {
  const me = c.get('user');
  const list = await listEntities(me.workspaceId, { q: c.req.query('q') || '', type: c.req.query('type') || '' });
  return c.json({ entities: list });
});

app.post('/', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  if (!body.name || !String(body.name).trim()) return c.json({ error: 'name is required' }, 400);
  const id = await createEntity(me.workspaceId, body, me.id);
  await audit(me.id, 'entity.create', id, { name: body.name });
  return c.json({ id }, 201);
});

app.post('/rebuild', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const result = await rebuildFromModuleData(me.workspaceId, me.id);
  await audit(me.id, 'entity.rebuild', me.workspaceId, result);
  return c.json(result);
});

// Static path before the :id param route.
app.get('/by-record/:module/:kind/:recordId', requireRole('viewer'), async (c) => {
  const me = c.get('user');
  const profile = await entityForRecord(me.workspaceId, c.req.param('module'), c.req.param('kind'), c.req.param('recordId'));
  if (!profile) return c.json({ entity: null });
  return c.json({ profile });
});

app.get('/:id', requireRole('viewer'), async (c) => {
  const me = c.get('user');
  const profile = await entityProfile(me.workspaceId, c.req.param('id'));
  if (!profile) return c.json({ error: 'not found' }, 404);
  return c.json({ profile });
});

app.put('/:id', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const ok = await updateEntity(me.workspaceId, id, body);
  if (!ok) return c.json({ error: 'not found' }, 404);
  let synced = 0;
  if (c.req.query('sync') === '1') synced = await syncEntityToLinks(me.workspaceId, id);
  await audit(me.id, 'entity.update', id, { synced });
  return c.json({ ok: true, synced });
});

app.delete('/:id', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const row = (await db.select().from(entities).where(and(eq(entities.id, id), eq(entities.workspaceId, me.workspaceId))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  await db.update(entities).set({ deletedAt: new Date() }).where(eq(entities.id, id));
  await audit(me.id, 'entity.delete', id);
  return c.json({ ok: true });
});

app.post('/:id/links', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  if (!body.module || !body.kind || !body.recordId) return c.json({ error: 'module, kind, recordId required' }, 400);
  try {
    const linkId = await addLink(me.workspaceId, c.req.param('id'), body);
    return c.json({ id: linkId }, 201);
  } catch { return c.json({ error: 'already linked' }, 409); }
});

app.delete('/:id/links/:linkId', requireRole('editor'), async (c) => {
  const me = c.get('user');
  await db.delete(entityLinks).where(and(eq(entityLinks.id, c.req.param('linkId')), eq(entityLinks.workspaceId, me.workspaceId)));
  return c.json({ ok: true });
});

export default app;
