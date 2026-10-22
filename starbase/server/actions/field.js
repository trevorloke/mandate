// Field + outreach actions: canvassing contacts, signs, volunteer roles,
// shifts with notifications, petitions, newsletter, email blasts, workspace
// settings. Same contract as every action: zod input, transactional handler,
// events emitted for the log.
import { z } from 'zod';
import {
  RATING_CODES, CHANNELS, OUTCOMES, SIGN_KIND_CODES, SIGN_STATUSES,
  VOLUNTEER_ROLE_CODES, SOCIAL_PLATFORMS, SHIFT_STATUSES,
} from '@starbase/shared/canvass';
import { createHash, randomBytes } from 'node:crypto';
import { newId } from '../lib/events.js';
import { emailConfigured, sendEmail, sendText, shiftMessage } from '../lib/notify.js';
import { httpError } from './util.js';
import { runHooks, hasHook } from '../lib/hooks.js';
// The tracked newsletter/press send path and A/B subject lines.
import {
  AB_MIN, abInput, abGroups, abOf, blastCounts, blastStatus, composeBlast, deliver,
  findLinks, newToken, openTest, outcomeOf, restReleased, retryable, saveLinks, sendKey, startTest,
} from '../ext/abtests/send.js';

const ALL_ROLES = ['manager', 'treasurer', 'staff', 'volunteer'];
const DESK_ROLES = ['manager', 'treasurer', 'staff'];
const MANAGER_ONLY = ['manager'];

const uuid = () => z.uuid();
const isoTs = () => z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'expected ISO timestamp');

const requirePerson = async (tx, workspaceId, id) => {
  const p = (await tx.query(
    'select id, name, email, phone, address, lat, lng from persons where id = $1 and workspace_id = $2 and deleted_at is null',
    [id, workspaceId],
  )).rows[0];
  if (!p) throw httpError(400, 'person not found in this workspace');
  return p;
};

// The signed-in user's own supporter record, matched by login email (oldest
// first). With create, a volunteer who isn't on the list yet is added.
const selfPerson = async (tx, ctx, emit, { create = false } = {}) => {
  const email = String(ctx.user.email || '').trim().toLowerCase();
  const found = (await tx.query(
    `select id, name from persons where workspace_id = $1 and lower(email) = $2 and deleted_at is null
     order by created_at limit 1`,
    [ctx.workspaceId, email],
  )).rows[0];
  if (found || !create) return found || null;
  const id = newId();
  const person = { kind: 'person', name: ctx.user.name || email, email, tags: ['volunteer'] };
  await tx.query(
    `insert into persons (id, workspace_id, kind, name, email, tags) values ($1, $2, $3, $4, $5, $6)`,
    [id, ctx.workspaceId, person.kind, person.name, email, JSON.stringify(person.tags)],
  );
  emit('person', id, 'create', { id, ...person });
  return { id, name: person.name };
};

// A send's status rule (blastStatus), its counts (blastCounts) and its
// message (plain text + tracked HTML) live in ext/abtests/send.js, shared
// with the A/B winner job.

const ACTIVE_SHIFT_STATUSES = ['assigned', 'confirmed'];
const activeOnShift = async (tx, workspaceId, shiftId) => (await tx.query(
  `select count(*)::int as n from shift_assignments
   where shift_id = $1 and workspace_id = $2 and status in ('assigned', 'confirmed')`,
  [shiftId, workspaceId],
)).rows[0].n;

