// Webhook dispatcher with delivery log + exponential backoff retry.
//
// Distributed-safe: multiple Node processes can run startWebhookWorker() simultaneously
// without double-processing. Each worker claims pending rows atomically (single UPDATE
// with RETURNING) by stamping its WORKER_ID and a lease_expires_at. If the worker dies,
// the lease eventually expires and another worker re-claims the row.
//
// Every event creates a delivery row per matching webhook. Initial attempt is immediate.
// On failure (non-2xx, network error), schedule next attempt at exponentially backed-off `next_retry_at`.
//
// HMAC-SHA256 signature in `X-Mandate-Signature: sha256=<hex>` header.
import { createHmac, randomUUID, randomBytes } from 'crypto';
import { db, sqlite } from '../db/index.js';
import { webhooks, webhookDeliveries } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 30_000;        // 30s, then 1m, 2m, 4m, 8m
const RETRY_TICK_MS = Number(process.env.MANDATE_WEBHOOK_TICK_MS || 15_000);
const LEASE_MS      = Number(process.env.MANDATE_WEBHOOK_LEASE_MS || 60_000);
const BATCH_SIZE    = Number(process.env.MANDATE_WEBHOOK_BATCH || 25);

// A unique id per worker process. Used both for owning leases and for stats display.
export const WORKER_ID = process.env.MANDATE_WORKER_ID
  || `w-${process.pid}-${randomBytes(3).toString('hex')}`;

const newId = (p='') => p + randomBytes(12).toString('hex');

function sign(secret, body) {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function eventMatches(eventGlob, eventName) {
  if (eventGlob === '*' || eventGlob === eventName) return true;
  if (eventGlob.endsWith('.*')) {
    const prefix = eventGlob.slice(0, -2);
    return eventName.startsWith(prefix + '.');
  }
  return false;
}

function delayForAttempt(attempt) {
  return BASE_DELAY_MS * Math.pow(2, attempt - 1);
}

// Public: emit an event to all matching active webhooks.
export async function emitWebhook({ workspaceId, event, payload }) {
  const list = await db.select().from(webhooks)
    .where(and(eq(webhooks.workspaceId, workspaceId), eq(webhooks.active, true)));
  if (!list.length) return;

  const eventId = randomUUID();
  const fullPayload = {
    event,
    workspace: workspaceId,
    timestamp: new Date().toISOString(),
    eventId,
    ...payload,
  };
  const body = JSON.stringify(fullPayload);

  const targets = list.filter(w => {
    let evs = ['*']; try { evs = JSON.parse(w.events || '["*"]'); } catch {}
    return Array.isArray(evs) && evs.some(g => eventMatches(g, event));
  });

  await Promise.all(targets.map(w => attempt(w, eventId, event, body, 1)));
}

// ── Distributed claim ──────────────────────────────────────────────────
//
// Atomic UPDATE … RETURNING — SQLite serializes writes, so two workers can't both
// claim the same row. The WHERE clause is the heart of correctness:
//   - status='failed'              → only retry-able rows
//   - next_retry_at <= now         → only ready-to-go rows
//   - worker_id IS NULL OR lease_expires_at < now
//                                  → unclaimed, OR lease has expired (worker died)
function claimBatch(now, leaseUntil) {
  const stmt = sqlite.prepare(`
    UPDATE webhook_deliveries
       SET worker_id = ?, lease_expires_at = ?
     WHERE id IN (
       SELECT id FROM webhook_deliveries
        WHERE status = 'failed'
          AND next_retry_at IS NOT NULL
          AND next_retry_at <= ?
          AND (worker_id IS NULL OR lease_expires_at < ?)
        ORDER BY next_retry_at ASC
        LIMIT ?
     )
     RETURNING id, webhook_id, event_id, event, payload, attempt
  `);
  return stmt.all(WORKER_ID, leaseUntil, now, now, BATCH_SIZE);
}

function releaseLease(deliveryId, fields) {
  // fields can include status, http_status, error, next_retry_at, completed_at
  const sets = [];
  const args = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    args.push(v);
  }
  sets.push('worker_id = NULL', 'lease_expires_at = NULL');
  args.push(deliveryId, WORKER_ID);
  // Only release if WE still own the lease (avoid stomping on a re-claim if we were slow)
  sqlite.prepare(`UPDATE webhook_deliveries SET ${sets.join(', ')} WHERE id = ? AND worker_id = ?`).run(...args);
}

