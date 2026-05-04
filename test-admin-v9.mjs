// E2E v9: webhook delivery log + retry, workspace cloning, advanced filter operators, retention setting
import { chromium } from 'playwright-core';
import http from 'http';

// Tiny webhook receiver that fails the first 2 attempts then succeeds — to test retry
let attemptCount = 0;
const received = [];
const hookServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    received.push({ headers: req.headers, body, at: Date.now() });
    attemptCount++;
    if (attemptCount <= 2) {
      // Fail first 2 attempts
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('not yet');
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    }
  });
});
const HOOK_PORT = 4568;
await new Promise(r => hookServer.listen(HOOK_PORT, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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

let webhookId = null;
await step('Create webhook to flaky test server', async () => {
  await page.click('.adm__nav-btn:has-text("Webhooks")');
  await page.waitForSelector('.adm__title');
  await page.click('button:has-text("+ New webhook")');
  await page.waitForSelector('input.adm__field-input--mono');
  const inputs = await page.$$('.adm__field-input');
  await inputs[0].fill('Flaky receiver');
  await inputs[1].fill(`http://localhost:${HOOK_PORT}/hook`);
  await page.click('button:has-text("Create webhook")');
  await page.waitForSelector('.adm__codeblock', { timeout: 5000 });
  await page.click('button:has-text("I\'ve saved it")');
  await page.waitForTimeout(300);
});

await step('Trigger event → first attempt fails (500)', async () => {
  attemptCount = 0;
  // Edit a record to fire data.update
  await page.click('.adm__nav-btn:has-text("Module data")');
  await page.click('.adm__data-card:has-text("Voters")');
  await page.click('button:has-text("Edit")');
  await page.waitForSelector('.adm__typed');
  await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.adm__field-label'));
    const lbl = labels.find(l => l.textContent.trim().startsWith('Last name'));
    const inp = lbl?.parentElement.querySelector('input');
    if (inp) { inp.focus(); inp.select?.(); }
  });
  await page.keyboard.type('RetryTestSentinel');
  await page.click('button:has-text("Save")');
  await page.waitForSelector('.adm__msg--ok', { timeout: 5000 });
  await new Promise(r => setTimeout(r, 1500));   // allow first attempt + status update

  log(`attempts so far: ${attemptCount}`);
  if (attemptCount === 0) throw new Error('initial delivery never reached server');
});

await step('Manually retry the failed delivery → success on next attempt', async () => {
  // Open delivery log via API to find the latest delivery
  const me = await page.evaluate(() => fetch('/api/auth/me', { credentials: 'include' }).then(r => r.json()));
  // Find the webhook
  const list = await page.evaluate(() => fetch('/api/webhooks', { credentials: 'include' }).then(r => r.json()));
  const hook = list.webhooks[0];
  webhookId = hook.id;
  const dels = await page.evaluate((wid) => fetch(`/api/webhooks/${wid}/deliveries`, { credentials: 'include' }).then(r => r.json()), webhookId);
  log(`delivery rows: ${dels.deliveries.length} · most recent status: ${dels.deliveries[0]?.status} (HTTP ${dels.deliveries[0]?.httpStatus})`);
  if (!dels.deliveries.some(d => d.status === 'failed' || d.status === 'success')) throw new Error('expected delivery row');

  // Find a failed one and retry it
  const failed = dels.deliveries.find(d => d.status === 'failed' || d.status === 'giving_up');
  if (!failed) throw new Error('no failed delivery to retry');

  const r = await page.evaluate(async ({ wid, did }) => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    const resp = await fetch(`/api/webhooks/${wid}/deliveries/${did}/retry`, {
      method: 'POST', credentials: 'include',
      headers: { 'X-CSRF-Token': csrf },
    });
    return resp.json();
  }, { wid: webhookId, did: failed.id });
  log(`retry response: ${JSON.stringify(r)}`);
  if (!r.ok) throw new Error('retry failed: ' + JSON.stringify(r));

  await new Promise(r => setTimeout(r, 800));
  log(`final attempt count on server: ${attemptCount}`);
  if (attemptCount < 2) throw new Error('expected at least 2 server-side attempts');
});

