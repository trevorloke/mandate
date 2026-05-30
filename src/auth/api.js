// API client. Cookie-based session, double-submit CSRF on mutating requests.
function getCsrfCookie() {
  const m = (typeof document !== 'undefined' ? document.cookie : '').match(/(?:^|;\s*)mdt_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

// Ensure we have a CSRF cookie before we make our first mutating request.
// Hit a cheap GET to trigger the server to set the cookie if missing.
let csrfReady = null;
async function ensureCsrf() {
  if (getCsrfCookie()) return;
  if (!csrfReady) {
    csrfReady = fetch('/api/auth/setup-state', { credentials: 'include' }).then(() => null).catch(() => null);
  }
  await csrfReady;
  csrfReady = null;
}

const fetchJson = async (path, opts = {}) => {
  const method = (opts.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    await ensureCsrf();
  }
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const csrf = getCsrfCookie();
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const res = await fetch(path, {
    credentials: 'include',
    headers,
    ...opts,
    body: opts.body ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
};

export const api = {
  setupState: () => fetchJson('/api/auth/setup-state'),
  signup:   (body) => fetchJson('/api/auth/signup', { method: 'POST', body }),
  login:    (body) => fetchJson('/api/auth/login',  { method: 'POST', body }),
  logout:   ()     => fetchJson('/api/auth/logout', { method: 'POST' }),
  me:       ()     => fetchJson('/api/auth/me'),
  updateMe: (body) => fetchJson('/api/auth/me',     { method: 'PUT', body }),

  workspace: () => fetchJson('/api/workspace'),
  updateWorkspace: (body) => fetchJson('/api/workspace', { method: 'PUT', body }),

  businessMetrics: () => fetchJson('/api/business-metrics'),

  listWorkspaces:   () => fetchJson('/api/workspaces'),
  createWorkspace:  (body) => fetchJson('/api/workspaces', { method: 'POST', body }),
  switchWorkspace:  (id) => fetchJson(`/api/workspaces/switch/${id}`, { method: 'POST' }),
  cloneWorkspace:   (id, name) => fetchJson(`/api/workspaces/${id}/clone`, { method: 'POST', body: { name } }),
  deleteWorkspace:  (id) => fetchJson(`/api/workspaces/${id}`, { method: 'DELETE' }),

  listUsers:   () => fetchJson('/api/users'),
  createUser:  (body) => fetchJson('/api/users', { method: 'POST', body }),
  updateUser:  (id, body) => fetchJson(`/api/users/${id}`, { method: 'PUT', body }),
  deleteUser:  (id) => fetchJson(`/api/users/${id}`, { method: 'DELETE' }),

  listData:    (mod, kind) => fetchJson(`/api/data/${mod}/${kind}`),
  createData:  (mod, kind, data) => fetchJson(`/api/data/${mod}/${kind}`, { method: 'POST', body: data }),
  updateData:  (mod, kind, id, data) => fetchJson(`/api/data/${mod}/${kind}/${id}`, { method: 'PUT', body: data }),
  deleteData:  (mod, kind, id) => fetchJson(`/api/data/${mod}/${kind}/${id}`, { method: 'DELETE' }),
  bulkData:    (mod, kind, records) => fetchJson(`/api/data/${mod}/${kind}/_bulk`, { method: 'PUT', body: records }),
  restoreData: (mod, kind, id) => fetchJson(`/api/data/${mod}/${kind}/${id}/restore`, { method: 'POST' }),

  listTrash:   () => fetchJson('/api/data/_trash'),
  purgeTrashItem: (id) => fetchJson(`/api/data/_trash/${id}`, { method: 'DELETE' }),
  emptyTrash:  () => fetchJson('/api/data/_trash/_empty', { method: 'POST' }),

  audit: (limit = 100) => fetchJson(`/api/audit?limit=${limit}`),

  createInvite: (body) => fetchJson('/api/invites', { method: 'POST', body }),
  getInvite: (token) => fetchJson(`/api/invites/${token}`),
  acceptInvite: (token, password) => fetchJson(`/api/invites/${token}`, { method: 'POST', body: { password } }),

  logoutAll: () => fetchJson('/api/auth/logout-all', { method: 'POST' }),

  requestPasswordReset: (email) => fetchJson('/api/password-reset/request', { method: 'POST', body: { email } }),
  getPasswordReset: (token) => fetchJson(`/api/password-reset/${token}`),
  setPasswordReset: (token, password) => fetchJson(`/api/password-reset/${token}`, { method: 'POST', body: { password } }),

  listTokens:    () => fetchJson('/api/tokens'),
  createToken:   (body) => fetchJson('/api/tokens', { method: 'POST', body }),
  revokeToken:   (id) => fetchJson(`/api/tokens/${id}`, { method: 'DELETE' }),

  listWebhooks:  () => fetchJson('/api/webhooks'),
  createWebhook: (body) => fetchJson('/api/webhooks', { method: 'POST', body }),
  updateWebhook: (id, body) => fetchJson(`/api/webhooks/${id}`, { method: 'PUT', body }),
  deleteWebhook: (id) => fetchJson(`/api/webhooks/${id}`, { method: 'DELETE' }),
  testWebhook:   (id) => fetchJson(`/api/webhooks/${id}/test`, { method: 'POST' }),

  importBackup:  (snapshot, mode = 'append') => fetchJson('/api/workspace/backup/import', { method: 'POST', body: { snapshot, mode } }),

  listNotifications:    () => fetchJson('/api/notifications'),
  markNotificationRead: (id) => fetchJson(`/api/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => fetchJson('/api/notifications/_read_all', { method: 'POST' }),
  deleteNotification:   (id) => fetchJson(`/api/notifications/${id}`, { method: 'DELETE' }),

  totpSetup:   () => fetchJson('/api/auth/totp/setup',   { method: 'POST' }),
  totpEnable:  (code) => fetchJson('/api/auth/totp/enable',  { method: 'POST', body: { code } }),
  totpDisable: (password, code) => fetchJson('/api/auth/totp/disable', { method: 'POST', body: { password, code } }),
  totpRegenerateCodes: (password, code) => fetchJson('/api/auth/totp/regenerate-codes', { method: 'POST', body: { password, code } }),

  listForms:    () => fetchJson('/api/forms'),
  createForm:   (body) => fetchJson('/api/forms', { method: 'POST', body }),
  updateForm:   (id, body) => fetchJson(`/api/forms/${id}`, { method: 'PUT', body }),
  deleteForm:   (id) => fetchJson(`/api/forms/${id}`, { method: 'DELETE' }),

  // Public (anonymous) form rendering + submission — no auth required.
  getPublicForm:    (slug) => fetchJson(`/api/public/forms/${slug}`),
  submitPublicForm: (slug, data) => fetchJson(`/api/public/forms/${slug}`, { method: 'POST', body: data }),

  // Social (Beacon) — real account connections + publishing.
  socialProviders:  () => fetchJson('/api/social/providers'),
  socialAccounts:   () => fetchJson('/api/social/accounts'),
  socialConnect:    (body) => fetchJson('/api/social/accounts/connect', { method: 'POST', body }),
  socialVerify:     (id) => fetchJson(`/api/social/accounts/${id}/verify`, { method: 'POST' }),
  socialDisconnect: (id) => fetchJson(`/api/social/accounts/${id}`, { method: 'DELETE' }),
  socialPosts:      (status) => fetchJson(`/api/social/posts${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  socialCompose:    (body) => fetchJson('/api/social/posts', { method: 'POST', body }),
  socialCancel:     (groupId) => fetchJson(`/api/social/posts/${groupId}/cancel`, { method: 'POST' }),
  socialRetry:      (id) => fetchJson(`/api/social/posts/${id}/retry`, { method: 'POST' }),
  socialSubmit:     (groupId) => fetchJson(`/api/social/posts/${groupId}/submit`, { method: 'POST' }),
  socialApprove:    (groupId) => fetchJson(`/api/social/posts/${groupId}/approve`, { method: 'POST' }),
  socialReject:     (groupId, reason) => fetchJson(`/api/social/posts/${groupId}/reject`, { method: 'POST', body: { reason } }),
  socialPublishNow: (groupId) => fetchJson(`/api/social/posts/${groupId}/publish`, { method: 'POST' }),
  socialRefreshMetrics: (groupId) => fetchJson(`/api/social/posts/${groupId}/metrics`, { method: 'POST' }),
  socialAnalytics:  () => fetchJson('/api/social/analytics'),
  socialBestTimes:  (platform) => fetchJson(`/api/social/best-times${platform ? `?platform=${platform}` : ''}`),
  socialTemplates:       () => fetchJson('/api/social/templates'),
  socialSaveTemplate:    (body) => fetchJson('/api/social/templates', { method: 'POST', body }),
  socialUpdateTemplate:  (id, body) => fetchJson(`/api/social/templates/${id}`, { method: 'PUT', body }),
  socialDeleteTemplate:  (id) => fetchJson(`/api/social/templates/${id}`, { method: 'DELETE' }),
  socialShorten:    (body) => fetchJson('/api/social/shorten', { method: 'POST', body }),
  socialLinks:      () => fetchJson('/api/social/links'),
  socialBulk:       (rows) => fetchJson('/api/social/bulk', { method: 'POST', body: { rows } }),
  socialInbox:        (status, assignee) => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (assignee) q.set('assignee', assignee);
    const s = q.toString();
    return fetchJson(`/api/social/inbox${s ? `?${s}` : ''}`);
  },
  socialTeam:         () => fetchJson('/api/social/team'),
  socialInboxAssign:  (id, userId) => fetchJson(`/api/social/inbox/${id}/assign`, { method: 'POST', body: { userId } }),
  socialInboxSync:    () => fetchJson('/api/social/inbox/sync', { method: 'POST' }),
  socialInboxRead:    (id) => fetchJson(`/api/social/inbox/${id}/read`, { method: 'POST' }),
  socialInboxArchive: (id) => fetchJson(`/api/social/inbox/${id}/archive`, { method: 'POST' }),
  socialInboxReply:   (id, text) => fetchJson(`/api/social/inbox/${id}/reply`, { method: 'POST', body: { text } }),
  // Developer-app credentials for OAuth platforms (X / LinkedIn / Meta).
  socialApps:       () => fetchJson('/api/social/apps'),
  socialSaveApp:    (platform, body) => fetchJson(`/api/social/apps/${platform}`, { method: 'PUT', body }),
  socialDeleteApp:  (platform) => fetchJson(`/api/social/apps/${platform}`, { method: 'DELETE' }),
  // OAuth connect is a browser redirect (not fetch):
  socialConnectStartUrl: (platform, returnTo = '/') => `/api/social/connect/${platform}/start?returnTo=${encodeURIComponent(returnTo)}`,
  // Media upload is multipart (not JSON), so it bypasses fetchJson.
  socialUploadMedia: async (file) => {
    await ensureCsrf();
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/social/media', {
      method: 'POST', credentials: 'include',
      headers: { 'X-CSRF-Token': getCsrfCookie() },
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'upload failed');
    return data;
  },

  listWebhookDeliveries: (id) => fetchJson(`/api/webhooks/${id}/deliveries`),
  retryWebhookDelivery:  (whid, did) => fetchJson(`/api/webhooks/${whid}/deliveries/${did}/retry`, { method: 'POST' }),

  metrics: () => fetchJson('/api/metrics'),

  listOauthProviders:   () => fetchJson('/api/oauth-providers'),
  createOauthProvider:  (body) => fetchJson('/api/oauth-providers', { method: 'POST', body }),
  updateOauthProvider:  (id, body) => fetchJson(`/api/oauth-providers/${id}`, { method: 'PUT', body }),
  deleteOauthProvider:  (id) => fetchJson(`/api/oauth-providers/${id}`, { method: 'DELETE' }),
  publicOauthProviders: () => fetchJson('/api/auth/oauth/providers'),

  listComments:    (target) => fetchJson(`/api/comments?target=${encodeURIComponent(target)}`),
  createComment:   (target, body, parentId) => fetchJson('/api/comments', { method: 'POST', body: { target, body, parentId } }),
  editComment:     (id, body) => fetchJson(`/api/comments/${id}`, { method: 'PUT', body: { body } }),
  deleteComment:   (id) => fetchJson(`/api/comments/${id}`, { method: 'DELETE' }),

  bulkInviteUsers: (rows) => fetchJson('/api/users/_bulk_invite', { method: 'POST', body: { rows } }),

  // Per-record sharing
  listRecordShares: (id) => fetchJson(`/api/data/_record/${id}/shares`),
  shareRecord:      (id, userId, level) => fetchJson(`/api/data/_record/${id}/shares`, { method: 'POST', body: { userId, level } }),
  unshareRecord:    (id, userId) => fetchJson(`/api/data/_record/${id}/shares/${userId}`, { method: 'DELETE' }),
  setRecordScope:   (id, scope) => fetchJson(`/api/data/_record/${id}/scope`, { method: 'PUT', body: { scope } }),

  verifyAuditChain: () => fetchJson('/api/audit/verify'),

  // ── Passkeys (WebAuthn) ──────────────────────────────────────────────
  // Each helper coordinates with the @simplewebauthn/browser library:
  // begin → server returns options → browser prompts user (biometric/PIN/key)
  // → client returns signed response → /complete verifies and acts.
  listPasskeys:   () => fetchJson('/api/auth/passkey'),
  renamePasskey:  (id, label) => fetchJson(`/api/auth/passkey/${id}`, { method: 'PUT', body: { label } }),
  deletePasskey:  (id) => fetchJson(`/api/auth/passkey/${id}`, { method: 'DELETE' }),

  passkeyRegister: async (label) => {
    const { startRegistration } = await import('@simplewebauthn/browser');
    const { options } = await fetchJson('/api/auth/passkey/register/begin', { method: 'POST', body: {} });
    const response = await startRegistration({ optionsJSON: options });
    return fetchJson('/api/auth/passkey/register/complete', { method: 'POST', body: { response, label } });
  },

  passkeyLogin: async (email) => {
    const { startAuthentication } = await import('@simplewebauthn/browser');
    const { options } = await fetchJson('/api/auth/passkey/login/begin', { method: 'POST', body: { email } });
    const response = await startAuthentication({ optionsJSON: options });
    return fetchJson('/api/auth/passkey/login/complete', { method: 'POST', body: { response } });
  },

  // Plan + quotas
  getPlan:    () => fetchJson('/api/workspace/plan'),
  setPlan:    (plan) => fetchJson('/api/workspace/plan', { method: 'PUT', body: { plan } }),

  // Wipe all module records in the current workspace (admin+, irreversible)
  wipeWorkspace: () => fetchJson('/api/workspace/wipe', { method: 'POST' }),

  // Webhook queue stats
  webhookQueueStats: () => fetchJson('/api/webhooks/_queue'),
  webhookQueueTick:  () => fetchJson('/api/webhooks/_queue/tick', { method: 'POST' }),

  // Dashboard widgets
  listWidgets:    () => fetchJson('/api/dashboard'),
  createWidget:   (body) => fetchJson('/api/dashboard', { method: 'POST', body }),
  updateWidget:   (id, body) => fetchJson(`/api/dashboard/${id}`, { method: 'PUT', body }),
  deleteWidget:   (id) => fetchJson(`/api/dashboard/${id}`, { method: 'DELETE' }),
  reorderWidgets: (items) => fetchJson('/api/dashboard/_reorder', { method: 'PUT', body: { items } }),

  // Scheduled reports
  listReports:   () => fetchJson('/api/reports'),
  createReport:  (body) => fetchJson('/api/reports', { method: 'POST', body }),
  updateReport:  (id, body) => fetchJson(`/api/reports/${id}`, { method: 'PUT', body }),
  deleteReport:  (id) => fetchJson(`/api/reports/${id}`, { method: 'DELETE' }),
  runReportNow:  (id) => fetchJson(`/api/reports/${id}/run-now`, { method: 'POST' }),
  // Export uses a direct download (returns CSV/JSON file), not JSON parsing
};
