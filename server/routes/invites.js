// Invite-link flow — backed by a dedicated `invites` table.
//   POST /api/invites          (admin+) → create invite, return single-use URL
//   GET  /api/invites/:token            → public — fetch invite for accept page
//   POST /api/invites/:token            → public — set password, create user, sign in
import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { db } from '../db/index.js';
import { users, sessions, invites, auditLog } from '../db/schema.js';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';
import { requireAuth, requireRole, setSessionCookie, ROLES } from '../middleware/auth.js';
import { sendEmail } from '../lib/email.js';
import { notify } from '../lib/notify.js';

const newId = (p='') => p + randomBytes(12).toString('hex');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const initialsOf = (n) => n.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const SESSION_DAYS = 14;
const INVITE_TTL_DAYS = 7;

const app = new Hono();

// Admin creates an invite
app.post('/', requireAuth, requireRole('admin'), async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { email, name, role = 'viewer' } = body;
  if (!email || !name) return c.json({ error: 'email and name required' }, 400);
  if (!ROLES.includes(role)) return c.json({ error: 'invalid role' }, 400);
  if (role === 'super_admin' && me.role !== 'super_admin') return c.json({ error: 'only super_admin can invite super_admin' }, 403);

  const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (existing.length) return c.json({ error: 'email already in use' }, 409);

  const token = randomBytes(24).toString('hex');
  const tokenHash = sha256(token);
  const id = newId('inv_');
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400 * 1000);

  await db.insert(invites).values({
    id, workspaceId: me.workspaceId, invitedById: me.id,
    email: email.toLowerCase(), name, role,
    tokenHash, expiresAt,
  });

  await db.insert(auditLog).values({
    id: newId('a_'), userId: me.id, action: 'invite.create', target: id,
    meta: JSON.stringify({ email, role }),
  });

  const origin = c.req.header('origin') || '';
  const inviteUrl = `${origin}/invite/${token}`;
  sendEmail({
    to: email.toLowerCase(),
    subject: `${me.name} invited you to a Mandate workspace`,
    text:
      `Hi ${name},\n\n` +
      `${me.name} (${me.email}) has invited you to join Mandate as ${role}.\n\n` +
      `Accept here (expires in ${INVITE_TTL_DAYS} days): ${inviteUrl}\n\n` +
      `This link is single-use.`,
  }).catch(() => {});

  return c.json({ ok: true, token, inviteUrl: `/invite/${token}` });
});

// Public: read invite details
app.get('/:token', async (c) => {
  const token = c.req.param('token');
  const tokenHash = sha256(token);
  const inv = (await db.select().from(invites).where(eq(invites.tokenHash, tokenHash)).limit(1))[0];
  if (!inv) return c.json({ error: 'invalid or expired invite' }, 404);
  if (inv.acceptedAt) return c.json({ error: 'this invite has already been used' }, 410);
  if (inv.expiresAt && inv.expiresAt < new Date()) return c.json({ error: 'this invite has expired' }, 410);
  return c.json({ invite: { email: inv.email, name: inv.name, role: inv.role } });
});

// Public: accept invite by setting password, activates + signs in
app.post('/:token', async (c) => {
  const token = c.req.param('token');
  const body = await c.req.json().catch(() => ({}));
  const { password } = body;
  if (!password || password.length < 8) return c.json({ error: 'password must be at least 8 characters' }, 400);

  const tokenHash = sha256(token);
  const inv = (await db.select().from(invites).where(eq(invites.tokenHash, tokenHash)).limit(1))[0];
  if (!inv) return c.json({ error: 'invalid or expired invite' }, 404);
  if (inv.acceptedAt) return c.json({ error: 'this invite has already been used' }, 410);
  if (inv.expiresAt && inv.expiresAt < new Date()) return c.json({ error: 'this invite has expired' }, 410);

  // Belt-and-braces: ensure the email isn't already taken
  const existing = await db.select().from(users).where(eq(users.email, inv.email)).limit(1);
  if (existing.length) return c.json({ error: 'email already in use' }, 409);

  const userId = newId('u_');
  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(users).values({
    id: userId,
    email: inv.email, passwordHash,
    name: inv.name, initials: initialsOf(inv.name),
    role: inv.role, workspaceId: inv.workspaceId,
    active: true, lastLoginAt: new Date(),
  });

  // Mark invite as accepted
  await db.update(invites).set({ acceptedAt: new Date(), acceptedById: userId })
    .where(eq(invites.id, inv.id));

  // sign in
  const sid = newId();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  await db.insert(sessions).values({ id: sid, userId, expiresAt });
  setSessionCookie(c, sid, SESSION_DAYS * 86400);

  await db.insert(auditLog).values({ id: newId('a_'), userId, action: 'invite.accept', target: inv.id });

  // Notify the inviter that their invite was accepted
  if (inv.invitedById) {
    notify({
      userId: inv.invitedById,
      kind: 'invite.accepted',
      title: `${inv.name} joined the workspace`,
      body: `${inv.email} accepted your invite as ${inv.role}.`,
      link: '/admin',
    }).catch(() => {});
  }

  const fresh = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  const { passwordHash: _ph, ...sanitized } = fresh;
  return c.json({ ok: true, user: sanitized });
});

export default app;
