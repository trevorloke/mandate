// Organizing actions: turfs (draw, assign, walk), public campaign events with
// RSVPs, and donation pledges (online donations become gifts here, so every
// one passes the same entity-keyed contribution-cap check as a desk gift).
import { z } from 'zod';
import { newId } from '../lib/events.js';
import { httpError } from './util.js';
import { logGift } from '../lib/gifts.js';

const DESK_ROLES = ['manager', 'treasurer', 'staff'];
const MONEY_ROLES = ['manager', 'treasurer', 'staff'];
const uuid = () => z.uuid();
const isoTs = () => z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'expected ISO timestamp');
const latlng = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]);
const slug = () => z.string().trim().regex(/^[a-z0-9-]{2,60}$/, 'lowercase letters, digits, dashes');

export const ORGANIZE_ACTIONS = {
  // ── Turfs ──
  'turf.create': {
    roles: DESK_ROLES,
    input: z.object({
      name: z.string().trim().min(1).max(200),
      polygon: z.array(latlng).min(3).max(500),
      color: z.string().max(20).nullish(),
      notes: z.string().max(2000).nullish(),
    }),
    handler: async (tx, ctx, input, emit) => {
      const id = newId();
      await tx.query(
        'insert into turfs (id, workspace_id, name, polygon, color, notes) values ($1, $2, $3, $4, $5, $6)',
        [id, ctx.workspaceId, input.name, JSON.stringify(input.polygon), input.color || null, input.notes || null],
      );
      emit('turf', id, 'create', input);
      return { turf: { id, ...input } };
    },
  },

  'turf.update': {
    roles: DESK_ROLES,
    input: z.object({
      id: uuid(),
      name: z.string().trim().min(1).max(200).nullish(),
      polygon: z.array(latlng).min(3).max(500).nullish(),
      color: z.string().max(20).nullish(),
      notes: z.string().max(2000).nullish(),
    }),
    handler: async (tx, ctx, input, emit) => {
      const n = await tx.query(
        `update turfs set name = coalesce($3, name), polygon = coalesce($4, polygon),
           color = coalesce($5, color), notes = coalesce($6, notes)
         where id = $1 and workspace_id = $2 and deleted_at is null`,
        [input.id, ctx.workspaceId, input.name || null, input.polygon ? JSON.stringify(input.polygon) : null,
         input.color || null, input.notes ?? null],
      );
      if (n.affectedRows === 0) throw httpError(404, 'turf not found');
      const { id, ...patch } = input;
      emit('turf', id, 'update', patch);
      return { id };
    },
  },

  'turf.delete': {
    roles: DESK_ROLES,
    input: z.object({ id: uuid() }),
    handler: async (tx, ctx, input, emit) => {
      const n = await tx.query(
        'update turfs set deleted_at = now() where id = $1 and workspace_id = $2 and deleted_at is null',
        [input.id, ctx.workspaceId],
      );
      if (n.affectedRows === 0) throw httpError(404, 'turf not found');
      emit('turf', input.id, 'void', {});
      return { id: input.id };
    },
  },

  'turf.assign': {
    roles: DESK_ROLES,
    input: z.object({ turf_id: uuid(), user_id: uuid() }),
    handler: async (tx, ctx, input, emit) => {
      const turf = (await tx.query(
        'select id from turfs where id = $1 and workspace_id = $2 and deleted_at is null', [input.turf_id, ctx.workspaceId],
      )).rows[0];
      if (!turf) throw httpError(404, 'turf not found');
      const member = (await tx.query(
        'select 1 from memberships where user_id = $1 and workspace_id = $2', [input.user_id, ctx.workspaceId],
      )).rows[0];
      if (!member) throw httpError(400, 'that person is not on the team — invite them first');
      await tx.query(
        `insert into turf_members (workspace_id, turf_id, user_id) values ($1, $2, $3) on conflict do nothing`,
        [ctx.workspaceId, input.turf_id, input.user_id],
      );
      emit('turf', input.turf_id, 'update', { assigned: input.user_id });
      return input;
    },
  },

  'turf.unassign': {
    roles: DESK_ROLES,
    input: z.object({ turf_id: uuid(), user_id: uuid() }),
    handler: async (tx, ctx, input, emit) => {
      await tx.query(
        'delete from turf_members where turf_id = $1 and user_id = $2 and workspace_id = $3',
        [input.turf_id, input.user_id, ctx.workspaceId],
      );
      emit('turf', input.turf_id, 'update', { unassigned: input.user_id });
      return input;
    },
  },

  // ── Campaign events + RSVPs ──
  'cevent.create': {
    roles: DESK_ROLES,
    input: z.object({
      slug: slug(),
      title: z.string().trim().min(1).max(300),
      description: z.string().max(8000).nullish(),
      location: z.string().max(400).nullish(),
      starts_at: isoTs(),
      ends_at: isoTs().nullish(),
      capacity: z.number().int().positive().nullish(),
      public: z.boolean().default(true),
    }),
    handler: async (tx, ctx, input, emit) => {
      const id = newId();
      try {
        await tx.query(
          `insert into campaign_events (id, workspace_id, slug, title, description, location, starts_at, ends_at, capacity, public)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [id, ctx.workspaceId, input.slug, input.title, input.description || null, input.location || null,
           input.starts_at, input.ends_at || null, input.capacity ?? null, input.public],
        );
      } catch (e) {
        if (String(e.message).includes('campaign_events_workspace_id_slug_key')) {
          throw httpError(409, `an event with link '${input.slug}' already exists`);
        }
        throw e;
      }
      emit('campaign_event', id, 'create', input);
      return { event: { id, ...input } };
    },
  },

  'cevent.update': {
    roles: DESK_ROLES,
    input: z.object({
      id: uuid(),
      title: z.string().trim().min(1).max(300).nullish(),
      description: z.string().max(8000).nullish(),
      location: z.string().max(400).nullish(),
      starts_at: isoTs().nullish(),
      ends_at: isoTs().nullish(),
      capacity: z.number().int().positive().nullish(),
      public: z.boolean().nullish(),
    }),
    handler: async (tx, ctx, input, emit) => {
      const n = await tx.query(
        `update campaign_events set title = coalesce($3, title), description = coalesce($4, description),
           location = coalesce($5, location), starts_at = coalesce($6, starts_at), ends_at = coalesce($7, ends_at),
           capacity = coalesce($8, capacity), public = coalesce($9, public)
         where id = $1 and workspace_id = $2 and deleted_at is null`,
        [input.id, ctx.workspaceId, input.title || null, input.description ?? null, input.location ?? null,
         input.starts_at || null, input.ends_at || null, input.capacity ?? null, input.public ?? null],
      );
      if (n.affectedRows === 0) throw httpError(404, 'event not found');
      const { id, ...patch } = input;
      emit('campaign_event', id, 'update', patch);
      return { id };
    },
  },

  'cevent.delete': {
    roles: DESK_ROLES,
    input: z.object({ id: uuid() }),
    handler: async (tx, ctx, input, emit) => {
      const n = await tx.query(
        'update campaign_events set deleted_at = now() where id = $1 and workspace_id = $2 and deleted_at is null',
        [input.id, ctx.workspaceId],
      );
      if (n.affectedRows === 0) throw httpError(404, 'event not found');
      emit('campaign_event', input.id, 'void', {});
      return { id: input.id };
    },
  },

  'rsvp.setStatus': {
    roles: DESK_ROLES,
    input: z.object({ id: uuid(), status: z.enum(['going', 'cancelled', 'attended']) }),
    handler: async (tx, ctx, input, emit) => {
      const n = await tx.query(
        'update event_rsvps set status = $3 where id = $1 and workspace_id = $2',
        [input.id, ctx.workspaceId, input.status],
      );
      if (n.affectedRows === 0) throw httpError(404, 'RSVP not found');
      emit('rsvp', input.id, 'update', { status: input.status });
      return input;
    },
  },

  // ── Pledges: the treasurer confirms offline donations ──
  'pledge.receive': {
    roles: MONEY_ROLES,
    input: z.object({
      id: uuid(),
      method: z.enum(['card', 'etransfer', 'cheque', 'cash', 'in-kind']).default('etransfer'),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
    handler: async (tx, ctx, input, emit) => {
      const p = (await tx.query(
        `select * from pledges where id = $1 and workspace_id = $2 and status in ('pledged', 'pending') for update`,
        [input.id, ctx.workspaceId],
      )).rows[0];
      if (!p) throw httpError(404, 'open pledge not found');
      const { gift, compliance } = await logGift(tx, ctx.workspace, {
        person_id: p.person_id, amount_cents: p.amount_cents, date: input.date,
        method: input.method, cadence: p.cadence, note: `Online pledge ${p.id.slice(0, 8)}`,
      }, emit);
      await tx.query(
        `update pledges set status = 'received', gift_id = $3, updated_at = now() where id = $1 and workspace_id = $2`,
        [p.id, ctx.workspaceId, gift.id],
      );
      emit('pledge', p.id, 'update', { status: 'received', gift_id: gift.id });
      return { pledge: { id: p.id, status: 'received' }, gift, compliance };
    },
  },

  'pledge.cancel': {
    roles: MONEY_ROLES,
    input: z.object({ id: uuid() }),
    handler: async (tx, ctx, input, emit) => {
      const n = await tx.query(
        `update pledges set status = 'cancelled', updated_at = now()
         where id = $1 and workspace_id = $2 and status in ('pledged', 'pending')`,
        [input.id, ctx.workspaceId],
      );
      if (n.affectedRows === 0) throw httpError(404, 'open pledge not found');
      emit('pledge', input.id, 'update', { status: 'cancelled' });
      return { id: input.id };
    },
  },
};
