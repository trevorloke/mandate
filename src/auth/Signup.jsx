import React, { useState } from 'react';
import './auth.css';
import { useAuth } from './AuthContext';

export default function Signup({ onSwitchToLogin }) {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [candidate, setCandidate] = useState('');
  const [party, setParty] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await signup({ name, email, password, workspaceName, candidate, party }); }
    catch (e) { setErr(e.message || 'Setup failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-screen">
      <div className="auth-screen__form-side">
        <div className="auth-screen__brand"><b>M</b><span>mandate</span></div>

        <h1 className="auth-screen__title">First, <em>your</em> workspace.</h1>
        <p className="auth-screen__sub">
          Create the workspace and the founding administrator. You can invite
          your team after sign-in.
        </p>

        <form className="auth-form" onSubmit={submit}>
          {err && <div className="auth-form__error">{err}</div>}

          <div className="auth-form__row">
            <label className="auth-form__label">Your name</label>
            <input className="auth-form__input" required autoFocus
              placeholder="Marcus Reyes"
              value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div className="auth-form__split">
            <div className="auth-form__row">
              <label className="auth-form__label">Email</label>
              <input className="auth-form__input" type="email" required
                placeholder="you@mandate.app"
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="auth-form__row">
              <label className="auth-form__label">Password</label>
              <input className="auth-form__input" type="password" required
                minLength={8}
                placeholder="min 8 characters"
                value={password} onChange={e => setPassword(e.target.value)} />
            </div>
          </div>

          <div className="auth-form__row">
            <label className="auth-form__label">Workspace name</label>
            <input className="auth-form__input" required
              placeholder="Meridian West — Assembly"
              value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} />
          </div>

          <div className="auth-form__split">
            <div className="auth-form__row">
              <label className="auth-form__label">Candidate</label>
              <input className="auth-form__input"
                placeholder="Amara Tanaka"
                value={candidate} onChange={e => setCandidate(e.target.value)} />
            </div>
            <div className="auth-form__row">
              <label className="auth-form__label">Party</label>
              <input className="auth-form__input"
                placeholder="Meridian Forward"
                value={party} onChange={e => setParty(e.target.value)} />
            </div>
          </div>

          <button className="auth-form__btn" disabled={busy}>
            {busy ? 'Creating workspace…' : 'Create workspace & sign in'}
          </button>

          <div className="auth-screen__footer">
            <span>Already set up?</span>
            <button type="button" onClick={onSwitchToLogin}>Sign in →</button>
          </div>
        </form>
      </div>

      <aside className="auth-screen__editorial">
        <div className="auth-editorial__strip"><span><i /> First-run · Day 1</span></div>
        <div>
          <p className="auth-editorial__quote">
            A workspace is a <em>theatre</em> — one campaign, one playbook, one record.
          </p>
          <div className="auth-editorial__attr">— Mandate operating principle №1</div>
        </div>
        <div className="auth-editorial__strip">
          <span>Multi-tenant</span><span>SQLite local</span><span>Postgres-ready</span>
        </div>
      </aside>
    </div>
  );
}
