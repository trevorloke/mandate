// Comments — threaded discussion attached to any target id within a workspace.
// Supports @-mentions: `@email@domain.com` or `@username` resolves to a user;
// each mention generates a notification + realtime broadcast.
import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { db } from '../db/index.js';
import { comments, users, auditLog } from '../db/schema.js';
import { and, eq, asc, isNull } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { broadcast } from '../lib/realtime.js';
import { notify } from '../lib/notify.js';

const newId = (p='') => p + randomBytes(12).toString('hex');

const app = new Hono();
app.use('*', requireAuth);

// Resolve @-mentions in body. Accepts:
//   @username         (matches users.email's local part — the bit before '@')
//   @user@example.com (matches full email)
async function resolveMentions(workspaceId, body) {
  // Match strings that look like mentions: @ + (email-like or word-like)
  const re = /@([A-Za-z0-9._-]+(?:@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?)/g;
  const tokens = new Set();
  let m; while ((m = re.exec(body))) tokens.add(m[1]);
  if (!tokens.size) return [];

  // Pull all workspace users once, match locally
  const all = await db.select({ id: users.id, email: users.email, name: users.name })
    .from(users).where(eq(users.workspaceId, workspaceId));

  const matches = new Map();
  for (const tok of tokens) {
    const lc = tok.toLowerCase();
    const u = all.find(u => {
      const local = u.email.split('@')[0];
      return u.email.toLowerCase() === lc || local.toLowerCase() === lc;
    });
    if (u) matches.set(u.id, u);
  }
  return Array.from(matches.values());
}

const enrich = async (rows, workspaceId) => {
  if (!rows.length) return [];
  const ids = Array.from(new Set(rows.map(r => r.authorId).filter(Boolean)));
  const us = ids.length
    ? await db.select({ id: users.id, name: users.name, email: users.email, initials: users.initials })
        .from(users).where(eq(users.workspaceId, workspaceId))
    : [];
  const byId = Object.fromEntries(us.map(u => [u.id, u]));
  return rows.map(r => ({
    id: r.id, target: r.target, parentId: r.parentId,
    body: r.deletedAt ? '(deleted)' : r.body,
    mentions: tryParse(r.mentions),
    authorId: r.authorId,
    author: byId[r.authorId] || null,
    editedAt: r.editedAt,
    deletedAt: r.deletedAt,
    createdAt: r.createdAt,
  }));
};

function tryParse(s) { try { return JSON.parse(s || '[]'); } catch { return []; } }

// GET /api/comments?target=…   — list thread
app.get('/', async (c) => {
  const me = c.get('user');
  const target = c.req.query('target');
  if (!target) return c.json({ error: 'target required' }, 400);
  const rows = await db.select().from(comments)
    .where(and(eq(comments.workspaceId, me.workspaceId), eq(comments.target, target)))
    .orderBy(asc(comments.createdAt));
  return c.json({ comments: await enrich(rows, me.workspaceId) });
});

// POST /api/comments  { target, body, parentId? }
app.post('/', async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { target, body: text, parentId } = body;
  if (!target) return c.json({ error: 'target required' }, 400);
  if (!text || !String(text).trim()) return c.json({ error: 'body required' }, 400);

  const mentioned = await resolveMentions(me.workspaceId, String(text));
  const id = newId('cmt_');

  await db.insert(comments).values({
    id, workspaceId: me.workspaceId, target,
    parentId: parentId || null,
    authorId: me.id,
    body: String(text).trim(),
    mentions: JSON.stringify(mentioned.map(u => u.id)),
  });

  // Notify each mentioned user (excluding self)
  for (const u of mentioned) {
    if (u.id === me.id) continue;
    try {
      await notify({
        userId: u.id,
        kind: 'mention',
        title: `${me.name} mentioned you`,
        body: String(text).slice(0, 140),
        link: `/comment/${target}#${id}`,
      });
    } catch {}
  }

  // Realtime push so any client watching this target re-fetches
  try { broadcast(me.workspaceId, 'comment.new', { target, id, at: new Date().toISOString() }); } catch {}

  await db.insert(auditLog).values({
    id: newId('a_'), userId: me.id, action: 'comment.create', target,
    meta: JSON.stringify({ commentId: id, mentions: mentioned.length }),
  });

  const fresh = (await db.select().from(comments).where(eq(comments.id, id)).limit(1))[0];
  const [enriched] = await enrich([fresh], me.workspaceId);
  return c.json({ ok: true, comment: enriched });
});

// PUT /api/comments/:id  — edit own
app.put('/:id', async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const row = (await db.select().from(comments)
    .where(and(eq(comments.id, id), eq(comments.workspaceId, me.workspaceId), isNull(comments.deletedAt)))
    .limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  if (row.authorId !== me.id && me.role !== 'admin' && me.role !== 'super_admin') {
    return c.json({ error: 'cannot edit others\' comments' }, 403);
  }
  if (!body.body || !String(body.body).trim()) return c.json({ error: 'body required' }, 400);

  const mentioned = await resolveMentions(me.workspaceId, String(body.body));
  await db.update(comments).set({
    body: String(body.body).trim(),
    mentions: JSON.stringify(mentioned.map(u => u.id)),
    editedAt: new Date(),
  }).where(eq(comments.id, id));

  try { broadcast(me.workspaceId, 'comment.update', { target: row.target, id, at: new Date().toISOString() }); } catch {}

  return c.json({ ok: true });
});

// DELETE /api/comments/:id  — soft-delete own (or admin)
app.delete('/:id', async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const row = (await db.select().from(comments)
    .where(and(eq(comments.id, id), eq(comments.workspaceId, me.workspaceId), isNull(comments.deletedAt)))
    .limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  if (row.authorId !== me.id && me.role !== 'admin' && me.role !== 'super_admin') {
    return c.json({ error: 'cannot delete others\' comments' }, 403);
  }
  await db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, id));
  try { broadcast(me.workspaceId, 'comment.delete', { target: row.target, id, at: new Date().toISOString() }); } catch {}
  return c.json({ ok: true });
});

export default app;
