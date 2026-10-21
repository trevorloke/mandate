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
import { sendEmail, sendText, shiftMessage } from '../lib/notify.js';
import { httpError } from './util.js';

const ALL_ROLES = ['manager', 'treasurer', 'staff', 'volunteer'];
const DESK_ROLES = ['manager', 'treasurer', 'staff'];
const MANAGER_ONLY = ['manager'];

const uuid = () => z.uuid();
const isoTs = () => z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'expected ISO timestamp');

const requirePerson = async (tx, workspaceId, id) => {
  const p = (await tx.query(
    'select id, name, email, phone, address from persons where id = $1 and workspace_id = $2 and deleted_at is null',
    [id, workspaceId],
  )).rows[0];
  if (!p) throw httpError(400, 'person not found in this workspace');
  return p;
};

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
    }),
    handler: async (tx, ctx, input, emit) => {
      await requirePerson(tx, ctx.workspaceId, input.person_id);
      const id = newId();
      await tx.query(
        `insert into contacts (id, workspace_id, person_id, channel, outcome, rating, note, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, ctx.workspaceId, input.person_id, input.channel, input.outcome,
         input.rating || null, input.note || null, ctx.user.id],
      );
      if (input.rating) {
        await tx.query(
          'update persons set rating = $3, rated_at = now(), updated_at = now() where id = $1 and workspace_id = $2',
          [input.person_id, ctx.workspaceId, input.rating],
        );
      }
      const payload = { id, ...input };
      emit('contact', id, 'create', payload);
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
    }).refine((v) => v.person_id || v.address, { message: 'person_id or address required' }),
    handler: async (tx, ctx, input, emit) => {
      let { address, lat, lng } = input;
      if (input.person_id) {
        const p = await requirePerson(tx, ctx.workspaceId, input.person_id);
        address = address || p.address;
      }
      const id = newId();
      await tx.query(
        `insert into signs (id, workspace_id, person_id, address, lat, lng, kind, status, note)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, ctx.workspaceId, input.person_id || null, address || null, lat ?? null, lng ?? null,
         input.kind, input.status, input.note || null],
      );
      const payload = { id, kind: input.kind, status: input.status, person_id: input.person_id || null, address };
      emit('sign', id, 'create', payload);
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
      if (shift.capacity) {
        const n = (await tx.query(
          `select count(*)::int as n from shift_assignments
           where shift_id = $1 and workspace_id = $2 and status in ('assigned', 'confirmed')`,
          [input.shift_id, ctx.workspaceId],
        )).rows[0].n;
        if (n >= shift.capacity) throw httpError(409, 'shift is at capacity');
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
      const ACTIVE = ['assigned', 'confirmed'];
      if (cur.capacity && ACTIVE.includes(input.status) && !ACTIVE.includes(cur.status)) {
        const n = (await tx.query(
          `select count(*)::int as n from shift_assignments
           where shift_id = $1 and workspace_id = $2 and status in ('assigned', 'confirmed')`,
          [cur.shift_id, ctx.workspaceId],
        )).rows[0].n;
        if (n >= cur.capacity) throw httpError(409, 'shift is at capacity');
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
  // result is recorded per-assignee; missing providers record 'queued'.
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
    }),
    handler: async (tx, ctx, input, emit) => {
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

      const id = newId();
      let sent = 0, failed = 0, queued = 0;
      const recipientRows = [];
      // Every newsletter identifies the sender and carries the recipient's own
      // one-click unsubscribe link (/u/:subscriptionId).
      const footer = (r) => input.kind === 'newsletter'
        ? `\n\n—\nSent by ${ctx.workspace.name}.\nUnsubscribe: ${ctx.publicUrl || ''}/u/${r.id}`
        : `\n\n—\n${ctx.workspace.name}`;
      for (const r of audience) {
        const res = await sendEmail({ to: r.email, subject: input.subject, text: input.body + footer(r) });
        if (res.status === 'sent') sent += 1;
        else if (res.status === 'failed') failed += 1;
        else queued += 1;
        recipientRows.push({ email: r.email, name: r.name, status: res.status, detail: res.detail });
      }
      const status = sent === audience.length ? 'sent' : failed === audience.length ? 'failed' : 'queued';
      const note = recipientRows.find((r) => r.detail)?.detail || null;
      await tx.query(
        `insert into blasts (id, workspace_id, kind, subject, body, status, provider_note, audience_count, sent_at, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, case when $6 = 'sent' then now() end, $9)`,
        [id, ctx.workspaceId, input.kind, input.subject, input.body, status, note, audience.length, ctx.user.id],
      );
      for (const r of recipientRows) {
        await tx.query(
          `insert into blast_recipients (id, workspace_id, blast_id, email, name, status)
           values ($1, $2, $3, $4, $5, $6)`,
          [newId(), ctx.workspaceId, id, r.email, r.name || null, r.status],
        );
      }
      emit('blast', id, 'create', { kind: input.kind, subject: input.subject, audience: audience.length, status });
      return { blast: { id, kind: input.kind, subject: input.subject, status, audience_count: audience.length, provider_note: note } };
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
    }),
    handler: async (tx, ctx, input, emit) => {
      const cur = (await tx.query(
        'select settings from workspaces where id = $1', [ctx.workspaceId],
      )).rows[0];
      const settings = typeof cur.settings === 'string' ? JSON.parse(cur.settings) : (cur.settings || {});
      if (input.website !== undefined && input.website !== null) settings.website = input.website;
      await tx.query(
        `update workspaces set name = coalesce($2, name), candidate = coalesce($3, candidate), settings = $4
         where id = $1`,
        [ctx.workspaceId, input.name || null, input.candidate ?? null, JSON.stringify(settings)],
      );
      emit('workspace', ctx.workspaceId, 'update', { name: input.name, candidate: input.candidate, website: input.website });
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
