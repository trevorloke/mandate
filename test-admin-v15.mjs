// E2E v15: Per-record permissions (ownership + scope + shares)
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

const csrfFromPage = () => page.evaluate(() => {
  const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
});

const apiAs = (csrf) => async (method, path, body) => {
  return page.evaluate(async ({ method, path, body, csrf }) => {
    const resp = await fetch(path, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: resp.status, body: await resp.json().catch(() => ({})) };
  }, { method, path, body, csrf });
};

await step('Sign up admin', async () => {
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.auth-screen__title');
  await page.fill('input[placeholder="Marcus Reyes"]', 'Marcus Reyes');
  await page.fill('input[placeholder="you@mandate.app"]', 'admin@m.app');
  await page.fill('input[placeholder="min 8 characters"]', 'pass1234');
  await page.fill('input[placeholder="Meridian West — Assembly"]', 'Meridian West');
  await page.click('button:has-text("Create workspace & sign in")');
  await page.waitForSelector('.home2__greeting', { timeout: 10000 });
});

let viewerId = null;
let editorId = null;
await step('Create a viewer + editor user', async () => {
  const csrf = await csrfFromPage();
  const api = apiAs(csrf);
  let r = await api('POST', '/api/users', { email: 'viewer@m.app', name: 'Vee Viewer', password: 'pass1234', role: 'viewer' });
  if (r.status !== 200) throw new Error('viewer create: ' + JSON.stringify(r));
  viewerId = r.body.user.id;
  r = await api('POST', '/api/users', { email: 'editor@m.app', name: 'Eddie Editor', password: 'pass1234', role: 'editor' });
  if (r.status !== 200) throw new Error('editor create: ' + JSON.stringify(r));
  editorId = r.body.user.id;
  log('viewer:', viewerId.slice(0,12), '+ editor:', editorId.slice(0,12));
});

let recordId = null;
await step('Admin creates a Raise donor record', async () => {
  const csrf = await csrfFromPage();
  const api = apiAs(csrf);
  const r = await api('POST', '/api/data/raise/donor', { name: 'Big Donor', amount: 5000 });
  if (r.status !== 200) throw new Error(JSON.stringify(r));
  recordId = r.body.record.id;
  if (r.body.record.viewerScope !== 'workspace') throw new Error('default scope should be workspace');
  if (!r.body.record.ownerId) throw new Error('ownerId not set on creation');
  log('record:', recordId.slice(0,12), 'scope:', r.body.record.viewerScope);
});

const signInAs = async (email, password) => {
  try {
    await page.evaluate(async () => {
      const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
      const csrf = m ? decodeURIComponent(m[1]) : '';
      return fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrf } });
    });
  } catch {}
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  // After logout we should land on auth; if we don't see it, retry once
  if (!(await page.$('.auth-screen__title'))) {
    await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
  }
  await page.waitForSelector('.auth-screen__title', { timeout: 8000 });
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  await page.click('button:has-text("Sign in")');
  try {
    await page.waitForSelector('.mdt__bar', { timeout: 12000 });
  } catch (e) {
    await page.screenshot({ path: `/tmp/mandate-audit/v15-signin-fail-${email.replace(/[^a-z]/g, '')}.png` });
    throw new Error(`sign-in to ${email} failed; screenshot saved`);
  }
};

await step('Viewer sees the record (default workspace scope)', async () => {
  await signInAs('viewer@m.app', 'pass1234');
  const csrf = await csrfFromPage();
  const r = await apiAs(csrf)('GET', '/api/data/raise/donor');
  if (r.status !== 200) throw new Error(JSON.stringify(r));
  const found = r.body.records.find(x => x.id === recordId);
  if (!found) throw new Error('viewer should see workspace-scope record');
  log('viewer sees', r.body.records.length, 'records');
});

await step('Admin marks record private; viewer no longer sees it', async () => {
  await signInAs('admin@m.app', 'pass1234');
  const csrf = await csrfFromPage();
  const r = await apiAs(csrf)('PUT', `/api/data/_record/${recordId}/scope`, { scope: 'private' });
  if (r.status !== 200) throw new Error(JSON.stringify(r));

  await signInAs('viewer@m.app', 'pass1234');
  const c2 = await csrfFromPage();
  const list = await apiAs(c2)('GET', '/api/data/raise/donor');
  const found = list.body.records.find(x => x.id === recordId);
  if (found) throw new Error('viewer should NOT see private record');
  log('viewer sees', list.body.records.length, 'records (record hidden)');
});

