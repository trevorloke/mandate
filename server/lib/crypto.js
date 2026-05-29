// Symmetric encryption for secrets at rest (social tokens, app secrets).
//
// AES-256-GCM. The key comes from MANDATE_SECRET_KEY (hex/base64/passphrase —
// anything; we SHA-256 it to 32 bytes). If it's unset we derive a stable key
// from a file-local fallback so dev still works, but we warn loudly because
// that fallback is NOT secure for production.
//
// Ciphertext format: 'enc:v1:' + base64(iv[12] | tag[16] | ciphertext).
// decrypt() passes through any value lacking the prefix, so the column can hold
// legacy plaintext during migration without breaking.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const PREFIX = 'enc:v1:';
let warned = false;

function key() {
  const raw = process.env.MANDATE_SECRET_KEY;
  if (!raw) {
    if (!warned) {
      console.warn('[crypto] MANDATE_SECRET_KEY is not set — using an insecure dev fallback key. Set it in production.');
      warned = true;
    }
    return createHash('sha256').update('mandate-dev-fallback-key').digest();
  }
  return createHash('sha256').update(raw).digest();
}

export function encrypt(plain) {
  if (plain == null) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decrypt(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value; // legacy plaintext
  try {
    const buf = Buffer.from(value.slice(PREFIX.length), 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return null; // tampered or wrong key
  }
}

// Convenience: encrypt/decrypt a JSON-serializable object.
export function encryptJson(obj) { return encrypt(JSON.stringify(obj ?? null)); }
export function decryptJson(value) {
  const s = decrypt(value);
  if (s == null) return null;
  try { return JSON.parse(s); } catch { return null; }
}
