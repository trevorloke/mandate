// Live end-to-end smoke test for the Beacon social pipeline.
//
//   npm run smoke
//
// Boots the REAL server (real SQLite, real background worker) against a local
// Mastodon-API stand-in, then drives the full flow over HTTP:
//   signup → connect → publish-now (inline) → schedule (background worker) →
//   /status observability → confirm both posts arrived over the wire.
//
// Self-contained: spawns the server child + stand-in, uses a throwaway temp DB,
// and tears everything down. Exits non-zero on any failed assertion.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT || 3939);
const MOCK_PORT = Number(process.env.SMOKE_MOCK_PORT || 4111);
const BASE = `http://127.0.0.1:${PORT}`;
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
const TICK_MS = 800; // fast worker tick so the scheduled-post path resolves quickly

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = false;
const ok = (label, cond, extra = '') => { console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' — ' + extra : ''}`); if (!cond) failed = true; };

// ── Local Mastodon-API stand-in (localhost isn't blocked by egress) ──
const received = [];
let n = 0;
const j = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const mock = http.createServer((req, res) => {
  const p = new URL(req.url, MOCK).pathname;
  let body = ''; req.on('data', (d) => { body += d; });
  req.on('end', () => {
    if (p === '/api/v1/accounts/verify_credentials') return j(res, 200, { id: '1', username: 'smoke', display_name: 'Smoke Test', avatar: null, followers_count: 1234 });
    if (p === '/api/v1/statuses' && req.method === 'POST') {
      let parsed = {}; try { parsed = JSON.parse(body); } catch {}
      n += 1; received.push(parsed.status);
      return j(res, 200, { id: String(n), url: `${MOCK}/@smoke/${n}`, uri: `tag:${n}` });
    }
    if (p.startsWith('/api/v1/statuses/') && req.method === 'GET') return j(res, 200, { favourites_count: 7, reblogs_count: 3, replies_count: 2 });
    j(res, 404, { error: 'not found' });
  });
});

// ── HTTP client with a tiny cookie jar ──
const cookies = {};
function setFrom(res) {
  for (const sc of res.headers.getSetCookie?.() || []) {
    const [pair] = sc.split(';'); const i = pair.indexOf('=');
    cookies[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
}
const cookieHeader = () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
async function call(method, path, body) {
  const headers = { 'content-type': 'application/json', cookie: cookieHeader() };
  if (method !== 'GET' && cookies.mdt_csrf) headers['x-csrf-token'] = cookies.mdt_csrf;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  setFrom(res);
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function waitForHealth(ms = 15000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) return true; } catch { /* not up yet */ }
    await sleep(200);
  }
  return false;
}

// ── Orchestration ──
const dbDir = mkdtempSync(join(tmpdir(), 'beacon-smoke-'));
let server;
const serverLog = [];
async function main() {
  await new Promise((r) => mock.listen(MOCK_PORT, '127.0.0.1', r));

  server = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      MANDATE_DB: join(dbDir, 'smoke.db'),
      MANDATE_SECRET_KEY: 'smoke-secret-key',
      MANDATE_SOCIAL_TICK_MS: String(TICK_MS),
      PORT: String(PORT), MANDATE_HOST: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => serverLog.push(d.toString()));
  server.stderr.on('data', (d) => serverLog.push(d.toString()));

  if (!await waitForHealth()) throw new Error('server did not become healthy');

  ok('server health', (await call('GET', '/api/health')).json.ok === true);

  const email = `smoke_${Date.now()}@test.local`;
  const su = await call('POST', '/api/auth/signup', { email, password: 'password123', name: 'Smoke Tester', workspaceName: 'Smoke WS' });
  ok('signup → super_admin + workspace', su.status === 200 && su.json.user?.role === 'super_admin', su.json.error || '');
  ok('session + csrf cookies issued', !!cookies.mdt_session && !!cookies.mdt_csrf);

  const prov = await call('GET', '/api/social/providers');
  ok('providers catalogue includes mastodon', (prov.json.providers || []).some((p) => p.id === 'mastodon'));
  ok('aiAvailable flag present', typeof prov.json.aiAvailable === 'boolean', `aiAvailable=${prov.json.aiAvailable}`);

  const conn = await call('POST', '/api/social/accounts/connect', { platform: 'mastodon', instanceUrl: MOCK, accessToken: 'tok-smoke' });
  ok('connect verifies + stores account', conn.status === 200 && conn.json.account?.status === 'connected', conn.json.error || '');
  const accountId = conn.json.account?.id;

  const now = await call('POST', '/api/social/posts', { body: 'Live smoke: publish now ✅', targets: [accountId], publishNow: true });
  ok('publish-now ok + published', now.json.results?.[0]?.ok === true && now.json.posts?.[0]?.status === 'published', now.json.results?.[0]?.error || '');
  ok('publish-now returns a remote url', !!now.json.results?.[0]?.url, now.json.results?.[0]?.url || '');

  const sched = await call('POST', '/api/social/posts', { body: 'Live smoke: scheduled via worker ⏰', targets: [accountId], scheduledAt: new Date(Date.now() - 1000).toISOString() });
  ok('schedule stores a scheduled post', sched.json.posts?.[0]?.status === 'scheduled', sched.json.posts?.[0]?.status);

  let published = false;
  for (let i = 0; i < 40 && !published; i++) {
    await sleep(250);
    const list = await call('GET', '/api/social/posts');
    const grp = (list.json.groups || []).find((g) => g.groupId === sched.json.groupId);
    const st = grp?.targets?.[0]?.status;
    if (st === 'published') published = true;
    else if (st === 'failed') { ok('background worker published the scheduled post', false, grp.targets[0].error); break; }
  }
  if (published) ok('background worker published the scheduled post', true);

  const status = await call('GET', '/api/social/status');
  ok('status: worker running + publish heartbeat', status.json.worker?.running === true && !!status.json.worker?.passes?.publish?.lastRunAt);
  ok('status: 1 connected / 0 errors + budget tracked', status.json.accounts?.summary?.connected === 1 && status.json.accounts?.summary?.error === 0 && (status.json.budgets || []).some((b) => b.platform === 'mastodon'));

  ok('stand-in received publish-now over the wire', received.some((t) => t?.includes('publish now')));
  ok('stand-in received the worker post over the wire', received.some((t) => t?.includes('scheduled via worker')));
}

main()
  .catch((e) => { failed = true; console.error('\nsmoke crashed:', e.message); if (serverLog.length) console.error('--- server log ---\n' + serverLog.join('')); })
  .finally(async () => {
    try { server?.kill('SIGTERM'); } catch {}
    await sleep(300);
    try { server?.kill('SIGKILL'); } catch {}
    await new Promise((r) => mock.close(r));
    try { rmSync(dbDir, { recursive: true, force: true }); } catch {}
    console.log('\n' + (failed ? '❌ SMOKE TEST FAILED' : '✅ SMOKE TEST PASSED — compose→schedule→publish works live'));
    process.exit(failed ? 1 : 0);
  });
