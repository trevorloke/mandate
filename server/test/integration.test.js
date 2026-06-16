// Integration tests: boot the REAL server and drive it over HTTP, exercising
// the full middleware chain (auth, CSRF, role gates), the social routes, and the
// public /l/:slug redirect. Network to platforms is not used; these hit only
// our own endpoints on localhost.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 3100 + Math.floor(Math.random() * 800);
const base = `http://127.0.0.1:${PORT}`;
let proc;

// Tiny cookie-jar HTTP client (session + CSRF, like the browser client).
const jar = new Map();
function absorb(res) {
  for (const c of (res.headers.getSetCookie?.() || [])) {
    const pair = c.split(';')[0];
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
}
async function req(method, path, body) {
  const headers = {};
  if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    if (jar.get('mdt_csrf')) headers['X-CSRF-Token'] = jar.get('mdt_csrf');
  }
  const res = await fetch(base + path, { method, headers, redirect: 'manual', body: body != null ? JSON.stringify(body) : undefined });
  absorb(res);
  return res;
}
const json = async (res) => { try { return await res.json(); } catch { return {}; } };

before(async () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'beacon-it-')), 'it.db');
  proc = spawn('node', ['server/index.js'], {
    env: { ...process.env, MANDATE_DB: dbPath, MANDATE_SECRET_KEY: 'it-key', PORT: String(PORT), MANDATE_PUBLIC_URL: base, MANDATE_EMAIL_BACKEND: 'capture' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server start timeout')), 20000);
    proc.stdout.on('data', (d) => { if (String(d).includes('Mandate API')) { clearTimeout(t); resolve(); } });
    proc.stderr.on('data', () => {});
    proc.on('exit', (code) => reject(new Error('server exited early: ' + code)));
  });
});

after(() => { try { proc?.kill('SIGKILL'); } catch { /* ignore */ } });

test('social routes require auth', async () => {
  const res = await req('GET', '/api/social/providers');
  assert.equal(res.status, 401);
});

test('signup establishes a session', async () => {
  await req('GET', '/api/auth/setup-state'); // primes the CSRF cookie
  const res = await req('POST', '/api/auth/signup', { email: 'it@test.com', password: 'password123', name: 'IT', workspaceName: 'IT WS' });
  assert.equal(res.status, 200);
  assert.ok(jar.get('mdt_session'), 'session cookie set');
});

test('providers + accounts are reachable once authed', async () => {
  const provs = await json(await req('GET', '/api/social/providers'));
  assert.ok(Array.isArray(provs.providers) && provs.providers.length >= 5);
  assert.equal(provs.aiAvailable, false);
  const accts = await json(await req('GET', '/api/social/accounts'));
  assert.deepEqual(accts.accounts, []);
});

test('compose validates targets', async () => {
  const res = await req('POST', '/api/social/posts', { body: 'hi', targets: [] });
  assert.equal(res.status, 400);
});

test('keywords create + list round-trip', async () => {
  const created = await json(await req('POST', '/api/social/keywords', { phrase: 'mount pleasant' }));
  assert.equal(created.keyword.phrase, 'mount pleasant');
  const list = await json(await req('GET', '/api/social/keywords'));
  assert.ok(list.keywords.some((k) => k.phrase === 'mount pleasant'));
});

test('queue slots save + read back', async () => {
  await req('PUT', '/api/social/slots', { slots: [{ day: 1, time: '09:00' }, { day: 3, time: '17:30' }] });
  const got = await json(await req('GET', '/api/social/slots'));
  assert.equal(got.slots.length, 2);
});

test('short link redirects publicly and counts a click', async () => {
  const s = await json(await req('POST', '/api/social/shorten', { url: 'https://example.com/page', utm: { campaign: 'launch' } }));
  assert.ok(s.shortUrl.includes('/l/' + s.slug));
  // Public redirect — no cookies needed.
  const red = await fetch(`${base}/l/${s.slug}`, { redirect: 'manual' });
  assert.equal(red.status, 302);
  assert.equal(red.headers.get('location'), 'https://example.com/page?utm_campaign=launch');
  const links = await json(await req('GET', '/api/social/links'));
  const mine = links.links.find((l) => l.slug === s.slug);
  assert.ok(mine && mine.clicks >= 1, 'click was tracked');
});

test('connecting with bad credentials fails cleanly (400)', async () => {
  const res = await req('POST', '/api/social/accounts/connect', { platform: 'bluesky', identifier: 'nope.bsky.social', appPassword: 'wrong' });
  assert.equal(res.status, 400);
});
