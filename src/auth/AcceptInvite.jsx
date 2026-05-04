import React, { useEffect, useState } from 'react';
import './auth.css';
import { api } from './api';
import { useAuth } from './AuthContext';

export default function AcceptInvite({ token, onCancel }) {
  const { refresh } = useAuth();
  const [invite, setInvite] = useState(null);
  const [err, setErr] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try { const r = await api.getInvite(token); setInvite(r.invite); }
      catch (e) { setErr(e.message || 'Invalid invite'); }
    })();
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await api.acceptInvite(token, password);
      // refresh auth state to get the now-signed-in user
      await refresh();
      // strip /invite/:token from URL
      window.history.replaceState({}, '', '/');
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-screen">
      <div className="auth-screen__form-side">
        <div className="auth-screen__brand"><b>M</b><span>mandate</span></div>

        {err && !invite ? (
          <>
            <h1 className="auth-screen__title">Invalid <em>invite</em>.</h1>
            <p className="auth-screen__sub">{err}</p>
            <button className="auth-form__btn auth-form__btn--ghost" onClick={onCancel}>Back to sign in</button>
          </>
        ) : invite ? (
          <>
            <h1 className="auth-screen__title">Welcome, <em>{invite.name.split(' ')[0]}</em>.</h1>
            <p className="auth-screen__sub">
              You've been invited to join as <b style={{ color: 'var(--ink)' }}>{invite.role.replace('_', ' ')}</b>.
              Set a password to begin.
            </p>
            <form className="auth-form" onSubmit={submit}>
              {err && <div className="auth-form__error">{err}</div>}
              <div className="auth-form__row">
                <label className="auth-form__label">Email</label>
                <input className="auth-form__input" value={invite.email} disabled />
              </div>
              <div className="auth-form__row">
                <label className="auth-form__label">Choose a password</label>
                <input className="auth-form__input" type="password" required minLength={8} autoFocus
                  placeholder="min 8 characters"
                  value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <button className="auth-form__btn" type="submit" disabled={busy}>
                {busy ? 'Activating…' : 'Set password & sign in'}
              </button>
            </form>
          </>
        ) : <p className="adm__msg">Loading invite…</p>}
      </div>

      <aside className="auth-screen__editorial">
        <div className="auth-editorial__strip"><span><i /> Invite · single-use</span></div>
        <div>
          <p className="auth-editorial__quote">
            A campaign is a <em>chorus.</em> Welcome to the desk.
          </p>
          <div className="auth-editorial__attr">— Mandate hub captain manual</div>
        </div>
        <div className="auth-editorial__strip">
          <span>Tokens expire after first use</span>
        </div>
      </aside>
    </div>
  );
}
