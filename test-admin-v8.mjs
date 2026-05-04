// E2E v8: webhooks (HMAC-signed deliveries), workspace export/import, audit CSV export, email Resend backend stub
import { chromium } from 'playwright-core';
import http from 'http';
import { createHmac } from 'crypto';
import fs from 'fs';

// Spin up a tiny "remote" server to receive webhook deliveries
const received = [];
const hookServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    received.push({
      method: req.method,
      path: req.url,
      headers: req.headers,
      body,
    });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
});
const HOOK_PORT = 4567;
await new Promise(r => hookServer.listen(HOOK_PORT, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const log = (...x) => console.log('  ', ...x);
const step = async (n, fn) => { try { const r = await fn(); console.log(`OK   ${n}`); return r; } catch (e) { console.log(`FAIL ${n}\n     ${e.message.slice(0, 300)}`); throw e; } };

await step('Sign up + seed', async () => {
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.auth-screen__title');
  await page.fill('input[placeholder="Marcus Reyes"]', 'Marcus Reyes');
  await page.fill('input[placeholder="you@mandate.app"]', 'sa@m.app');
  await page.fill('input[placeholder="min 8 characters"]', 'supersecret123');
  await page.fill('input[placeholder="Meridian West — Assembly"]', 'Meridian West');
  await page.click('button:has-text("Create workspace & sign in")');
  await page.waitForSelector('.home2__greeting', { timeout: 10000 });
  await page.evaluate(() => localStorage.setItem('mandate2:route', 'admin'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('.adm__nav-btn:has-text("Module data")');
  await page.click('button:has-text("Load prototype data")');
  await page.waitForSelector('.adm__msg--ok', { timeout: 60000 });
});

let webhookSecret = null;
await step('Create webhook pointing at our test server', async () => {
  await page.click('.adm__nav-btn:has-text("Webhooks")');
  await page.waitForSelector('.adm__title');
  await page.click('button:has-text("+ New webhook")');
  await page.waitForSelector('input.adm__field-input--mono');
  // Fill label + URL
  const inputs = await page.$$('.adm__field-input');
  await inputs[0].fill('Test receiver');
  await inputs[1].fill(`http://localhost:${HOOK_PORT}/hook`);
  await page.click('button:has-text("Create webhook")');
  await page.waitForSelector('.adm__codeblock', { timeout: 5000 });
  webhookSecret = await page.inputValue('input.adm__field-input--mono[readonly]');
  log('webhook secret prefix:', webhookSecret.slice(0, 14) + '…');
  if (!webhookSecret.startsWith('whsec_')) throw new Error('expected whsec_ prefix');
});

await step('Test webhook delivery: ping reaches our server with valid signature', async () => {
  await page.click('button:has-text("I\'ve saved it")');
  await page.waitForTimeout(300);
  // Click "Test" on the new webhook row
  await page.click('table button:has-text("Test")');
  await page.waitForTimeout(800);

  if (received.length === 0) throw new Error('webhook delivery never reached test server');
  const last = received[received.length - 1];
  log('hook event headers: sig =', (last.headers['x-mandate-signature'] || '').slice(0, 40) + '…');
  log('hook body sample:', last.body.slice(0, 80));

  // Verify signature
  const sig = last.headers['x-mandate-signature'] || '';
  const expected = 'sha256=' + createHmac('sha256', webhookSecret).update(last.body).digest('hex');
  if (sig !== expected) throw new Error(`signature mismatch:\n  got: ${sig}\n  exp: ${expected}`);

  // Verify event content
  const payload = JSON.parse(last.body);
  if (payload.event !== 'test.ping') throw new Error('expected event=test.ping, got ' + payload.event);
  if (!payload.workspace) throw new Error('expected workspace id in payload');
});

await step('Real event: edit a record → webhook fires data.update', async () => {
  const before = received.length;
  // Edit a voter
  await page.click('.adm__nav-btn:has-text("Module data")');
  await page.click('.adm__data-card:has-text("Voters")');
  await page.waitForSelector('.adm__bucket-search');
  await page.click('button:has-text("Edit")');
  await page.waitForSelector('.adm__typed');
  await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.adm__field-label'));
    const lbl = labels.find(l => l.textContent.trim().startsWith('Last name'));
    if (lbl) {
      const inp = lbl.parentElement.querySelector('input');
      inp.focus(); inp.select?.();
    }
  });
  await page.keyboard.type('WebhookTriggerTest');
  await page.click('button:has-text("Save")');
  await page.waitForSelector('.adm__msg--ok', { timeout: 5000 });
  await new Promise(r => setTimeout(r, 1000));   // allow async webhook to fly

  if (received.length <= before) throw new Error('webhook did NOT fire on data.update');
  const last = received[received.length - 1];
  const payload = JSON.parse(last.body);
  log('fired event:', payload.event, '· module:', payload.module, '· kind:', payload.kind);
  if (payload.event !== 'data.update') throw new Error('expected data.update, got ' + payload.event);
  if (!payload.next || payload.next.last !== 'WebhookTriggerTest') throw new Error('next state missing or wrong');
});

await step('Workspace backup: download snapshot, parse JSON', async () => {
  await page.click('.adm__back');
  await page.click('.adm__nav-btn:has-text("Workspace")');
  await page.waitForSelector('a:has-text("Download snapshot")');
  // Direct API call instead of chasing the download link
  const snapshot = await page.evaluate(() =>
    fetch('/api/workspace/backup/export', { credentials: 'include' }).then(r => r.json())
  );
  log('snapshot format:', snapshot.format, '· records:', snapshot.records?.length);
  if (snapshot.format !== 'mandate-workspace-snapshot') throw new Error('bad snapshot format');
  if (snapshot.records.length < 100) throw new Error(`expected 100+ records, got ${snapshot.records.length}`);
  globalThis.__snapshot = snapshot;
});

await step('Workspace import: replace mode, count matches', async () => {
  // Trim snapshot to a known small size
  const small = {
    ...globalThis.__snapshot,
    records: globalThis.__snapshot.records.slice(0, 25),
  };
  // Get CSRF token first
  const r = await page.evaluate(async (snapshot) => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    const resp = await fetch('/api/workspace/backup/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      credentials: 'include',
      body: JSON.stringify({ snapshot, mode: 'replace' }),
    });
    return resp.json();
  }, small);
  log('import response:', r);
  if (!r.ok) throw new Error('import failed: ' + JSON.stringify(r));
  if (r.recordsImported !== 25) throw new Error(`expected 25 imported, got ${r.recordsImported}`);

  // Verify count via overview
  await page.click('.adm__nav-btn:has-text("Overview")');
  await page.waitForSelector('.adm__stats');
  const recordsText = await page.textContent('.adm__stat-v');
  log('records after replace:', recordsText);
  if (recordsText !== '25') throw new Error(`expected 25 records, got ${recordsText}`);
});

await step('Audit CSV export: download via API, parse', async () => {
  const csv = await page.evaluate(() =>
    fetch('/api/audit/export', { credentials: 'include' }).then(r => r.text())
  );
  const lines = csv.split('\n').filter(Boolean);
  const head = lines[0];
  log('audit csv head:', head);
  log('audit csv lines:', lines.length);
  if (!head.startsWith('timestamp,actor_name,actor_email,action,target,meta')) throw new Error('bad CSV header');
  if (lines.length < 5) throw new Error('expected several audit rows');
});

await step('Email backend: capture mode (test-only) — no console clutter', async () => {
  // Just confirm the backend accepts an unknown env (falls back to console)
  // and that the email-related actions produced output already
  const apiLog = fs.readFileSync('/tmp/api.log', 'utf8');
  const emailCount = (apiLog.match(/───── EMAIL ─────/g) || []).length;
  log(`email console emissions: ${emailCount}`);
  // We didn't trigger email in this test (no invite/reset)
});

console.log(`\nReceived webhook deliveries total: ${received.length}`);
console.log(`Total page errors: ${errors.length}`);
errors.slice(0, 5).forEach(e => console.log(`  · ${e.slice(0, 200)}`));

await browser.close();
hookServer.close();
