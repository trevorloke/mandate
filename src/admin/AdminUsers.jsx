import { useEffect, useState } from 'react';
import { api } from '../auth/api';
import { useAuth } from '../auth/AuthContext';
import { fromCSV, downloadFile } from './csv';

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState(null);
  const [inviteResult, setInviteResult] = useState(null);
  const [bulkResults, setBulkResults] = useState(null);

  const load = async () => {
    setLoading(true);
    try { const { users } = await api.listUsers(); setUsers(users); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const onCreate = async (data) => {
    await api.createUser(data);
    setShowCreate(false);
    setMsg({ kind: 'ok', text: 'User created.' });
    load();
  };
  const onUpdate = async (id, data) => {
    await api.updateUser(id, data);
    setEditing(null);
    setMsg({ kind: 'ok', text: 'Updated.' });
    load();
  };
  const onDelete = async (id) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    await api.deleteUser(id);
    setMsg({ kind: 'ok', text: 'Deleted.' });
    load();
  };

  const onInvite = async (data) => {
    const r = await api.createInvite(data);
    setShowInvite(false);
    const url = `${window.location.origin}${r.inviteUrl}`;
    setInviteResult({ url, ...data });
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p className="adm__msg" style={{ margin: 0 }}>
          {users.length} {users.length === 1 ? 'user' : 'users'} in your workspace.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="adm__btn adm__btn--ghost" onClick={() => setShowBulk(true)}>⤓ Bulk CSV invite</button>
          <button className="adm__btn adm__btn--ghost" onClick={() => setShowInvite(true)}>↗ Send invite link</button>
          <button className="adm__btn" onClick={() => setShowCreate(true)}>+ Add user directly</button>
        </div>
      </div>

      {inviteResult && (
        <div className="adm__panel" style={{ background: '#f6efde', borderColor: '#d6c8ae' }}>
          <div className="adm__panel-h">Invite link</div>
          <h3 className="adm__panel-title" style={{ marginBottom: 8 }}>Invite for {inviteResult.name}</h3>
          <p className="adm__msg" style={{ marginBottom: 10 }}>
            Send this single-use link to {inviteResult.email}. They'll set a password and sign in.
          </p>
          <input
            className="adm__field-input"
            readOnly
            value={inviteResult.url}
            onClick={e => e.target.select()}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
          />
          <div className="adm__actions">
            <button className="adm__btn" onClick={() => { navigator.clipboard?.writeText(inviteResult.url); }}>Copy link</button>
            <button className="adm__btn adm__btn--ghost" onClick={() => setInviteResult(null)}>Done</button>
          </div>
        </div>
      )}

      {msg && <div className={`adm__msg adm__msg--${msg.kind}`} style={{ marginBottom: 12 }}>{msg.text}</div>}

      {showCreate && <UserForm onCancel={() => setShowCreate(false)} onSubmit={onCreate} title="Add user directly" me={me} />}
      {showInvite && <UserForm onCancel={() => setShowInvite(false)} onSubmit={onInvite} title="Send invite link" me={me} inviteMode />}
      {showBulk && <BulkInvite
        onCancel={() => setShowBulk(false)}
        onResult={(rs) => { setShowBulk(false); setBulkResults(rs); load(); }}
      />}
      {editing && <UserForm user={editing} onCancel={() => setEditing(null)} onSubmit={(d) => onUpdate(editing.id, d)} title="Edit user" me={me} />}

      {bulkResults && <BulkResults results={bulkResults} onClose={() => setBulkResults(null)} />}

      {loading ? <p className="adm__msg">Loading…</p> : (
        <table className="adm__table">
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td><b style={{ fontWeight: 500 }}>{u.name}</b></td>
                <td>{u.email}</td>
                <td><span className={`adm__role-pill adm__role-pill--${u.role}`}>{u.role.replace('_', ' ')}</span></td>
                <td>{u.active ? 'active' : <em style={{ color: '#8b2418' }}>disabled</em>}</td>
                <td style={{ color: 'var(--ink-5)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '—'}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="adm__btn adm__btn--ghost adm__btn-sm" onClick={() => setEditing(u)}>Edit</button>
                  {u.id !== me.id && (
                    <button className="adm__btn adm__btn--danger adm__btn-sm" style={{ marginLeft: 6 }} onClick={() => onDelete(u.id)}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function UserForm({ user, onCancel, onSubmit, title, me, inviteMode = false }) {
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [role, setRole] = useState(user?.role || 'viewer');
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(user?.active !== false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const data = inviteMode ? { name, email, role } : { name, email, role, active };
      if (!inviteMode && password) data.password = password;
      await onSubmit(data);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const ROLES = me.role === 'super_admin'
    ? ['viewer', 'editor', 'admin', 'super_admin']
    : ['viewer', 'editor', 'admin'];

  return (
    <div className="adm__panel">
      <div className="adm__panel-h">Users · form</div>
      <h3 className="adm__panel-title">{title}</h3>
      {err && <div className="adm__msg adm__msg--err" style={{ marginBottom: 12 }}>{err}</div>}
      <form onSubmit={submit}>
        <div className="adm__field-row">
          <div className="adm__field">
            <label className="adm__field-label">Name</label>
            <input className="adm__field-input" required value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="adm__field">
            <label className="adm__field-label">Email</label>
            <input className="adm__field-input" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
          </div>
        </div>
        <div className="adm__field-row">
          <div className="adm__field">
            <label className="adm__field-label">Role</label>
            <select className="adm__field-select" value={role} onChange={e => setRole(e.target.value)}>
              {ROLES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="adm__field">
            <label className="adm__field-label">{user ? 'New password (optional)' : (inviteMode ? '' : 'Password')}</label>
            {inviteMode ? (
              <p className="adm__msg" style={{ margin: '8px 0 0', fontSize: 12 }}>
                The invitee will set their own password via the link.
              </p>
            ) : (
              <input className="adm__field-input" type="password" minLength={8}
                placeholder={user ? 'leave blank to keep' : 'min 8 characters'}
                required={!user}
                value={password} onChange={e => setPassword(e.target.value)} />
            )}
          </div>
        </div>
        {user && (
          <div className="adm__field">
            <label className="adm__field-label">
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} style={{ marginRight: 8 }} />
              Active
            </label>
          </div>
        )}
        <div className="adm__actions">
          <button className="adm__btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <button className="adm__btn adm__btn--ghost" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function BulkInvite({ onCancel, onResult }) {
  const [csv, setCsv] = useState('email,name,role\nalice@example.com,Alice Doe,editor\nbob@example.com,Bob Smith,viewer');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const rows = fromCSV(csv);
      if (!rows.length) { setErr('CSV is empty.'); setBusy(false); return; }
      const r = await api.bulkInviteUsers(rows);
      onResult(r.invites);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const text = await file.text();
    setCsv(text);
  };

  return (
    <div className="adm__panel">
      <div className="adm__panel-h">Users · bulk invite</div>
      <h3 className="adm__panel-title">Invite multiple users from CSV</h3>
      <p className="adm__msg" style={{ marginBottom: 12 }}>
        CSV columns: <code>email</code>, <code>name</code>, <code>role</code> (one of viewer/editor/admin).
        Each row gets a single-use invite link. Up to 500 rows per batch.
      </p>
      {err && <div className="adm__msg adm__msg--err" style={{ marginBottom: 12 }}>{err}</div>}
      <form onSubmit={submit}>
        <div className="adm__field">
          <label className="adm__field-label">CSV (paste here, or upload)</label>
          <textarea className="adm__field-textarea" rows={10}
            value={csv} onChange={e => setCsv(e.target.value)} spellCheck={false} />
        </div>
        <div className="adm__actions">
          <input type="file" accept=".csv" onChange={onFile} style={{ display: 'none' }} id="bulk-csv-up" />
          <button className="adm__btn adm__btn--ghost" type="button" onClick={() => document.getElementById('bulk-csv-up').click()}>Upload CSV file</button>
          <button className="adm__btn" type="submit" disabled={busy}>{busy ? 'Inviting…' : 'Send invites'}</button>
          <button className="adm__btn adm__btn--ghost" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function BulkResults({ results, onClose }) {
  const ok = results.filter(r => r.ok).length;
  const fail = results.length - ok;
  const downloadLinks = () => {
    const lines = ['email,inviteUrl', ...results.filter(r => r.ok).map(r => `${r.email},${r.inviteUrl}`)];
    downloadFile(`mandate-bulk-invites-${new Date().toISOString().slice(0,10)}.csv`, lines.join('\n'));
  };
  return (
    <div className="adm__panel" style={{ background: '#fff8e0', borderColor: '#d6c8ae' }}>
      <div className="adm__panel-h">Bulk invite · results</div>
      <h3 className="adm__panel-title">{ok} sent · {fail > 0 ? `${fail} failed` : 'no errors'}</h3>
      <p className="adm__msg" style={{ marginBottom: 8 }}>
        Each <b>ok</b> row got a single-use invite link. Distribute them now — the URLs will not be retrievable later.
      </p>
      <table className="adm__table">
        <thead><tr><th>Email</th><th>Status</th><th>Link / Error</th></tr></thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={i}>
              <td>{r.email}</td>
              <td>{r.ok
                ? <span className="adm__role-pill" style={{ color: '#234a2c', borderColor: '#b6cdb9', background: '#ecf5ed' }}>ok</span>
                : <span className="adm__role-pill" style={{ color: '#8b2418', borderColor: '#c4a097', background: '#fbeae6' }}>fail</span>}</td>
              <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                {r.ok ? r.inviteUrl : (r.error || '')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="adm__actions">
        {ok > 0 && <button className="adm__btn" onClick={downloadLinks}>↑ Download links CSV</button>}
        <button className="adm__btn adm__btn--ghost" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