// Try one delivery; record the result; if failed and attempts remain, schedule next try.
async function attempt(hook, eventId, event, body, attemptNum) {
  const id = newId('whd_');
  await db.insert(webhookDeliveries).values({
    id, webhookId: hook.id, eventId, event, payload: body,
    attempt: attemptNum, status: 'queued',
  });

  const sig = sign(hook.secret, body);
  let httpStatus = 0, errMsg = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Mandate-Signature': `sha256=${sig}`,
        'X-Mandate-Webhook-Id': hook.id,
        'X-Mandate-Event-Id': eventId,
        'X-Mandate-Attempt': String(attemptNum),
        'User-Agent': 'Mandate-Webhook/1.0',
      },
      body,
      signal: ctrl.signal,
    });
    clearTimeout(t);
    httpStatus = res.status;
    if (!res.ok) errMsg = `HTTP ${res.status}`;
  } catch (e) {
    errMsg = e.message?.slice(0, 200) || 'delivery failed';
  }

  const success = httpStatus >= 200 && httpStatus < 300;
  if (success) {
    await db.update(webhookDeliveries).set({
      status: 'success', httpStatus, completedAt: new Date(), error: null, nextRetryAt: null,
    }).where(eq(webhookDeliveries.id, id));
    await db.update(webhooks).set({
      lastDeliveryAt: new Date(), lastStatus: httpStatus, lastError: null,
    }).where(eq(webhooks.id, hook.id));
    return { id, success: true };
  }

  const moreAttempts = attemptNum < MAX_ATTEMPTS;
  const nextRetryAt = moreAttempts ? new Date(Date.now() + delayForAttempt(attemptNum)) : null;
  await db.update(webhookDeliveries).set({
    status: moreAttempts ? 'failed' : 'giving_up',
    httpStatus, error: errMsg, nextRetryAt, completedAt: new Date(),
  }).where(eq(webhookDeliveries.id, id));
  await db.update(webhooks).set({
    lastDeliveryAt: new Date(), lastStatus: httpStatus, lastError: errMsg,
  }).where(eq(webhooks.id, hook.id));
  return { id, success: false, moreAttempts };
}

// Periodic retry worker — polls for due-and-unclaimed rows, claims a batch atomically,
// processes each (with the lease held), then releases.
let workerStarted = false;
export function startWebhookWorker() {
  if (workerStarted) return;
  workerStarted = true;
  setInterval(processRetries, RETRY_TICK_MS).unref?.();
}

export async function processRetries() {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const leaseUntilEpoch = nowEpoch + Math.floor(LEASE_MS / 1000);

  const claimed = claimBatch(nowEpoch, leaseUntilEpoch);
  if (!claimed.length) return { claimed: 0 };

  let processed = 0;
  for (const d of claimed) {
    try {
      const hook = (await db.select().from(webhooks).where(eq(webhooks.id, d.webhook_id)).limit(1))[0];
      if (!hook || !hook.active) {
        releaseLease(d.id, { status: 'giving_up' });
        continue;
      }
      // Mark this prior failed row as 'giving_up' (we won't reuse it; new attempt is its own row)
      releaseLease(d.id, { status: 'giving_up' });
      // Make a new attempt (which inserts a fresh delivery row at attempt+1)
      await attempt(hook, d.event_id, d.event, d.payload, d.attempt + 1);
      processed++;
    } catch (e) {
      // On unexpected error, release lease so another worker can retry.
      try { releaseLease(d.id, {}); } catch {}
    }
  }
  return { claimed: claimed.length, processed };
}

// Public: queue stats for monitoring UI.
export async function queueStats() {
  const rows = sqlite.prepare(`
    SELECT
      SUM(CASE WHEN status = 'failed' AND (next_retry_at IS NOT NULL) AND next_retry_at <= ? AND (worker_id IS NULL OR lease_expires_at < ?) THEN 1 ELSE 0 END) AS due,
      SUM(CASE WHEN status = 'failed' AND worker_id IS NOT NULL AND lease_expires_at >= ? THEN 1 ELSE 0 END) AS in_flight,
      SUM(CASE WHEN status = 'failed' AND (next_retry_at IS NULL OR next_retry_at > ?) THEN 1 ELSE 0 END) AS waiting,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_total,
      SUM(CASE WHEN status = 'giving_up' THEN 1 ELSE 0 END) AS giving_up_total,
      COUNT(*) AS total
    FROM webhook_deliveries
  `).get(
    Math.floor(Date.now()/1000),
    Math.floor(Date.now()/1000),
    Math.floor(Date.now()/1000),
    Math.floor(Date.now()/1000),
  );

  const activeWorkers = sqlite.prepare(`
    SELECT worker_id AS workerId, COUNT(*) AS in_flight, MAX(lease_expires_at) AS lease_expires_at
    FROM webhook_deliveries
    WHERE worker_id IS NOT NULL AND lease_expires_at >= ?
    GROUP BY worker_id
  `).all(Math.floor(Date.now()/1000));

  return {
    workerId: WORKER_ID,
    leaseMs: LEASE_MS,
    tickMs: RETRY_TICK_MS,
    batchSize: BATCH_SIZE,
    counts: rows || { due: 0, in_flight: 0, waiting: 0, success_total: 0, giving_up_total: 0, total: 0 },
    activeWorkers,
  };
}

// Manual retry for a failed delivery (admin-triggered).
export async function retryDelivery(deliveryId) {
  const d = (await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId)).limit(1))[0];
  if (!d) throw new Error('delivery not found');
  const hook = (await db.select().from(webhooks).where(eq(webhooks.id, d.webhookId)).limit(1))[0];
  if (!hook) throw new Error('webhook not found');
  await db.update(webhookDeliveries).set({ status: 'giving_up' }).where(eq(webhookDeliveries.id, d.id));
  await attempt(hook, d.eventId, d.event, d.payload, 1);
}
