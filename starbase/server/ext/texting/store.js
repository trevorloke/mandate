// Texting reads and writes shared by the actions, the signed-in reads and
// the Twilio webhooks. Writes here take the caller's transaction and emit,
// so they always land on the event log with the action that caused them.
import { newId } from '../../lib/events.js';
import {
  DEFAULT_TEMPLATE, DEFAULT_FROM, DEFAULT_UNTIL, NO_TEXT_TAG, PHONE_DIGITS_SQL, last10,
  isQuiet, windowWord, now,
} from './rules.js';

const parseJ = (v, fb) => (typeof v === 'string' ? JSON.parse(v) : (v ?? fb));
export const tagsOf = (p) => parseJ(p?.tags, []);

export const settingsFor = async (q, workspaceId) => {
  const r = (await q.query(
    'select template, allow_from, allow_until from texting_settings where workspace_id = $1', [workspaceId],
  )).rows[0];
  return {
    template: r?.template || DEFAULT_TEMPLATE,
    allow_from: r?.allow_from ?? DEFAULT_FROM,
    allow_until: r?.allow_until ?? DEFAULT_UNTIL,
  };
};

export const tzOf = (workspace) => workspace?.settings?.tz || 'America/Vancouver';

// { now: true|false, from, until, label: '9 am–9 pm' }
export const quietState = (settings, workspace) => ({
  now: isQuiet(now(), tzOf(workspace), settings.allow_from, settings.allow_until),
  from: settings.allow_from,
  until: settings.allow_until,
  label: windowWord(settings.allow_from, settings.allow_until),
});

export const isOptedOut = async (q, workspaceId, phone) => !!(await q.query(
  'select 1 from texting_optouts where workspace_id = $1 and phone = $2 and opted_out', [workspaceId, phone],
)).rows[0];

// STOP (out = true) or START (out = false) for one number in one workspace:
// the opt-out row, and the do-not-text tag on everyone with that number.
export const applyOptOut = async (tx, emit, workspaceId, phone, { out, keyword }) => {
  const prev = (await tx.query(
    'select id, opted_out from texting_optouts where workspace_id = $1 and phone = $2 for update', [workspaceId, phone],
  )).rows[0];
  if (prev) {
    await tx.query(
      'update texting_optouts set opted_out = $3, keyword = $4, changed_at = now() where id = $1 and workspace_id = $2',
      [prev.id, workspaceId, out, keyword],
    );
    if (prev.opted_out !== out) emit('texting_optout', prev.id, 'update', { phone, opted_out: out, keyword });
  } else {
    const id = newId();
    await tx.query(
      'insert into texting_optouts (id, workspace_id, phone, opted_out, keyword) values ($1, $2, $3, $4, $5)',
      [id, workspaceId, phone, out, keyword],
    );
    emit('texting_optout', id, 'create', { phone, opted_out: out, keyword });
  }
  const people = (await tx.query(
    `select id, tags from persons where workspace_id = $1 and deleted_at is null
       and ${PHONE_DIGITS_SQL('phone')} = $2`,
    [workspaceId, last10(phone)],
  )).rows;
  for (const p of people) {
    const tags = tagsOf(p);
    const has = tags.includes(NO_TEXT_TAG);
    if (out === has) continue;
    const next = out ? [...tags, NO_TEXT_TAG] : tags.filter((t) => t !== NO_TEXT_TAG);
    await tx.query('update persons set tags = $3, updated_at = now() where id = $1 and workspace_id = $2',
      [p.id, workspaceId, JSON.stringify(next)]);
    emit('person', p.id, 'update', { tags: next, source: out ? 'text-stop' : 'text-start' });
  }
  return { people: people.length };
};

// The first person in the workspace with this number (oldest record first).
export const personByPhone = async (q, workspaceId, phone) => (await q.query(
  `select id, name, tags from persons where workspace_id = $1 and deleted_at is null
     and ${PHONE_DIGITS_SQL('phone')} = $2 order by created_at limit 1`,
  [workspaceId, last10(phone)],
)).rows[0] || null;

// A conversation is "first" until a text in it has gone out.
export const isFirstOut = async (q, conversationId) => !(await q.query(
  `select 1 from texting_messages where conversation_id = $1 and direction = 'out'
     and status in ('sent', 'delivered') limit 1`,
  [conversationId],
)).rows[0];

// Conversations, as the inbox lists them. viewer: the member reading (their
// unread state); mine: only conversations they started; personId: one
// person's conversations.
export const listConversations = async (q, { workspaceId, viewerId, mine = false, personId = null, limit = 200 }) => {
  const params = [workspaceId, viewerId, limit];
  let where = 'c.workspace_id = $1';
  if (mine) where += ' and c.started_by = $2';
  if (personId) { params.push(personId); where += ` and c.person_id = $${params.length}`; }
  const rows = (await q.query(
    `select c.id, c.person_id, p.name as person_name, c.phone, c.started_by, u.name as started_by_name,
            c.created_at, c.last_at,
            l.body as last_body, l.direction as last_direction, l.status as last_status, l.created_at as last_message_at,
            (select count(*)::int from texting_messages m where m.conversation_id = c.id) as messages,
            exists (select 1 from texting_messages m where m.conversation_id = c.id and m.direction = 'in'
                      and m.created_at > coalesce(r.read_at, '-infinity'::timestamptz)) as unread,
            exists (select 1 from texting_optouts o where o.workspace_id = c.workspace_id and o.phone = c.phone and o.opted_out) as opted_out
     from texting_conversations c
     left join persons p on p.id = c.person_id
     left join users u on u.id = c.started_by
     left join texting_reads r on r.conversation_id = c.id and r.user_id = $2
     left join lateral (
       select body, direction, status, created_at from texting_messages m
       where m.conversation_id = c.id order by m.created_at desc, m.id desc limit 1
     ) l on true
     where ${where}
     order by c.last_at desc limit $3`,
    params,
  )).rows;
  return rows.map((r) => ({ ...r, unread: !!r.unread, opted_out: !!r.opted_out }));
};

export const unreadCount = async (q, workspaceId, userId) => (await q.query(
  `select count(*)::int as n from texting_conversations c
   left join texting_reads r on r.conversation_id = c.id and r.user_id = $2
   where c.workspace_id = $1 and c.started_by = $2
     and exists (select 1 from texting_messages m where m.conversation_id = c.id and m.direction = 'in'
                   and m.created_at > coalesce(r.read_at, '-infinity'::timestamptz))`,
  [workspaceId, userId],
)).rows[0].n;

export const myConversationCount = async (q, workspaceId, userId) => (await q.query(
  'select count(*)::int as n from texting_conversations where workspace_id = $1 and started_by = $2',
  [workspaceId, userId],
)).rows[0].n;
