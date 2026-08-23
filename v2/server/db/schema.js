// Core DDL. One place, executed idempotently at boot. Record-type tables are
// generated from the shared registry — the registry IS the migration source.
import { ddlFor, recordTypeKeys } from '@mandate/shared/registry';

const CORE = `
create table if not exists workspaces (
  id uuid primary key,
  name text not null,
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
  attrs jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists persons_ws_name_idx on persons (workspace_id, lower(name)) where deleted_at is null;
create index if not exists persons_ws_email_idx on persons (workspace_id, lower(email)) where deleted_at is null;

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
  ('bc-provincial', 2025, 149565, 'Elections BC 2025 indexed annual limit — verify before filing')
on conflict do nothing;
`;

export const bootstrap = async (db) => {
  await db.exec(CORE);
  for (const key of recordTypeKeys()) await db.exec(ddlFor(key));
  await db.exec(SEED);
};
