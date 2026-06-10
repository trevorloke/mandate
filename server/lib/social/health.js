// Account health checks — validate stored tokens so accounts flip to 'error'
// (with a reason) BEFORE a scheduled post fails on them. Used by the verify
// route and a periodic worker pass.
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { socialAccounts } from '../../db/schema.js';
import { getProvider } from './index.js';
import { getApp } from './oauth.js';
import { encryptJson, decryptJson } from '../crypto.js';
import { randomBytes } from 'crypto';
import { sqlite } from '../../db/index.js';

export async function checkAccountHealth(accountId) {
  const account = (await db.select().from(socialAccounts).where(eq(socialAccounts.id, accountId)).limit(1))[0];
  if (!account) return { ok: false, error: 'not found' };
  const prov = getProvider(account.platform);
  if (!prov?.adapter?.verify) return { ok: true }; // nothing to check against

  try {
    const creds = decryptJson(account.credentials);
    const app = prov.connect === 'oauth' ? await getApp(account.workspaceId, account.platform).catch(() => null) : null;
    const res = await prov.adapter.verify({ ...account, credentials: creds, _app: app });
    const update = { status: 'connected', lastError: null, lastVerifiedAt: new Date(), updatedAt: new Date() };
    if (res.credentials) update.credentials = encryptJson(res.credentials); // persist refreshed tokens
    await db.update(socialAccounts).set(update).where(eq(socialAccounts.id, accountId));
    // Daily audience snapshot (INSERT OR IGNORE on account+day keeps one/day).
    if (prov.adapter.audience) {
      try {
        const liveCreds = res.credentials || creds;
        const aud = await prov.adapter.audience({ ...account, credentials: liveCreds, _app: app });
        const day = new Date().toISOString().slice(0, 10);
        sqlite.prepare('INSERT OR IGNORE INTO social_audience (id, workspace_id, account_id, followers, day) VALUES (?,?,?,?,?)')
          .run('au_' + randomBytes(12).toString('hex'), account.workspaceId, account.id, aud.followers || 0, day);
        if (aud.credentials) {
          await db.update(socialAccounts).set({ credentials: encryptJson(aud.credentials), updatedAt: new Date() }).where(eq(socialAccounts.id, accountId));
        }
      } catch { /* audience is best-effort */ }
    }
    return { ok: true };
  } catch (e) {
    await db.update(socialAccounts).set({
      status: 'error', lastError: String(e.message).slice(0, 300), lastVerifiedAt: new Date(), updatedAt: new Date(),
    }).where(eq(socialAccounts.id, accountId));
    return { ok: false, error: e.message };
  }
}

// Re-check every connected account (periodic worker pass).
export async function checkAllAccounts() {
  const rows = await db.select({ id: socialAccounts.id }).from(socialAccounts);
  let checked = 0;
  for (const r of rows) {
    try { await checkAccountHealth(r.id); checked++; } catch { /* skip one */ }
  }
  return checked;
}
