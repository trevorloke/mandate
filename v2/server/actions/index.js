// The Action registry — the only write path. Each action declares its name,
// the roles allowed to invoke it, a zod input contract, and a transactional
// handler that performs typed table writes and emits events. The palette,
// buttons, and the public API all call the same registry via POST
// /api/actions/:name; there is no other way to mutate campaign data.
import { z } from 'zod';
import { zodFor } from '@mandate/shared/registry';
import { newId } from '../lib/events.js';
import { checkCap } from '../lib/cap.js';

const MONEY_ROLES = ['manager', 'treasurer', 'staff'];
const PEOPLE_ROLES = ['manager', 'treasurer', 'staff'];
const FILING_ROLES = ['manager', 'treasurer'];

const personInput = z.object({
  kind: z.enum(['person', 'org']).default('person'),
  name: z.string().trim().min(1).max(300),
  email: z.string().email().max(320).nullish(),
  phone: z.string().max(40).nullish(),
  address: z.string().max(1000).nullish(),
});

const rowToPerson = (r) => ({
  id: r.id, kind: r.kind, name: r.name, email: r.email,
  phone: r.phone, address: r.address,
});

export const ACTIONS = {
  'person.create': {
    roles: PEOPLE_ROLES,
    input: personInput,
    handler: async (tx, ctx, input, emit) => {
      const id = newId();
      await tx.query(
        `insert into persons (id, workspace_id, kind, name, email, phone, address)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [id, ctx.workspaceId, input.kind, input.name, input.email || null,
         input.phone || null, input.address || null],
      );
      const payload = { id, ...input };
      emit('person', id, 'create', payload);
      return { person: payload };
    },
  },

  'person.update': {
    roles: PEOPLE_ROLES,
    input: personInput.partial().extend({ id: z.uuid() }),
    handler: async (tx, ctx, input, emit) => {
      const { id, ...patch } = input;
      const cur = (await tx.query(
        'select * from persons where id = $1 and workspace_id = $2 and deleted_at is null',
        [id, ctx.workspaceId],
      )).rows[0];
      if (!cur) throw httpError(404, 'person not found');
      const next = { ...rowToPerson(cur), ...patch };
      await tx.query(
        `update persons set kind = $3, name = $4, email = $5, phone = $6, address = $7, updated_at = now()
         where id = $1 and workspace_id = $2`,
        [id, ctx.workspaceId, next.kind, next.name, next.email || null,
         next.phone || null, next.address || null],
      );
      emit('person', id, 'update', patch);
      return { person: next };
    },
  },

  'gift.log': {
    roles: MONEY_ROLES,
    input: zodFor('gift'),
    handler: async (tx, ctx, input, emit) => {
      const donor = (await tx.query(
        'select id, name from persons where id = $1 and workspace_id = $2 and deleted_at is null',
        [input.person_id, ctx.workspaceId],
      )).rows[0];
      if (!donor) throw httpError(400, 'donor not found in this workspace — create the person first');

      const id = newId();
      await tx.query(
        `insert into gifts (id, workspace_id, person_id, amount_cents, date, method, note)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [id, ctx.workspaceId, input.person_id, input.amount_cents, input.date,
         input.method || null, input.note || null],
      );

      // Cap check inside the same transaction: the SUM already includes this
      // gift, so the exact crossing record is the one that gets flagged.
      const cap = await checkCap(tx, {
        workspaceId: ctx.workspaceId,
        personId: input.person_id,
        date: input.date,
        jurisdiction: ctx.workspace.jurisdiction,
        settings: ctx.workspace.settings,
      });
      let flagReason = null;
      if (cap.checked && cap.over) {
        flagReason = `${donor.name} is at $${(cap.totalCents / 100).toFixed(2)} for ${cap.year} — over the $${(cap.capCents / 100).toFixed(2)} limit (${cap.source})`;
        await tx.query(
          'update gifts set flagged = true, flag_reason = $3 where id = $1 and workspace_id = $2',
          [id, ctx.workspaceId, flagReason],
        );
      }

      const payload = { id, ...input, flagged: !!flagReason, flag_reason: flagReason };
      emit('gift', id, 'create', payload);
      return { gift: payload, compliance: cap };
    },
  },

  'gift.void': {
    roles: MONEY_ROLES,
    input: z.object({ id: z.uuid() }),
    handler: async (tx, ctx, input, emit) => {
      const n = await tx.query(
        'update gifts set deleted_at = now() where id = $1 and workspace_id = $2 and deleted_at is null',
        [input.id, ctx.workspaceId],
      );
      if (n.affectedRows === 0) throw httpError(404, 'gift not found');
      emit('gift', input.id, 'void', {});
      return { id: input.id };
    },
  },

  'gift.restore': {
    roles: MONEY_ROLES,
    input: z.object({ id: z.uuid() }),
    handler: async (tx, ctx, input, emit) => {
      const n = await tx.query(
        'update gifts set deleted_at = null where id = $1 and workspace_id = $2 and deleted_at is not null',
        [input.id, ctx.workspaceId],
      );
      if (n.affectedRows === 0) throw httpError(404, 'gift not found in trash');
      emit('gift', input.id, 'restore', {});
      return { id: input.id };
    },
  },

  'filing.create': {
    roles: FILING_ROLES,
    input: zodFor('filing'),
    handler: async (tx, ctx, input, emit) => {
      const id = newId();
      await tx.query(
        `insert into filings (id, workspace_id, name, due_date, status, note)
         values ($1, $2, $3, $4, $5, $6)`,
        [id, ctx.workspaceId, input.name, input.due_date, input.status, input.note || null],
      );
      const payload = { id, ...input };
      emit('filing', id, 'create', payload);
      return { filing: payload };
    },
  },

  'filing.update': {
    roles: FILING_ROLES,
    input: zodFor('filing').partial().extend({ id: z.uuid() }),
    handler: async (tx, ctx, input, emit) => {
      const { id, ...patch } = input;
      const cur = (await tx.query(
        'select name, due_date, status, note from filings where id = $1 and workspace_id = $2 and deleted_at is null',
        [id, ctx.workspaceId],
      )).rows[0];
      if (!cur) throw httpError(404, 'filing not found');
      const next = {
        name: patch.name ?? cur.name,
        due_date: patch.due_date ?? isoDate(cur.due_date),
        status: patch.status ?? cur.status,
        note: patch.note ?? cur.note,
      };
      await tx.query(
        `update filings set name = $3, due_date = $4, status = $5, note = $6, updated_at = now()
         where id = $1 and workspace_id = $2`,
        [id, ctx.workspaceId, next.name, next.due_date, next.status, next.note || null],
      );
      emit('filing', id, 'update', patch);
      return { filing: { id, ...next } };
    },
  },
};

const isoDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

export const httpError = (status, message) => {
  const e = new Error(message);
  e.status = status;
  return e;
};
