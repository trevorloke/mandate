// Scheduled reports worker.
// Polls every minute for reports whose next_run_at <= now, generates a CSV
// for the report's kind, emails it to the target, and reschedules.
//
// Kinds:
//   bucket_csv   — CSV of module_data for (module, kind) with optional filter
//   audit_log    — CSV of audit_log entries since last run (or since create)
//
// Email backend chosen via MANDATE_EMAIL_BACKEND. Use 'capture' in tests.
import { db } from '../db/index.js';
import { scheduledReports, moduleData, auditLog, users, workspaces } from '../db/schema.js';
import { and, eq, gte, isNull, isNotNull, lte, asc, desc } from 'drizzle-orm';
import { sendEmail } from './email.js';
import { socialAnalyticsRows, socialAnalyticsCsvFromRows } from './social/report.js';

const POLL_MS = Number(process.env.MANDATE_REPORTS_POLL_MS || 60_000);

function tryParse(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }

function csvEscape(s) {
  if (s === null || s === undefined) return '';
  s = String(s);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function rowsToCsv(headers, rows) {
  const head = headers.join(',');
  const body = rows.map(r => headers.map(h => csvEscape(r[h])).join(',')).join('\n');
  return head + '\n' + body + '\n';
}

// ── Generators ─────────────────────────────────────────────────────────

async function generateBucketCsv({ workspaceId, params }) {
  const { module, kind, includeDeleted = false } = params;
  if (!module || !kind) throw new Error('bucket_csv requires params.module and params.kind');
  const clauses = [eq(moduleData.workspaceId, workspaceId), eq(moduleData.module, module), eq(moduleData.kind, kind)];
  if (!includeDeleted) clauses.push(isNull(moduleData.deletedAt));
  const rows = await db.select().from(moduleData).where(and(...clauses)).orderBy(desc(moduleData.updatedAt));
  // Flatten: id, createdAt, updatedAt + all data keys union
  const flat = rows.map(r => {
    const data = tryParse(r.data, {});
    return { id: r.id, createdAt: r.createdAt?.toISOString?.() || '', updatedAt: r.updatedAt?.toISOString?.() || '', ...data };
  });
  const keys = new Set(['id', 'createdAt', 'updatedAt']);
  flat.forEach(o => Object.keys(o).forEach(k => keys.add(k)));
  return {
    csv: rowsToCsv(Array.from(keys), flat),
    count: rows.length,
    summary: `${rows.length} ${module}/${kind} record${rows.length === 1 ? '' : 's'}`,
  };
}

async function generateAuditLog({ workspaceId, params, lastRunAt }) {
  // Audit_log isn't workspace-scoped at the table level — but actions on a workspace's
  // resources are joined via user.workspace_id. For simplicity, return entries by users
  // in this workspace. (At real scale, an action_workspace_id column would be cleaner.)
  const since = lastRunAt || new Date(0);
  const wsUsers = await db.select({ id: users.id }).from(users).where(eq(users.workspaceId, workspaceId));
  const userIds = new Set(wsUsers.map(u => u.id));
  const rows = await db.select().from(auditLog)
    .where(gte(auditLog.createdAt, since))
    .orderBy(asc(auditLog.createdAt));
  const ours = rows.filter(r => !r.userId || userIds.has(r.userId));
  const flat = ours.map(r => ({
    id: r.id, action: r.action, target: r.target || '', userId: r.userId || '',
    createdAt: r.createdAt?.toISOString?.() || '',
    meta: r.meta || '',
  }));
  return {
    csv: rowsToCsv(['id', 'action', 'target', 'userId', 'createdAt', 'meta'], flat),
    count: ours.length,
    summary: `${ours.length} audit entries since ${since.toISOString()}`,
  };
}

async function generateSocialAnalytics({ workspaceId }) {
  const rows = await socialAnalyticsRows(workspaceId);
  const totalEng = rows.reduce((s, r) => s + r.engagement, 0);
  return {
    csv: socialAnalyticsCsvFromRows(rows),
    count: rows.length,
    summary: `${rows.length} published post${rows.length === 1 ? '' : 's'}, ${totalEng} total engagement`,
  };
}

const GENERATORS = {
  bucket_csv:       generateBucketCsv,
  audit_log:        generateAuditLog,
  social_analytics: generateSocialAnalytics,
};

// ── Run a single report ─────────────────────────────────────────────────
export async function runReport(report) {
  const params = tryParse(report.params, {});
  const gen = GENERATORS[report.kind];
  if (!gen) throw new Error(`unknown report kind: ${report.kind}`);
  const out = await gen({ workspaceId: report.workspaceId, params, lastRunAt: report.lastRunAt });
  const ws = (await db.select().from(workspaces).where(eq(workspaces.id, report.workspaceId)).limit(1))[0];
  const subject = `[Mandate] ${report.name} — ${out.summary}`;
  const text = [
    `Scheduled report from ${ws?.name || 'your workspace'}.`,
    '',
    `Report: ${report.name}`,
    `Kind:   ${report.kind}`,
    `Window: ${report.lastRunAt ? report.lastRunAt.toISOString() : 'all time'} → ${new Date().toISOString()}`,
    `Rows:   ${out.count}`,
    '',
    'CSV attached inline below:',
    '',
    '──',
    out.csv,
  ].join('\n');
  await sendEmail({
    to: report.targetEmail,
    subject,
    text,
    attachments: [{ filename: `${report.name.replace(/[^A-Za-z0-9-_]+/g, '_')}.csv`, content: out.csv, contentType: 'text/csv' }],
  });
  return { count: out.count, summary: out.summary };
}

// ── Worker tick ─────────────────────────────────────────────────────────
async function tick() {
  const now = new Date();
  const due = await db.select().from(scheduledReports)
    .where(and(
      eq(scheduledReports.active, true),
      isNotNull(scheduledReports.nextRunAt),
      lte(scheduledReports.nextRunAt, now),
    ));
  for (const r of due) {
    let status = 'ok', errMsg = null;
    try {
      await runReport(r);
    } catch (e) {
      status = 'failed';
      errMsg = String(e.message || e).slice(0, 500);
      console.error('[reports] failed:', r.id, errMsg);
    }
    const nextRun = new Date(Date.now() + (r.intervalMinutes || 1440) * 60_000);
    await db.update(scheduledReports).set({
      lastRunAt: now,
      lastStatus: status,
      lastError: errMsg,
      nextRunAt: nextRun,
    }).where(eq(scheduledReports.id, r.id));
  }
}

let timer = null;
export function startReportsWorker() {
  if (timer) return;
  // Run once on startup so any past-due reports fire promptly, then on interval.
  tick().catch(() => {});
  timer = setInterval(() => { tick().catch(() => {}); }, POLL_MS);
  timer.unref?.();
}
export function stopReportsWorker() {
  if (timer) { clearInterval(timer); timer = null; }
}
