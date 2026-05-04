// E2E v7: soft delete + trash + restore, token scopes, audit diff, saved searches, migrations
import { chromium } from 'playwright-core';

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

await step('Soft delete: delete a voter, verify it goes to Trash, restore it', async () => {
  // Edit a voter so we have a known record, then delete it
  await page.click('.adm__data-card:has-text("Voters")');
  await page.waitForSelector('table.adm__table--bucket');

  // Edit first
  await page.click('button:has-text("Edit")');
  await page.waitForSelector('.adm__typed');
  // change last name
  await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.adm__field-label'));
    const lbl = labels.find(l => l.textContent.trim().startsWith('Last name'));
    if (lbl) {
      const inp = lbl.parentElement.querySelector('input');
      inp.focus(); inp.select?.();
    }
  });
  await page.keyboard.type('SoftDeleteSentinel');
  await page.click('button:has-text("Save")');
  await page.waitForSelector('.adm__msg--ok', { timeout: 5000 });

  // Now click Delete on that row
  page.once('dialog', d => d.accept());
  await page.evaluate(() => {
    // Click first Delete button
    const btns = Array.from(document.querySelectorAll('.adm__btn--danger'));
    const b = btns.find(x => x.textContent.trim() === 'Delete');
    if (b) b.click();
  });
  await page.waitForTimeout(500);

  // Check counts: voter bucket should have 1 less
  const meta = await page.textContent('.adm__bucket-meta');
  log('after delete:', meta);
  if (!meta.includes('59')) throw new Error('expected 59 records remaining');

  // Go to Trash tab
  await page.click('.adm__back');
  await page.click('.adm__nav-btn:has-text("Trash")');
  await page.waitForSelector('table.adm__table');
  const html = await page.content();
  if (!html.includes('SoftDeleteSentinel')) throw new Error('soft-deleted record not in Trash');
  log('✓ deleted record visible in trash');

  // Restore - target the table row's Restore button (not the nav tab)
  await page.click('table .adm__btn--ghost.adm__btn-sm');
  await page.waitForFunction(
    () => !document.body.textContent.includes('SoftDeleteSentinel'),
    { timeout: 10000 }
  );
  log('✓ row disappeared from trash after restore');

  // Verify back in voter bucket
  await page.click('.adm__nav-btn:has-text("Module data")');
  await page.click('.adm__data-card:has-text("Voters")');
  await page.waitForSelector('.adm__bucket-meta');
  await page.fill('.adm__bucket-search', 'SoftDeleteSentinel');
  await page.waitForTimeout(500);
  const m = await page.textContent('.adm__bucket-meta');
  log('after restore + search:', m);
  if (!m.includes('1 of')) throw new Error('restored record not searchable: ' + m);
});

await step('Bulk delete + Trash shows multiple → empty trash', async () => {
  await page.fill('.adm__bucket-search', '');
  await page.waitForTimeout(200);
  // Select all on page
  await page.click('.adm__check-col input[type=checkbox]');
  page.once('dialog', d => d.accept());
  await page.click('.adm__bulkbar button:has-text("Delete")');
  await page.waitForSelector('.adm__msg--ok', { timeout: 15000 });

  // Go to Trash
  await page.click('.adm__back');
  await page.click('.adm__nav-btn:has-text("Trash")');
  await page.waitForSelector('button:has-text("Empty trash")');
  const txt = await page.textContent('button:has-text("Empty trash")');
  log('trash size:', txt);
  if (!/\d+/.test(txt)) throw new Error('trash empty button missing count');

  page.once('dialog', d => d.accept());
  await page.click('button:has-text("Empty trash")');
  await page.waitForSelector('.adm__msg--ok', { timeout: 15000 });
  // Trash should be empty
  await page.waitForTimeout(300);
  const html = await page.content();
  if (!html.includes('Trash is empty')) throw new Error('trash should be empty');
});

