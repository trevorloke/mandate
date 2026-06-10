// Scheduled-post publishing worker.
// Periodically claims due posts atomically (single UPDATE … RETURNING — SQLite
// serializes writes so two workers can't grab the same row) and publishes them.
// Also reclaims rows stuck in 'publishing' whose lease expired (crashed worker).
import { randomBytes } from 'crypto';
import { sqlite } from '../db/index.js';
import { publishPost } from './social/publish.js';
import { refreshStaleMetrics } from './social/metrics.js';
import { checkAllAccounts } from './social/health.js';
import { syncAllInboxes } from './social/inbox.js';
import { syncAllFeeds } from './social/feeds.js';
import { syncAllListening } from './social/listening.js';

const WORKER_ID = 'sw_' + randomBytes(4).toString('hex');
const TICK_MS = 15_000;
const LEASE_MS = 60_000;
const BATCH = 10;

// Prepared lazily — the worker starts after ensureTables(), so the table exists
// by the time we prepare (preparing at import time would run before bootstrap).
let claimStmt = null;
function getClaimStmt() {
  if (!claimStmt) {
    claimStmt = sqlite.prepare(`
      UPDATE social_posts
         SET status = 'publishing', worker_id = ?, lease_expires_at = ?
       WHERE id IN (
         SELECT id FROM social_posts
          WHERE (status = 'scheduled'  AND scheduled_at IS NOT NULL AND scheduled_at <= ?)
             OR (status = 'publishing' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?)
             OR (status = 'failed'     AND next_retry_at IS NOT NULL AND next_retry_at <= ?)
          ORDER BY scheduled_at ASC
          LIMIT ?
       )
      RETURNING id
    `);
  }
  return claimStmt;
}

export async function runPublishTickOnce() { return tick(); }

async function tick() {
  const now = Math.floor(Date.now() / 1000);
  const lease = now + Math.floor(LEASE_MS / 1000);
  let claimed = [];
  try {
    claimed = getClaimStmt().all(WORKER_ID, lease, now, now, now, BATCH);
  } catch (e) {
    console.warn('[social-worker] claim failed:', e.message);
    return;
  }
  for (const row of claimed) {
    try { await publishPost(row.id); }
    catch (e) { console.warn('[social-worker] publish error', row.id, e.message); }
  }
}

const METRICS_TICK_MS = 10 * 60 * 1000; // refresh stale post metrics every 10 min
const HEALTH_TICK_MS = 30 * 60 * 1000;  // re-check account tokens every 30 min
const INBOX_TICK_MS = 5 * 60 * 1000;    // pull new interactions every 5 min
const FEEDS_TICK_MS = 20 * 60 * 1000;   // pull RSS feeds every 20 min
const LISTEN_TICK_MS = 10 * 60 * 1000;  // scan keyword listening every 10 min
let timer = null;
let metricsTimer = null;
let healthTimer = null;
let inboxTimer = null;
let feedsTimer = null;
let listenTimer = null;
export function startSocialWorker() {
  if (timer) return;
  timer = setInterval(() => { tick().catch(() => {}); }, TICK_MS);
  timer.unref?.();
  metricsTimer = setInterval(() => { refreshStaleMetrics().catch(() => {}); }, METRICS_TICK_MS);
  metricsTimer.unref?.();
  healthTimer = setInterval(() => { checkAllAccounts().catch(() => {}); }, HEALTH_TICK_MS);
  healthTimer.unref?.();
  inboxTimer = setInterval(() => { syncAllInboxes().catch(() => {}); }, INBOX_TICK_MS);
  inboxTimer.unref?.();
  feedsTimer = setInterval(() => { syncAllFeeds().catch(() => {}); }, FEEDS_TICK_MS);
  feedsTimer.unref?.();
  listenTimer = setInterval(() => { syncAllListening().catch(() => {}); }, LISTEN_TICK_MS);
  listenTimer.unref?.();
  console.log(`[social-worker] started (${WORKER_ID})`);
}
export function stopSocialWorker() {
  if (timer) { clearInterval(timer); timer = null; }
  if (metricsTimer) { clearInterval(metricsTimer); metricsTimer = null; }
  if (healthTimer) { clearInterval(healthTimer); healthTimer = null; }
  if (inboxTimer) { clearInterval(inboxTimer); inboxTimer = null; }
  if (feedsTimer) { clearInterval(feedsTimer); feedsTimer = null; }
  if (listenTimer) { clearInterval(listenTimer); listenTimer = null; }
}