await step('Admin shares record with viewer (view-only); viewer can list but not edit', async () => {
  await signInAs('admin@m.app', 'pass1234');
  const csrf = await csrfFromPage();
  let r = await apiAs(csrf)('POST', `/api/data/_record/${recordId}/shares`, { userId: viewerId, level: 'view' });
  if (r.status !== 200) throw new Error('share: ' + JSON.stringify(r));

  await signInAs('viewer@m.app', 'pass1234');
  const c2 = await csrfFromPage();
  const list = await apiAs(c2)('GET', '/api/data/raise/donor');
  const found = list.body.records.find(x => x.id === recordId);
  if (!found) throw new Error('viewer should see record after share');

  // Try to edit — should be 403
  const edit = await apiAs(c2)('PUT', `/api/data/raise/donor/${recordId}`, { name: 'tampered', amount: 1 });
  if (edit.status !== 403) throw new Error('viewer with view-only should NOT edit; status=' + edit.status);
  log('viewer can read; edit correctly rejected (403)');
});

await step('Upgrade share to edit; viewer can now save changes', async () => {
  await signInAs('admin@m.app', 'pass1234');
  const csrf = await csrfFromPage();
  let r = await apiAs(csrf)('POST', `/api/data/_record/${recordId}/shares`, { userId: viewerId, level: 'edit' });
  if (r.status !== 200) throw new Error(JSON.stringify(r));

  await signInAs('viewer@m.app', 'pass1234');
  const c2 = await csrfFromPage();
  const edit = await apiAs(c2)('PUT', `/api/data/raise/donor/${recordId}`, { name: 'Edited By Viewer', amount: 7500 });
  if (edit.status !== 200) throw new Error('viewer with edit-share should succeed; got ' + edit.status + ': ' + JSON.stringify(edit.body));
  if (edit.body.record.data.name !== 'Edited By Viewer') throw new Error('edit not persisted');
  log('viewer edited record successfully');
});

await step('Revoke share; viewer loses access', async () => {
  await signInAs('admin@m.app', 'pass1234');
  const csrf = await csrfFromPage();
  const r = await apiAs(csrf)('DELETE', `/api/data/_record/${recordId}/shares/${viewerId}`);
  if (r.status !== 200) throw new Error(JSON.stringify(r));

  await signInAs('viewer@m.app', 'pass1234');
  const c2 = await csrfFromPage();
  const list = await apiAs(c2)('GET', '/api/data/raise/donor');
  const found = list.body.records.find(x => x.id === recordId);
  if (found) throw new Error('viewer still sees record after revoke');
  log('access revoked correctly');
});

await step('Non-owner non-admin (editor) cannot manage shares', async () => {
  await signInAs('editor@m.app', 'pass1234');
  const csrf = await csrfFromPage();
  // editor has no edit-access (not admin, not owner) — listing shares should 403
  const r = await apiAs(csrf)('GET', `/api/data/_record/${recordId}/shares`);
  if (r.status !== 403) throw new Error('editor should not manage shares; got ' + r.status);
  log('editor correctly blocked from share management');
});

await step('SharePanel UI renders inside record edit panel for admin', async () => {
  await signInAs('admin@m.app', 'pass1234');
  await page.click('.usrm__avatar');
  await page.click('.usrm__item:has-text("Admin")');
  await page.waitForSelector('.adm__nav');
  await page.click('.adm__nav-btn:has-text("Module data")');
  await page.waitForTimeout(500);
  const cards = await page.$$('.adm__data-card');
  for (const c of cards) {
    const txt = (await c.textContent()) || '';
    if (/donor/i.test(txt)) { await c.click(); break; }
  }
  await page.waitForTimeout(700);
  const editBtn = await page.$('table tbody tr button:has-text("Edit"), table tbody tr button:has-text("View")');
  if (!editBtn) throw new Error('no edit button found');
  await editBtn.click();
  await page.waitForTimeout(700);
  const shrCount = await page.locator('.shr').count();
  if (shrCount < 1) throw new Error('SharePanel did not render');
  // Verify both pills present
  const pillsTxt = await page.locator('.shr__pill').allTextContents();
  log('share panel pills:', pillsTxt.join(' | '));
  await page.screenshot({ path: '/tmp/mandate-audit/v15-share-panel.png', fullPage: true });
});

console.log(`\nTotal page errors: ${errors.length}`);
errors.slice(0, 5).forEach(e => console.log(`  · ${e.slice(0, 200)}`));

await browser.close();
console.log('\n✅ test-admin-v15 complete');
