// Tide worker — periodically refreshes attention readings for every active topic
// on its cadence (the brief's 4-hour refresh). Mirrors the social-worker liveness
// model so the Tide status panel can prove the pipeline is alive. Readings are
// idempotent per time-window, so overlapping ticks across processes are harmless.
import { randomBytes } from 'crypto';
import { dueTopics, generateReading } from './tide/service.js';

const WORKER_ID = 'tw_' + randomBytes(4).toString('hex');
const TICK_MS = 5 * 60 * 1000;       // check for due topics every 5 min
const startedAt = Date.now();

let timer = null;
const pass = { lastRunAt: null, lastDurationMs: null, lastError: null, runs: 0, lastRefreshed: 0 };

// One pass: find due topics and generate a reading for each. Exported for tests.
export async function runDuePass(now = Date.now()) {
  const t0 = Date.now();
  let refreshed = 0;
  try {
    const due = await dueTopics(now);
    for (const t of due) {
      try { await generateReading(t.workspaceId, t.id, { at: now }); refreshed++; }
      catch (e) { console.warn('[tide-worker] topic refresh failed', t.id, e.message); }
    }
    pass.lastError = null;
  } catch (e) {
    pass.lastError = e.message;
  } finally {
    pass.lastRunAt = Date.now();
    pass.lastDurationMs = Date.now() - t0;
    pass.runs += 1;
    pass.lastRefreshed = refreshed;
  }
  return refreshed;
}

export function startTideWorker() {
  if (timer) return;
  timer = setInterval(() => { runDuePass().catch(() => {}); }, TICK_MS);
  if (timer.unref) timer.unref();
}

export function stopTideWorker() {
  if (timer) { clearInterval(timer); timer = null; }
}

export function getTideWorkerStatus() {
  return {
    id: WORKER_ID,
    running: !!timer,
    startedAt,
    uptimeMs: Date.now() - startedAt,
    tickMs: TICK_MS,
    pass: { ...pass },
  };
}
