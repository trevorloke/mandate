// WebAuthn / passkeys — phishing-resistant credentials.
// Endpoints:
//   POST /api/auth/passkey/register/begin     (auth required)
//   POST /api/auth/passkey/register/complete  (auth required)
//   POST /api/auth/passkey/login/begin        (no auth; usernameless or email-supplied)
//   POST /api/auth/passkey/login/complete     (no auth; sets session cookie)
//   GET  /api/auth/passkey                    (auth required) — list current user's passkeys
//   PUT  /api/auth/passkey/:id                (auth required) — rename
//   DELETE /api/auth/passkey/:id              (auth required)
import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { db } from '../db/index.js';
import { users, sessions, passkeys, webauthnChallenges, auditLog } from '../db/schema.js';
import { and, eq, lt } from 'drizzle-orm';
import { requireAuth, setSessionCookie } from '../middleware/auth.js';
import { planFor, hasFeature } from '../lib/plans.js';

const newId = (p='') => p + randomBytes(12).toString('hex');
const SESSION_DAYS = 14;
const CHALLENGE_TTL_S = 5 * 60;

// Resolve RP (relying party) id + origin from request.
// rpID must be the registrable domain (e.g. 'mandate.app' or 'localhost').
function rpFromRequest(c) {
  const origin = c.req.header('origin') || `http://localhost:5174`;
  let rpID;
  try { rpID = new URL(origin).hostname; } catch { rpID = 'localhost'; }
  return { origin, rpID, rpName: 'Mandate' };
}

async function purgeExpiredChallenges() {
  await db.delete(webauthnChallenges).where(lt(webauthnChallenges.expiresAt, new Date()));
}

const app = new Hono();

// ── REGISTER ───────────────────────────────────────────────────────────
app.post('/register/begin', requireAuth, async (c) => {
  const me = c.get('user');
  const plan = await planFor(me.workspaceId);
  if (!hasFeature(plan, 'passkeys')) {
    return c.json({ error: `Passkeys require a higher plan (current: ${plan.label}). Upgrade to enable.`, code: 'FEATURE_GATED', feature: 'passkeys', plan: plan.key }, 402);
  }
  const { rpID, rpName } = rpFromRequest(c);
  const existing = await db.select().from(passkeys).where(eq(passkeys.userId, me.id));

  const options = await generateRegistrationOptions({
    rpName, rpID,
    userID: new TextEncoder().encode(me.id),
    userName: me.email,
    userDisplayName: me.name,
    attestationType: 'none',
    excludeCredentials: existing.map(p => ({
      id: p.credentialId,
      transports: tryParse(p.transports, []),
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  await db.insert(webauthnChallenges).values({
    id: newId('wc_'),
    challenge: options.challenge,
    userId: me.id,
    kind: 'register',
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_S * 1000),
  });

  return c.json({ options });
});

app.post('/register/complete', requireAuth, async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { response, label } = body;
  if (!response) return c.json({ error: 'response required' }, 400);

  const expected = (await db.select().from(webauthnChallenges)
    .where(and(eq(webauthnChallenges.userId, me.id), eq(webauthnChallenges.kind, 'register')))
    .orderBy(webauthnChallenges.createdAt)).at(-1);
  if (!expected) return c.json({ error: 'no challenge — call /begin first' }, 400);
  if (expected.expiresAt < new Date()) return c.json({ error: 'challenge expired' }, 400);

  const { origin, rpID } = rpFromRequest(c);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: expected.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch (e) {
    return c.json({ error: 'verification failed: ' + e.message }, 400);
  }

  if (!verification.verified || !verification.registrationInfo) {
    return c.json({ error: 'registration not verified' }, 400);
  }

  const info = verification.registrationInfo;
  // simplewebauthn v13 puts credential under .credential, v10 had it inline. Handle both.
  const cred = info.credential || info;
  const credentialId = typeof cred.id === 'string'
    ? cred.id
    : Buffer.from(cred.id).toString('base64url');
  const publicKey = Buffer.from(cred.publicKey).toString('base64url');
  const counter = cred.counter ?? 0;

  await db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, expected.id));

  const id = newId('pk_');
  await db.insert(passkeys).values({
    id, userId: me.id,
    credentialId, publicKey, counter,
    deviceType: info.credentialDeviceType || null,
    backedUp: !!info.credentialBackedUp,
    transports: JSON.stringify(response?.response?.transports || []),
    label: (label || guessLabel(c)).slice(0, 80),
  });

  await db.insert(auditLog).values({
    id: newId('a_'), userId: me.id, action: 'passkey.register', target: id,
    meta: JSON.stringify({ deviceType: info.credentialDeviceType, backedUp: !!info.credentialBackedUp }),
  });

  return c.json({ ok: true, id });
});

// ── LOGIN ──────────────────────────────────────────────────────────────
// Usernameless: client passes no email; we return options without allowCredentials,
// the browser shows discoverable credentials, and we resolve user from credential id on /complete.
// With email: we narrow allowCredentials to that user's registered passkeys.
app.post('/login/begin', async (c) => {
  await purgeExpiredChallenges();
  const body = await c.req.json().catch(() => ({}));
  const { email } = body;
  const { rpID } = rpFromRequest(c);

  let allowCredentials = undefined;
  let userId = null;
  if (email) {
    const u = (await db.select().from(users).where(eq(users.email, String(email).toLowerCase())).limit(1))[0];
    if (u) {
      userId = u.id;
      const ks = await db.select().from(passkeys).where(eq(passkeys.userId, u.id));
      allowCredentials = ks.map(k => ({ id: k.credentialId, transports: tryParse(k.transports, []) }));
      // Don't disclose whether user exists if no passkeys — return generic options anyway.
      if (!allowCredentials.length) allowCredentials = undefined;
    }
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials,
    userVerification: 'preferred',
  });

  await db.insert(webauthnChallenges).values({
    id: newId('wc_'),
    challenge: options.challenge,
    userId,
    kind: 'authenticate',
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_S * 1000),
  });

  return c.json({ options });
});

