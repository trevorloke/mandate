// E2E v19: Custom dashboard widgets
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
const step = async (n, fn) => { try { const r = await fn(); console.log(`OK   ${n}`); return r; } catch (e) { console.log(`FAIL ${n}\n     ${e.message.slice(0, 400)}`); throw e; } };

const csrf = () => page.evaluate(() => {
  const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
});
const apiAs = (csrfToken) => async (method, path, body) =>
  page.evaluate(async ({ method, path, body, csrf }) => {
    const resp = await fetch(path, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: resp.status, body: await resp.json().catch(() => ({})) };
  }, { method, path, body, csrf: csrfToken });

await step('Sign up + seed donors', async () => {
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.auth-screen__title');
  await page.fill('input[placeholder="Marcus Reyes"]', 'Dash Admin');
  await page.fill('input[placeholder="you@mandate.app"]', 'dash@m.app');
  await page.fill('input[placeholder="min 8 characters"]', 'pass1234');
  await page.fill('input[placeholder="Meridian West — Assembly"]', 'Dashboard WS');
  await page.click('button:has-text("Create workspace & sign in")');
  await page.waitForSelector('.mdt__bar', { timeout: 8000 });
  const c = await csrf();
  for (let i = 0; i < 4; i++) {
    await apiAs(c)('POST', '/api/data/raise/donor', { name: `Donor ${i+1}`, amount: 100 * (i+1) });
  }
});

await step('Open admin Overview — empty dashboard placeholder shows', async () => {
  await page.click('.usrm__avatar');
  await page.click('.usrm__item:has-text("Admin")');
  await page.waitForSelector('.adm__nav');
  // Default tab is Overview
  await page.waitForSelector('.dash', { timeout: 5000 });
  const empty = await page.locator('.dash__empty').isVisible();
  if (!empty) throw new Error('expected empty placeholder');
});

let widgetIds = [];
await step('Create a metric widget via API', async () => {
  const c = await csrf();
  const r = await apiAs(c)('POST', '/api/dashboard', {
    kind: 'metric', title: 'Donors', params: { module: 'raise', kind: 'donor' }, width: 'third',
  });
  if (r.status !== 200) throw new Error(JSON.stringify(r));
  if (r.body.widget.data?.count !== 4) throw new Error('expected count=4; got ' + r.body.widget.data?.count);
  widgetIds.push(r.body.widget.id);
});

await step('Create a list widget via API', async () => {
  const c = await csrf();
  const r = await apiAs(c)('POST', '/api/dashboard', {
    kind: 'list', title: 'Recent donors', params: { module: 'raise', kind: 'donor', limit: 3 }, width: 'half',
  });
  if (r.status !== 200) throw new Error(JSON.stringify(r));
  if (r.body.widget.data?.records?.length !== 3) throw new Error('expected 3 records');
  widgetIds.push(r.body.widget.id);
});

await step('Create an audit widget via API', async () => {
  const c = await csrf();
  const r = await apiAs(c)('POST', '/api/dashboard', {
    kind: 'audit', title: 'Activity', params: { limit: 10 }, width: 'full',
  });
  if (r.status !== 200) throw new Error(JSON.stringify(r));
  if (!r.body.widget.data?.entries?.length) throw new Error('expected entries');
  widgetIds.push(r.body.widget.id);
});

await step('Create a note widget via API', async () => {
  const c = await csrf();
  const r = await apiAs(c)('POST', '/api/dashboard', {
    kind: 'note', title: 'Welcome', params: { text: '**Hi team** — focus on *major donors* this week.' }, width: 'full',
  });
  if (r.status !== 200) throw new Error(JSON.stringify(r));
  widgetIds.push(r.body.widget.id);
});

