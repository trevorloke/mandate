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

  verifyAuditChain: () => fetchJson('/api/audit/verify'),
  // Export uses a direct download (returns CSV/JSON file), not JSON parsing
};
