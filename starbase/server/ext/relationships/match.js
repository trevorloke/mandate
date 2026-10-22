// Finding people: the signed-in person's own record, and whether someone
// typed into "My people" is already on the list.
//
// The same keys as the import's dedupe (routes/data.js): email, then name +
// phone — names compared case-insensitively with runs of spaces as one,
// phones by their digits (the last ten, so "+1 604…" is "604…"). A volunteer
// matches on name + email, never on an email alone: a bare email match would
// tell them whose email it is (they never see anyone else's). Oldest first.
import { newId } from '../../lib/events.js';
import { loginEmail } from '../../lib/viewer.js';

export const nameKey = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export const phoneKey = (s) => {
  const d = String(s ?? '').replace(/\D+/g, '');
  return d.length >= 10 ? d.slice(-10) : d;
};
export const emailKey = (s) => String(s ?? '').trim().toLowerCase();

const NAME_SQL = `lower(regexp_replace(trim(name), '\\s+', ' ', 'g'))`;
const PHONE_SQL = `right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10)`;

const first = async (tx, sql, params) => (await tx.query(
  `select id, name, email, phone, address, unit, rating, rated_at, tags from persons
   where workspace_id = $1 and deleted_at is null and ${sql}
   order by created_at, id limit 1`,
  params,
)).rows[0] || null;

// { name, phone?, email? } → the person already on the list, or null.
export const findKnown = async (tx, ctx, { name, phone, email }) => {
  const ws = ctx.workspaceId;
  const n = nameKey(name);
  const e = emailKey(email);
  const ph = phoneKey(phone);
  const desk = ctx.role !== 'volunteer';
  if (e) {
    const hit = desk
      ? await first(tx, 'lower(email) = $2', [ws, e])
      : await first(tx, `lower(email) = $2 and ${NAME_SQL} = $3`, [ws, e, n]);
    if (hit) return hit;
  }
  if (ph.length >= 7) {
    const hit = await first(tx, `${NAME_SQL} = $2 and ${PHONE_SQL} = $3`, [ws, n, ph]);
    if (hit) return hit;
  }
  return null;
};

// The signed-in user's own supporter record, matched by login email (oldest
// first) — the same record Shifts' "Count me in" uses. With create, someone
// who isn't on the list yet is added (a volunteer, tagged so).
export const selfPerson = async (tx, ctx, emit, { create = false } = {}) => {
  const email = loginEmail(ctx);
  if (!email) return null;
  const found = (await tx.query(
    `select id, name from persons where workspace_id = $1 and lower(email) = $2 and deleted_at is null
     order by created_at limit 1`,
    [ctx.workspaceId, email],
  )).rows[0];
  if (found || !create) return found || null;
  const id = newId();
  const tags = ctx.role === 'volunteer' ? ['volunteer'] : [];
  const person = { kind: 'person', name: ctx.user.name || email, email, tags };
  await tx.query(
    'insert into persons (id, workspace_id, kind, name, email, tags) values ($1, $2, $3, $4, $5, $6)',
    [id, ctx.workspaceId, person.kind, person.name, email, JSON.stringify(tags)],
  );
  emit('person', id, 'create', { id, ...person });
  return { id, name: person.name };
};
