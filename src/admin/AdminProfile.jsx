import { useState } from 'react';
import { api } from '../auth/api';
import { useAuth } from '../auth/AuthContext';
import TotpPanel from './TotpPanel';
import PasskeyPanel from './PasskeyPanel';

export default function AdminProfile() {
  const { user, setUser, logout, refresh } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const saveProfile = async (e) => {
    e.preventDefault();
    setMsg(null); setBusy(true);
    try {
      const updated = await api.updateMe({ name, email });
      setUser(updated.user);
      setMsg({ kind: 'ok', text: 'Profile updated.' });
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setBusy(false); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setMsg(null); setBusy(true);
    try {
      await api.updateMe({ currentPassword, password });
      setCurrentPassword(''); setPassword('');
      setMsg({ kind: 'ok', text: 'Password changed.' });
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setBusy(false); }
  };

  return (
    <div>
      {msg && <div className={`adm__msg adm__msg--${msg.kind}`} style={{ marginBottom: 12 }}>{msg.text}</div>}

      <div className="adm__panel">
        <div className="adm__panel-h">Account · profile</div>
        <h3 className="adm__panel-title">Your details</h3>

        <form onSubmit={saveProfile}>
          <div className="adm__field-row">
            <div className="adm__field">
              <label className="adm__field-label">Name</label>
              <input className="adm__field-input" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="adm__field">
              <label className="adm__field-label">Email</label>
              <input className="adm__field-input" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
          </div>
          <div className="adm__field-row">
            <div className="adm__field">
              <label className="adm__field-label">Role</label>
              <input className="adm__field-input" value={user?.role || ''} disabled />
            </div>
            <div className="adm__field">
              <label className="adm__field-label">Member since</label>
              <input className="adm__field-input" value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : ''} disabled />
            </div>
          </div>
          <div className="adm__actions">
            <button className="adm__btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
          </div>
        </form>
      </div>

      <TotpPanel user={user} onChange={refresh} />

      <PasskeyPanel />

      <div className="adm__panel">
        <div className="adm__panel-h">Account · sessions</div>
        <h3 className="adm__panel-title">Active sessions</h3>
        <p className="adm__msg" style={{ marginBottom: 12 }}>
          If you suspect someone else used your password, sign out everywhere to revoke all of your existing sessions.
        </p>
        <div className="adm__actions">
          <button
            className="adm__btn adm__btn--danger"
            onClick={async () => {
              if (!confirm('Sign out of all devices? You will need to sign in again.')) return;
              try { await api.logoutAll(); } catch {}
              await logout();
            }}
          >
            Sign out everywhere
          </button>
        </div>
      </div>

      <div className="adm__panel">
        <div className="adm__panel-h">Account · security</div>
        <h3 className="adm__panel-title">Change password</h3>
        <form onSubmit={changePassword}>
          <div className="adm__field-row">
            <div className="adm__field">
              <label className="adm__field-label">Current password</label>
              <input className="adm__field-input" type="password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
            </div>
            <div className="adm__field">
              <label className="adm__field-label">New password</label>
              <input className="adm__field-input" type="password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} placeholder="min 8 characters" />
            </div>
          </div>
          <div className="adm__actions">
            <button className="adm__btn" type="submit" disabled={busy || !currentPassword || !password}>
              {busy ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
