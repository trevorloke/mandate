// /api/auth — signup creates user + workspace + manager membership in one
// transaction (every tenant is small and self-serve; there is no operator
// console). Login binds the session to the user's workspace membership.
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { newId } from '../lib/events.js';
import {
  hashPassword, verifyPassword, dummyVerify,
  createSession, destroySession, loadContext, SESSION_COOKIE,
} from '../lib/auth.js';

const app = new Hono();

const cookieOpts = { httpOnly: true, sameSite: 'Lax', path: '/' };

const signupInput = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  workspaceName: z.string().trim().min(1).max(200),
  candidate: z.string().trim().max(200).optional(),
  jurisdiction: z.enum(['bc-provincial', 'bc-municipal', 'federal']).default('bc-provincial'),
});

app.post('/signup', async (c) => {
  const db = await getDb();
  const parsed = signupInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
  const input = parsed.data;

  const email = input.email.toLowerCase();
  const passwordHash = await hashPassword(input.password);
  const userId = newId();
  const workspaceId = newId();
  try {
    await db.transaction(async (tx) => {
      await tx.query(
        'insert into users (id, email, name, password_hash) values ($1, $2, $3, $4)',
        [userId, email, input.name, passwordHash],
      );
      await tx.query(
        'insert into workspaces (id, name, candidate, jurisdiction) values ($1, $2, $3, $4)',
        [workspaceId, input.workspaceName, input.candidate || null, input.jurisdiction],
      );
      await tx.query(
        'insert into memberships (user_id, workspace_id, role) values ($1, $2, $3)',
        [userId, workspaceId, 'manager'],
      );
    });
  } catch (e) {
    if (String(e.message).includes('users_email_key')) {
      return c.json({ error: 'an account with that email already exists' }, 409);
    }
    throw e;
  }
  const token = await createSession(db, userId, workspaceId);
  setCookie(c, SESSION_COOKIE, token, cookieOpts);
  const ctx = await loadContext(db, token);
  return c.json({ user: ctx.user, workspace: ctx.workspace, role: ctx.role }, 201);
});

app.post('/login', async (c) => {
  const db = await getDb();
  const { email, password } = await c.req.json().catch(() => ({}));
  if (!email || !password) return c.json({ error: 'email and password required' }, 400);
  const user = (await db.query(
    'select id, password_hash from users where email = $1',
    [String(email).toLowerCase()],
  )).rows[0];
  if (!user) {
    await dummyVerify();
    return c.json({ error: 'invalid credentials' }, 401);
  }
  if (!(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: 'invalid credentials' }, 401);
  }
  const membership = (await db.query(
    'select workspace_id from memberships where user_id = $1 order by created_at limit 1',
    [user.id],
  )).rows[0];
  if (!membership) return c.json({ error: 'no workspace membership' }, 403);
  const token = await createSession(db, user.id, membership.workspace_id);
  setCookie(c, SESSION_COOKIE, token, cookieOpts);
  const ctx = await loadContext(db, token);
  return c.json({ user: ctx.user, workspace: ctx.workspace, role: ctx.role });
});

app.post('/logout', async (c) => {
  const db = await getDb();
  await destroySession(db, getCookie(c, SESSION_COOKIE));
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

app.get('/me', async (c) => {
  const db = await getDb();
  const ctx = await loadContext(db, getCookie(c, SESSION_COOKIE));
  if (!ctx) return c.json({ error: 'not signed in' }, 401);
  return c.json({ user: ctx.user, workspace: ctx.workspace, role: ctx.role });
});

export default app;
