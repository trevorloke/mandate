// Start a campaign: name, email, password, campaign name. The jurisdiction
// (BC municipal unless changed) sits under "More".
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../api.js';

const JURISDICTIONS = [
  { value: 'bc-municipal', label: 'BC — Municipal' },
  { value: 'bc-provincial', label: 'BC — Provincial' },
  { value: 'federal', label: 'Federal (Canada)' },
];

// Big, thumb-sized controls (auth pages load before any page stylesheet).
const AUTH_INPUT = { minHeight: 48, fontSize: 16 };
const AUTH_BUTTON = { width: '100%', minHeight: 52, fontSize: 13, marginTop: 'var(--s-2)' };
const MORE = {
  display: 'inline-flex', alignItems: 'center', gap: 'var(--s-2)', minHeight: 48, padding: 0, margin: '0 0 var(--s-2)',
  background: 'none', border: 0, cursor: 'pointer', color: 'var(--text-3)',
  fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase',
};

export default function Signup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '', email: '', password: '', workspaceName: '', jurisdiction: 'bc-municipal',
  });
  const [more, setMore] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await apiPost('/auth/signup', form);
      queryClient.setQueryData(['me'], me);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <span className="brand">Starbase</span>
      <h1>Start your campaign</h1>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="su-name">Your name</label>
          <input id="su-name" className="input" required autoFocus autoComplete="name" style={AUTH_INPUT}
            value={form.name} onChange={set('name')} />
        </div>
        <div className="field">
          <label htmlFor="su-email">Email</label>
          <input id="su-email" className="input" type="email" required autoComplete="email" style={AUTH_INPUT}
            value={form.email} onChange={set('email')} />
        </div>
        <div className="field">
          <label htmlFor="su-password">Password</label>
          <input id="su-password" className="input" type="password" required minLength={8} autoComplete="new-password" style={AUTH_INPUT}
            placeholder="8 or more characters" value={form.password} onChange={set('password')} />
        </div>
        <div className="field">
          <label htmlFor="su-workspace">Campaign name</label>
          <input id="su-workspace" className="input" required placeholder="Imagine Surrey" style={AUTH_INPUT}
            value={form.workspaceName} onChange={set('workspaceName')} />
        </div>

        <button type="button" style={MORE} aria-expanded={more} aria-controls="su-more" onClick={() => setMore((v) => !v)}>
          <span aria-hidden="true" style={{ fontSize: 16, width: 12, textAlign: 'center' }}>{more ? '−' : '+'}</span>
          More
        </button>
        {more ? (
          <div id="su-more" className="field">
            <label htmlFor="su-jurisdiction">Jurisdiction</label>
            <select id="su-jurisdiction" className="input" style={AUTH_INPUT} value={form.jurisdiction} onChange={set('jurisdiction')}>
              {JURISDICTIONS.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
            </select>
          </div>
        ) : (
          // Closed, the form still carries the jurisdiction (BC municipal by default).
          <input type="hidden" id="su-jurisdiction" name="jurisdiction" value={form.jurisdiction} />
        )}

        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn btn-primary" style={AUTH_BUTTON} disabled={busy}>
          {busy ? 'Creating…' : 'Create campaign'}
        </button>
      </form>
      <hr className="hairline" />
      <p className="muted"><Link to="/login">Sign in</Link></p>
    </div>
  );
}
