// SharePanel — manages per-record access for a single record.
// Shows: viewer scope (workspace/private), list of explicit shares, add/revoke.
// Visible to owner + admins; rendered inside a record's edit panel.
import { useEffect, useState } from 'react';
import { api } from '../auth/api';
import { useAuth } from '../auth/AuthContext';
import './SharePanel.css';

export default function SharePanel({ recordId }) {
  const [info, setInfo] = useState(null);  // { record, shares }
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pickUser, setPickUser] = useState('');
  const [pickLevel, setPickLevel] = useState('view');
  const { user: me } = useAuth();

  const load = async () => {
    setErr('');
    try {
      const r = await api.listRecordShares(recordId);
      setInfo(r);
    } catch (e) {
      // 403 = not owner/admin → don't render the panel
      if (e.status === 403) { setInfo(null); return; }
      setErr(e.message);
    }
  };

  useEffect(() => {
    load();
    // Try to load user list (admin endpoint — viewers will get 403 silently)
    api.listUsers().then(r => setUsers(r.users || [])).catch(() => {});
  }, [recordId]);

  if (!info) return null;  // user is neither owner nor admin

  const isOwner = info.record.ownerId === me?.id;
  const isAdmin = me?.role === 'admin' || me?.role === 'super_admin';
  const canManage = isOwner || isAdmin;

  const setScope = async (scope) => {
    setBusy(true);
    try { await api.setRecordScope(recordId, scope); await load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const addShare = async (e) => {
    e.preventDefault();
    if (!pickUser) return;
    setBusy(true);
    try { await api.shareRecord(recordId, pickUser, pickLevel); setPickUser(''); await load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const revoke = async (userId) => {
    setBusy(true);
    try { await api.unshareRecord(recordId, userId); await load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  // Users not yet shared with (and not the owner)
  const sharedIds = new Set(info.shares.map(s => s.userId));
  const candidates = users.filter(u =>
    u.id !== info.record.ownerId && !sharedIds.has(u.id) && u.id !== me?.id
  );

  return (
    <div className="shr">
      <div className="shr__head">Access · this record</div>

      <div className="shr__row">
        <span className="shr__label">Visibility</span>
        <div className="shr__scope">
          <button
            className={`shr__pill ${info.record.viewerScope === 'workspace' ? 'is-on' : ''}`}
            disabled={!canManage || busy}
            onClick={() => setScope('workspace')}
          >Everyone in workspace</button>
          <button
            className={`shr__pill ${info.record.viewerScope === 'private' ? 'is-on' : ''}`}
            disabled={!canManage || busy}
            onClick={() => setScope('private')}
          >Private (owner + shares)</button>
        </div>
      </div>

      {info.shares.length > 0 && (
        <ul className="shr__list">
          {info.shares.map(s => (
            <li key={s.id} className="shr__item">
              <span className="shr__avatar">{s.userInitials || (s.userName || '?').slice(0, 2).toUpperCase()}</span>
              <span className="shr__name">
                <b>{s.userName || s.userEmail || s.userId}</b>
                {s.userEmail && <em> · {s.userEmail}</em>}
              </span>
              <span className={`shr__level shr__level--${s.level}`}>{s.level}</span>
              {canManage && (
                <button className="shr__x" disabled={busy} onClick={() => revoke(s.userId)} title="Revoke">×</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && candidates.length > 0 && (
        <form className="shr__add" onSubmit={addShare}>
          <select value={pickUser} onChange={e => setPickUser(e.target.value)}>
            <option value="">Add user…</option>
            {candidates.map(u => (
              <option key={u.id} value={u.id}>{u.name} · {u.email}</option>
            ))}
          </select>
          <select value={pickLevel} onChange={e => setPickLevel(e.target.value)}>
            <option value="view">view</option>
            <option value="edit">edit</option>
          </select>
          <button className="shr__btn" type="submit" disabled={!pickUser || busy}>Grant</button>
        </form>
      )}

      {err && <div className="shr__err">{err}</div>}
    </div>
  );
}
