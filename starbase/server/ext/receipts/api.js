// Receipts reads (signed in; mounted under /api). Money roles only — and
// volunteers are refused every path here by deskOnlyReads before a handler
// runs, so nothing about receipts ever reaches their browser.
//   GET /receipts                  the list, settings, counts, email on/off
//   GET /receipts/gift/:giftId     the receipt line under a gift on Money
//   GET /receipts/:id              one receipt, as printed, + the donor link
//   GET /receipts/disclosure.csv   contributors over the disclosure amount (manager/treasurer)
//   GET /receipts/register.csv     every receipt, in number order (manager/treasurer)
import { Hono } from 'hono';
import { emailConfigured } from '../../lib/notify.js';
import {
  MONEY_ROLES, AGENT_ROLES, loadSettings, statusOf, docOf, campaignName, linkFor, addressOf, isoDay, methodWord,
} from './core.js';

export const api = new Hono();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tzOf = (ctx) => ctx.workspace?.settings?.tz || 'America/Vancouver';

const deskOnly = async (c, next) => {
  if (!MONEY_ROLES.includes(c.get('ctx').role)) return c.json({ error: 'volunteers cannot view this' }, 403);
  await next();
};
api.use('/receipts', deskOnly);
api.use('/receipts/*', deskOnly);
// The filing exports: the financial agent's people only.
const agentOnly = (c) => (AGENT_ROLES.includes(c.get('ctx').role) ? null : c.json({ error: 'managers and treasurers only' }, 403));

const ROW = `r.id, r.number, r.series, r.seq, r.gift_id, r.person_id, r.donor_name, r.donor_address, r.amount_cents,
  r.received_on, r.method, r.sample, r.voided_at, r.email_status, r.sent_at, r.sent_count, r.token, r.created_at,
  (nullif(trim(p.email), '') is not null) as has_email`;

const shape = (r, ctx) => ({
  id: r.id,
  number: r.number,
  gift_id: r.gift_id,
  person_id: r.person_id,
  donor_name: r.donor_name,
  amount_cents: Number(r.amount_cents),
  received_on: isoDay(r.received_on),
  method: r.method || null,
  sample: !!r.sample,
  void: !!r.voided_at,
  sent_at: r.sent_at || null,
  sent_count: Number(r.sent_count || 0),
  has_email: !!r.has_email,
  status: statusOf(r, { emailOn: emailConfigured(), hasEmail: !!r.has_email, timeZone: tzOf(ctx) }),
});

// What Send would do for this receipt right now.
const canSend = (r) => !r.voided_at && !r.sample && !!r.has_email && emailConfigured();

api.get('/receipts', async (c) => {
  const ctx = c.get('ctx');
  const db = c.get('db');
  const settings = await loadSettings(db, ctx.workspaceId);
  const rows = (await db.query(
    `select ${ROW} from receipts r left join persons p on p.id = r.person_id
     where r.workspace_id = $1 order by r.created_at desc, r.seq desc limit 2000`,
    [ctx.workspaceId],
  )).rows;
  const unsent = rows.filter((r) => !r.voided_at && !r.sample && r.email_status !== 'sent' && r.has_email);
  return c.json({
    receipts: rows.map((r) => shape(r, ctx)),
    settings,
    emailConfigured: emailConfigured(),
    canManage: AGENT_ROLES.includes(ctx.role),
    counts: { total: rows.length, unsent: unsent.length, sendable: emailConfigured() ? unsent.length : 0 },
  });
});

