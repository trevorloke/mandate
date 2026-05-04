// Password reset flow — backed by a dedicated `password_resets` table.
//   POST /api/password-reset/request    { email }    → always 200 (don't reveal existence)
//   GET  /api/password-reset/:token                  → returns email/name (if valid)
//   POST /api/password-reset/:token     { password } → set new password, kill all sessions, sign in
import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { db } from '../db/index.js';
import { users, sessions, passwordResets, auditLog } from '../db/schema.js';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { setSessionCookie } from '../middleware/auth.js';
import { rateLimit } from '../middleware/ratelimit.js';
import { sendEmail } from '../lib/email.js';

const newId = (p='') => p + randomBytes(12).toString('hex');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const SESSION_DAYS = 14;
const TOKEN_TTL_MIN = 60;

const app = new Hono();

// Request a reset link
app.post('/request', rateLimit({ key: 'pwreset', max: 5, windowMs: 60_000 }), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email } = body;
  if (!email) return c.json({ ok: true });

  const u = (await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1))[0];
  if (!u || !u.active) return c.json({ ok: true });

  const token = randomBytes(24).toString('hex');
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000);

  await db.insert(passwordResets).values({
    id: newId('pr_'), userId: u.id, tokenHash, expiresAt,
  });

  const origin = c.req.header('origin') || '';
  const resetUrl = `${origin}/reset-password/${token}`;
  sendEmail({
    to: u.email,
    subject: 'Reset your Mandate password',
    text:
      `Hi ${u.name},\n\n` +
      `Someone requested a password reset for your account.\n` +
      `If this was you, follow this link within ${TOKEN_TTL_MIN} minutes:\n\n` +
      `${resetUrl}\n\n` +
      `If not, you can ignore this email — your password will not change.`,
  }).catch(() => {});

  return c.json({ ok: true, resetUrl: `/reset-password/${token}` });
});

async function findActiveToken(token) {
  const tokenHash = sha256(token);
  const now = new Date();
  const row = (await db.select().from(passwordResets)
    .where(and(eq(passwordResets.tokenHash, tokenHash), gt(passwordResets.expiresAt, now), isNull(passwordResets.usedAt)))
    .limit(1))[0];
  return row || null;
}

app.get('/:token', async (c) => {
  const token = c.req.param('token');
  const found = await findActiveToken(token);
  if (!found) return c.json({ error: 'invalid or expired link' }, 404);
  const u = (await db.select().from(users).where(eq(users.id, found.userId)).limit(1))[0];
  if (!u || !u.active) return c.json({ error: 'user not found' }, 404);
  return c.json({ email: u.email, name: u.name });
});

app.post('/:token', async (c) => {
  const token = c.req.param('token');
  const body = await c.req.json().catch(() => ({}));
  const { password } = body;
  if (!password || password.length < 8) return c.json({ error: 'password must be at least 8 characters' }, 400);

  const found = await findActiveToken(token);
  if (!found) return c.json({ error: 'invalid or expired link' }, 404);
  const u = (await db.select().from(users).where(eq(users.id, found.userId)).limit(1))[0];
  if (!u || !u.active) return c.json({ error: 'user not found' }, 404);

  const passwordHash = await bcrypt.hash(password, 10);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, u.id));

  // Kill all existing sessions for security
  await db.delete(sessions).where(eq(sessions.userId, u.id));

  // Mark token consumed
  await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, found.id));

  // Issue a fresh session
  const sid = newId();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  await db.insert(sessions).values({ id: sid, userId: u.id, expiresAt });
  setSessionCookie(c, sid, SESSION_DAYS * 86400);

  await db.insert(auditLog).values({ id: newId('a_'), userId: u.id, action: 'password.reset' });

  const { passwordHash: _ph, ...sanitized } = u;
  return c.json({ ok: true, user: sanitized });
});

export default app;
