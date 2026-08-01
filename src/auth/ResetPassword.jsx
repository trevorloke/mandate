import { useEffect, useState } from 'react';
import './auth.css';
import { api } from './api';
import { useAuth } from './AuthContext';

export default function ResetPassword({ token, onCancel }) {
  const { refresh } = useAuth();
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try { setInfo(await api.getPasswordReset(token)); }
      catch (e) { setErr(e.message || 'Invalid link'); }
    })();
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    if (password !== confirm) { setErr('Passwords do not match'); setBusy(false); return; }
    try {
      await api.setPasswordReset(token, password);
      await refresh();
      window.history.replaceState({}, '', '/');
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-screen">
      <div className="auth-screen__form-side">
        <div className="auth-screen__brand"><b>M</b><span>mandate</span></div>

        {err && !info ? (
          <>
            <h1 className="auth-screen__title">Link <em>expired</em>.</h1>
            <p className="auth-screen__sub">{err}</p>
            <button className="auth-form__btn auth-form__btn--ghost" onClick={onCancel}>Back to sign in</button>
          </>
        ) : info ? (
          <>
            <h1 className="auth-screen__title">Set a <em>new</em> password.</h1>
            <p className="auth-screen__sub">For {info.email}. All other devices will be signed out.</p>
            <form className="auth-form" onSubmit={submit}>
              {err && <div className="auth-form__error">{err}</div>}
              <div className="auth-form__row">
                <label className="auth-form__label">New password</label>
                <input className="auth-form__input" type="password" required minLength={8} autoFocus
                  placeholder="min 8 characters"
                  value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <div className="auth-form__row">
                <label className="auth-form__label">Confirm</label>
                <input className="auth-form__input" type="password" required minLength={8}
                  placeholder="repeat"
                  value={confirm} onChange={e => setConfirm(e.target.value)} />
              </div>
              <button className="auth-form__btn" type="submit" disabled={busy}>
                {busy ? 'Updating…' : 'Set password & sign in'}
              </button>
            </form>
          </>
        ) : <p className="adm__msg">Verifying link…</p>}
      </div>

      <aside className="auth-screen__editorial">
        <div className="auth-editorial__strip"><span><i /> Recovery · single-use</span></div>
        <div>
          <p className="auth-editorial__quote">A password is a <em>commitment.</em> Make this one count.</p>
          <div className="auth-editorial__attr">— Mandate security pamphlet</div>
        </div>
        <div className="auth-editorial__strip"><span>Tokens expire after 60 minutes</span></div>
      </aside>
    </div>
  );
}