api.get('/receipts/disclosure.csv', async (c) => {
  const no = agentOnly(c);
  if (no) return no;
  const ctx = c.get('ctx');
  const db = c.get('db');
  const settings = await loadSettings(db, ctx.workspaceId);
  // Every live gift (voids excluded), keyed by donor — never by name.
  const rows = (await db.query(
    `select g.id, g.person_id, g.date, g.amount_cents, p.name, p.address, p.unit, p.city, p.postal,
            r.number, r.donor_address
     from gifts g join persons p on p.id = g.person_id
     left join receipts r on r.workspace_id = g.workspace_id and r.gift_id = g.id
     where g.workspace_id = $1 and g.deleted_at is null
     order by g.date, g.created_at`,
    [ctx.workspaceId],
  )).rows;
  const groups = new Map();
  for (const g of rows) {
    const k = g.person_id;
    if (!groups.has(k)) groups.set(k, { id: k, name: g.name, address: addressOf(g), gifts: [], total: 0 });
    const grp = groups.get(k);
    grp.gifts.push(g);
    grp.total += Number(g.amount_cents);
    if (!grp.address && g.donor_address) grp.address = g.donor_address;
  }
  // Contributors A–Z (plain character order, the same on every database),
  // each one's contributions oldest first.
  const key = (grp) => `${String(grp.name || '').toLowerCase()}\u0000${grp.id}`;
  const sorted = [...groups.values()].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const lines = [['Contributor', 'Home address', 'Contributor total', 'Date received', 'Amount', 'Receipt']];
  for (const grp of sorted) {
    if (grp.total <= settings.disclosure_cents) continue;
    for (const g of grp.gifts) {
      lines.push([grp.name, grp.address || '', dollars(grp.total), isoDay(g.date), dollars(g.amount_cents), g.number || '']);
    }
  }
  return csv(c, `disclosure-over-${Math.round(settings.disclosure_cents / 100)}-${today()}.csv`, lines);
});

api.get('/receipts/register.csv', async (c) => {
  const no = agentOnly(c);
  if (no) return no;
  const ctx = c.get('ctx');
  const db = c.get('db');
  const rows = (await db.query(
    `select ${ROW} from receipts r left join persons p on p.id = r.person_id
     where r.workspace_id = $1 order by (r.series = 'sample'), r.series, r.seq`,
    [ctx.workspaceId],
  )).rows;
  const lines = [['Receipt', 'Status', 'Date received', 'Contributor', 'Home address', 'Amount', 'Method', 'Sent']];
  for (const r of rows) {
    const s = statusOf(r, { emailOn: emailConfigured(), hasEmail: !!r.has_email, timeZone: tzOf(ctx) });
    lines.push([r.number, s.word, isoDay(r.received_on), r.donor_name, r.donor_address || '', dollars(r.amount_cents),
      methodWord(r.method), r.sent_at ? new Date(r.sent_at).toISOString().slice(0, 10) : '']);
  }
  return csv(c, `receipts-${today()}.csv`, lines);
});

api.get('/receipts/gift/:giftId', async (c) => {
  const ctx = c.get('ctx');
  if (!UUID_RE.test(c.req.param('giftId'))) return c.json({ error: 'not found' }, 404);
  const db = c.get('db');
  const r = (await db.query(
    `select ${ROW} from receipts r left join persons p on p.id = r.person_id
     where r.workspace_id = $1 and r.gift_id = $2`,
    [ctx.workspaceId, c.req.param('giftId')],
  )).rows[0];
  const settings = await loadSettings(db, ctx.workspaceId);
  return c.json({ receipt: r ? shape(r, ctx) : null, threshold_cents: settings.threshold_cents });
});

api.get('/receipts/:id', async (c) => {
  const ctx = c.get('ctx');
  if (!UUID_RE.test(c.req.param('id'))) return c.json({ error: 'not found' }, 404);
  const db = c.get('db');
  const r = (await db.query(
    `select ${ROW} from receipts r left join persons p on p.id = r.person_id
     where r.workspace_id = $1 and r.id = $2`,
    [ctx.workspaceId, c.req.param('id')],
  )).rows[0];
  if (!r) return c.json({ error: 'not found' }, 404);
  const settings = await loadSettings(db, ctx.workspaceId);
  return c.json({
    receipt: shape(r, ctx),
    doc: docOf(r, settings, await campaignName(db, ctx.workspaceId)),
    link: linkFor(ctx.publicUrl, r.token),
    canSend: canSend(r),
    emailConfigured: emailConfigured(),
  });
});

// ── CSV ──
const dollars = (cents) => (Number(cents || 0) / 100).toFixed(2);
const today = () => new Date().toISOString().slice(0, 10);
// A cell a spreadsheet would run as a formula is quoted as text.
const cell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (c, filename, lines) => {
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="${filename}"`);
  c.header('Cache-Control', 'no-store');
  return c.body(`${lines.map((l) => l.map(cell).join(',')).join('\r\n')}\r\n`);
};
