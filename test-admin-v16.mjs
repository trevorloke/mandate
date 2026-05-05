// E2E v16: Scheduled reports
//   - Create a bucket_csv report; run now; verify email captured with CSV attachment
//   - Pause / resume / delete
//   - Worker tick auto-fires reports whose nextRunAt has passed
//   - UI: AdminReports tab renders, table shows the report
import { chromium } from 'playwright-core';
import Database from 'better-sqlite3';
import path from 'node:path';

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
const apiAs = (csrf) => async (method, path, body) =>
  page.evaluate(async ({ method, path, body, csrf }) => {
    const resp = await fetch(path, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: resp.status, body: await resp.json().catch(() => ({})) };
  }, { method, path, body, csrf });

await step('Sign up admin + seed donors', async () => {
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.auth-screen__title');
  await page.fill('input[placeholder="Marcus Reyes"]', 'Marcus Reyes');
  await page.fill('input[placeholder="you@mandate.app"]', 'admin@m.app');
  await page.fill('input[placeholder="min 8 characters"]', 'pass1234');
  await page.fill('input[placeholder="Meridian West — Assembly"]', 'Meridian West');
  await page.click('button:has-text("Create workspace & sign in")');
  await page.waitForSelector('.home2__greeting', { timeout: 10000 });

  const csrf = await csrfFromPage();
  const api = apiAs(csrf);
  // Pro plan: free is capped at 1 scheduled report and the test creates 2 below
  await api('PUT', '/api/workspace/plan', { plan: 'pro' });
  for (let i = 0; i < 5; i++) {
    await api('POST', '/api/data/raise/donor', { name: `Donor ${i+1}`, amount: (i+1) * 100, tier: i < 2 ? 'major' : 'small' });
  }
  log('seeded 5 donor records');
});

let reportId = null;
await step('Create a scheduled bucket_csv report (daily)', async () => {
  const csrf = await csrfFromPage();
  const r = await apiAs(csrf)('POST', '/api/reports', {
    name: 'Daily donors digest',
    kind: 'bucket_csv',
    params: { module: 'raise', kind: 'donor' },
    targetEmail: 'finance@m.app',
    intervalMinutes: 1440,
    active: true,
  });
  if (r.status !== 200) throw new Error(JSON.stringify(r));
  reportId = r.body.report.id;
  if (!r.body.report.nextRunAt) throw new Error('active report should have nextRunAt');
  log('report:', reportId, 'next:', r.body.report.nextRunAt);
});

await step('Run-now sends an email with CSV attachment', async () => {
  const csrf = await csrfFromPage();
  const r = await apiAs(csrf)('POST', `/api/reports/${reportId}/run-now`);
  if (r.status !== 200 || !r.body.ok) throw new Error('run-now failed: ' + JSON.stringify(r));
  if (r.body.count !== 5) throw new Error('expected 5 rows; got ' + r.body.count);

  // Verify capture
  const ec = await apiAs(csrf)('GET', '/api/_test/emails');
  const emails = ec.body.emails;
  if (!emails.length) throw new Error('no email captured');
  const last = emails[emails.length - 1];
  if (last.to !== 'finance@m.app') throw new Error('wrong recipient: ' + last.to);
  if (!/Daily donors digest/.test(last.subject)) throw new Error('subject mismatch: ' + last.subject);
  if (!Array.isArray(last.attachments) || !last.attachments[0]?.content) throw new Error('no CSV attachment');
  const csv = last.attachments[0].content;
  // Check CSV: header line + 5 data rows
  const lines = csv.trim().split('\n');
  if (lines.length < 6) throw new Error('CSV too short: ' + lines.length + ' lines');
  if (!/Donor 1/.test(csv)) throw new Error('CSV missing donor rows');
  log('email to:', last.to, ' attachment:', last.attachments[0].filename, ' lines:', lines.length);
});