app.post('/login/complete', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { response } = body;
  if (!response?.id) return c.json({ error: 'response required' }, 400);

  // The challenge we stored was the latest 'authenticate' challenge for the matching user
  // (or null userId for usernameless). We resolve the credential first, then the challenge.
  const credentialId = response.id;  // base64url
  const cred = (await db.select().from(passkeys).where(eq(passkeys.credentialId, credentialId)).limit(1))[0];
  if (!cred) return c.json({ error: 'unknown credential' }, 400);

  // Find the most recent authentication challenge for this user (or null/usernameless)
  const candidates = await db.select().from(webauthnChallenges)
    .where(eq(webauthnChallenges.kind, 'authenticate'));
  const expected = candidates
    .filter(ch => !ch.userId || ch.userId === cred.userId)
    .filter(ch => ch.expiresAt > new Date())
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!expected) return c.json({ error: 'no matching challenge — call /begin first' }, 400);

  const { origin, rpID } = rpFromRequest(c);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: expected.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.credentialId,
        publicKey: Buffer.from(cred.publicKey, 'base64url'),
        counter: cred.counter,
        transports: tryParse(cred.transports, []),
      },
    });
  } catch (e) {
    return c.json({ error: 'verification failed: ' + e.message }, 400);
  }

  if (!verification.verified) return c.json({ error: 'auth not verified' }, 400);

  await db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, expected.id));

  // Update counter + lastUsedAt
  await db.update(passkeys).set({
    counter: verification.authenticationInfo.newCounter,
    lastUsedAt: new Date(),
  }).where(eq(passkeys.id, cred.id));

  // Look up the user, create a session
  const user = (await db.select().from(users).where(eq(users.id, cred.userId)).limit(1))[0];
  if (!user || !user.active) return c.json({ error: 'user inactive' }, 403);

  const sid = newId('s_');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  await db.insert(sessions).values({ id: sid, userId: user.id, expiresAt });
  setSessionCookie(c, sid, SESSION_DAYS * 86400);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  await db.insert(auditLog).values({
    id: newId('a_'), userId: user.id, action: 'auth.passkey_login', target: cred.id,
  });

  const { passwordHash, totpSecret, recoveryCodesHash, ...safe } = user;
  return c.json({ ok: true, user: safe });
});

// ── LIST / RENAME / DELETE ─────────────────────────────────────────────
app.get('/', requireAuth, async (c) => {
  const me = c.get('user');
  const rows = await db.select({
    id: passkeys.id, label: passkeys.label, deviceType: passkeys.deviceType,
    backedUp: passkeys.backedUp, transports: passkeys.transports,
    lastUsedAt: passkeys.lastUsedAt, createdAt: passkeys.createdAt,
  }).from(passkeys).where(eq(passkeys.userId, me.id));
  return c.json({ passkeys: rows.map(r => ({ ...r, transports: tryParse(r.transports, []) })) });
});

app.put('/:id', requireAuth, async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  if (!body.label || !String(body.label).trim()) return c.json({ error: 'label required' }, 400);
  const row = (await db.select().from(passkeys)
    .where(and(eq(passkeys.id, id), eq(passkeys.userId, me.id))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  await db.update(passkeys).set({ label: String(body.label).slice(0, 80) }).where(eq(passkeys.id, id));
  return c.json({ ok: true });
});

app.delete('/:id', requireAuth, async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const row = (await db.select().from(passkeys)
    .where(and(eq(passkeys.id, id), eq(passkeys.userId, me.id))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  await db.delete(passkeys).where(eq(passkeys.id, id));
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'passkey.delete', target: id });
  return c.json({ ok: true });
});

function tryParse(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }
function guessLabel(c) {
  const ua = c.req.header('user-agent') || '';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Android/i.test(ua)) return 'Android';
  return 'Passkey';
}

export default app;
