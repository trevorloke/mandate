// Personal access tokens for headless API access.
import React, { useEffect, useState } from 'react';
import { api } from '../auth/api';

export default function AdminTokens() {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [revealed, setRevealed] = useState(null);  // {token, label, prefix} after creation
  const [msg, setMsg] = useState(null);

  const load = async () => {
    setLoading(true);
    try { const { tokens } = await api.listTokens(); setTokens(tokens); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const onCreate = async (data) => {
    const r = await api.createToken(data);
    setShowCreate(false);
    setRevealed(r);
    load();
  };

  const onRevoke = async (id) => {
    if (!confirm('Revoke this token? Any service using it will lose access immediately.')) return;
    try { await api.revokeToken(id); setMsg({ kind: 'ok', text: 'Revoked.' }); load(); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 16 }}>
        <p className="adm__msg" style={{ margin: 0, flex: 1 }}>
          Personal access tokens authorize machine-to-machine requests to the API. Use as <code>Authorization: Bearer mdt_…</code>. Tokens act as you (same role and workspace).
        </p>
        <button className="adm__btn" onClick={() => setShowCreate(true)}>+ New token</button>
      </div>

      {msg && <div className={`adm__msg adm__msg--${msg.kind}`} style={{ marginBottom: 12 }}>{msg.text}</div>}

      {revealed && (
        <div className="adm__panel" style={{ background: '#fff8e0', borderColor: '#d6c8ae' }}>
          <div className="adm__panel-h">Save this token now</div>
          <h3 className="adm__panel-title">It will not be shown again</h3>
          <p className="adm__msg" style={{ marginBottom: 10 }}>
            Token <b>"{revealed.label}"</b> created. Copy it now and store it securely.
          </p>
          <input
            className="adm__field-input adm__field-input--mono"
            readOnly
            value={revealed.token}
            onClick={e => e.target.select()}
            style={{ fontSize: 13 }}
          />
          <div className="adm__actions">
            <button className="adm__btn" onClick={() => navigator.clipboard?.writeText(revealed.token)}>Copy token</button>
            <button className="adm__btn adm__btn--ghost" onClick={() => setRevealed(null)}>I've saved it</button>
          </div>
          <pre className="adm__codeblock">
{`# Try it:
curl -H "Authorization: Bearer ${revealed.token.slice(0, 12)}…" \\
  https://your-host/api/data/ground/voter`}
          </pre>
        </div>
      )}

      {showCreate && <NewTokenForm onCancel={() => setShowCreate(false)} onSubmit={onCreate} />}

      {loading ? <p className="adm__msg">Loading…</p> : tokens.length === 0 ? (
        <div className="adm__panel" style={{ textAlign: 'center', color: 'var(--ink-4)' }}>
          <p style={{ fontStyle: 'italic', margin: 0 }}>No tokens yet. Create one to integrate.</p>
        </div>
      ) : (
        <table className="adm__table">
          <thead>
            <tr><th>Label</th><th>Prefix</th><th>Scopes</th><th>Last used</th><th>Expires</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {tokens.map(t => (
              <tr key={t.id}>
                <td><b style={{ fontWeight: 500 }}>{t.label}</b></td>
                <td><code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>mdt_{t.prefix}…</code></td>
                <td>
                  {(t.scopes || ['read', 'write']).map(s => (
                    <span key={s} className="adm__role-pill" style={{ marginRight: 4 }}>{s}</span>
                  ))}
                </td>
                <td style={{ fontSize: 12, color: 'var(--ink-5)' }}>{t.lastUsedAt ? relTime(t.lastUsedAt) : '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--ink-5)' }}>{t.expiresAt ? new Date(t.expiresAt).toLocaleDateString() : 'never'}</td>
                <td>
                  {t.revoked
                    ? <span className="adm__role-pill" style={{ color: '#8b2418', borderColor: '#c4a097' }}>revoked</span>
                    : <span className="adm__role-pill" style={{ color: '#234a2c', borderColor: '#b6cdb9', background: '#ecf5ed' }}>active</span>}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {!t.revoked && <button className="adm__btn adm__btn--danger adm__btn-sm" onClick={() => onRevoke(t.id)}>Revoke</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function NewTokenForm({ onCancel, onSubmit }) {
  const [label, setLabel] = useState('');
  const [expires, setExpires] = useState('90');  // days
  const [scopeRead, setScopeRead] = useState(true);
  const [scopeWrite, setScopeWrite] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const expiresInDays = expires === 'never' ? 0 : Number(expires);
      const scopes = [];
      if (scopeRead) scopes.push('read');
      if (scopeWrite) scopes.push('write');
      if (!scopes.length) { setErr('Select at least one scope'); setBusy(false); return; }
      await onSubmit({ label, expiresInDays, scopes });
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="adm__panel">
      <div className="adm__panel-h">Tokens · new</div>
      <h3 className="adm__panel-title">Generate access token</h3>
      {err && <div className="adm__msg adm__msg--err" style={{ marginBottom: 12 }}>{err}</div>}
      <form onSubmit={submit}>
        <div className="adm__field">
          <label className="adm__field-label">Label</label>
          <input className="adm__field-input" required autoFocus
            placeholder="e.g. CRM sync · Mobile app · CI integration"
            value={label} onChange={e => setLabel(e.target.value)} />
        </div>
        <div className="adm__field-row">
          <div className="adm__field">
            <label className="adm__field-label">Expires in</label>
            <select className="adm__field-select" value={expires} onChange={e => setExpires(e.target.value)}>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
              <option value="never">Never</option>
            </select>
          </div>
          <div className="adm__field">
            <label className="adm__field-label">Scopes</label>
            <div style={{ display: 'flex', gap: 14, paddingTop: 6 }}>
              <label className="adm__field-bool">
                <input type="checkbox" checked={scopeRead} onChange={e => setScopeRead(e.target.checked)} />
                <span>read · GET</span>
              </label>
              <label className="adm__field-bool">
                <input type="checkbox" checked={scopeWrite} onChange={e => setScopeWrite(e.target.checked)} />
                <span>write · POST / PUT / DELETE</span>
              </label>
            </div>
          </div>
        </div>
        <div className="adm__actions">
          <button className="adm__btn" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create token'}</button>
          <button className="adm__btn adm__btn--ghost" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function relTime(t) {
  const d = new Date(t);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return d.toLocaleDateString();
}