await step('Workspace cloning: super_admin clones into new tenant', async () => {
  await page.click('.adm__nav-btn:has-text("Workspaces")');
  await page.waitForSelector('.adm__title');
  // Find first row's Clone button
  page.once('dialog', d => d.accept('Cloned Test'));
  await page.click('table button:has-text("Clone")');
  await page.waitForSelector('.adm__msg--ok', { timeout: 10000 });
  const txt = await page.textContent('.adm__msg--ok');
  log('clone result:', txt);
  if (!txt.includes('records copied') || !txt.includes('Cloned Test')) throw new Error('clone msg unexpected');

  // Verify the new workspace is in the list
  const html = await page.content();
  if (!html.includes('Cloned Test')) throw new Error('cloned workspace not in list');
});

await step('Advanced filter: voter support gte 0.7 narrows the list', async () => {
  await page.click('.adm__nav-btn:has-text("Module data")');
  await page.click('.adm__data-card:has-text("Voters")');
  await page.waitForSelector('.adm__bucket-search');

  // Open advanced filters
  await page.click('button:has-text("Advanced filters")');
  await page.click('button:has-text("+ Add condition")');
  await page.waitForTimeout(200);

  // Set field=Support, op=gte, value=0.7 via Playwright (React-aware)
  const sels = await page.$$('.adm__adv .adm__filter-chip');
  await sels[0].selectOption('support');
  await page.waitForTimeout(150);
  // Re-query: the row may have re-rendered with new ops list
  const sels2 = await page.$$('.adm__adv .adm__filter-chip');
  await sels2[1].selectOption('gte');
  await page.waitForTimeout(150);
  const sels3 = await page.$$('.adm__adv .adm__filter-chip');
  // The third chip is now an input (since field is number)
  await sels3[2].fill('0.7');
  await page.waitForTimeout(400);

  // Debug: dump current chip state
  const chipState = await page.$$eval('.adm__adv .adm__filter-chip', els =>
    els.map(e => ({
      tag: e.tagName, value: e.value,
      text: (e.tagName === 'SELECT' && e.options[e.selectedIndex]?.textContent) || '',
    }))
  );
  log('chip state:', JSON.stringify(chipState));

  const meta = await page.textContent('.adm__bucket-meta');
  log('after support>=0.7 filter:', meta);
  if (!meta.includes('match') && !meta.includes('records')) throw new Error('unexpected filter result');
  // Should be substantially fewer than 60
  const m = meta.match(/(\d+)/g);
  const count = parseInt(m?.[0] || '0', 10);
  if (count >= 60) throw new Error(`filter should narrow list, got ${count}`);
  log(`filtered count: ${count}`);
});

await step('Retention setting: save 7-day trash retention', async () => {
  await page.click('.adm__nav-btn:has-text("Workspace")');
  await page.waitForSelector('input.adm__field-input--mono[type=number]');
  // Find the last input[type=number] (retention panel comes after the modules panel)
  const numberInputs = await page.$$('input.adm__field-input[type=number]');
  const trashInput = numberInputs[numberInputs.length - 1];
  await trashInput.fill('7');
  // Click Save retention
  await page.click('button:has-text("Save retention")');
  await page.waitForSelector('.adm__msg--ok', { timeout: 5000 });

  // Verify via API
  const r = await page.evaluate(() => fetch('/api/workspace', { credentials: 'include' }).then(r => r.json()));
  log('retention setting:', r.workspace.settings.retention);
  if (r.workspace.settings.retention?.trashDays !== 7) throw new Error('retention not persisted');
});

console.log(`\nWebhook delivery attempts: ${attemptCount}`);
console.log(`Total page errors: ${errors.length}`);
errors.slice(0, 5).forEach(e => console.log(`  · ${e.slice(0, 200)}`));

await browser.close();
hookServer.close();
