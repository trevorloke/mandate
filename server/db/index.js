import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { createHash } from 'crypto';
import * as schema from './schema.js';
import { sql } from 'drizzle-orm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.MANDATE_DB || './mandate.db';
const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Register SHA256 for SQLite — used by the audit-log chain trigger.
sqlite.function('sha256_hex', { deterministic: true }, (s) =>
  createHash('sha256').update(String(s ?? '')).digest('hex'));

export const db = drizzle(sqlite, { schema });

// Apply migrations from server/db/migrations if present, else fall back to inline DDL bootstrap.
// Drizzle's migrator is idempotent — safe to run on every boot.
export function ensureTables() {
  const migrationsFolder = join(__dirname, 'migrations');
  if (existsSync(migrationsFolder)) {
    try {
      migrate(db, { migrationsFolder });
    } catch (e) {
      // Migrations fail silently if the DB was bootstrapped via inline DDL — fall through
      console.warn('[db] migration step skipped:', e.message);
    }
  }
  bootstrapTables();
}

function bootstrapTables() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT,
      candidate TEXT,
      party TEXT,
      phase TEXT,
      days_to_vote INTEGER,
      tz TEXT DEFAULT 'PT',
      settings TEXT DEFAULT '{}',
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      initials TEXT,
      role TEXT NOT NULL DEFAULT 'viewer',
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
      active INTEGER NOT NULL DEFAULT 1,
      last_login_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      ip TEXT,
      user_agent TEXT
    );

    CREATE TABLE IF NOT EXISTS module_data (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      module TEXT NOT NULL,
      kind TEXT NOT NULL,
      data TEXT NOT NULL,
      deleted_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      target TEXT,
      meta TEXT,
      ip TEXT,
      prev_hash TEXT,
      hash TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      prefix TEXT NOT NULL,           -- first 8 chars for display ('mdt_xxxx…')
      scopes TEXT DEFAULT '[]',       -- JSON array of scopes (currently informational)
      expires_at INTEGER,
      last_used_at INTEGER,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      url TEXT NOT NULL,
      secret TEXT NOT NULL,
      events TEXT DEFAULT '["*"]',
      active INTEGER NOT NULL DEFAULT 1,
      last_delivery_at INTEGER,
      last_status INTEGER,
      last_error TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      read_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      invited_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER,
      accepted_at INTEGER,
      accepted_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_invites_workspace ON invites(workspace_id);

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL,
      event TEXT NOT NULL,
      payload TEXT NOT NULL,
      attempt INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL,
      http_status INTEGER,
      error TEXT,
      next_retry_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS public_forms (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      module TEXT NOT NULL,
      kind TEXT NOT NULL,
      allowed_fields TEXT NOT NULL DEFAULT '[]',
      redirect_url TEXT,
      rate_limit_per_min INTEGER NOT NULL DEFAULT 10,
      active INTEGER NOT NULL DEFAULT 1,
      captcha_provider TEXT,
      captcha_sitekey TEXT,
      captcha_secret TEXT,
      submission_count INTEGER NOT NULL DEFAULT 0,
      last_submission_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS oauth_providers (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      kind TEXT NOT NULL,
      issuer_url TEXT,
      client_id TEXT NOT NULL,
      client_secret TEXT NOT NULL,
      scopes TEXT NOT NULL DEFAULT 'openid email profile',
      auto_provision INTEGER NOT NULL DEFAULT 0,
      auto_provision_role TEXT NOT NULL DEFAULT 'viewer',
      discovery_cache TEXT,
      discovery_cache_at INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      target TEXT NOT NULL,
      parent_id TEXT,
      author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      body TEXT NOT NULL,
      mentions TEXT DEFAULT '[]',
      edited_at INTEGER,
      deleted_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(workspace_id, target, created_at);

    CREATE TABLE IF NOT EXISTS scheduled_reports (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      created_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      params TEXT NOT NULL DEFAULT '{}',
      target_email TEXT NOT NULL,
      interval_minutes INTEGER NOT NULL DEFAULT 1440,
      active INTEGER NOT NULL DEFAULT 1,
      last_run_at INTEGER,
      last_status TEXT,
      last_error TEXT,
      next_run_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_scheduled_reports_due ON scheduled_reports(active, next_run_at);
    CREATE INDEX IF NOT EXISTS idx_scheduled_reports_workspace ON scheduled_reports(workspace_id);

    CREATE TABLE IF NOT EXISTS passkeys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      device_type TEXT,
      backed_up INTEGER NOT NULL DEFAULT 0,
      transports TEXT DEFAULT '[]',
      label TEXT NOT NULL DEFAULT 'Passkey',
      last_used_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkeys(user_id);

    CREATE TABLE IF NOT EXISTS webauthn_challenges (
      id TEXT PRIMARY KEY,
      challenge TEXT NOT NULL UNIQUE,
      user_id TEXT,
      kind TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expires ON webauthn_challenges(expires_at);

    CREATE TABLE IF NOT EXISTS dashboard_widgets (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      params TEXT NOT NULL DEFAULT '{}',
      position INTEGER NOT NULL DEFAULT 0,
      width TEXT NOT NULL DEFAULT 'half',
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_user ON dashboard_widgets(user_id, position);

    CREATE INDEX IF NOT EXISTS idx_public_forms_workspace ON public_forms(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_public_forms_slug ON public_forms(slug);
    CREATE INDEX IF NOT EXISTS idx_oauth_providers_workspace ON oauth_providers(workspace_id);

    CREATE INDEX IF NOT EXISTS idx_webhooks_workspace ON webhooks(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_hook ON webhook_deliveries(webhook_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(status, next_retry_at);

    CREATE INDEX IF NOT EXISTS idx_module_data_lookup ON module_data(workspace_id, module, kind);
    CREATE INDEX IF NOT EXISTS idx_module_data_deleted ON module_data(workspace_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_users_workspace ON users(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash);
  `);

  // Idempotent column adds for upgrading existing DBs
  alterIfMissing('module_data', 'deleted_at', 'INTEGER');
  alterIfMissing('module_data', 'owner_id', 'TEXT REFERENCES users(id) ON DELETE SET NULL');
  alterIfMissing('module_data', 'viewer_scope', "TEXT NOT NULL DEFAULT 'workspace'");
  alterIfMissing('api_tokens', 'scopes', "TEXT DEFAULT '[]'");
  alterIfMissing('users', 'totp_secret', 'TEXT');
  alterIfMissing('users', 'totp_enabled', 'INTEGER NOT NULL DEFAULT 0');
  alterIfMissing('users', 'recovery_codes_hash', 'TEXT');
  alterIfMissing('users', 'locale', "TEXT NOT NULL DEFAULT 'en'");
  alterIfMissing('public_forms', 'captcha_provider', 'TEXT');
  alterIfMissing('public_forms', 'captcha_sitekey', 'TEXT');
  alterIfMissing('public_forms', 'captcha_secret', 'TEXT');
  alterIfMissing('audit_log', 'prev_hash', 'TEXT');
  alterIfMissing('audit_log', 'hash', 'TEXT');
  alterIfMissing('webhook_deliveries', 'worker_id', 'TEXT');
  alterIfMissing('webhook_deliveries', 'lease_expires_at', 'INTEGER');
  alterIfMissing('workspaces', 'plan', "TEXT NOT NULL DEFAULT 'free'");
  alterIfMissing('workspaces', 'plan_changed_at', 'INTEGER');
  // Index now that the columns exist
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_lease ON webhook_deliveries(status, worker_id, lease_expires_at);`);

  // Per-record shares table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS record_shares (
      id            TEXT PRIMARY KEY,
      record_id     TEXT NOT NULL,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      level         TEXT NOT NULL DEFAULT 'view',
      granted_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_record_shares_record_user ON record_shares(record_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_record_shares_user ON record_shares(user_id);
  `);

  // Daily business-metric snapshots (deltas + sparklines)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS metric_snapshots (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      metric_key   TEXT NOT NULL,
      value        REAL NOT NULL,
      day          TEXT NOT NULL,
      captured_at  INTEGER DEFAULT (unixepoch())
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_metric_snapshots_unique ON metric_snapshots(workspace_id, metric_key, day);
    CREATE INDEX IF NOT EXISTS idx_metric_snapshots_lookup ON metric_snapshots(workspace_id, metric_key, day DESC);
  `);

  // Social (Beacon): connected accounts, scheduled/published posts, dev-app creds.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS social_accounts (
      id               TEXT PRIMARY KEY,
      workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      platform         TEXT NOT NULL,
      handle           TEXT,
      display_name     TEXT,
      avatar_url       TEXT,
      remote_id        TEXT,
      instance_url     TEXT,
      credentials      TEXT,
      scopes           TEXT,
      status           TEXT NOT NULL DEFAULT 'connected',
      last_error       TEXT,
      last_verified_at INTEGER,
      created_by_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at       INTEGER DEFAULT (unixepoch()),
      updated_at       INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_social_accounts_workspace ON social_accounts(workspace_id);

    CREATE TABLE IF NOT EXISTS social_posts (
      id               TEXT PRIMARY KEY,
      workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      group_id         TEXT NOT NULL,
      account_id       TEXT REFERENCES social_accounts(id) ON DELETE SET NULL,
      platform         TEXT NOT NULL,
      body             TEXT NOT NULL DEFAULT '',
      media_json       TEXT,
      status           TEXT NOT NULL DEFAULT 'draft',
      scheduled_at     INTEGER,
      published_at     INTEGER,
      remote_id        TEXT,
      remote_url       TEXT,
      error            TEXT,
      metrics_json     TEXT,
      metrics_at       INTEGER,
      thread_json      TEXT,
      next_retry_at    INTEGER,
      attempts         INTEGER NOT NULL DEFAULT 0,
      worker_id        TEXT,
      lease_expires_at INTEGER,
      created_by_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at       INTEGER DEFAULT (unixepoch()),
      updated_at       INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_social_posts_workspace ON social_posts(workspace_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_social_posts_due ON social_posts(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_social_posts_group ON social_posts(group_id);

    CREATE TABLE IF NOT EXISTS social_apps (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      platform      TEXT NOT NULL,
      client_id     TEXT,
      client_secret TEXT,
      extra         TEXT DEFAULT '{}',
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_social_apps_unique ON social_apps(workspace_id, platform);

    CREATE TABLE IF NOT EXISTS social_oauth_states (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL,
      user_id       TEXT,
      platform      TEXT NOT NULL,
      code_verifier TEXT,
      redirect_uri  TEXT NOT NULL,
      return_to     TEXT,
      expires_at    INTEGER NOT NULL,
      created_at    INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS social_media (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL,
      mime          TEXT NOT NULL,
      filename      TEXT,
      size          INTEGER,
      data          BLOB NOT NULL,
      created_by_id TEXT,
      created_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_social_media_workspace ON social_media(workspace_id);

    CREATE TABLE IF NOT EXISTS social_inbox (
      id               TEXT PRIMARY KEY,
      workspace_id     TEXT NOT NULL,
      account_id       TEXT,
      platform         TEXT NOT NULL,
      type             TEXT NOT NULL,
      remote_id        TEXT NOT NULL,
      author_handle    TEXT,
      author_name      TEXT,
      author_avatar    TEXT,
      text             TEXT,
      parent_remote_id TEXT,
      url              TEXT,
      reply_context    TEXT,
      status           TEXT NOT NULL DEFAULT 'unread',
      assigned_to_id   TEXT,
      assigned_at      INTEGER,
      replied_at       INTEGER,
      remote_created_at INTEGER,
      fetched_at       INTEGER DEFAULT (unixepoch()),
      created_at       INTEGER DEFAULT (unixepoch())
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_social_inbox_unique ON social_inbox(workspace_id, platform, remote_id);
    CREATE INDEX IF NOT EXISTS idx_social_inbox_list ON social_inbox(workspace_id, status, remote_created_at DESC);

    CREATE TABLE IF NOT EXISTS social_templates (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL,
      name          TEXT NOT NULL,
      body          TEXT NOT NULL DEFAULT '',
      media_json    TEXT,
      tags          TEXT DEFAULT '[]',
      created_by_id TEXT,
      created_at    INTEGER DEFAULT (unixepoch()),
      updated_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_social_templates_ws ON social_templates(workspace_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS social_links (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL,
      slug          TEXT NOT NULL UNIQUE,
      target_url    TEXT NOT NULL,
      title         TEXT,
      utm           TEXT,
      post_id       TEXT,
      clicks        INTEGER NOT NULL DEFAULT 0,
      last_click_at INTEGER,
      created_by_id TEXT,
      created_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_social_links_ws ON social_links(workspace_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS social_link_clicks (
      id         TEXT PRIMARY KEY,
      link_id    TEXT NOT NULL,
      referrer   TEXT,
      ua         TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_social_link_clicks_link ON social_link_clicks(link_id, created_at);

    CREATE TABLE IF NOT EXISTS social_feeds (
      id              TEXT PRIMARY KEY,
      workspace_id    TEXT NOT NULL,
      url             TEXT NOT NULL,
      title           TEXT,
      account_ids     TEXT DEFAULT '[]',
      last_item_guid  TEXT,
      last_checked_at INTEGER,
      last_error      TEXT,
      created_by_id   TEXT,
      created_at      INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_social_feeds_ws ON social_feeds(workspace_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS social_keywords (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL,
      phrase        TEXT NOT NULL,
      created_by_id TEXT,
      created_at    INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_social_keywords_ws ON social_keywords(workspace_id);

    CREATE TABLE IF NOT EXISTS social_listening (
      id                TEXT PRIMARY KEY,
      workspace_id      TEXT NOT NULL,
      keyword_id        TEXT,
      platform          TEXT NOT NULL,
      remote_id         TEXT NOT NULL,
      author_handle     TEXT,
      author_name       TEXT,
      author_avatar     TEXT,
      text              TEXT,
      url               TEXT,
      sentiment         TEXT,
      remote_created_at INTEGER,
      fetched_at        INTEGER DEFAULT (unixepoch())
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_social_listening_unique ON social_listening(workspace_id, platform, remote_id);
    CREATE INDEX IF NOT EXISTS idx_social_listening_list ON social_listening(workspace_id, remote_created_at DESC);

    CREATE TABLE IF NOT EXISTS social_metrics_history (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      post_id      TEXT NOT NULL,
      metrics_json TEXT NOT NULL,
      captured_at  INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_social_metrics_history ON social_metrics_history(post_id, captured_at);

    CREATE TABLE IF NOT EXISTS social_audience (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      account_id   TEXT NOT NULL,
      followers    INTEGER NOT NULL,
      day          TEXT NOT NULL,
      captured_at  INTEGER DEFAULT (unixepoch())
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_social_audience_unique ON social_audience(account_id, day);
    CREATE INDEX IF NOT EXISTS idx_social_audience_ws ON social_audience(workspace_id, day);
  `);
  // Columns added after social_posts shipped.
  alterIfMissing('social_posts', 'metrics_json', 'TEXT');
  alterIfMissing('social_posts', 'metrics_at', 'INTEGER');
  alterIfMissing('social_posts', 'thread_json', 'TEXT');
  alterIfMissing('social_posts', 'next_retry_at', 'INTEGER');
  alterIfMissing('social_inbox', 'assigned_to_id', 'TEXT');
  alterIfMissing('social_inbox', 'assigned_at', 'INTEGER');
  alterIfMissing('social_links', 'utm', 'TEXT');

  // Chain audit_log entries: each row gets prev_hash + hash computed
  // automatically by an AFTER INSERT trigger using the registered sha256_hex UDF.
  // Order by SQLite's implicit rowid (insertion order) — created_at is per-second
  // and collisions would otherwise scramble chain order vs. ascending-id read order.
  sqlite.exec(`
    DROP TRIGGER IF EXISTS audit_log_chain;
    CREATE TRIGGER audit_log_chain
    AFTER INSERT ON audit_log
    WHEN NEW.hash IS NULL
    BEGIN
      UPDATE audit_log SET
        prev_hash = COALESCE((SELECT hash FROM audit_log WHERE rowid < NEW.rowid ORDER BY rowid DESC LIMIT 1), ''),
        hash = sha256_hex(
          COALESCE((SELECT hash FROM audit_log WHERE rowid < NEW.rowid ORDER BY rowid DESC LIMIT 1), '') ||
          '|' || NEW.id ||
          '|' || COALESCE(NEW.user_id, '') ||
          '|' || NEW.action ||
          '|' || COALESCE(NEW.target, '') ||
          '|' || COALESCE(NEW.meta, '') ||
          '|' || COALESCE(NEW.created_at, 0)
        )
      WHERE id = NEW.id;
    END;
  `);
}

function alterIfMissing(table, column, decl) {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}

export { sqlite };
