// TOTP 2FA flow:
//   POST /api/auth/totp/setup        → returns { secret, otpauth, qr } — NOT enabled yet
//   POST /api/auth/totp/enable {code} → verifies code, enables TOTP, returns recovery codes (shown once)
//   POST /api/auth/totp/disable {password,code} → off
//   POST /api/auth/totp/verify {code} → consumed by login flow when user has 2FA on
//   POST /api/auth/totp/regenerate-codes {password} → new recovery codes
import { Hono } from 'hono';
import * as otp from 'otplib';
import qrcode from 'qrcode';

// Minimal compatibility shim around otplib v13's functional API.
const TOTP_OPTS = { algorithm: 'SHA1', digits: 6, step: 30, encoding: 'base32', window: 1 };

const authenticator = {
  generateSecret: () => otp.generateSecret({ format: 'base32', size: 20 }),
  keyuri: (account, issuer, secret) => otp.generateURI({ account, issuer, secret, ...TOTP_OPTS }),
  generate: (secret) => otp.generateSync({ secret, ...TOTP_OPTS }),
  check: (token, secret) => {
    try { return otp.verifySync({ token, secret, ...TOTP_OPTS }); }
    catch { return false; }
  },
};
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { db } from '../db/index.js';
import { users, auditLog } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

// (window=1 already configured in TOTP_OPTS — accept ±1 30s window for clock skew)

const newId = (p='') => p + randomBytes(12).toString('hex');

function newRecoveryCodes(n = 8) {
  return Array.from({ length: n }, () => {
    // 4 hex chars + dash + 4 hex chars (e.g., 'a3b9-7c12') — easy to read
    const a = randomBytes(2).toString('hex');
    const b = randomBytes(2).toString('hex');
    return `${a}-${b}`;
  });
}

const app = new Hono();
app.use('*', requireAuth);

// Begin enrollment — generate a secret + QR code, but don't enable yet
app.post('/setup', async (c) => {
  const me = c.get('user');
  if (me.totpEnabled) return c.json({ error: '2FA already enabled — disable first' }, 400);

  const secret = authenticator.generateSecret();
  const issuer = 'Mandate';
  const accountName = me.email;
  const otpauth = authenticator.keyuri(accountName, issuer, secret);
  const qr = await qrcode.toDataURL(otpauth);

  // Store the candidate secret on the user (totp_enabled stays false)
  await db.update(users).set({ totpSecret: secret, updatedAt: new Date() }).where(eq(users.id, me.id));

  return c.json({ secret, otpauth, qr });
});

// Verify the code, enable TOTP, issue recovery codes (shown ONCE)
app.post('/enable', async (c) => {
  const me = c.get('user');
  if (me.totpEnabled) return c.json({ error: 'already enabled' }, 400);
  const fresh = (await db.select().from(users).where(eq(users.id, me.id)).limit(1))[0];
  if (!fresh.totpSecret) return c.json({ error: 'call /setup first' }, 400);

  const body = await c.req.json().catch(() => ({}));
  const { code } = body;
  if (!code) return c.json({ error: 'code required' }, 400);
  const ok = authenticator.check(String(code).replace(/\s+/g, ''), fresh.totpSecret);
  if (!ok) return c.json({ error: 'invalid code' }, 400);

  // Generate + hash recovery codes; show plain ONCE to user
  const codes = newRecoveryCodes(8);
  const codesHash = await Promise.all(codes.map(c => bcrypt.hash(c, 10)));

  await db.update(users).set({
    totpEnabled: true,
    recoveryCodesHash: JSON.stringify(codesHash),
    updatedAt: new Date(),
  }).where(eq(users.id, me.id));

  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'totp.enable' });
  return c.json({ ok: true, recoveryCodes: codes });
});

// Disable TOTP — requires current password + a current code
app.post('/disable', async (c) => {
  const me = c.get('user');
  if (!me.totpEnabled) return c.json({ error: 'not enabled' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const { password, code } = body;
  if (!password) return c.json({ error: 'password required' }, 400);

  const fresh = (await db.select().from(users).where(eq(users.id, me.id)).limit(1))[0];
  const passOk = await bcrypt.compare(password, fresh.passwordHash);
  if (!passOk) return c.json({ error: 'password incorrect' }, 401);

  if (!code) return c.json({ error: 'code required' }, 400);
  const ok = await verifyTotpOrRecovery(fresh, code);
  if (!ok) return c.json({ error: 'invalid code' }, 401);

  await db.update(users).set({
    totpEnabled: false,
    totpSecret: null,
    recoveryCodesHash: null,
    updatedAt: new Date(),
  }).where(eq(users.id, me.id));

  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'totp.disable' });
  return c.json({ ok: true });
});

// Regenerate recovery codes (requires password + current code)
app.post('/regenerate-codes', async (c) => {
  const me = c.get('user');
  if (!me.totpEnabled) return c.json({ error: '2FA not enabled' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const { password, code } = body;

  const fresh = (await db.select().from(users).where(eq(users.id, me.id)).limit(1))[0];
  const passOk = await bcrypt.compare(password || '', fresh.passwordHash);
  if (!passOk) return c.json({ error: 'password incorrect' }, 401);

  const ok = await verifyTotpOrRecovery(fresh, code);
  if (!ok) return c.json({ error: 'invalid code' }, 401);

  const codes = newRecoveryCodes(8);
  const codesHash = await Promise.all(codes.map(c => bcrypt.hash(c, 10)));
  await db.update(users).set({
    recoveryCodesHash: JSON.stringify(codesHash),
    updatedAt: new Date(),
  }).where(eq(users.id, me.id));

  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'totp.regenerate_codes' });
  return c.json({ ok: true, recoveryCodes: codes });
});

// ── Helpers exposed for login flow ─────────────────────────────────────
export async function verifyTotpOrRecovery(user, codeRaw) {
  const code = String(codeRaw || '').trim().replace(/\s+/g, '');
  if (!code) return false;
  // Try TOTP first (6-digit numeric)
  if (/^\d{6}$/.test(code) && user.totpSecret) {
    if (authenticator.check(code, user.totpSecret)) return true;
  }
  // Try recovery code (xxxx-xxxx)
  if (/^[a-f0-9]{4}-[a-f0-9]{4}$/i.test(code) && user.recoveryCodesHash) {
    let hashes = []; try { hashes = JSON.parse(user.recoveryCodesHash); } catch {}
    for (let i = 0; i < hashes.length; i++) {
      // bcrypt.compare is sync-blocking; run sequentially
      if (await bcrypt.compare(code.toLowerCase(), hashes[i])) {
        // Consume this recovery code (one-time use)
        const remaining = hashes.filter((_, j) => j !== i);
        await db.update(users).set({
          recoveryCodesHash: JSON.stringify(remaining),
          updatedAt: new Date(),
        }).where(eq(users.id, user.id));
        return true;
      }
    }
  }
  return false;
}

export default app;
