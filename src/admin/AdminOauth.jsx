// OAuth/OIDC providers — admin only.
import React, { useEffect, useState } from 'react';
import { api } from '../auth/api';

export default function AdminOauth() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    setLoading(true);
    try { const { providers } = await api.listOauthProviders(); setProviders(providers); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const onCreate = async (data) => {
    try {
      await api.createOauthProvider(data);
      setShowCreate(false);
      setMsg({ kind: 'ok', text: 'Provider created.' });
      load();
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };
  const onToggle = async (p) => {
    try { await api.updateOauthProvider(p.id, { active: !p.active }); load(); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };
  const onDelete = async (p) => {
    if (!confirm(`Delete "${p.label}"?`)) return;
    try { await api.deleteOauthProvider(p.id); load(); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
        <p className="adm__msg" style={{ margin: 0, flex: 1 }}>
          Configure single-sign-on. Configure your provider's redirect URI as
          {' '}<code>{(typeof window !== 'undefined' ? window.location.origin : '') + '/api/auth/oauth/callback'}</code>.
          Users sign in with the matching email, or get auto-provisioned if enabled.
        </p>
        <button className="adm__btn" onClick={() => setShowCreate(true)}>+ New provider</button>
      </div>

      {msg && <div className={`adm__msg adm__msg--${msg.kind}`} style={{ marginBottom: 12 }}>{msg.text}</div>}

      {showCreate && <NewProviderForm onCancel={() => setShowCreate(false)} onSubmit={onCreate} />}

      {loading ? <p className="adm__msg">Loading…</p> : providers.length === 0 ? (
        <div className="adm__panel" style={{ textAlign: 'center', color: 'var(--ink-4)' }}>
          <p style={{ fontStyle: 'italic', margin: 0 }}>No OAuth providers configured.</p>
        </div>
      ) : (
        <table className="adm__table">
          <thead>
            <tr><th>Label</th><th>Kind</th><th>Client ID</th><th>Auto-provision</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {providers.map(p => (
              <tr key={p.id}>
                <td><b style={{ fontWeight: 500 }}>{p.label}</b></td>
                <td><span className="adm__role-pill">{p.kind}</span></td>
                <td><code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>{p.clientId}</code></td>
                <td>{p.autoProvision ? <span className="adm__role-pill" style={{ color: '#234a2c', borderColor: '#b6cdb9', background: '#ecf5ed' }}>{p.autoProvisionRole}</span> : <em style={{ color: 'var(--ink-5)' }}>off</em>}</td>
                <td>{p.active
                  ? <span className="adm__role-pill" style={{ color: '#234a2c', borderColor: '#b6cdb9', background: '#ecf5ed' }}>active</span>
                  : <span className="adm__role-pill">paused</span>}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="adm__btn adm__btn--ghost adm__btn-sm" onClick={() => onToggle(p)}>{p.active ? 'Pause' : 'Resume'}</button>
                  <button className="adm__btn adm__btn--danger adm__btn-sm" style={{ marginLeft: 6 }} onClick={() => onDelete(p)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function NewProviderForm({ onCancel, onSubmit }) {
  const [kind, setKind] = useState('google');
  const [label, setLabel] = useState('Google');
  const [issuerUrl, setIssuerUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [scopes, setScopes] = useState('openid email profile');
  const [autoProvision, setAutoProvision] = useState(false);
  const [autoProvisionRole, setAutoProvisionRole] = useState('viewer');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const data = { kind, label, clientId, clientSecret, scopes, autoProvision, autoProvisionRole };
      if (kind === 'oidc') data.issuerUrl = issuerUrl;
      await onSubmit(data);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="adm__panel">
      <div className="adm__panel-h">OAuth · new</div>
      <h3 className="adm__panel-title">Add provider</h3>
      {err && <div className="adm__msg adm__msg--err" style={{ marginBottom: 12 }}>{err}</div>}
      <form onSubmit={submit}>
        <div className="adm__field-row">
          <div className="adm__field">
            <label className="adm__field-label">Kind</label>
            <select className="adm__field-select" value={kind} onChange={e => { setKind(e.target.value); setLabel(e.target.value === 'google' ? 'Google' : ''); }}>
              <option value="google">Google</option>
              <option value="oidc">Generic OIDC (Azure AD, Okta, Auth0, etc.)</option>
            </select>
          </div>
          <div className="adm__field">
            <label className="adm__field-label">Label (shown on login)</label>
            <input className="adm__field-input" required value={label} onChange={e => setLabel(e.target.value)} />
          </div>
        </div>
        {kind === 'oidc' && (
          <div className="adm__field">
            <label className="adm__field-label">Issuer URL</label>
            <input className="adm__field-input adm__field-input--mono" required
              placeholder="https://your-org.okta.com or https://login.microsoftonline.com/{tenant}/v2.0"
              value={issuerUrl} onChange={e => setIssuerUrl(e.target.value)} />
          </div>
        )}
        <div className="adm__field-row">
          <div className="adm__field">
            <label className="adm__field-label">Client ID</label>
            <input className="adm__field-input adm__field-input--mono" required value={clientId} onChange={e => setClientId(e.target.value)} />
          </div>
          <div className="adm__field">
            <label className="adm__field-label">Client secret</label>
            <input className="adm__field-input adm__field-input--mono" type="password" required value={clientSecret} onChange={e => setClientSecret(e.target.value)} />
          </div>
        </div>
        <div className="adm__field">
          <label className="adm__field-label">Scopes</label>
          <input className="adm__field-input adm__field-input--mono" value={scopes} onChange={e => setScopes(e.target.value)} />
        </div>
        <div className="adm__field-row">
          <div className="adm__field">
            <label className="adm__field-bool">
              <input type="checkbox" checked={autoProvision} onChange={e => setAutoProvision(e.target.checked)} />
              <span>Auto-create users on first sign-in</span>
            </label>
          </div>
          {autoProvision && (
            <div className="adm__field">
              <label className="adm__field-label">Default role</label>
              <select className="adm__field-select" value={autoProvisionRole} onChange={e => setAutoProvisionRole(e.target.value)}>
                <option value="viewer">viewer</option>
                <option value="editor">editor</option>
                <option value="admin">admin</option>
              </select>
            </div>
          )}
        </div>
        <div className="adm__actions">
          <button className="adm__btn" type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add provider'}</button>
          <button className="adm__btn adm__btn--ghost" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
