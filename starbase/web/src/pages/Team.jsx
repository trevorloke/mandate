// Team (managers): invite volunteers and staff by email, share the join link,
// see pending invites, change roles. Volunteers canvass, phone, and place
// signs; staff and the treasurer also see money and lists.
import { useState } from 'react';
import { Navigate, useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, action, fmtDate } from '../api.js';

const ROLES = [
  { code: 'volunteer', label: 'Volunteer', hint: 'Map, doors, phone and text banks, signs' },
  { code: 'staff',     label: 'Staff',     hint: 'Everything except team and website settings' },
  { code: 'treasurer', label: 'Treasurer', hint: 'Staff, plus filings' },
  { code: 'manager',   label: 'Manager',   hint: 'Everything, including the team' },
];

export default function Team() {
  const { me } = useOutletContext();
  const queryClient = useQueryClient();
  const team = useQuery({ queryKey: ['team'], queryFn: () => apiGet('/team'), enabled: me.role === 'manager' });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('volunteer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(null); // { email, joinUrl, emailStatus }
  const [copied, setCopied] = useState(false);

  if (me.role !== 'manager') return <Navigate to="/" replace />;

  const invite = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null); setSent(null); setCopied(false);
    try {
      const r = await action('member.invite', { email: email.trim(), role });
      setSent({ email: r.invite.email, role: r.invite.role, joinUrl: r.joinUrl, emailStatus: r.email });
      setEmail('');
      queryClient.invalidateQueries({ queryKey: ['team'] });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const setMemberRole = async (userId, next) => {
    setError(null);
    try {
      await action('member.setRole', { user_id: userId, role: next });
      queryClient.invalidateQueries({ queryKey: ['team'] });
    } catch (err) {
      setError(err.message);
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(sent.joinUrl); setCopied(true); } catch { setCopied(false); }
  };

  const members = team.data?.members || [];
  const invites = team.data?.invites || [];

  return (
    <>
      <span className="eyebrow">Team</span>
      <h1>Who’s on the campaign</h1>

      <form className="card" onSubmit={invite}>
        <span className="eyebrow">Invite someone</span>
        <div className="form-row" style={{ display: 'flex', gap: 'var(--s-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: '2 1 240px', marginBottom: 0 }}>
            <label htmlFor="team-email">Email</label>
            <input id="team-email" className="input" type="email" required maxLength={320} autoCapitalize="off" spellCheck={false}
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
            <label htmlFor="team-role">Role</label>
            <select id="team-role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Inviting…' : 'Send invite'}</button>
        </div>
        <p className="muted" style={{ marginTop: 'var(--s-2)' }}>{ROLES.find((r) => r.code === role)?.hint}</p>
        {error && <p className="error">{error}</p>}
        {sent && (
          <div className="banner" role="status">
            <div>
              <strong>Invite ready for {sent.email}.</strong>{' '}
              {sent.emailStatus === 'sent'
                ? 'We emailed them the link.'
                : 'Email isn’t connected yet — send them this link yourself (text works too).'}
            </div>
            <div style={{ display: 'flex', gap: 'var(--s-2)', marginTop: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
              <code className="mono" style={{ wordBreak: 'break-all' }} data-testid="join-url">{sent.joinUrl}</code>
              <button type="button" className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
            </div>
          </div>
        )}
      </form>

      <section className="card">
        <span className="eyebrow">Members · {members.length}</span>
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Since</th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.name}{m.id === me.user.id ? <span className="muted"> (you)</span> : null}</td>
                <td className="mono">{m.email}</td>
                <td>
                  <select className="input" aria-label={`Role for ${m.name}`} value={m.role}
                    disabled={m.id === me.user.id} onChange={(e) => setMemberRole(m.id, e.target.value)}>
                    {ROLES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                  </select>
                </td>
                <td className="mono muted">{fmtDate(m.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {invites.length > 0 && (
        <section className="card">
          <span className="eyebrow">Pending invites · {invites.length}</span>
          <table className="table">
            <thead><tr><th>Email</th><th>Role</th><th>Expires</th></tr></thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id}>
                  <td className="mono">{i.email}</td>
                  <td>{ROLES.find((r) => r.code === i.role)?.label || i.role}</td>
                  <td className="mono muted">{fmtDate(i.expires_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
