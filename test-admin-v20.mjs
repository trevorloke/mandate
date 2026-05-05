// E2E v20: Internationalization (en / fr / es)
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

await step('Auth screen renders in English by default', async () => {
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.auth-screen__title');
  const title = (await page.textContent('.auth-screen__title')).trim();
  // Could be "Sign in." (returning user) or "Set up your workspace." (first-run)
  if (!/sign in|set up/i.test(title)) throw new Error('unexpected en title: ' + title);
  log('default title:', title);
});

await step('Switch locale to French via picker on auth screen', async () => {
  // Need to be on the sign-in view (not signup) — the locale dropdown is in the auth-screen footer
  // First-run sees signup which doesn't have a picker. So force-create a user via API first.
  await page.evaluate(async () => {
    await fetch('/api/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'i18n@m.app', password: 'pass1234', name: 'I18N User', workspaceName: 'I18N WS' }),
    });
    // Sign back out
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrf } });
  });
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.auth-screen__title');

  await page.selectOption('.auth-form__locale', 'fr');
  await page.waitForTimeout(300);
  const title = (await page.textContent('.auth-screen__title')).trim();
  if (!/connexion/i.test(title)) throw new Error('expected French title; got: ' + title);
  // The "Sign in" submit button text should also have changed
  const btn = (await page.textContent('button.auth-form__btn[type="submit"]')).trim();
  if (!/se connecter/i.test(btn)) throw new Error('expected French button; got: ' + btn);
  log('fr title:', title, '| btn:', btn);
});

await step('Switch to Spanish, persists on reload via localStorage', async () => {
  await page.selectOption('.auth-form__locale', 'es');
  await page.waitForTimeout(200);
  const title = (await page.textContent('.auth-screen__title')).trim();
  if (!/iniciar sesi/i.test(title)) throw new Error('expected Spanish title; got: ' + title);

  // Reload — should restore from localStorage
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.auth-screen__title');
  await page.waitForTimeout(200);
  const reloadedTitle = (await page.textContent('.auth-screen__title')).trim();
  if (!/iniciar sesi/i.test(reloadedTitle)) throw new Error('Spanish did not persist across reload: ' + reloadedTitle);
  log('persisted Spanish title after reload');
});

await step('Sign in (Spanish locale), then user.locale syncs to backend', async () => {
  await page.fill('input[type=email]', 'i18n@m.app');
  await page.fill('input[type=password]', 'pass1234');
  // Button text is "Iniciar sesión" in es
  await page.click('button.auth-form__btn[type=submit]');
  await page.waitForSelector('.mdt__bar', { timeout: 8000 });
  // Wait a beat for the locale-sync useEffect to fire
  await page.waitForTimeout(800);
  const me = await page.evaluate(() => fetch('/api/auth/me', { credentials: 'include' }).then(r => r.json()));
  if (me.user?.locale !== 'es') throw new Error('user.locale not synced to backend: ' + me.user?.locale);
  log('user.locale on backend:', me.user.locale);
});

await step('Top bar Home tab uses Spanish "Inicio"', async () => {
  // The "Home" tab in the shell should now read "Inicio"
  const homeTab = await page.locator('.mdt__tab').first().textContent();
  if (!/inicio/i.test(homeTab)) throw new Error('home tab not localized: ' + homeTab);
  log('home tab:', homeTab.trim());
});

await step('Open admin — nav and header in Spanish', async () => {
  await page.click('.mdt__avatar');
  await page.click('.usrm__item:has-text("Admin")');
  await page.waitForSelector('.adm__nav');
  // Title should include "Ajustes & acceso"
  const title = await page.textContent('.adm__title');
  if (!/ajustes/i.test(title)) throw new Error('admin title not Spanish: ' + title);
  // First nav button should say "Resumen"
  const firstTab = await page.locator('.adm__nav-btn').first().textContent();
  if (!/resumen/i.test(firstTab)) throw new Error('first nav tab not Spanish: ' + firstTab);
  log('admin title:', title.trim(), '| 1st tab:', firstTab.trim());
});

await step('Switch to French via user-menu picker', async () => {
  await page.click('.mdt__avatar');
  await page.waitForSelector('.usrm__locale select');
  await page.selectOption('.usrm__locale select', 'fr');
  await page.waitForTimeout(300);
  // Close menu
  await page.keyboard.press('Escape');
  // Verify admin re-renders in French
  const title = await page.textContent('.adm__title');
  if (!/réglages/i.test(title)) throw new Error('admin title not French after switch: ' + title);
  // Backend should also be updated to 'fr'
  await page.waitForTimeout(600);
  const me = await page.evaluate(() => fetch('/api/auth/me', { credentials: 'include' }).then(r => r.json()));
  if (me.user?.locale !== 'fr') throw new Error('backend locale should be fr; got ' + me.user?.locale);
  log('switched to fr; backend confirmed');
});

await step('Sign out, sign back in — server-stored locale wins', async () => {
  // Logout via API + simulate a fresh device (no local choice) + reload
  await page.evaluate(async () => {
    const m = document.cookie.match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : '';
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrf } });
    window.localStorage.removeItem('mdt_locale');
  });
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.auth-screen__title');
  // Sign in
  await page.fill('input[type=email]', 'i18n@m.app');
  await page.fill('input[type=password]', 'pass1234');
  await page.click('button.auth-form__btn[type=submit]');
  await page.waitForSelector('.mdt__bar', { timeout: 8000 });
  await page.waitForTimeout(700);
  // The user.locale stored on the server is 'fr' — UI should now be in French
  const homeTab = await page.locator('.mdt__tab').first().textContent();
  if (!/accueil/i.test(homeTab)) throw new Error('expected French home tab after server preference applied; got: ' + homeTab);
  log('after sign-in, home tab:', homeTab.trim(), '(server pref applied)');
});

await page.screenshot({ path: '/tmp/mandate-audit/v20-i18n.png', fullPage: false });

console.log(`\nTotal page errors: ${errors.length}`);
errors.slice(0, 5).forEach(e => console.log(`  · ${e.slice(0, 200)}`));

await browser.close();
console.log('\n✅ test-admin-v20 complete');
