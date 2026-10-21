import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../api.js';

const JURISDICTIONS = [
  { value: 'bc-provincial', label: 'BC — Provincial' },
  { value: 'bc-municipal', label: 'BC — Municipal' },
  { value: 'federal', label: 'Federal (Canada)' },
];

export default function Signup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '', email: '', password: '', workspaceName: '', jurisdiction: 'bc-provincial',
  });
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
      <span className="brand">Mandate</span>
      <h1>Start your campaign</h1>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="su-name">Your name</label>
          <input id="su-name" className="input" required autoFocus autoComplete="name"
            value={form.name} onChange={set('name')} />
        </div>
        <div className="field">
          <label htmlFor="su-email">Email</label>
          <input id="su-email" className="input" type="email" required autoComplete="email"
            value={form.email} onChange={set('email')} />
        </div>
        <div className="field">
          <label htmlFor="su-password">Password</label>
          <input id="su-password" className="input" type="password" required minLength={8} autoComplete="new-password"
            value={form.password} onChange={set('password')} />
        </div>
        <div className="field">
          <label htmlFor="su-workspace">Workspace name</label>
          <input id="su-workspace" className="input" required placeholder="Friends of …"
            value={form.workspaceName} onChange={set('workspaceName')} />
        </div>
        <div className="field">
          <label htmlFor="su-jurisdiction">Jurisdiction</label>
          <select id="su-jurisdiction" className="input" value={form.jurisdiction} onChange={set('jurisdiction')}>
            {JURISDICTIONS.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
          </select>
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>Create workspace</button>
      </form>
      <hr className="hairline" />
      <p className="muted">Already set up? <Link to="/login">Sign in</Link></p>
    </div>
  );
}
