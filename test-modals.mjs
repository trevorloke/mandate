// Test critical modals and drawers
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('pageerror', (err) => errors.push({ where: '?', msg: err.message }));

async function setRoute(route) {
  await page.goto('http://localhost:5174/');
  await page.evaluate((r) => localStorage.setItem('mandate2:route', r), route);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
}

async function clickByText(text, opts = {}) {
  const handle = await page.evaluateHandle((t) => {
    const all = Array.from(document.querySelectorAll('button, a'));
    return all.find(el => (el.textContent || '').trim().toLowerCase().includes(t.toLowerCase())) || null;
  }, text);
  const el = handle.asElement();
  if (el) {
    await el.click(opts);
    return true;
  }
  return false;
}

async function check(name, fn) {
  const errsBefore = errors.length;
  try {
    const result = await fn();
    const newErrs = errors.slice(errsBefore);
    console.log(`${result ? 'OK  ' : 'FAIL'} ${name.padEnd(40)} ${newErrs.length ? '⚠ ' + newErrs.length + ' err' : ''}`);
    newErrs.forEach(e => console.log(`         ✗ ${e.msg.slice(0, 200)}`));
  } catch (e) {
    console.log(`FAIL ${name.padEnd(40)} ✗ ${e.message.slice(0, 100)}`);
  }
}

// 1. Ledger New Entry modal
await setRoute('ledger');
await check('Ledger: open New Entry modal', async () => {
  await clickByText('NEW ENTRY');
  await page.waitForTimeout(400);
  const visible = await page.evaluate(() => !!document.querySelector('.lne, .r-modal'));
  await page.screenshot({ path: '/tmp/mandate-audit/modal-ledger-new.png' });
  return visible;
});
await check('Ledger: close New Entry via Cancel', async () => {
  const ok = await clickByText('Cancel');
  await page.waitForTimeout(400);
  return ok;
});

// 2. Raise Log Gift modal
await setRoute('raise');
await check('Raise: open Log Gift modal', async () => {
  await clickByText('LOG GIFT');
  await page.waitForTimeout(400);
  const visible = await page.evaluate(() => !!document.querySelector('.r-modal, .raise-modal'));
  await page.screenshot({ path: '/tmp/mandate-audit/modal-raise-loggift.png' });
  return visible;
});

// 3. Conductor drawer (cmd+J or button click)
await setRoute('home');
await check('Home: open Conductor drawer', async () => {
  await clickByText('Conductor');
  await page.waitForTimeout(400);
  const visible = await page.evaluate(() =>
    !!document.querySelector('.cnd, .conductor, [class*="cond"]') &&
    (document.querySelector('.cnd, .conductor, [class*="cond"]')?.offsetWidth > 100)
  );
  await page.screenshot({ path: '/tmp/mandate-audit/modal-conductor.png' });
  return visible;
});

// 4. Fabric: ObjRef hover/click → DossierDrawer
await setRoute('home');
await check('Home: ObjRef link clickable', async () => {
  const found = await page.evaluate(() => {
    const ref = document.querySelector('.ref, [class*="objref"], [data-objref], .home2__dek a, .home2__dek span');
    return !!ref;
  });
  // try clicking an ObjRef
  await clickByText('Vance housing');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/mandate-audit/modal-dossier.png' });
  return found;
});

// 5. Site Pages: clicking a page row should expand or show detail
await setRoute('site');
await check('Site: page row expandable', async () => {
  const pageCard = await page.$('.site2__page, [class*="site"][class*="page"]');
  if (pageCard) {
    await pageCard.click();
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: '/tmp/mandate-audit/site-pages-detail.png' });
  return !!pageCard;
});

console.log(`\nTotal errors: ${errors.length}`);
await browser.close();
