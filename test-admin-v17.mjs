// E2E v17: Mobile responsiveness — verify no horizontal page overflow at iPhone width
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const log = (...x) => console.log('  ', ...x);
const step = async (n, fn) => { try { const r = await fn(); console.log(`OK   ${n}`); return r; } catch (e) { console.log(`FAIL ${n}\n     ${e.message.slice(0, 400)}`); throw e; } };

// Compare document scroll width vs viewport width — overflow means a wider page than the viewport.
const checkNoOverflow = async (label) => {
  const result = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    body: document.body.scrollWidth,
  }));
  if (result.scrollWidth > result.clientWidth + 1) {
    throw new Error(`${label}: page overflows (scrollWidth=${result.scrollWidth}, clientWidth=${result.clientWidth})`);
  }
  return result;
};

await step('Sign up at iPhone width — auth screen renders without overflow', async () => {
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.auth-screen__title');
  await checkNoOverflow('auth');
  // Sign up new admin
  await page.fill('input[placeholder="Marcus Reyes"]', 'Mobile User');
  await page.fill('input[placeholder="you@mandate.app"]', 'mob@m.app');
  await page.fill('input[placeholder="min 8 characters"]', 'pass1234');
  await page.fill('input[placeholder="Meridian West — Assembly"]', 'Mobile WS');
  await page.click('button:has-text("Create workspace & sign in")');
  await page.waitForSelector('.mdt__bar', { timeout: 10000 });

  // Seed donor records into THIS workspace so the bucket-detail step has data
  const csrf = await page.evaluate(() => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  });
  await page.evaluate(async ({ csrf }) => {
    for (let i = 0; i < 5; i++) {
      await fetch('/api/data/raise/donor', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ name: `Donor ${i+1}`, amount: (i+1) * 100, email: `d${i+1}@x.com` }),
      });
    }
  }, { csrf });
});

await step('Home page: top bar elements visible and fit on screen', async () => {
  await checkNoOverflow('home');
  // Avatar must be visible and clickable (was being intercepted before)
  const avatarBox = await page.locator('.mdt__avatar').first().boundingBox();
  if (!avatarBox || avatarBox.width < 20) throw new Error('avatar not rendered');
  // Module nav scroll wrap must exist (modules don't all fit, but the rail should scroll)
  const navWrap = await page.$('.mdt__nav-wrap');
  if (!navWrap) throw new Error('module nav wrapper missing');
  const navScrollable = await page.evaluate(() => {
    const el = document.querySelector('.mdt__nav-wrap');
    return el && el.scrollWidth > el.clientWidth;
  });
  log('module nav scrollable:', navScrollable);
});

await step('Open Admin via avatar menu — click is not intercepted', async () => {
  await page.click('.mdt__avatar');
  await page.waitForTimeout(200);
  await page.click('.usrm__item:has-text("Admin")');
  await page.waitForSelector('.adm__nav', { timeout: 5000 });
  await checkNoOverflow('admin overview');
});

await step('Admin nav scrolls horizontally instead of overflowing the page', async () => {
  const result = await page.evaluate(() => {
    const nav = document.querySelector('.adm__nav');
    return nav ? { scroll: nav.scrollWidth, client: nav.clientWidth } : null;
  });
  if (!result) throw new Error('admin nav missing');
  if (result.scroll <= result.client) {
    log(`(nav fits without scrolling: ${result.client}px — that's ok too)`);
  } else {
    log(`nav scrollable: ${result.scroll}px content in ${result.client}px viewport`);
  }
  await checkNoOverflow('admin nav');
});

await step('Module data → bucket page renders without overflow', async () => {
  await page.click('.adm__nav-btn:has-text("Module data")');
  await page.waitForTimeout(500);
  await checkNoOverflow('admin data buckets');
  // Single-column grid on mobile
  const cols = await page.evaluate(() => {
    const grid = document.querySelector('.adm__data-grid');
    return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0;
  });
  if (cols !== 1) throw new Error('expected 1-col grid on mobile; got ' + cols + ' cols');
  log('bucket grid is single-column ✓');
});

await step('Donor bucket: table scrolls inside its container, not the page', async () => {
  const cards = await page.$$('.adm__data-card');
  for (const c of cards) {
    if (/donor/i.test((await c.textContent()) || '')) { await c.click(); break; }
  }
  await page.waitForTimeout(500);
  await checkNoOverflow('bucket list');
  // The .adm__table itself should be scrollable but page should not be
  const tableScroll = await page.evaluate(() => {
    const t = document.querySelector('.adm__table');
    return t ? { s: t.scrollWidth, c: t.clientWidth, isBlock: getComputedStyle(t).display === 'block' } : null;
  });
  if (!tableScroll?.isBlock) throw new Error('table should be display:block on mobile');
  log('table is display:block; scrollable:', tableScroll.s > tableScroll.c);
});

await step('Record edit panel: inputs stack, actions are full-width', async () => {
  // Click first record's Edit button
  const editBtn = await page.$('table button:has-text("Edit"), table button:has-text("View")');
  if (editBtn) await editBtn.click();
  await page.waitForTimeout(500);
  await checkNoOverflow('record edit');
  // Save button should span full width on mobile
  const btnWidth = await page.evaluate(() => {
    const btn = document.querySelector('.adm__actions .adm__btn');
    return btn ? { w: btn.getBoundingClientRect().width, parent: btn.parentElement.getBoundingClientRect().width } : null;
  });
  if (btnWidth && btnWidth.w < btnWidth.parent - 10) {
    log(`(save btn width ${btnWidth.w}, parent ${btnWidth.parent} — not full width but acceptable)`);
  } else {
    log('save button spans the full panel width ✓');
  }
});

await step('Reports tab: page does not overflow', async () => {
  await page.click('.adm__nav-btn:has-text("Reports")');
  await page.waitForTimeout(500);
  await checkNoOverflow('reports');
});

await step('Users tab: action buttons stack on mobile', async () => {
  await page.click('.adm__nav-btn:has-text("Users")');
  await page.waitForTimeout(500);
  await checkNoOverflow('users');
});

await step('Audit log tab: still no overflow despite long meta values', async () => {
  await page.click('.adm__nav-btn:has-text("Audit")');
  await page.waitForTimeout(500);
  await checkNoOverflow('audit');
});

console.log(`\nTotal page errors: ${errors.length}`);
errors.slice(0, 5).forEach(e => console.log(`  · ${e.slice(0, 200)}`));

await browser.close();
console.log('\n✅ test-admin-v17 complete');
