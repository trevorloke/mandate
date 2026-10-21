// Join a campaign from an invite link. New people set a name and password;
// people who already use Starbase confirm with their existing password.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api.js';

const ROLE_LABEL = { manager: 'a manager', treasurer: 'the treasurer', staff: 'staff', volunteer: 'a volunteer' };

export default function Join() {
  const { token } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inv = useQuery({ queryKey: ['invite', token], queryFn: () => apiGet(`/auth/invite/${token}`), retry: false });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await apiPost('/auth/join', inv.data.hasAccount ? { token, password } : { token, name, password });
      queryClient.clear();
      queryClient.setQueryData(['me'], me);
      navigate(me.role === 'volunteer' ? '/map' : '/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (inv.isPending) return <div className="auth-page"><span className="brand">Starbase</span></div>;
  if (inv.isError) {
    return (
      <div className="auth-page">
        <span className="brand">Starbase</span>
        <h1>Invite not found</h1>
        <p className="muted">{inv.error.message}. Ask your campaign for a new link.</p>
      </div>
    );
  }

  const { email, role, workspaceName, hasAccount } = inv.data;
  return (
    <div className="auth-page">
      <span className="brand">Starbase</span>
      <h1>Join {workspaceName}</h1>
      <p className="muted">You’re invited as {ROLE_LABEL[role] || role}, as <strong>{email}</strong>.</p>
      <form onSubmit={submit}>
        {!hasAccount && (
          <div className="field">
            <label htmlFor="join-name">Your name</label>
            <input id="join-name" className="input" required autoFocus autoComplete="name" maxLength={200}
              value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="join-password">{hasAccount ? 'Your Starbase password' : 'Choose a password'}</label>
          <input id="join-password" className="input" type="password" required minLength={8} maxLength={200}
            autoFocus={hasAccount} autoComplete={hasAccount ? 'current-password' : 'new-password'}
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Joining…' : `Join ${workspaceName}`}
        </button>
      </form>
    </div>
  );
}
