// Webhook dispatcher with delivery log + exponential backoff retry.
//
// Every event creates a delivery row per matching webhook. Initial attempt is immediate.
// On failure (non-2xx, network error), schedule next attempt at exponentially backed-off `next_retry_at`.
// A periodic worker picks up `status='failed' AND next_retry_at <= now` and retries.
//
// HMAC-SHA256 signature in `X-Mandate-Signature: sha256=<hex>` header.
import { createHmac, randomUUID, randomBytes } from 'crypto';
import { db } from '../db/index.js';
import { webhooks, webhookDeliveries } from '../db/schema.js';
import { and, eq, lte } from 'drizzle-orm';

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 30_000;        // 30s, then 1m, 2m, 4m, 8m
const RETRY_TICK_MS = 15_000;        // worker polls every 15s

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
  // attempt 1 -> 30s, 2 -> 60s, 3 -> 120s, 4 -> 240s
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

  // Filter by event subscriptions
  const targets = list.filter(w => {
    let evs = ['*']; try { evs = JSON.parse(w.events || '["*"]'); } catch {}
    return Array.isArray(evs) && evs.some(g => eventMatches(g, event));
  });

  await Promise.all(targets.map(w => attempt(w, eventId, event, body, 1)));
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
    return;
  }

  // Failure: schedule retry or give up
  const moreAttempts = attemptNum < MAX_ATTEMPTS;
  const nextRetryAt = moreAttempts ? new Date(Date.now() + delayForAttempt(attemptNum)) : null;
  await db.update(webhookDeliveries).set({
    status: moreAttempts ? 'failed' : 'giving_up',
    httpStatus, error: errMsg, nextRetryAt, completedAt: new Date(),
  }).where(eq(webhookDeliveries.id, id));
  await db.update(webhooks).set({
    lastDeliveryAt: new Date(), lastStatus: httpStatus, lastError: errMsg,
  }).where(eq(webhooks.id, hook.id));
}

// Periodic retry worker — runs once per RETRY_TICK_MS.
let workerStarted = false;
export function startWebhookWorker() {
  if (workerStarted) return;
  workerStarted = true;
  setInterval(processRetries, RETRY_TICK_MS).unref?.();
}

async function processRetries() {
  const now = new Date();
  // Find failed deliveries due for retry
  const due = await db.select().from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.status, 'failed'), lte(webhookDeliveries.nextRetryAt, now)))
    .limit(50);
  if (!due.length) return;

  for (const d of due) {
    const hook = (await db.select().from(webhooks).where(eq(webhooks.id, d.webhookId)).limit(1))[0];
    if (!hook || !hook.active) continue;
    // Mark prior attempt as resolved (we won't retry that row again — we create a new delivery row)
    await db.update(webhookDeliveries).set({ status: 'giving_up' }).where(eq(webhookDeliveries.id, d.id));
    // Make a new attempt with attempt+1
    await attempt(hook, d.eventId, d.event, d.payload, d.attempt + 1);
  }
}

// Manual retry for a failed delivery (admin-triggered).
export async function retryDelivery(deliveryId) {
  const d = (await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId)).limit(1))[0];
  if (!d) throw new Error('delivery not found');
  const hook = (await db.select().from(webhooks).where(eq(webhooks.id, d.webhookId)).limit(1))[0];
  if (!hook) throw new Error('webhook not found');
  await db.update(webhookDeliveries).set({ status: 'giving_up' }).where(eq(webhookDeliveries.id, d.id));
  await attempt(hook, d.eventId, d.event, d.payload, 1);   // reset to attempt 1 for manual retry
}
