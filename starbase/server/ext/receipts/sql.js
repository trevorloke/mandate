// Receipts tables. Idempotent; run at boot after the core schema.
//
//   receipt_settings  one row per campaign: who the financial agent is, the
//                     threshold for a receipt, the tax line and the footer,
//                     and the disclosure threshold. No row = the defaults.
//   receipt_counters  the last number used per series ('2026', 'sample'):
//                     bumped inside the gift's own transaction, so a gift
//                     that rolls back hands its number back — no gaps.
//   receipts          one per gift at or over the threshold. The donor's name
//                     and address are copied in when it is issued (and again
//                     whenever it is sent), so a sent receipt stays what the
//                     donor got. token: the donor's own link (/r/<token>).
export const sql = `
create table if not exists receipt_settings (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  threshold_cents int not null default 0 check (threshold_cents >= 0),
  disclosure_cents int not null default 10000 check (disclosure_cents >= 0),
  agent_name text,
  agent_contact text,
  notice text,
  footer text,
  updated_at timestamptz not null default now()
);

create table if not exists receipt_counters (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  series text not null,
  last int not null default 0,
  primary key (workspace_id, series)
);

create table if not exists receipts (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  gift_id uuid not null,
  person_id uuid,
  series text not null,
  seq int not null check (seq > 0),
  number text not null,
  token text not null unique,
  donor_name text not null,
  donor_address text,
  amount_cents int not null,
  received_on date not null,
  method text,
  sample boolean not null default false,
  voided_at timestamptz,
  email_status text check (email_status in ('queued', 'sent', 'failed')),
  email_note text,
  sent_at timestamptz,
  sent_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, gift_id),
  unique (workspace_id, series, seq)
);
create index if not exists receipts_ws_idx on receipts (workspace_id, series, seq);
create index if not exists receipts_person_idx on receipts (workspace_id, person_id);
`;