await step('Reload admin overview — all 4 widgets render', async () => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.dash__card', { timeout: 5000 });
  const cards = await page.locator('.dash__card').count();
  if (cards !== 4) throw new Error('expected 4 cards; got ' + cards);
  // Verify metric value shows as "4"
  const metricNum = await page.locator('.dash__metric-num').first().textContent();
  if (metricNum.trim() !== '4') throw new Error('metric should show 4; got ' + metricNum);
  // Verify markdown rendered (bold + italic tags)
  const noteHtml = await page.locator('.dash__note').first().innerHTML();
  if (!/<b>Hi team<\/b>/.test(noteHtml)) throw new Error('note bold not rendered');
  if (!/<em>major donors<\/em>/.test(noteHtml)) throw new Error('note italic not rendered');
  log('all 4 widgets rendered ✓');
});

await step('Reorder widgets (move metric down)', async () => {
  const c = await csrf();
  // Click the down arrow on the first card
  const downBtn = page.locator('.dash__card').first().locator('.dash__card-actions button[title="Move down"]');
  await downBtn.click();
  await page.waitForTimeout(400);
  // Verify by re-fetching
  const r = await apiAs(c)('GET', '/api/dashboard');
  const widgets = r.body.widgets;
  if (widgets[0].kind === 'metric') throw new Error('expected metric to no longer be first');
  log('new order:', widgets.map(w => w.kind).join(' → '));
});

await step('Edit widget via UI — change title', async () => {
  // Click the edit button on the first visible card
  await page.locator('.dash__card-actions button[title="Edit"]').first().click();
  await page.waitForSelector('.dash__editor');
  const titleInput = page.locator('.dash__editor input.adm__field-input').first();
  await titleInput.fill('UPDATED TITLE');
  await page.click('.dash__editor button:has-text("Save")');
  await page.waitForTimeout(500);
  const found = await page.locator('.dash__card-title:has-text("UPDATED TITLE")').count();
  if (found !== 1) throw new Error('updated title not visible');
});

await step('Add widget via UI', async () => {
  await page.click('button:has-text("Add widget")');
  await page.waitForSelector('.dash__editor');
  // Default kind is "metric" — fill title, save
  const titleInput = page.locator('.dash__editor input.adm__field-input').first();
  await titleInput.fill('UI-Created Widget');
  await page.click('.dash__editor button:has-text("Add widget")');
  await page.waitForTimeout(500);
  const cards = await page.locator('.dash__card').count();
  if (cards !== 5) throw new Error('expected 5 cards after UI create; got ' + cards);
});

await step('Remove a widget via UI', async () => {
  page.once('dialog', d => d.accept());
  await page.locator('.dash__card-actions button[title="Remove"]').first().click();
  await page.waitForTimeout(500);
  const cards = await page.locator('.dash__card').count();
  if (cards !== 4) throw new Error('expected 4 cards after delete; got ' + cards);
});

await step('Widgets are isolated per user (other admin sees empty board)', async () => {
  // Create a second admin
  const c = await csrf();
  let r = await apiAs(c)('POST', '/api/users', { email: 'other@m.app', name: 'Other Admin', password: 'pass1234', role: 'admin' });
  if (r.status !== 200) throw new Error('failed to create second admin: ' + JSON.stringify(r));

  // Sign out, sign in as other admin
  await apiAs(c)('POST', '/api/auth/logout');
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.auth-screen__title');
  await page.fill('input[type=email]', 'other@m.app');
  await page.fill('input[type=password]', 'pass1234');
  await page.click('button:has-text("Sign in")');
  await page.waitForSelector('.mdt__bar', { timeout: 8000 });
  await page.click('.usrm__avatar');
  await page.click('.usrm__item:has-text("Admin")');
  await page.waitForSelector('.dash');
  const empty = await page.locator('.dash__empty').isVisible();
  if (!empty) throw new Error('other admin should see empty board (per-user isolation)');
});

await page.screenshot({ path: '/tmp/mandate-audit/v19-dashboard.png', fullPage: true });

console.log(`\nTotal page errors: ${errors.length}`);
errors.slice(0, 5).forEach(e => console.log(`  · ${e.slice(0, 200)}`));

await browser.close();
console.log('\n✅ test-admin-v19 complete');