await step('Pause and resume report', async () => {
  const csrf = await csrfFromPage();
  let r = await apiAs(csrf)('PUT', `/api/reports/${reportId}`, { active: false });
  if (r.body.report.active !== false || r.body.report.nextRunAt) throw new Error('pause did not clear nextRunAt');
  r = await apiAs(csrf)('PUT', `/api/reports/${reportId}`, { active: true });
  if (r.body.report.active !== true || !r.body.report.nextRunAt) throw new Error('resume did not set nextRunAt');
  log('paused/resumed cleanly');
});

await step('Worker fires past-due reports automatically', async () => {
  // Manually set nextRunAt to the past, then trigger the worker.
  const dbPath = path.resolve('mandate.db');
  const sqlite = new Database(dbPath);
  sqlite.prepare(`UPDATE scheduled_reports SET next_run_at = ? WHERE id = ?`).run(Math.floor(Date.now()/1000) - 60, reportId);
  sqlite.close();

  // Clear emails first so we know the new send is from the worker
  const csrf = await csrfFromPage();
  await apiAs(csrf)('GET', '/api/_test/emails?clear=1');

  // Wait for the worker poll cycle
  await new Promise(r => setTimeout(r, 2500));

  const ec = await apiAs(csrf)('GET', '/api/_test/emails');
  const emails = ec.body.emails;
  if (!emails.length) throw new Error('worker did not auto-fire (no email in 2.5s window with poll set to 2000ms)');
  const last = emails[emails.length - 1];
  if (last.to !== 'finance@m.app') throw new Error('worker email: wrong recipient');
  log('worker fired report; emails captured:', emails.length);
});

await step('Audit-log report kind also works', async () => {
  const csrf = await csrfFromPage();
  let r = await apiAs(csrf)('POST', '/api/reports', {
    name: 'Audit weekly', kind: 'audit_log', params: {},
    targetEmail: 'security@m.app', intervalMinutes: 10080, active: true,
  });
  if (r.status !== 200) throw new Error(JSON.stringify(r));
  const auditReportId = r.body.report.id;
  await apiAs(csrf)('GET', '/api/_test/emails?clear=1');
  r = await apiAs(csrf)('POST', `/api/reports/${auditReportId}/run-now`);
  if (!r.body.ok) throw new Error('audit run-now failed: ' + JSON.stringify(r));
  if (r.body.count < 1) throw new Error('expected at least 1 audit row');
  const ec = await apiAs(csrf)('GET', '/api/_test/emails');
  if (!ec.body.emails.length) throw new Error('no audit email captured');
  log('audit report sent', r.body.count, 'rows to', ec.body.emails[0].to);
});

await step('UI renders Reports tab and shows scheduled report', async () => {
  await page.click('.usrm__avatar');
  await page.click('.usrm__item:has-text("Admin")');
  await page.waitForSelector('.adm__nav');
  await page.click('.adm__nav-btn:has-text("Reports")');
  await page.waitForTimeout(700);
  const rows = await page.locator('.adm__table tbody tr').count();
  if (rows < 2) throw new Error('expected ≥2 reports in table; got ' + rows);
  // Try opening "New report" panel
  await page.click('button:has-text("New report")');
  await page.waitForTimeout(300);
  const panelTitle = await page.locator('.adm__panel-title').textContent();
  if (!/New scheduled report/i.test(panelTitle)) throw new Error('editor not visible');
  await page.screenshot({ path: '/tmp/mandate-audit/v16-reports.png', fullPage: true });
});

await step('Delete report', async () => {
  const csrf = await csrfFromPage();
  const r = await apiAs(csrf)('DELETE', `/api/reports/${reportId}`);
  if (!r.body.ok) throw new Error(JSON.stringify(r));
});

console.log(`\nTotal page errors: ${errors.length}`);
errors.slice(0, 5).forEach(e => console.log(`  · ${e.slice(0, 200)}`));

await browser.close();
console.log('\n✅ test-admin-v16 complete');
