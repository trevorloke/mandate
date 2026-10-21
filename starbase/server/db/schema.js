// Core DDL. One place, executed idempotently at boot. Record-type tables are
// generated from the shared registry — the registry IS the migration source.
import { ddlFor, recordTypeKeys } from '@starbase/shared/registry';

const CORE = `
create table if not exists workspaces (
  id uuid primary key,
  name text not null,
  slug text unique,
  candidate text,
  jurisdiction text not null default 'bc-provincial',
  settings jsonb not null default '{}',
  event_seq bigint not null default 0,
  last_event_hash text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- Tenancy is a membership, never a mutable column on users.
create table if not exists memberships (
  user_id uuid not null references users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  role text not null check (role in ('manager', 'treasurer', 'staff', 'volunteer')),
  created_at timestamptz not null default now(),
  primary key (user_id, workspace_id)
);

create table if not exists sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- The Person primitive: one canonical row per person/org, first-class.
create table if not exists persons (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind text not null default 'person' check (kind in ('person', 'org')),
  name text not null,
  email text,
  phone text,
  address text,
  unit text,
  city text,
  postal text,
  lat double precision,
  lng double precision,
  tags jsonb not null default '[]',
  socials jsonb not null default '{}',
  rating text,
  rated_at timestamptz,
  attrs jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists persons_ws_name_idx on persons (workspace_id, lower(name)) where deleted_at is null;
create index if not exists persons_ws_email_idx on persons (workspace_id, lower(email)) where deleted_at is null;
create index if not exists persons_ws_addr_idx on persons (workspace_id, lower(address)) where deleted_at is null;

-- Every door/phone/text touch, with the campaign's rating scale.
create table if not exists contacts (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  channel text not null check (channel in ('door', 'phone', 'text')),
  outcome text not null check (outcome in ('contacted', 'no_answer', 'refused', 'moved', 'inaccessible')),
  rating text,
  note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index if not exists contacts_ws_person_idx on contacts (workspace_id, person_id);
create index if not exists contacts_ws_time_idx on contacts (workspace_id, created_at);

-- Signs: billboard (4×8), large (4×4), lawn — at a person's door or a bare address.
create table if not exists signs (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id uuid references persons(id) on delete set null,
  address text,
  lat double precision,
  lng double precision,
  kind text not null check (kind in ('billboard', 'large', 'lawn')),
  status text not null default 'requested' check (status in ('requested', 'installed', 'removed')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists signs_ws_idx on signs (workspace_id, status);

-- Volunteer roles (driver, scrutineer, …); detail carries language / community.
create table if not exists volunteer_roles (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  role text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists vroles_ws_person_idx on volunteer_roles (workspace_id, person_id);
create index if not exists vroles_ws_role_idx on volunteer_roles (workspace_id, role);

-- Volunteer shifts + assignments; notify sends email/text with instructions + link.
create table if not exists shifts (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  role text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  instructions text,
  link text,
  capacity int,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists shifts_ws_time_idx on shifts (workspace_id, starts_at) where deleted_at is null;

create table if not exists shift_assignments (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  shift_id uuid not null references shifts(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  status text not null default 'assigned' check (status in ('assigned', 'confirmed', 'declined', 'no_show', 'completed')),
  notified_at timestamptz,
  notify_email text,
  notify_text text,
  created_at timestamptz not null default now(),
  unique (shift_id, person_id)
);
create index if not exists sassign_ws_shift_idx on shift_assignments (workspace_id, shift_id);

-- Petitions with public signature pages (/p/:workspace/:petition).
create table if not exists petitions (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  slug text not null,
  title text not null,
  body text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table if not exists petition_signatures (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  petition_id uuid not null references petitions(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  address text,
  subscribe boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists psig_petition_idx on petition_signatures (workspace_id, petition_id);

-- Newsletter list (public signup at /n/:workspace; one-click unsubscribe /u/:id).
create table if not exists subscriptions (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  name text,
  status text not null default 'subscribed' check (status in ('subscribed', 'unsubscribed')),
  source text,
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);

-- Email blasts: newsletters to the list, press releases to media-tagged people.
create table if not exists blasts (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind text not null check (kind in ('newsletter', 'press')),
  subject text not null,
  body text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  provider_note text,
  audience_count int not null default 0,
  sent_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table if not exists blast_recipients (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  blast_id uuid not null references blasts(id) on delete cascade,
  email text not null,
  name text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  created_at timestamptz not null default now()
);
create index if not exists brecip_blast_idx on blast_recipients (workspace_id, blast_id);

-- The event log: append-only, per-workspace sequence, hash-chained.
-- This one table is the sync protocol, the audit trail, and the API.
create table if not exists events (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  seq bigint not null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  op text not null check (op in ('create', 'update', 'void', 'restore', 'merge')),
  payload jsonb not null,
  actor_id uuid references users(id),
  client_ts timestamptz,
  server_ts timestamptz not null default now(),
  payload_hash text not null,
  hash text not null,
  primary key (workspace_id, seq)
);
create index if not exists events_entity_idx on events (workspace_id, entity_type, entity_id);

-- Contribution-cap rules, per jurisdiction and year. Seeded with the BC
-- provincial annual individual limit; VERIFY the current indexed amount with
-- Elections BC before relying on it for a filing year. Workspaces may
-- override via settings.capCents.
create table if not exists cap_rules (
  jurisdiction text not null,
  year int not null,
  cap_cents integer not null,
  source_note text not null,
  primary key (jurisdiction, year)
);
`;

const SEED = `
insert into cap_rules (jurisdiction, year, cap_cents, source_note) values
  ('bc-provincial', 2024, 145082, 'Elections BC 2024 indexed annual limit — verify before filing'),
  ('bc-provincial', 2025, 149565, 'Elections BC 2025 indexed annual limit — verify before filing'),
  ('bc-municipal',  2022, 125000, 'LECFA 2022 per-campaign contribution limit — verify the indexed amount for the current election year')
on conflict do nothing;
`;

// Columns added after the first release — bring pre-existing dev databases up
// to the current shape. All idempotent.
const ALTERS = `
alter table workspaces add column if not exists slug text unique;
alter table persons add column if not exists unit text;
alter table persons add column if not exists city text;
alter table persons add column if not exists postal text;
alter table persons add column if not exists lat double precision;
alter table persons add column if not exists lng double precision;
alter table persons add column if not exists tags jsonb not null default '[]';
alter table persons add column if not exists socials jsonb not null default '{}';
alter table persons add column if not exists rating text;
alter table persons add column if not exists rated_at timestamptz;
alter table gifts add column if not exists cadence text;
`;

export const bootstrap = async (db) => {
  await db.exec(CORE);
  for (const key of recordTypeKeys()) await db.exec(ddlFor(key));
  await db.exec(ALTERS);
  await db.exec(SEED);
};
