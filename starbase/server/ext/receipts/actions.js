// receipt.* actions — the only writes this feature makes from the desk.
//   receipt.send       email one receipt (Send / Send again)
//   receipt.sendAll    email every receipt not sent yet that can be
//   receipt.settings   financial agent, threshold, tax line, footer, disclosure
// Sends happen inside the action, so what the screen says afterwards is what
// the email provider answered. Without email connected they refuse plainly.
import { z } from 'zod';
import { emailConfigured } from '../../lib/notify.js';
import { httpError } from '../../actions/util.js';
import { MONEY_ROLES, AGENT_ROLES, DEFAULTS, deliver, donorEmail } from './core.js';

const SEND_ALL_MAX = 100;
const text = (max) => z.string().max(max).nullish();
const cents = () => z.number().int().min(0).max(100_000_000).optional();

const sendable = (r) => {
  if (r.voided_at) return 'This receipt is void';
  if (r.sample) return 'Sample receipts are never sent';
  return null;
};

export const actions = {
  'receipt.send': {
    roles: MONEY_ROLES,
    input: z.object({ id: z.uuid() }),
    handler: async (tx, ctx, input, emit) => {
      const r = (await tx.query('select * from receipts where id = $1 and workspace_id = $2 for update',
        [input.id, ctx.workspaceId])).rows[0];
      if (!r) throw httpError(404, 'receipt not found');
      const why = sendable(r);
      if (why) throw httpError(409, why);
      const email = await donorEmail(tx, ctx.workspaceId, r.person_id);
      if (!email) throw httpError(409, 'No email on file for this donor');
      if (!emailConfigured()) throw httpError(409, 'Email isn’t connected — nothing was sent');
      const res = await deliver(tx, { workspaceId: ctx.workspaceId, emit }, r, { email, base: ctx.publicUrl });
      return { id: r.id, number: r.number, email: res.status, detail: res.detail };
    },
  },

  'receipt.sendAll': {
    roles: MONEY_ROLES,
    input: z.object({}).passthrough(),
    handler: async (tx, ctx, _input, emit) => {
      if (!emailConfigured()) throw httpError(409, 'Email isn’t connected — nothing was sent');
      const todo = (await tx.query(
        `select r.*, nullif(trim(p.email), '') as email from receipts r join persons p on p.id = r.person_id
         where r.workspace_id = $1 and r.voided_at is null and not r.sample
           and r.email_status is distinct from 'sent' and nullif(trim(p.email), '') is not null
         order by r.series, r.seq limit $2 for update of r`,
        [ctx.workspaceId, SEND_ALL_MAX + 1],
      )).rows;
      let sent = 0; let failed = 0;
      for (const r of todo.slice(0, SEND_ALL_MAX)) {
        const res = await deliver(tx, { workspaceId: ctx.workspaceId, emit }, r, { email: r.email, base: ctx.publicUrl });
        if (res.status === 'sent') sent += 1; else failed += 1;
      }
      return { tried: Math.min(todo.length, SEND_ALL_MAX), sent, failed, more: todo.length > SEND_ALL_MAX };
    },
  },

  'receipt.settings': {
    roles: AGENT_ROLES,
    input: z.object({
      threshold_cents: cents(),
      disclosure_cents: cents(),
      agent_name: text(200),
      agent_contact: text(300),
      notice: text(300),
      footer: text(500),
    }),
    handler: async (tx, ctx, input, emit) => {
      const cur = (await tx.query('select * from receipt_settings where workspace_id = $1 for update', [ctx.workspaceId])).rows[0];
      const has = (k) => Object.hasOwn(input, k) && input[k] !== undefined;
      const pick = (k, fallback) => (has(k) ? (typeof input[k] === 'string' ? input[k].trim() || null : input[k]) : (cur ? cur[k] : fallback));
      const next = {
        threshold_cents: pick('threshold_cents', DEFAULTS.threshold_cents) ?? DEFAULTS.threshold_cents,
        disclosure_cents: pick('disclosure_cents', DEFAULTS.disclosure_cents) ?? DEFAULTS.disclosure_cents,
        agent_name: pick('agent_name', null),
        agent_contact: pick('agent_contact', null),
        notice: pick('notice', null),
        footer: has('footer') ? pick('footer', null) : (cur ? cur.footer : DEFAULTS.footer),
      };
      await tx.query(
        `insert into receipt_settings (workspace_id, threshold_cents, disclosure_cents, agent_name, agent_contact, notice, footer, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, now())
         on conflict (workspace_id) do update set threshold_cents = $2, disclosure_cents = $3, agent_name = $4,
           agent_contact = $5, notice = $6, footer = $7, updated_at = now()`,
        [ctx.workspaceId, next.threshold_cents, next.disclosure_cents, next.agent_name, next.agent_contact, next.notice, next.footer],
      );
      const changed = Object.fromEntries(Object.keys(next).filter(has).map((k) => [k, next[k]]));
      emit('receipt_settings', ctx.workspaceId, 'update', changed);
      return { settings: next };
    },
  },
};