export const FIELD_ACTIONS = {
  // ── Canvassing ──
  'contact.log': {
    roles: ALL_ROLES, // doorknockers and phoners are volunteers
    input: z.object({
      person_id: uuid(),
      channel: z.enum(CHANNELS),
      outcome: z.enum(OUTCOMES),
      rating: z.enum(RATING_CODES).nullish(),
      note: z.string().max(2000).nullish(),
      // Offline outbox key: a knock replayed after reconnecting is the same
      // knock, never a second one.
      client_id: uuid().nullish(),
      // Survey answers given in the same conversation; a feature module
      // (contactLogged hook) stores them with this contact.
      answers: z.array(z.object({
        question_id: uuid(),
        value: z.union([z.string().max(2000), z.number(), z.boolean(), z.array(z.string().max(200)).max(50)]),
      })).max(50).nullish(),
    }),
    handler: async (tx, ctx, input, emit) => {
      await requirePerson(tx, ctx.workspaceId, input.person_id);
      if (input.answers?.length && !hasHook('contactLogged')) throw httpError(400, 'surveys are not available');
      if (input.client_id) {
        const dup = (await tx.query(
          'select id, person_id, channel, outcome, rating, note from contacts where workspace_id = $1 and client_id = $2',
          [ctx.workspaceId, input.client_id],
        )).rows[0];
        if (dup) return { contact: dup, duplicate: true };
      }
      const id = newId();
      await tx.query(
        `insert into contacts (id, workspace_id, person_id, channel, outcome, rating, note, client_id, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, ctx.workspaceId, input.person_id, input.channel, input.outcome,
         input.rating || null, input.note || null, input.client_id || null, ctx.user.id],
      );
      if (input.rating) {
        await tx.query(
          'update persons set rating = $3, rated_at = now(), updated_at = now() where id = $1 and workspace_id = $2',
          [input.person_id, ctx.workspaceId, input.rating],
        );
      }
      const payload = { id, ...input };
      emit('contact', id, 'create', payload);
      await runHooks('contactLogged', tx, ctx, { contact: { id, ...input }, input }, emit);
      return { contact: payload };
    },
  },

  'person.locate': {
    roles: ALL_ROLES, // pins get placed in the field
    input: z.object({ id: uuid(), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
    handler: async (tx, ctx, input, emit) => {
      await requirePerson(tx, ctx.workspaceId, input.id);
      await tx.query(
        'update persons set lat = $3, lng = $4, updated_at = now() where id = $1 and workspace_id = $2',
        [input.id, ctx.workspaceId, input.lat, input.lng],
      );
      emit('person', input.id, 'update', { lat: input.lat, lng: input.lng });
      return { id: input.id, lat: input.lat, lng: input.lng };
    },
  },

  // ── Signs ──
  'sign.place': {
    roles: ALL_ROLES,
    input: z.object({
      kind: z.enum(SIGN_KIND_CODES),
      status: z.enum(SIGN_STATUSES).default('requested'),
      person_id: uuid().nullish(),
      address: z.string().max(400).nullish(),
      lat: z.number().min(-90).max(90).nullish(),
      lng: z.number().min(-180).max(180).nullish(),
      note: z.string().max(1000).nullish(),
      // Offline outbox key (the column comes from server/ext/offline): a
      // request replayed after reconnecting is the same request, never a
      // second sign.
      client_id: uuid().nullish(),
    }).refine((v) => v.person_id || v.address, { message: 'person_id or address required' }),
    handler: async (tx, ctx, input, emit) => {
      if (input.client_id) {
        const dup = (await tx.query(
          'select id, kind, status, person_id, address from signs where workspace_id = $1 and client_id = $2',
          [ctx.workspaceId, input.client_id],
        )).rows[0];
        if (dup) return { sign: { ...dup, person_id: dup.person_id || null }, duplicate: true };
      }
      let { address, lat, lng } = input;
      if (input.person_id) {
        const p = await requirePerson(tx, ctx.workspaceId, input.person_id);
        address = address || p.address;
        if (lat == null && lng == null && p.lat != null && p.lng != null) { lat = p.lat; lng = p.lng; }
      }
      // A crew needs somewhere to go: an address or a pin.
      if (!String(address || '').trim() && (lat == null || lng == null)) {
        throw httpError(400, 'add an address first — the sign crew needs to know where it goes');
      }
      const id = newId();
      // client_id only when given, so sign.place never needs the column otherwise.
      const withClient = Boolean(input.client_id);
      await tx.query(
        `insert into signs (id, workspace_id, person_id, address, lat, lng, kind, status, note${withClient ? ', client_id' : ''})
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9${withClient ? ', $10' : ''})`,
        [id, ctx.workspaceId, input.person_id || null, address || null, lat ?? null, lng ?? null,
         input.kind, input.status, input.note || null, ...(withClient ? [input.client_id] : [])],
      );
      const payload = { id, kind: input.kind, status: input.status, person_id: input.person_id || null, address };
      emit('sign', id, 'create', { ...payload, client_id: input.client_id || undefined });
      return { sign: payload };
    },
  },

  'sign.update': {
    roles: ALL_ROLES,
    input: z.object({
      id: uuid(),
      status: z.enum(SIGN_STATUSES).nullish(),
      note: z.string().max(1000).nullish(),
    }),
    handler: async (tx, ctx, input, emit) => {
      const cur = (await tx.query(
        'select id from signs where id = $1 and workspace_id = $2', [input.id, ctx.workspaceId],
      )).rows[0];
      if (!cur) throw httpError(404, 'sign not found');
      await tx.query(
        `update signs set status = coalesce($3, status), note = coalesce($4, note), updated_at = now()
         where id = $1 and workspace_id = $2`,
        [input.id, ctx.workspaceId, input.status || null, input.note ?? null],
      );
      emit('sign', input.id, 'update', { status: input.status, note: input.note });
      return { id: input.id };
    },
  },

  // Take back a request that never went up (a door-card Undo, a mistaken
  // tap). The request row goes — off every list, map and count — and the log
  // keeps a 'void' event carrying exactly what was cancelled. A sign that has
  // gone up is history, not a request: it is marked taken down instead.
  'sign.cancel': {
    roles: ALL_ROLES,
    input: z.object({ id: uuid() }),
    handler: async (tx, ctx, input, emit) => {
      const s = (await tx.query(
        `select id, person_id, address, lat, lng, kind, status, note, created_at
         from signs where id = $1 and workspace_id = $2 for update`,
        [input.id, ctx.workspaceId],
      )).rows[0];
      if (!s) throw httpError(404, 'sign not found');
      if (s.status !== 'requested') {
        throw httpError(409, s.status === 'installed'
          ? 'that sign is already up — mark it taken down instead'
          : 'that sign was already put up and taken down');
      }
      await tx.query('delete from signs where id = $1 and workspace_id = $2', [s.id, ctx.workspaceId]);
      emit('sign', s.id, 'void', {
        cancelled: true, kind: s.kind, status: s.status, person_id: s.person_id || null,
        address: s.address || null, lat: s.lat ?? null, lng: s.lng ?? null, note: s.note || null,
        requested_at: s.created_at instanceof Date ? s.created_at.toISOString() : s.created_at,
      });
      return { id: s.id, cancelled: true };
    },
  },

  // ── Volunteer roles ──
  'volunteer.assign': {
    roles: DESK_ROLES,
    input: z.object({
      person_id: uuid(),
      role: z.enum(VOLUNTEER_ROLE_CODES),
      detail: z.string().max(200).nullish(), // language, community committee area
    }),
    handler: async (tx, ctx, input, emit) => {
      await requirePerson(tx, ctx.workspaceId, input.person_id);
      const id = newId();
      await tx.query(
        `insert into volunteer_roles (id, workspace_id, person_id, role, detail)
         values ($1, $2, $3, $4, $5)`,
        [id, ctx.workspaceId, input.person_id, input.role, input.detail || null],
      );
      const payload = { id, ...input };
      emit('volunteer_role', id, 'create', payload);
      return { volunteerRole: payload };
    },
  },

  'volunteer.unassign': {
    roles: DESK_ROLES,
    input: z.object({ id: uuid() }),
    handler: async (tx, ctx, input, emit) => {
      const n = await tx.query(
        'delete from volunteer_roles where id = $1 and workspace_id = $2',
        [input.id, ctx.workspaceId],
      );
      if (n.affectedRows === 0) throw httpError(404, 'role assignment not found');
      emit('volunteer_role', input.id, 'void', {});
      return { id: input.id };
    },
  },

  // ── Shifts ──
  'shift.create': {
    roles: DESK_ROLES,
    input: z.object({
      title: z.string().trim().min(1).max(300),
      role: z.enum(VOLUNTEER_ROLE_CODES).nullish(),
      location: z.string().max(400).nullish(),
      starts_at: isoTs(),
      ends_at: isoTs().nullish(),
      instructions: z.string().max(4000).nullish(),
      link: z.string().max(1000).nullish(),
      capacity: z.number().int().positive().nullish(),
    }),
    handler: async (tx, ctx, input, emit) => {
      const id = newId();
      await tx.query(
        `insert into shifts (id, workspace_id, title, role, location, starts_at, ends_at, instructions, link, capacity, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [id, ctx.workspaceId, input.title, input.role || null, input.location || null,
         input.starts_at, input.ends_at || null, input.instructions || null,
         input.link || null, input.capacity ?? null, ctx.user.id],
      );
      const payload = { id, ...input };
      emit('shift', id, 'create', payload);
      return { shift: payload };
    },
  },

  'shift.assign': {
    roles: DESK_ROLES,
    input: z.object({ shift_id: uuid(), person_id: uuid() }),
    handler: async (tx, ctx, input, emit) => {
      const shift = (await tx.query(
        'select id, capacity from shifts where id = $1 and workspace_id = $2 and deleted_at is null',
        [input.shift_id, ctx.workspaceId],
      )).rows[0];
      if (!shift) throw httpError(404, 'shift not found');
      await requirePerson(tx, ctx.workspaceId, input.person_id);
      if (shift.capacity && await activeOnShift(tx, ctx.workspaceId, input.shift_id) >= shift.capacity) {
        throw httpError(409, 'shift is at capacity');
      }
      const id = newId();
      try {
        await tx.query(
          `insert into shift_assignments (id, workspace_id, shift_id, person_id)
           values ($1, $2, $3, $4)`,
          [id, ctx.workspaceId, input.shift_id, input.person_id],
        );
      } catch (e) {
        if (String(e.message).includes('shift_assignments_shift_id_person_id_key')) {
          throw httpError(409, 'already assigned to this shift');
        }
        throw e;
      }
      const payload = { id, ...input };
      emit('shift_assignment', id, 'create', payload);
      return { assignment: payload };
    },
  },

  'shift.unassign': {
    roles: DESK_ROLES,
    input: z.object({ id: uuid() }),
    handler: async (tx, ctx, input, emit) => {
      const n = await tx.query(
        'delete from shift_assignments where id = $1 and workspace_id = $2',
        [input.id, ctx.workspaceId],
      );
      if (n.affectedRows === 0) throw httpError(404, 'assignment not found');
      emit('shift_assignment', input.id, 'void', {});
      return { id: input.id };
    },
  },

  // A volunteer books themselves ("Count me in") or drops out ("Can't make
  // it"). They act only on their own record, matched by login email; a
  // newcomer who isn't on the list yet is added as a supporter.
  'shift.join': {
    roles: ALL_ROLES,
    input: z.object({ shift_id: uuid() }),
    handler: async (tx, ctx, input, emit) => {
      const shift = (await tx.query(
        `select id, capacity, coalesce(ends_at, starts_at) < now() as over
         from shifts where id = $1 and workspace_id = $2 and deleted_at is null for update`,
        [input.shift_id, ctx.workspaceId],
      )).rows[0];
      if (!shift) throw httpError(404, 'shift not found');
      if (shift.over) throw httpError(409, 'that shift is over');
      const me = await selfPerson(tx, ctx, emit, { create: true });
      const cur = (await tx.query(
        'select id, status from shift_assignments where shift_id = $1 and person_id = $2 and workspace_id = $3',
        [shift.id, me.id, ctx.workspaceId],
      )).rows[0];
      if (cur && ACTIVE_SHIFT_STATUSES.includes(cur.status)) throw httpError(409, "you're already on this shift");
      if (shift.capacity && await activeOnShift(tx, ctx.workspaceId, shift.id) >= shift.capacity) {
        throw httpError(409, 'shift is full');
      }
      if (cur) {
        await tx.query("update shift_assignments set status = 'confirmed' where id = $1", [cur.id]);
        emit('shift_assignment', cur.id, 'update', { status: 'confirmed', self: true });
        return { assignment: { id: cur.id, shift_id: shift.id, person_id: me.id, status: 'confirmed' } };
      }
      const id = newId();
      await tx.query(
        `insert into shift_assignments (id, workspace_id, shift_id, person_id, status)
         values ($1, $2, $3, $4, 'confirmed')`,
        [id, ctx.workspaceId, shift.id, me.id],
      );
      const payload = { id, shift_id: shift.id, person_id: me.id, status: 'confirmed', self: true };
      emit('shift_assignment', id, 'create', payload);
      return { assignment: payload };
    },
  },

  'shift.leave': {
    roles: ALL_ROLES,
    input: z.object({ shift_id: uuid() }),
    handler: async (tx, ctx, input, emit) => {
      const me = await selfPerson(tx, ctx, emit);
      const cur = me && (await tx.query(
        `select id from shift_assignments where shift_id = $1 and person_id = $2 and workspace_id = $3
           and status in ('assigned', 'confirmed')`,
        [input.shift_id, me.id, ctx.workspaceId],
      )).rows[0];
      if (!cur) throw httpError(404, "you're not on this shift");
      // Declined, not deleted: the organizer still sees who dropped out.
      await tx.query("update shift_assignments set status = 'declined' where id = $1", [cur.id]);
      emit('shift_assignment', cur.id, 'update', { status: 'declined', self: true });
      return { id: cur.id, status: 'declined' };
    },
  },

  'shift.setStatus': {
    roles: DESK_ROLES,
    input: z.object({ id: uuid(), status: z.enum(SHIFT_STATUSES) }),
    handler: async (tx, ctx, input, emit) => {
      const cur = (await tx.query(
        `select a.status, a.shift_id, s.capacity from shift_assignments a join shifts s on s.id = a.shift_id
         where a.id = $1 and a.workspace_id = $2`,
        [input.id, ctx.workspaceId],
      )).rows[0];
      if (!cur) throw httpError(404, 'assignment not found');
      const ACTIVE = ACTIVE_SHIFT_STATUSES;
      if (cur.capacity && ACTIVE.includes(input.status) && !ACTIVE.includes(cur.status)
          && await activeOnShift(tx, ctx.workspaceId, cur.shift_id) >= cur.capacity) {
        throw httpError(409, 'shift is at capacity');
      }
      await tx.query(
        'update shift_assignments set status = $3 where id = $1 and workspace_id = $2',
        [input.id, ctx.workspaceId, input.status],
      );
      emit('shift_assignment', input.id, 'update', { status: input.status });
      return { id: input.id, status: input.status };
    },
  },

  // Notify every assignee by email AND text with time, place, instructions,
  // and the shift link. Provider calls happen inside the handler but each
  // result is recorded per-assignee; missing providers record 'queued' (not
  // sent, and nothing sends it later). Every run messages everyone on the
  // shift whatever their last result, so "Notify again" after connecting
  // email/text is how the 'queued' ones are reached.
  'shift.notify': {
    roles: DESK_ROLES,
    input: z.object({ shift_id: uuid() }),
    handler: async (tx, ctx, input, emit) => {
      const shift = (await tx.query(
        'select * from shifts where id = $1 and workspace_id = $2 and deleted_at is null',
        [input.shift_id, ctx.workspaceId],
      )).rows[0];
      if (!shift) throw httpError(404, 'shift not found');
      const assignees = (await tx.query(
        `select a.id as assignment_id, p.id, p.name, p.email, p.phone
         from shift_assignments a join persons p on p.id = a.person_id
         where a.shift_id = $1 and a.workspace_id = $2 and a.status in ('assigned', 'confirmed')`,
        [input.shift_id, ctx.workspaceId],
      )).rows;

      const message = shiftMessage(shift, ctx.workspace.name, ctx.workspace.settings?.tz || 'America/Vancouver');
      const results = [];
      for (const a of assignees) {
        const emailRes = a.email
          ? await sendEmail({ to: a.email, subject: `Your shift: ${shift.title}`, text: message })
          : { status: 'skipped', detail: 'no email on file' };
        const textRes = a.phone
          ? await sendText({ to: a.phone, body: message })
          : { status: 'skipped', detail: 'no phone on file' };
        await tx.query(
          `update shift_assignments set notified_at = now(), notify_email = $3, notify_text = $4
           where id = $1 and workspace_id = $2`,
          [a.assignment_id, ctx.workspaceId, emailRes.status, textRes.status],
        );
        results.push({ person_id: a.id, name: a.name, email: emailRes.status, text: textRes.status });
      }
      emit('shift', shift.id, 'update', { notified: results.length });
      return { shift_id: shift.id, notified: results };
    },
  },

  // ── Petitions ──
  'petition.create': {
    roles: DESK_ROLES,
    input: z.object({
      slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/, 'lowercase letters, digits, dashes'),
      title: z.string().trim().min(1).max(300),
      body: z.string().max(8000).nullish(),
    }),
    handler: async (tx, ctx, input, emit) => {
      const id = newId();
      try {
        await tx.query(
          'insert into petitions (id, workspace_id, slug, title, body) values ($1, $2, $3, $4, $5)',
          [id, ctx.workspaceId, input.slug, input.title, input.body || null],
        );
      } catch (e) {
        if (String(e.message).includes('petitions_workspace_id_slug_key')) {
          throw httpError(409, `a petition with slug '${input.slug}' already exists`);
        }
        throw e;
      }
      const payload = { id, ...input };
      emit('petition', id, 'create', payload);
      return { petition: payload };
    },
  },

  'petition.update': {
    roles: DESK_ROLES,
    input: z.object({
      id: uuid(),
      title: z.string().trim().min(1).max(300).nullish(),
      body: z.string().max(8000).nullish(),
      active: z.boolean().nullish(),
    }),
    handler: async (tx, ctx, input, emit) => {
      const n = await tx.query(
        `update petitions set title = coalesce($3, title), body = coalesce($4, body),
         active = coalesce($5, active) where id = $1 and workspace_id = $2`,
        [input.id, ctx.workspaceId, input.title || null, input.body ?? null, input.active ?? null],
      );
      if (n.affectedRows === 0) throw httpError(404, 'petition not found');
      emit('petition', input.id, 'update', { title: input.title, active: input.active });
      return { id: input.id };
    },
  },

  // ── Newsletter ──
  'subscription.add': {
    roles: DESK_ROLES,
    input: z.object({
      email: z.string().email().max(320),
      name: z.string().max(300).nullish(),
    }),
    handler: async (tx, ctx, input, emit) => {
      const id = newId();
      await tx.query(
        `insert into subscriptions (id, workspace_id, email, name, status, source)
         values ($1, $2, $3, $4, 'subscribed', 'manual')
         on conflict (workspace_id, email)
         do update set status = 'subscribed', name = coalesce(excluded.name, subscriptions.name)`,
        [id, ctx.workspaceId, input.email.toLowerCase(), input.name || null],
      );
      const row = (await tx.query(
        'select id from subscriptions where workspace_id = $1 and email = $2',
        [ctx.workspaceId, input.email.toLowerCase()],
      )).rows[0];
      emit('subscription', row.id, 'create', { email: input.email.toLowerCase(), name: input.name });
      return { id: row.id };
    },
  },

  'subscription.remove': {
    roles: DESK_ROLES,
    input: z.object({ id: uuid() }),
    handler: async (tx, ctx, input, emit) => {
      const n = await tx.query(
        `update subscriptions set status = 'unsubscribed' where id = $1 and workspace_id = $2`,
        [input.id, ctx.workspaceId],
      );
      if (n.affectedRows === 0) throw httpError(404, 'subscription not found');
      emit('subscription', input.id, 'void', {});
      return { id: input.id };
    },
  },

  // ── Email blasts: newsletter → subscribed list; press → media-tagged people ──
  'blast.send': {
    roles: DESK_ROLES,
    input: z.object({
      kind: z.enum(['newsletter', 'press']),
      subject: z.string().trim().min(1).max(300),
      body: z.string().trim().min(1).max(50000),
      // Two subject lines: A and B go to two small groups now; the winner
      // goes to everyone else when the wait ends (ext/abtests).
      ab: abInput.nullish(),
    }),
    handler: async (tx, ctx, input, emit) => {
      if (input.ab && input.ab.subject_b === input.subject) throw httpError(400, 'subject B is the same as subject A');
      // Winner by clicks needs something to click.
      if (input.ab?.metric === 'clicks' && findLinks(input.body).length === 0) {
        throw httpError(400, 'winner by clicks needs a link in the message');
      }
      const audience = input.kind === 'newsletter'
        ? (await tx.query(
            `select id, email, name from subscriptions where workspace_id = $1 and status = 'subscribed'`,
            [ctx.workspaceId],
          )).rows
        : (await tx.query(
            `select email, name from persons
             where workspace_id = $1 and deleted_at is null and email is not null
               and tags @> '"media"'::jsonb`,
            [ctx.workspaceId],
          )).rows;
      if (audience.length === 0) {
        throw httpError(400, input.kind === 'newsletter'
          ? 'no subscribed addresses on the newsletter list yet'
          : "no people tagged 'media' with an email address yet");
      }

      // A test needs a list big enough to tell; a smaller one sends normally.
      const ab = input.ab && audience.length >= AB_MIN ? input.ab : null;
      const groups = ab ? abGroups(audience.length, ab.pct) : [];
      const live = emailConfigured();
      const links = findLinks(input.body);

      const id = newId();
      let sent = 0, failed = 0, unsure = 0;
      const recipientRows = [];
      // Without email connected sendEmail sends nothing and answers 'queued':
      // the send is saved, and blast.resend sends those rows once it is.
      // Each recipient gets its own token for the open pixel and its links,
      // and its row id up front for the email's idempotency key. One the
      // service never answered for is 'sending' — not sure it went.
      for (const [i, r] of audience.entries()) {
        const group = groups[i] || null;
        const token = newToken();
        const rowId = newId();
        // The rest of an A/B send waits for the winner: nothing goes to them now.
        const res = group === 'rest' && live
          ? { status: 'queued' }
          : await sendEmail({
            to: r.email,
            subject: group === 'b' ? ab.subject_b : input.subject,
            ...composeBlast(ctx, { kind: input.kind, body: input.body, subscriptionId: r.id, token, links }),
            idempotencyKey: sendKey(id, { id: rowId, send_tries: 0 }),
          });
        const out = outcomeOf(res);
        if (out.status === 'sent') sent += 1;
        else if (out.status === 'failed') failed += 1;
        else if (out.status === 'sending') unsure += 1;
        recipientRows.push({ id: rowId, email: r.email, name: r.name, status: out.status, refused: out.refused, detail: res.detail, token, group });
      }
      const status = blastStatus({ total: audience.length, sent, failed });
      const note = recipientRows.find((r) => r.detail)?.detail || null;
      await tx.query(
        `insert into blasts (id, workspace_id, kind, subject, body, status, provider_note, audience_count, sent_at, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, case when $6 = 'sent' then now() end, $9)`,
        [id, ctx.workspaceId, input.kind, input.subject, input.body, status, note, audience.length, ctx.user.id],
      );
      for (const r of recipientRows) {
        await tx.query(
          `insert into blast_recipients (id, workspace_id, blast_id, email, name, status, token, ab_group,
             sent_at, sending_at, send_tries)
           values ($1, $2, $3, $4, $5, $6, $7, $8,
             case when $6 = 'sent' then now() end, case when $6 = 'sending' then now() end, $9)`,
          [r.id, ctx.workspaceId, id, r.email, r.name || null, r.status, r.token, r.group, r.refused ? 1 : 0],
        );
      }
      await saveLinks(tx, ctx.workspaceId, id, links);
      // Not connected: the whole test is saved and starts on Send now.
      const test = ab ? await openTest(tx, ctx, id, ab, live) : null;
      emit('blast', id, 'create', {
        kind: input.kind, subject: input.subject, audience: audience.length, status,
        ...(test ? { ab: { subject_b: ab.subject_b, pct: ab.pct, wait_hours: ab.wait_hours, metric: ab.metric, status: test.status } } : {}),
      });
      const counts = {
        total: audience.length, sent, failed, queued: audience.length - sent - failed - unsure,
        ...(unsure ? { sending: unsure } : {}),
      };
      return {
        blast: {
          id, kind: input.kind, subject: input.subject, status, audience_count: audience.length, provider_note: note,
          ...(test ? { ab: test } : {}),
        },
        counts,
        ...(input.ab && !ab ? { ab_skipped: `A/B needs at least ${AB_MIN}` } : {}),
      };
    },
  },

  // "Send now": send one saved blast to everyone on it not yet reached — the
  // 'queued' rows (saved while email wasn't connected) and the 'failed' rows
  // (the provider turned them down) — through the same path as blast.send.
  // A 'sent' row is never touched, so no one gets it twice however often it
  // runs. Refused (409) while email isn't connected: nothing pretends to send.
  // A newsletter subscriber who unsubscribed since is taken off the send
  // (never emailed); its status and sent time follow blast.send's rule.
  // An A/B send saved while email wasn't connected starts its test here: A
  // and B go out, the rest stay held until the winner job (ext/abtests).
  // Answers { blast, counts: { total, sent, failed, queued } } for the whole
  // send after this run, plus resent: { sent, failed, skipped } for this run.
  'blast.resend': {
    roles: DESK_ROLES,
    input: z.object({ id: uuid() }),
    handler: async (tx, ctx, input, emit) => {
      const blast = (await tx.query(
        `select id, kind, subject, body, status, provider_note, audience_count, sent_at,
                ab_status, ab_subject_b, ab_pct, ab_wait_hours, ab_metric, ab_decide_at, ab_winner, ab_decided_at
         from blasts where id = $1 and workspace_id = $2`,
        [input.id, ctx.workspaceId],
      )).rows[0];
      if (!blast) throw httpError(404, 'send not found');
      if (!emailConfigured()) throw httpError(409, "email isn't connected yet — connect it, then send");
      // Not reached yet: queued, failed, or 'sending' long enough ago that
      // the service never answered (sent again with the same key, so the
      // service drops it if it did go).
      const waiting = (await tx.query(
        `select id, email, name, token, ab_group, send_tries from blast_recipients
         where blast_id = $1 and workspace_id = $2 and ${retryable()}
           and ($3::boolean or ab_group is distinct from 'rest')
         order by created_at, id`,
        [blast.id, ctx.workspaceId, restReleased(blast)],
      )).rows;
      const pick = (b) => ({
        id: b.id, kind: b.kind, subject: b.subject, status: b.status,
        audience_count: b.audience_count, provider_note: b.provider_note, sent_at: b.sent_at,
        ...(b.ab_status ? { ab: abOf(b) } : {}),
      });
      const starting = blast.ab_status === 'saved';
      if (waiting.length === 0 && !starting) {
        return { blast: pick(blast), counts: await blastCounts(tx, ctx.workspaceId, blast.id), resent: { sent: 0, failed: 0, skipped: 0 } };
      }

      const { sent, failed, skipped, note: firstNote } = await deliver(tx, ctx, blast, waiting);
      let note = firstNote;
      const test = starting ? await startTest(tx, ctx, blast.id) : null;
      const counts = await blastCounts(tx, ctx.workspaceId, blast.id);
      const status = blastStatus(counts);
      if (counts.total === 0) note = 'everyone on this send has unsubscribed';
      const updated = (await tx.query(
        `update blasts set status = $3, provider_note = $4, audience_count = $5,
           sent_at = case when $3 = 'sent' then now() else sent_at end
         where id = $1 and workspace_id = $2
         returning *`,
        [blast.id, ctx.workspaceId, status, note, counts.total],
      )).rows[0];
      emit('blast', blast.id, 'update', {
        resent: waiting.length - skipped, sent, failed, unsubscribed: skipped, status,
        ...(test ? { ab: test.status } : {}),
      });
      return { blast: pick(updated), counts, resent: { sent, failed, skipped } };
    },
  },

  // ── Team: invite volunteers and staff; change roles ──
  'member.invite': {
    roles: MANAGER_ONLY,
    input: z.object({
      email: z.string().email().max(320),
      role: z.enum(['manager', 'treasurer', 'staff', 'volunteer']),
    }),
    handler: async (tx, ctx, input, emit) => {
      const email = input.email.toLowerCase();
      const already = (await tx.query(
        `select 1 from memberships m join users u on u.id = m.user_id
         where m.workspace_id = $1 and u.email = $2`,
        [ctx.workspaceId, email],
      )).rows[0];
      if (already) throw httpError(409, `${email} is already on the team`);
      const token = randomBytes(24).toString('hex');
      const id = newId();
      // One live link per email: a new invite ("New link") kills the old one.
      const replaced = (await tx.query(
        `update invites set expires_at = now()
         where workspace_id = $1 and email = $2 and accepted_at is null and expires_at > now()
         returning id`,
        [ctx.workspaceId, email],
      )).rows;
      for (const r of replaced) emit('invite', r.id, 'void', { email, replaced_by: id });
      await tx.query(
        `insert into invites (id, workspace_id, email, role, token_hash, created_by, expires_at)
         values ($1, $2, $3, $4, $5, $6, now() + interval '14 days')`,
        [id, ctx.workspaceId, email, input.role,
         createHash('sha256').update(token).digest('hex'), ctx.user.id],
      );
      const joinUrl = `${ctx.publicUrl || ''}/join/${token}`;
      const mail = await sendEmail({
        to: email,
        subject: `Join ${ctx.workspace.name} on Starbase`,
        text: `${ctx.user.name} invited you to join ${ctx.workspace.name} as ${input.role}.\n\nSet your password and get started: ${joinUrl}\n\nThis link expires in 14 days.`,
      });
      // The token never enters the event log — only who was invited, as what.
      emit('invite', id, 'create', { email, role: input.role });
      return { invite: { id, email, role: input.role }, joinUrl, email: mail.status };
    },
  },

  // Cancel a pending invite: its link stops working at once.
  'member.cancelInvite': {
    roles: MANAGER_ONLY,
    input: z.object({ id: uuid() }),
    handler: async (tx, ctx, input, emit) => {
      const row = (await tx.query(
        `update invites set expires_at = now()
         where id = $1 and workspace_id = $2 and accepted_at is null and expires_at > now()
         returning id, email`,
        [input.id, ctx.workspaceId],
      )).rows[0];
      if (!row) throw httpError(404, 'invite not found');
      emit('invite', row.id, 'void', { email: row.email });
      return { id: row.id };
    },
  },

  'member.setRole': {
    roles: MANAGER_ONLY,
    input: z.object({ user_id: uuid(), role: z.enum(['manager', 'treasurer', 'staff', 'volunteer']) }),
    handler: async (tx, ctx, input, emit) => {
      if (input.user_id === ctx.user.id && input.role !== 'manager') {
        throw httpError(400, 'you cannot remove your own manager role');
      }
      const n = await tx.query(
        'update memberships set role = $3 where user_id = $1 and workspace_id = $2',
        [input.user_id, ctx.workspaceId, input.role],
      );
      if (n.affectedRows === 0) throw httpError(404, 'member not found');
      emit('membership', input.user_id, 'update', { role: input.role });
      return { user_id: input.user_id, role: input.role };
    },
  },

  // ── Workspace settings (website link for public pages, cap override, …) ──
  'workspace.update': {
    roles: MANAGER_ONLY,
    input: z.object({
      name: z.string().trim().min(1).max(200).nullish(),
      candidate: z.string().max(200).nullish(),
      website: z.string().max(500).nullish(), // e.g. the Imagine Surrey site
      // Shown on the donate page when card payments aren't connected, e.g.
      // "E-transfer to donate@imaginesurrey.ca" or a cheque mailing address.
      donate_instructions: z.string().max(2000).nullish(),
    }),
    handler: async (tx, ctx, input, emit) => {
      const cur = (await tx.query(
        'select settings from workspaces where id = $1', [ctx.workspaceId],
      )).rows[0];
      const settings = typeof cur.settings === 'string' ? JSON.parse(cur.settings) : (cur.settings || {});
      if (input.website !== undefined && input.website !== null) settings.website = input.website;
      if (input.donate_instructions !== undefined && input.donate_instructions !== null) settings.donateInstructions = input.donate_instructions;
      await tx.query(
        `update workspaces set name = coalesce($2, name), candidate = coalesce($3, candidate), settings = $4
         where id = $1`,
        [ctx.workspaceId, input.name || null, input.candidate ?? null, JSON.stringify(settings)],
      );
      emit('workspace', ctx.workspaceId, 'update', { name: input.name, candidate: input.candidate, website: input.website, donate_instructions: input.donate_instructions });
      return { ok: true };
    },
  },
};

const SOCIALS_SHAPE = z.partialRecord(z.enum(SOCIAL_PLATFORMS), z.string().max(300));
export const personFieldExtensions = {
  unit: z.string().max(40).nullish(),
  city: z.string().max(120).nullish(),
  postal: z.string().max(20).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(50).nullish(),
  socials: SOCIALS_SHAPE.nullish(),
};
