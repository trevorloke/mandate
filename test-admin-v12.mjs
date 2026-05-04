// E2E v12: public forms (admin create + anonymous submit), webhook delivery history, metrics endpoint
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const log = (...x) => console.log('  ', ...x);
const step = async (n, fn) => { try { const r = await fn(); console.log(`OK   ${n}`); return r; } catch (e) { console.log(`FAIL ${n}\n     ${e.message.slice(0, 300)}`); throw e; } };

await step('Sign up + seed', async () => {
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.auth-screen__title');
  await page.fill('input[placeholder="Marcus Reyes"]', 'Marcus Reyes');
  await page.fill('input[placeholder="you@mandate.app"]', 'sa@m.app');
  await page.fill('input[placeholder="min 8 characters"]', 'supersecret123');
  await page.fill('input[placeholder="Meridian West — Assembly"]', 'Meridian West');
  await page.click('button:has-text("Create workspace & sign in")');
  await page.waitForSelector('.home2__greeting', { timeout: 10000 });
  await page.evaluate(() => localStorage.setItem('mandate2:route', 'admin'));
  await page.reload({ waitUntil: 'domcontentloaded' });
});

let formSlug = null;
await step('Create a public donate form via API', async () => {
  const r = await page.evaluate(async () => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    const resp = await fetch('/api/forms', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({
        label: 'Donate',
        module: 'raise', kind: 'donor',
        allowedFields: [
          { key: 'name',  label: 'Name',   type: 'text',   required: true },
          { key: 'email', label: 'Email',  type: 'email',  required: true },
          { key: 'amount',label: 'Amount', type: 'number', required: true },
          { key: 'note',  label: 'Note',   type: 'textarea' },
        ],
        rateLimitPerMin: 30,
      }),
    });
    return resp.json();
  });
  if (!r.ok) throw new Error('form create failed: ' + JSON.stringify(r));
  formSlug = r.form.slug;
  log('form slug:', formSlug);
});

await step('Anonymous submit to public form (no cookies, no CSRF) → 200', async () => {
  // Use Node's native fetch — no cookies, no browser context
  const resp = await fetch(`http://localhost:3000/api/public/forms/${formSlug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Anon Submitter', email: 'anon@x.com', amount: 50, note: 'Keep going!' }),
  });
  const body = await resp.json();
  log('public submit:', resp.status, JSON.stringify(body));
  if (resp.status !== 200 || !body.ok) throw new Error('expected 200 ok');

  const records = await page.evaluate(() =>
    fetch('/api/data/raise/donor', { credentials: 'include' }).then(r => r.json())
  );
  const found = records.records.find(r => JSON.stringify(r.data).includes('Anon Submitter'));
  if (!found) throw new Error('submitted record not in raise.donor bucket');
  log('✓ submission stored as raise.donor record');
});

await step('Form schema fetch (public): GET returns fields', async () => {
  const resp = await fetch(`http://localhost:3000/api/public/forms/${formSlug}`);
  const body = await resp.json();
  log('form metadata:', body.form.label, '·', body.form.fields.length, 'fields');
  if (body.form.fields.length !== 4) throw new Error('expected 4 fields');
});

await step('Public submit rate-limited after burst', async () => {
  let last = null;
  for (let i = 0; i < 35; i++) {
    const resp = await fetch(`http://localhost:3000/api/public/forms/${formSlug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Burst' + i, email: 'b@x.com', amount: 1 }),
    });
    last = { status: resp.status };
    if (last.status === 429) break;
  }
  log(`burst final status: ${last.status}`);
  if (last.status !== 429) throw new Error('expected 429 after burst');
});

await step('Webhook delivery history: create webhook → fire → see history rows', async () => {
  // Create a webhook pointing at a known-bad URL so it fails
  const wh = await page.evaluate(async () => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    const resp = await fetch('/api/webhooks', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ label: 'Bad URL', url: 'http://localhost:9/none', events: ['*'] }),
    });
    return resp.json();
  });
  log('webhook id:', wh.id);

  // Fire test
  await page.evaluate(async (id) => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    return fetch(`/api/webhooks/${id}/test`, { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrf } }).then(r => r.json());
  }, wh.id);
  await new Promise(r => setTimeout(r, 1500));

  // Fetch deliveries
  const dels = await page.evaluate(async (id) => {
    return fetch(`/api/webhooks/${id}/deliveries`, { credentials: 'include' }).then(r => r.json());
  }, wh.id);
  log('deliveries:', dels.deliveries.length, '· first status:', dels.deliveries[0]?.status, '· error:', dels.deliveries[0]?.error?.slice(0, 40));
  if (dels.deliveries.length === 0) throw new Error('expected at least one delivery row');
  if (dels.deliveries[0].status === 'success') throw new Error('expected failure for bad URL');
});

await step('Metrics endpoint returns workspace counts', async () => {
  const r = await page.evaluate(() => fetch('/api/metrics', { credentials: 'include' }).then(r => r.json()));
  log('metrics:', JSON.stringify({
    activeRecords: r.metrics.activeRecords,
    activeUsers: r.metrics.activeUsers,
    activeForms: r.metrics.activeForms,
    activeWebhooks: r.metrics.activeWebhooks,
    deliveries24h: r.metrics.deliveries24h,
    failedDeliveries24h: r.metrics.failedDeliveries24h,
    formSubmissions24h: r.metrics.formSubmissions24h,
    sseSubscribers: r.metrics.sseSubscribers,
    uptimeSeconds: r.metrics.uptimeSeconds,
    heapMB: r.metrics.memoryUsage.heapUsedMB,
  }));
  if (typeof r.metrics.activeRecords !== 'number') throw new Error('metrics shape wrong');
  if (r.metrics.activeForms !== 1) throw new Error(`expected 1 active form, got ${r.metrics.activeForms}`);
  if (r.metrics.formSubmissions24h < 1) throw new Error('expected form submissions in last 24h');
});

await step('Forms tab visible with the donate form listed', async () => {
  await page.click('.adm__nav-btn:has-text("Forms")');
  await page.waitForSelector('table');
  const html = await page.content();
  if (!html.includes('Donate')) throw new Error('Donate form not in list');
  if (!html.includes(formSlug)) throw new Error('slug not in list');
});

console.log(`\nTotal page errors: ${errors.length}`);
errors.slice(0, 5).forEach(e => console.log(`  · ${e.slice(0, 200)}`));

await browser.close();
