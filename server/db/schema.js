// Database schema using Drizzle ORM (SQLite)
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const workspaces = sqliteTable('workspaces', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  kind:        text('kind'),                    // e.g. 'PROVINCIAL · MLA'
  candidate:   text('candidate'),
  party:       text('party'),
  phase:       text('phase'),                   // e.g. 'Persuasion'
  daysToVote:  integer('days_to_vote'),
  tz:          text('tz').default('PT'),
  settings:    text('settings').default('{}'),  // JSON: module enable flags, theme overrides
  plan:        text('plan').notNull().default('free'),  // 'free' | 'pro' | 'enterprise'
  planChangedAt: integer('plan_changed_at', { mode: 'timestamp' }),
  createdAt:   integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt:   integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export const users = sqliteTable('users', {
  id:           text('id').primaryKey(),
  email:        text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name:         text('name').notNull(),
  initials:     text('initials'),
  role:         text('role').notNull().default('viewer'),  // super_admin | admin | editor | viewer
  workspaceId:  text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  active:       integer('active', { mode: 'boolean' }).notNull().default(true),
  totpSecret:   text('totp_secret'),                  // base32-encoded; null until enrolled
  totpEnabled:  integer('totp_enabled', { mode: 'boolean' }).notNull().default(false),
  recoveryCodesHash: text('recovery_codes_hash'),      // JSON array of bcrypt hashes
  locale:       text('locale').notNull().default('en'),
  lastLoginAt:  integer('last_login_at', { mode: 'timestamp' }),
  createdAt:    integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt:    integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export const sessions = sqliteTable('sessions', {
  id:        text('id').primaryKey(),         // random session token
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  ip:        text('ip'),
  userAgent: text('user_agent'),
});

// Generic per-module data store. Each module has many "records".
// Used by admin to populate/customize module content.
// `kind` = entity type within module (e.g. 'voter', 'donor', 'pledge')
export const moduleData = sqliteTable('module_data', {
  id:          text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  module:      text('module').notNull(),       // ground, beacon, raise, ledger, ...
  kind:        text('kind').notNull(),         // voter, post, prospect, je, ...
  data:        text('data').notNull(),         // JSON
  // Per-record permissions: ownerId is the user who created/owns the record.
  // viewerScope: 'workspace' (everyone in workspace can read), 'private' (only owner+shares+admins).
  ownerId:     text('owner_id').references(() => users.id, { onDelete: 'set null' }),
  viewerScope: text('viewer_scope').notNull().default('workspace'),  // 'workspace' | 'private'
  deletedAt:   integer('deleted_at', { mode: 'timestamp' }),
  createdAt:   integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt:   integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Per-record shares — explicit grants for individual users on a single record.
// Composite uniqueness on (recordId, userId) enforced via index.
export const recordShares = sqliteTable('record_shares', {
  id:        text('id').primaryKey(),
  recordId:  text('record_id').notNull(),     // module_data.id (text FK declared inline below if needed)
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  level:     text('level').notNull().default('view'),  // 'view' | 'edit'
  grantedById: text('granted_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Audit log for admin actions. `hash` chains: each row's hash =
// SHA256(prev_hash + canonical(this row)). A break anywhere is detectable
// by replaying the chain.
export const auditLog = sqliteTable('audit_log', {
  id:        text('id').primaryKey(),
  userId:    text('user_id').references(() => users.id, { onDelete: 'set null' }),
  action:    text('action').notNull(),         // 'user.create', 'workspace.update', ...
  target:    text('target'),                   // entity id affected
  meta:      text('meta'),                     // JSON
  ip:        text('ip'),
  prevHash:  text('prev_hash'),
  hash:      text('hash'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Personal access tokens for headless API access.
// The plaintext token is shown ONCE on creation; only its hash is stored.
export const apiTokens = sqliteTable('api_tokens', {
  id:          text('id').primaryKey(),
  userId:      text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  label:       text('label').notNull(),
  tokenHash:   text('token_hash').notNull().unique(),
  prefix:      text('prefix').notNull(),       // first 8 chars for display
  scopes:      text('scopes').default('[]'),
  expiresAt:   integer('expires_at', { mode: 'timestamp' }),
  lastUsedAt:  integer('last_used_at', { mode: 'timestamp' }),
  revoked:     integer('revoked', { mode: 'boolean' }).notNull().default(false),
  createdAt:   integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Outbound webhooks — admin can subscribe URLs to data events.
// On every data.create / update / delete, the system POSTs JSON to active webhook URLs
// signed with HMAC-SHA256 using the per-webhook secret.
export const webhooks = sqliteTable('webhooks', {
  id:             text('id').primaryKey(),
  workspaceId:    text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  label:          text('label').notNull(),
  url:            text('url').notNull(),
  secret:         text('secret').notNull(),       // hex; never returned after creation
  events:         text('events').default('["*"]'),// JSON array of event globs
  active:         integer('active', { mode: 'boolean' }).notNull().default(true),
  lastDeliveryAt: integer('last_delivery_at', { mode: 'timestamp' }),
  lastStatus:     integer('last_status'),         // last HTTP status code
  lastError:      text('last_error'),
  createdAt:      integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// In-app notifications targeted at users.
// `kind` is a free-form tag (e.g. 'invite.accepted', 'webhook.failed', 'mention').
// `link` is an optional in-app path the user should be sent to when they click it.
export const notifications = sqliteTable('notifications', {
  id:        text('id').primaryKey(),
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind:      text('kind').notNull(),
  title:     text('title').notNull(),
  body:      text('body'),
  link:      text('link'),
  readAt:    integer('read_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Dedicated invite table — replaces the old `users.passwordHash = "INVITE:…"` sentinel.
export const invites = sqliteTable('invites', {
  id:           text('id').primaryKey(),
  workspaceId:  text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  invitedById:  text('invited_by_id').references(() => users.id, { onDelete: 'set null' }),
  email:        text('email').notNull(),
  name:         text('name').notNull(),
  role:         text('role').notNull(),
  tokenHash:    text('token_hash').notNull().unique(),
  expiresAt:    integer('expires_at', { mode: 'timestamp' }),
  acceptedAt:   integer('accepted_at', { mode: 'timestamp' }),
  acceptedById: text('accepted_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt:    integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Dedicated password-reset table — replaces the audit-log sentinel hack.
export const passwordResets = sqliteTable('password_resets', {
  id:        text('id').primaryKey(),
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  usedAt:    integer('used_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Per-attempt webhook delivery log. Retried deliveries share an `event_id` (the original event UUID).
// Status: 'queued' | 'success' | 'failed' | 'giving_up'.
//
// Distributed processing: a worker atomically claims rows by stamping its `worker_id` and a
// `lease_expires_at`. If the worker dies, the lease expires and another worker re-claims.
export const webhookDeliveries = sqliteTable('webhook_deliveries', {
  id:              text('id').primaryKey(),
  webhookId:       text('webhook_id').notNull().references(() => webhooks.id, { onDelete: 'cascade' }),
  eventId:         text('event_id').notNull(),       // groups retries for the same event
  event:           text('event').notNull(),
  payload:         text('payload').notNull(),        // raw JSON sent
  attempt:         integer('attempt').notNull().default(1),
  status:          text('status').notNull(),         // queued | success | failed | giving_up
  httpStatus:      integer('http_status'),
  error:           text('error'),
  nextRetryAt:     integer('next_retry_at', { mode: 'timestamp' }),
  workerId:        text('worker_id'),                // who currently owns this delivery
  leaseExpiresAt:  integer('lease_expires_at', { mode: 'timestamp' }),
  createdAt:       integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  completedAt:     integer('completed_at', { mode: 'timestamp' }),
});

// Public forms — workspace-issued endpoints for collecting anonymous submissions.
// e.g. donate forms, volunteer signups, RSVPs.
// On submit, an entry is stored as module_data scoped to (workspace, module, kind).
export const publicForms = sqliteTable('public_forms', {
  id:             text('id').primaryKey(),
  workspaceId:    text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  label:          text('label').notNull(),
  slug:           text('slug').notNull().unique(),  // public path: /api/public/forms/:slug
  module:         text('module').notNull(),
  kind:           text('kind').notNull(),
  allowedFields:  text('allowed_fields').notNull().default('[]'),  // JSON array of field defs
  redirectUrl:    text('redirect_url'),
  rateLimitPerMin: integer('rate_limit_per_min').notNull().default(10),
  active:         integer('active', { mode: 'boolean' }).notNull().default(true),
  // Captcha protection: 'hcaptcha' | 'turnstile' | null (off)
  captchaProvider: text('captcha_provider'),
  captchaSitekey:  text('captcha_sitekey'),
  captchaSecret:   text('captcha_secret'),    // server-side; never returned in GET
  submissionCount: integer('submission_count').notNull().default(0),
  lastSubmissionAt: integer('last_submission_at', { mode: 'timestamp' }),
  createdAt:      integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Comments — threaded discussion on any module record (or any target id).
// `target` is opaque (e.g. 'd_abc...' for module_data; or 'workspace' for workspace-wide).
export const comments = sqliteTable('comments', {
  id:          text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  target:      text('target').notNull(),
  parentId:    text('parent_id'),                   // null for top-level
  authorId:    text('author_id').references(() => users.id, { onDelete: 'set null' }),
  body:        text('body').notNull(),
  mentions:    text('mentions').default('[]'),      // JSON: array of user ids referenced
  editedAt:    integer('edited_at', { mode: 'timestamp' }),
  deletedAt:   integer('deleted_at', { mode: 'timestamp' }),
  createdAt:   integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Dashboard widgets — per-user custom layout shown on the admin overview.
// Each widget knows its kind (metric, list, audit, note) and stores kind-specific params.
// Position controls vertical order within the user's board.
export const dashboardWidgets = sqliteTable('dashboard_widgets', {
  id:          text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId:      text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind:        text('kind').notNull(),                  // metric | list | audit | note
  title:       text('title').notNull(),
  params:      text('params').notNull().default('{}'),  // JSON
  position:    integer('position').notNull().default(0),
  width:       text('width').notNull().default('half'), // 'half' | 'full' | 'third'
  createdAt:   integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt:   integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Passkeys (WebAuthn credentials) — phishing-resistant 2nd factor or password-replacement.
// One user can register many passkeys (phone Face ID, laptop Touch ID, hardware key, etc.).
export const passkeys = sqliteTable('passkeys', {
  id:           text('id').primaryKey(),
  userId:       text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  credentialId: text('credential_id').notNull().unique(),  // base64url
  publicKey:    text('public_key').notNull(),               // base64url COSE public key
  counter:      integer('counter').notNull().default(0),
  deviceType:   text('device_type'),                        // 'singleDevice' | 'multiDevice'
  backedUp:     integer('backed_up', { mode: 'boolean' }).notNull().default(false),
  transports:   text('transports').default('[]'),           // JSON array: ['internal','usb','nfc',...]
  label:        text('label').notNull().default('Passkey'),
  lastUsedAt:   integer('last_used_at', { mode: 'timestamp' }),
  createdAt:    integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// One-shot challenge cache — session-bound, expires fast.
// Used for both registration and authentication ceremonies.
export const webauthnChallenges = sqliteTable('webauthn_challenges', {
  id:        text('id').primaryKey(),
  challenge: text('challenge').notNull().unique(),
  userId:    text('user_id'),                       // null for usernameless login flow
  kind:      text('kind').notNull(),                // 'register' | 'authenticate'
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});
// `kind` selects the generator. `params` is kind-specific JSON config.
// `intervalMinutes` controls the cadence; nextRunAt is the wall-clock trigger.
export const scheduledReports = sqliteTable('scheduled_reports', {
  id:              text('id').primaryKey(),
  workspaceId:     text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  createdById:     text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  name:            text('name').notNull(),
  kind:            text('kind').notNull(),                 // 'bucket_csv' | 'audit_log'
  params:          text('params').notNull().default('{}'), // JSON
  targetEmail:     text('target_email').notNull(),
  intervalMinutes: integer('interval_minutes').notNull().default(1440),  // default daily
  active:          integer('active', { mode: 'boolean' }).notNull().default(true),
  lastRunAt:       integer('last_run_at', { mode: 'timestamp' }),
  lastStatus:      text('last_status'),                    // 'ok' | 'failed'
  lastError:       text('last_error'),
  nextRunAt:       integer('next_run_at', { mode: 'timestamp' }),
  createdAt:       integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});
// prototype simplicity; in production, encrypt at rest with a KMS key.
export const oauthProviders = sqliteTable('oauth_providers', {
  id:                text('id').primaryKey(),
  workspaceId:       text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  label:             text('label').notNull(),               // e.g. 'Google · Mandate'
  kind:              text('kind').notNull(),                // 'google' | 'oidc' (generic)
  // For 'google' we hardcode endpoints. For 'oidc' the issuer is auto-discovered.
  issuerUrl:         text('issuer_url'),
  clientId:          text('client_id').notNull(),
  clientSecret:      text('client_secret').notNull(),
  scopes:            text('scopes').notNull().default('openid email profile'),
  // If true, sign-in for an unknown email auto-creates a user with `autoProvisionRole`.
  autoProvision:     integer('auto_provision', { mode: 'boolean' }).notNull().default(false),
  autoProvisionRole: text('auto_provision_role').notNull().default('viewer'),
  // Cached discovery: { authorization_endpoint, token_endpoint, userinfo_endpoint, jwks_uri }
  discoveryCache:    text('discovery_cache'),
  discoveryCacheAt:  integer('discovery_cache_at', { mode: 'timestamp' }),
  active:            integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt:         integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Daily snapshots of computed business metrics, one row per (workspace, metric, day).
// Powers period-over-period deltas and sparklines for the module KPI strips.
export const metricSnapshots = sqliteTable('metric_snapshots', {
  id:          text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  metricKey:   text('metric_key').notNull(),   // e.g. 'raise.ytd', 'ledger.cash'
  value:       real('value').notNull(),
  day:         text('day').notNull(),          // 'YYYY-MM-DD' (UTC) — daily dedupe key
  capturedAt:  integer('captured_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ── Social (Beacon) — real account connections, scheduled/published posts,
// and per-platform developer-app credentials. Tokens & secrets are stored
// encrypted (see server/lib/crypto.js); they are never returned to the client.

// A connected social account (Bluesky, Mastodon, X, …). `credentials` holds an
// encrypted JSON blob (access/refresh tokens, app password, instance, did…).
export const socialAccounts = sqliteTable('social_accounts', {
  id:             text('id').primaryKey(),
  workspaceId:    text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  platform:       text('platform').notNull(),          // 'bluesky' | 'mastodon' | 'x' | 'meta' | 'linkedin'
  handle:         text('handle'),                       // '@name' / 'name@instance'
  displayName:    text('display_name'),
  avatarUrl:      text('avatar_url'),
  remoteId:       text('remote_id'),                    // did / account id on the platform
  instanceUrl:    text('instance_url'),                 // mastodon instance origin
  credentials:    text('credentials'),                  // encrypted JSON — server-only
  scopes:         text('scopes'),
  status:         text('status').notNull().default('connected'), // connected | error | expired
  lastError:      text('last_error'),
  lastVerifiedAt: integer('last_verified_at', { mode: 'timestamp' }),
  createdById:    text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt:      integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt:      integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// One row per (post content × target account). Posts composed to N accounts
// share a groupId so the UI can group them; the worker publishes each row
// independently with its own status/retry. scheduledAt null = publish now/draft.
export const socialPosts = sqliteTable('social_posts', {
  id:            text('id').primaryKey(),
  workspaceId:   text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  groupId:       text('group_id').notNull(),
  accountId:     text('account_id').references(() => socialAccounts.id, { onDelete: 'set null' }),
  platform:      text('platform').notNull(),
  body:          text('body').notNull().default(''),
  mediaJson:     text('media_json'),                   // JSON array of media refs (future)
  status:        text('status').notNull().default('draft'), // draft|scheduled|publishing|published|failed|canceled
  scheduledAt:   integer('scheduled_at', { mode: 'timestamp' }),
  publishedAt:   integer('published_at', { mode: 'timestamp' }),
  remoteId:      text('remote_id'),
  remoteUrl:     text('remote_url'),
  error:         text('error'),
  attempts:      integer('attempts').notNull().default(0),
  workerId:      text('worker_id'),
  leaseExpiresAt: integer('lease_expires_at', { mode: 'timestamp' }),
  createdById:   text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt:     integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt:     integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Per-platform developer-app credentials (client id/secret) for the gated
// providers that require an OAuth app. clientSecret is stored encrypted.
export const socialApps = sqliteTable('social_apps', {
  id:           text('id').primaryKey(),
  workspaceId:  text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  platform:     text('platform').notNull(),
  clientId:     text('client_id'),
  clientSecret: text('client_secret'),                 // encrypted
  extra:        text('extra').default('{}'),           // JSON: redirect URI, instance, etc.
  active:       integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt:    integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});
