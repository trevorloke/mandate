// A/B subject lines + open and click tracking for newsletters and press
// releases. Columns on the core blasts / blast_recipients tables, plus the
// links each send carries (the only places a click may redirect to).
//
// blasts.ab_status: null (no test) · 'saved' (email wasn't connected: nothing
// went out; the test starts on Send now) · 'testing' (A and B sent, the rest
// wait for the winner) · 'decided' (winner picked, the rest sent with it).
// blast_recipients.ab_group: 'a' · 'b' · 'rest' (null on a send with no test).
// A 'rest' row is held — never sent — until the blast has a winner.
export const sql = `
alter table blasts add column if not exists ab_subject_b text;
alter table blasts add column if not exists ab_pct int;
alter table blasts add column if not exists ab_wait_hours int;
alter table blasts add column if not exists ab_metric text check (ab_metric in ('opens', 'clicks'));
alter table blasts add column if not exists ab_status text check (ab_status in ('saved', 'testing', 'decided'));
alter table blasts add column if not exists ab_started_at timestamptz;
alter table blasts add column if not exists ab_decide_at timestamptz;
alter table blasts add column if not exists ab_winner text check (ab_winner in ('a', 'b'));
alter table blasts add column if not exists ab_decided_at timestamptz;
alter table blasts add column if not exists ab_result jsonb;

alter table blast_recipients add column if not exists token text;
alter table blast_recipients add column if not exists ab_group text check (ab_group in ('a', 'b', 'rest'));
alter table blast_recipients add column if not exists opens int not null default 0;
alter table blast_recipients add column if not exists first_open_at timestamptz;
alter table blast_recipients add column if not exists last_open_at timestamptz;
alter table blast_recipients add column if not exists clicks int not null default 0;
alter table blast_recipients add column if not exists first_click_at timestamptz;
alter table blast_recipients add column if not exists last_click_at timestamptz;
create unique index if not exists brecip_token_idx on blast_recipients (token) where token is not null;

create table if not exists blast_links (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  blast_id uuid not null references blasts(id) on delete cascade,
  n int not null,
  url text not null,
  primary key (blast_id, n)
);
`;
