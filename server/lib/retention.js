// Trash retention worker — periodically purge soft-deleted records older than
// the workspace's `settings.retention.trashDays` value.
// Default: keep forever (0 means disabled).
import { db } from '../db/index.js';
import { workspaces, moduleData, auditLog } from '../db/schema.js';
import { and, eq, lte, isNotNull } from 'drizzle-orm';
import { randomBytes } from 'crypto';

const TICK_MS = 60 * 60 * 1000;        // hourly

let started = false;
export function startRetentionWorker() {
  if (started) return;
  started = true;
  // Run once at startup, then every TICK_MS
  runOnce().catch((e) => console.warn('[retention] error:', e.message));
  setInterval(() => runOnce().catch(() => {}), TICK_MS).unref?.();
}

async function runOnce() {
  const allWs = await db.select().from(workspaces);
  for (const ws of allWs) {
    let settings = {};
    try { settings = JSON.parse(ws.settings || '{}'); } catch {}
    const trashDays = Number(settings.retention?.trashDays) || 0;
    if (!trashDays) continue;

    const cutoff = new Date(Date.now() - trashDays * 86400 * 1000);
    const due = await db.select().from(moduleData)
      .where(and(eq(moduleData.workspaceId, ws.id), isNotNull(moduleData.deletedAt), lte(moduleData.deletedAt, cutoff)));
    if (!due.length) continue;

    for (const r of due) {
      await db.delete(moduleData).where(eq(moduleData.id, r.id));
    }
    await db.insert(auditLog).values({
      id: 'a_' + randomBytes(12).toString('hex'),
      userId: null,
      action: 'retention.purge',
      target: ws.id,
      meta: JSON.stringify({ purged: due.length, trashDays }),
    });
    console.log(`[retention] purged ${due.length} records from workspace ${ws.id} (>${trashDays}d in trash)`);
  }
}
