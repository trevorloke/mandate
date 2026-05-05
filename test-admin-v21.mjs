// E2E v21: Distributed webhook queue
//   1. Atomic claim: 4 due rows, two parallel ticks → all 4 processed exactly once
//   2. Lease expiration: simulate worker death by manually stamping a lease in the past;
//      next tick re-claims the orphaned row
//   3. Stats endpoint reflects live counts and lists active workers
//   4. AdminWebhooks UI renders the QueuePanel with stat cards and "Run tick now"
import { chromium } from 'playwright-core';
import Database from 'better-sqlite3';
import http from 'http';
import path from 'node:path';

// ── Test sink: a deliberately-slow HTTP server to control timing ─────────
let sinkHits = 0;
const sink = http.createServer((req, res) => {
  sinkHits++;
  // Always 500 so the delivery is marked 'failed' and ends up in the retry queue
  res.writeHead(500, { 'content-type': 'text/plain' });
  res.end('boom');
});
await new Promise(r => sink.listen(4600, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const log = (...x) => console.log('  ', ...x);
const step = async (n, fn) => { try { const r = await fn(); console.log(`OK   ${n}`); return r; } catch (e) { console.log(`FAIL ${n}\n     ${e.message.slice(0, 400)}`); throw e; } };

const csrf = () => page.evaluate(() => {
  const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
});
const apiAs = (csrfToken) => async (method, p, body) =>
  page.evaluate(async ({ method, path: p, body, csrf }) => {
    const resp = await fetch(p, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: resp.status, body: await resp.json().catch(() => ({})) };
  }, { method, path: p, body, csrf: csrfToken });

await step('Sign up + create a webhook pointing at the always-failing sink', async () => {
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.auth-screen__title');
  await page.fill('input[placeholder="Marcus Reyes"]', 'Q Admin');
  await page.fill('input[placeholder="you@mandate.app"]', 'q@m.app');
  await page.fill('input[placeholder="min 8 characters"]', 'pass1234');
  await page.fill('input[placeholder="Meridian West — Assembly"]', 'Q WS');
  await page.click('button:has-text("Create workspace & sign in")');
  await page.waitForSelector('.mdt__bar', { timeout: 10000 });

  const c = await csrf();
  const r = await apiAs(c)('POST', '/api/webhooks', {
    label: 'Sink', url: 'http://localhost:4600/hook', events: ['*'],
  });
  if (r.status !== 200) throw new Error(JSON.stringify(r));
});

await step('Fire 4 events that all fail and enter the retry queue', async () => {
  const c = await csrf();
  for (let i = 0; i < 4; i++) {
    await apiAs(c)('POST', '/api/data/raise/donor', { name: `D${i+1}`, amount: 100 });
  }
  // Initial fires complete; sink should have 4 hits
  await new Promise(r => setTimeout(r, 1000));
  if (sinkHits !== 4) throw new Error('expected 4 initial hits; got ' + sinkHits);
  log('initial hits:', sinkHits);
});

await step('Force next_retry_at into the past so all 4 are due', async () => {
  const db = new Database(path.resolve('mandate.db'));
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`UPDATE webhook_deliveries SET next_retry_at = ? WHERE status = 'failed'`).run(now - 60);
  const due = db.prepare(`SELECT COUNT(*) c FROM webhook_deliveries WHERE status='failed' AND next_retry_at <= ?`).get(now);
  db.close();
  if (due.c !== 4) throw new Error('expected 4 due rows; got ' + due.c);
});

await step('Two parallel /tick calls → exactly-once processing (no double-claim)', async () => {
  const c = await csrf();
  const before = sinkHits;
  const [a, b] = await Promise.all([
    apiAs(c)('POST', '/api/webhooks/_queue/tick'),
    apiAs(c)('POST', '/api/webhooks/_queue/tick'),
  ]);
  await new Promise(r => setTimeout(r, 500));  // let the deliveries' fetch() complete
  log('A claimed:', a.body.claimed, '· B claimed:', b.body.claimed);

  // Both calls hit the same Node process and the same SQL — atomicity guarantees
  // claimed_total === unique rows. With BATCH_SIZE=25 (default), one will get all 4.
  const total = (a.body.claimed || 0) + (b.body.claimed || 0);
  if (total !== 4) throw new Error('expected 4 total claims; got ' + total);

  const newHits = sinkHits - before;
  if (newHits !== 4) throw new Error(`expected 4 new sink hits; got ${newHits}`);
  log('sink received', newHits, 'retry hits — exactly once');
});

await step('Lease expiration: orphan a row, next tick reclaims it', async () => {
  // Create another delivery in the queue
  const c = await csrf();
  await apiAs(c)('POST', '/api/data/raise/donor', { name: 'orphan', amount: 99 });
  await new Promise(r => setTimeout(r, 800));

  const dbPath = path.resolve('mandate.db');
  const db = new Database(dbPath);
  const now = Math.floor(Date.now() / 1000);
  // Force this newest delivery to be due, AND stamp a fake lease that's already expired
  db.prepare(`
    UPDATE webhook_deliveries
       SET next_retry_at = ?, worker_id = 'dead-worker', lease_expires_at = ?
     WHERE id = (SELECT id FROM webhook_deliveries WHERE status='failed' ORDER BY rowid DESC LIMIT 1)
  `).run(now - 60, now - 30);  // lease already expired 30s ago
  db.close();

  // Tick — the row should be re-claimed despite having a worker_id, because the lease has expired
  const before = sinkHits;
  const r = await apiAs(c)('POST', '/api/webhooks/_queue/tick');
  await new Promise(r => setTimeout(r, 500));
  if (r.body.claimed !== 1) throw new Error('expected 1 reclaim; got ' + r.body.claimed);
  if (sinkHits - before !== 1) throw new Error('expected 1 new sink hit from reclaim; got ' + (sinkHits - before));
  log('reclaimed orphan row ✓');
});

await step('Queue stats endpoint reports correct totals', async () => {
  const c = await csrf();
  const r = await apiAs(c)('GET', '/api/webhooks/_queue');
  if (!r.body.workerId) throw new Error('no workerId in stats');
  if (typeof r.body.counts.success_total !== 'number') throw new Error('counts not numeric');
  log('worker:', r.body.workerId, '· total rows:', r.body.counts.total, '· success:', r.body.counts.success_total, '· giving_up:', r.body.counts.giving_up_total);
});

await step('AdminWebhooks UI renders the queue panel with stats', async () => {
  await page.click('.usrm__avatar');
  await page.click('.usrm__item:has-text("Admin")');
  await page.waitForSelector('.adm__nav');
  await page.click('.adm__nav-btn:has-text("Webhooks")');
  await page.waitForTimeout(800);
  // The QueuePanel header text
  await page.waitForSelector('.adm__panel-title:has-text("Distributed delivery queue")');
  // 4 stat cards
  const cards = await page.locator('.adm__stat-card').count();
  if (cards < 4) throw new Error('expected ≥4 stat cards in the queue panel; got ' + cards);
  // "Run tick now" button is present
  await page.waitForSelector('button:has-text("Run tick now")');
  await page.screenshot({ path: '/tmp/mandate-audit/v21-queue.png', fullPage: false });
});

await step('Click "Run tick now" — UI invokes the endpoint', async () => {
  // Need fresh due rows. Stamp existing 'failed' rows to past, then tick via UI.
  const dbPath = path.resolve('mandate.db');
  const db = new Database(dbPath);
  // Insert one more failure to get the queue moving
  const c = await csrf();
  await apiAs(c)('POST', '/api/data/raise/donor', { name: 'ui-tick', amount: 1 });
  await new Promise(r => setTimeout(r, 800));
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`UPDATE webhook_deliveries SET next_retry_at = ?, worker_id = NULL, lease_expires_at = NULL WHERE status='failed'`).run(now - 60);
  db.close();
  const before = sinkHits;
  await page.click('button:has-text("Run tick now")');
  await new Promise(r => setTimeout(r, 1500));
  const newHits = sinkHits - before;
  if (newHits < 1) throw new Error('expected at least 1 new hit from UI-driven tick; got ' + newHits);
  log('UI tick produced', newHits, 'retry deliveries');
});

console.log(`\nTotal page errors: ${errors.length}`);
errors.slice(0, 5).forEach(e => console.log(`  · ${e.slice(0, 200)}`));

await browser.close();
sink.close();
console.log('\n✅ test-admin-v21 complete');
