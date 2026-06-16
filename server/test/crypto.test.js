import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MANDATE_SECRET_KEY ||= 'test-secret-key';
const { encrypt, decrypt, encryptJson, decryptJson } = await import('../lib/crypto.js');

test('encrypt → decrypt round-trips and uses the versioned prefix', () => {
  const enc = encrypt('hunter2');
  assert.ok(enc.startsWith('enc:v1:'), 'has prefix');
  assert.notEqual(enc, 'hunter2', 'not plaintext');
  assert.equal(decrypt(enc), 'hunter2');
});

test('encryptJson → decryptJson preserves structure', () => {
  const obj = { accessToken: 'abc', nested: { did: 'did:plc:x', n: 3 }, arr: [1, 2] };
  assert.deepEqual(decryptJson(encryptJson(obj)), obj);
});

test('decrypt passes through legacy plaintext (migration safety)', () => {
  assert.equal(decrypt('legacy-plain-value'), 'legacy-plain-value');
});

test('decrypt returns null on tampered ciphertext', () => {
  const enc = encrypt('secret');
  const tampered = enc.slice(0, -3) + 'AAA';
  assert.equal(decrypt(tampered), null);
});

test('null/undefined are handled', () => {
  assert.equal(encrypt(null), null);
  assert.equal(decrypt(null), null);
  assert.equal(decryptJson(null), null);
});

test('a different key cannot decrypt (auth fails → null)', async () => {
  const enc = encrypt('topsecret');
  process.env.MANDATE_SECRET_KEY = 'a-totally-different-key';
  // re-import is cached; key() reads env each call, so decrypt now uses new key
  assert.equal(decrypt(enc), null);
  process.env.MANDATE_SECRET_KEY = 'test-secret-key';
  assert.equal(decrypt(enc), 'topsecret');
});
