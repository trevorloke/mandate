// Multi-workspace management — super_admin only.
import React, { useEffect, useState } from 'react';
import { api } from '../auth/api';
import { useAuth, } from '../auth/AuthContext';
import { invalidateLive } from '../auth/useLiveRecords';

export default function AdminWorkspaces() {
  const { workspace: current, refresh } = useAuth();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    setLoading(true);
    try { const { workspaces } = await api.listWorkspaces(); setList(workspaces); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const onSwitch = async (id) => {
    if (id === current?.id) return;
    if (!confirm('Switch to this workspace? The page will reload to refresh data.')) return;
    try {
      await api.switchWorkspace(id);
      invalidateLive();      // clear live-data cache
      await refresh();
      // Reload to repopulate everything
      window.location.reload();
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };

  const onDelete = async (w) => {
    if (!confirm(`Delete workspace "${w.name}"? This cannot be undone.`)) return;
    try { await api.deleteWorkspace(w.id); setMsg({ kind: 'ok', text: 'Deleted.' }); load(); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };

  const onClone = async (w) => {
    const name = prompt(`Clone "${w.name}" — name for the new workspace:`, `${w.name} (copy)`);
    if (!name?.trim()) return;
    try {
      const r = await api.cloneWorkspace(w.id, name.trim());
      setMsg({ kind: 'ok', text: `Cloned · ${r.recordsCopied} records copied to "${r.workspace.name}".` });
      load();
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };

  const onCreate = async (data) => {
    try {
      await api.createWorkspace(data);
      setShowCreate(false);
      setMsg({ kind: 'ok', text: 'Workspace created.' });
      load();
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p className="adm__msg" style={{ margin: 0 }}>
          {list.length} {list.length === 1 ? 'workspace' : 'workspaces'} in the system. Each is a separate, isolated tenant.
        </p>
        <button className="adm__btn" onClick={() => setShowCreate(true)}>+ New workspace</button>
      </div>

      {msg && <div className={`adm__msg adm__msg--${msg.kind}`} style={{ marginBottom: 12 }}>{msg.text}</div>}

      {showCreate && <NewWorkspaceForm onCancel={() => setShowCreate(false)} onSubmit={onCreate} />}

      {loading ? <p className="adm__msg">Loading…</p> : (
        <table className="adm__table">
          <thead>
            <tr><th>Name</th><th>Kind</th><th>Phase</th><th>Candidate</th><th>Users</th><th>Created</th><th></th></tr>
          </thead>
          <tbody>
            {list.map(w => (
              <tr key={w.id} style={current?.id === w.id ? { background: '#fffbe5' } : null}>
                <td>
                  <b style={{ fontWeight: 500 }}>{w.name}</b>
                  {current?.id === w.id && <span className="adm__role-pill" style={{ marginLeft: 8 }}>current</span>}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-5)' }}>{w.kind}</td>
                <td>{w.phase}</td>
                <td>{w.candidate}</td>
                <td>{w.userCount}</td>
                <td style={{ color: 'var(--ink-5)', fontSize: 12 }}>{new Date(w.createdAt).toLocaleDateString()}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="adm__btn adm__btn--ghost adm__btn-sm" onClick={() => onClone(w)}>Clone</button>
                  {current?.id !== w.id && (
                    <button className="adm__btn adm__btn--ghost adm__btn-sm" style={{ marginLeft: 6 }} onClick={() => onSwitch(w.id)}>Switch</button>
                  )}
                  {current?.id !== w.id && w.userCount === 0 && (
                    <button className="adm__btn adm__btn--danger adm__btn-sm" style={{ marginLeft: 6 }} onClick={() => onDelete(w)}>Delete</button>
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

function NewWorkspaceForm({ onCancel, onSubmit }) {
  const [form, setForm] = useState({
    name: '', kind: 'PROVINCIAL · MLA',
    candidate: '', party: '', phase: 'Pre-launch', daysToVote: 365, tz: 'PT',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await onSubmit({ ...form, daysToVote: Number(form.daysToVote) }); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="adm__panel">
      <div className="adm__panel-h">Workspaces · new</div>
      <h3 className="adm__panel-title">Create workspace</h3>
      {err && <div className="adm__msg adm__msg--err" style={{ marginBottom: 12 }}>{err}</div>}
      <form onSubmit={submit}>
        <div className="adm__field">
          <label className="adm__field-label">Workspace name</label>
          <input className="adm__field-input" required value={form.name} onChange={set('name')} placeholder="e.g. Burnaby South — Federal" />
        </div>
        <div className="adm__field-row">
          <div className="adm__field">
            <label className="adm__field-label">Kind</label>
            <input className="adm__field-input" value={form.kind} onChange={set('kind')} />
          </div>
          <div className="adm__field">
            <label className="adm__field-label">Phase</label>
            <select className="adm__field-select" value={form.phase} onChange={set('phase')}>
              <option>Pre-launch</option>
              <option>Recruitment</option>
              <option>Persuasion</option>
              <option>GOTV</option>
              <option>Post-election</option>
            </select>
          </div>
        </div>
        <div className="adm__field-row">
          <div className="adm__field">
            <label className="adm__field-label">Candidate</label>
            <input className="adm__field-input" value={form.candidate} onChange={set('candidate')} />
          </div>
          <div className="adm__field">
            <label className="adm__field-label">Party</label>
            <input className="adm__field-input" value={form.party} onChange={set('party')} />
          </div>
        </div>
        <div className="adm__field-row">
          <div className="adm__field">
            <label className="adm__field-label">Days to vote</label>
            <input className="adm__field-input" type="number" value={form.daysToVote} onChange={set('daysToVote')} />
          </div>
          <div className="adm__field">
            <label className="adm__field-label">Timezone</label>
            <input className="adm__field-input" value={form.tz} onChange={set('tz')} />
          </div>
        </div>
        <div className="adm__actions">
          <button className="adm__btn" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create workspace'}</button>
          <button className="adm__btn adm__btn--ghost" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