await step('Token scopes: create read-only token, write should fail', async () => {
  await page.click('.adm__nav-btn:has-text("API tokens")');
  await page.waitForSelector('.adm__title');
  await page.click('button:has-text("+ New token")');
  await page.fill('input.adm__field-input', 'Read-only test');
  // Uncheck "write" scope
  await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.adm__field-bool'));
    const writeLbl = labels.find(l => l.textContent.includes('write'));
    if (writeLbl) writeLbl.querySelector('input').click();
  });
  await page.click('button:has-text("Create token")');
  await page.waitForSelector('.adm__codeblock', { timeout: 5000 });
  const token = await page.inputValue('input.adm__field-input--mono[readonly]');
  log('read-only token:', token.slice(0, 16) + '…');

  // Try to read (allowed)
  const readResult = await page.evaluate(async (tok) => {
    const r = await fetch('/api/data/ground/voter', {
      headers: { 'Authorization': 'Bearer ' + tok },
      credentials: 'omit',
    });
    return r.status;
  }, token);
  log('read with read-only token:', readResult);
  if (readResult !== 200) throw new Error('read should succeed for read-only token');

  // Try to write (should fail)
  const writeResult = await page.evaluate(async (tok) => {
    const r = await fetch('/api/data/ground/voter', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({ id: 'X-1', first: 'Should', last: 'Fail' }),
    });
    const body = await r.json();
    return { status: r.status, error: body.error };
  }, token);
  log('write with read-only token:', writeResult);
  if (writeResult.status !== 403) throw new Error('write should be forbidden for read-only token');
  if (!/scope/i.test(writeResult.error || '')) throw new Error('error should mention scope');
});

await step('Audit log: edit a voter, see diff in audit detail', async () => {
  // First, edit a voter to generate a data.update with prev/next
  await page.click('.adm__nav-btn:has-text("Module data")');
  await page.click('.adm__data-card:has-text("Voters")');
  await page.waitForSelector('table.adm__table--bucket');
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
  await page.keyboard.type('AuditDiffTarget');
  await page.click('button:has-text("Save")');
  await page.waitForSelector('.adm__msg--ok', { timeout: 5000 });

  // Audit log
  await page.click('.adm__back');
  await page.click('.adm__nav-btn:has-text("Audit log")');
  await page.waitForSelector('.adm__log');

  // Filter by data.update
  await page.evaluate(() => {
    const sel = Array.from(document.querySelectorAll('select.adm__filter-chip')).find(s => s.options[0].textContent === 'Action: all');
    if (sel) {
      sel.value = 'data.update';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForTimeout(300);

  // Click on first row to expand
  await page.click('.adm__log-row');
  await page.waitForTimeout(300);
  const html = await page.content();
  if (!html.includes('AuditDiffTarget')) throw new Error('audit diff should show new value');
  if (!html.includes('Field changes')) throw new Error('audit diff view missing');
  log('✓ audit diff visible');
});

await step('Saved searches: save a search, restore it', async () => {
  await page.click('.adm__nav-btn:has-text("Module data")');
  await page.click('.adm__data-card:has-text("Voters")');
  await page.waitForSelector('.adm__bucket-search');
  await page.fill('.adm__bucket-search', 'housing');
  await page.waitForTimeout(300);
  // Save search (auto-prompt)
  page.once('dialog', d => d.accept('Housing voters'));
  await page.click('button:has-text("Save this search")');
  await page.waitForTimeout(300);
  // Clear search
  await page.fill('.adm__bucket-search', '');
  await page.waitForTimeout(200);
  // Click saved search chip
  await page.click('button.adm__filter-chip:has-text("Housing voters")');
  await page.waitForTimeout(300);
  const q = await page.inputValue('.adm__bucket-search');
  log('after saved search apply:', q);
  if (q !== 'housing') throw new Error(`expected search restored to "housing", got "${q}"`);
});

await step('Drizzle migrations: file exists', async () => {
  // Check that the migration was generated (we did this earlier)
  const fs = await import('fs');
  if (!fs.existsSync('/home/claude/mandate-app/server/db/migrations/0000_initial.sql')) {
    throw new Error('migration file missing');
  }
  const migrationContent = fs.readFileSync('/home/claude/mandate-app/server/db/migrations/0000_initial.sql', 'utf8');
  log('migration sample:', migrationContent.split('\n')[0].slice(0, 60));
  if (!/CREATE TABLE/.test(migrationContent)) throw new Error('migration is empty');
});

console.log(`\nTotal page errors: ${errors.length}`);
errors.slice(0, 5).forEach(e => console.log(`  · ${e.slice(0, 200)}`));
await browser.close();
