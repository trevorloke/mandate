// Team (managers): one invite row (email · role · Send invite), then members
// as rows with a role select, then pending invites. What each role can do
// sits under "Roles". Volunteers canvass, phone and place signs; staff and
// the treasurer also see money and lists.
import { useId, useState } from 'react';
import { Navigate, useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, action, fmtDate } from '../api.js';
import './outreach.css';

const ROLES = [
  { code: 'volunteer', label: 'Volunteer', hint: 'Map, doors, calls, texts, signs' },
  { code: 'staff',     label: 'Staff',     hint: 'Everything but team and website' },
  { code: 'treasurer', label: 'Treasurer', hint: 'Staff, plus filings' },
  { code: 'manager',   label: 'Manager',   hint: 'Everything, including the team' },
];
const roleLabel = (code) => ROLES.find((r) => r.code === code)?.label || code;

// "Oct 21" (with the year only when it isn't this year), like every other screen.
const fmtDay = (ts) => {
  const d = new Date(ts);
  if (!ts || Number.isNaN(d.getTime())) return fmtDate(ts);
  return d.toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
  });
};
// Let a long address break after the @ rather than mid-word.
const Email = ({ value }) => {
  const at = String(value || '').indexOf('@');
  if (at < 0) return value;
  return <>{value.slice(0, at + 1)}<wbr />{value.slice(at + 1)}</>;
};

function RolesHelp() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="ot-more-wrap">
      <button type="button" className="ot-more" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        Roles
      </button>
      {open && (
        <ul id={id} className="ot-roles ot-more-body">
          {ROLES.map((r) => <li key={r.code}><strong>{r.label}</strong><span className="muted">{r.hint}</span></li>)}
        </ul>
      )}
    </div>
  );
}

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
    <div className="ot-page">
      <div className="ot-top"><h1>Team</h1></div>

      <form className="ot-invite" onSubmit={invite}>
        <label htmlFor="team-email" className="ot-sr">Email</label>
        <input id="team-email" className="input ot-invite__email" type="email" required maxLength={320}
          autoCapitalize="off" spellCheck={false} placeholder="Email"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="team-role" className="ot-sr">Role</label>
        <select id="team-role" className="input ot-role" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
        </select>
        <button type="submit" className="btn btn-primary ot-btn-tap" disabled={busy}>{busy ? 'Inviting…' : 'Send invite'}</button>
      </form>
      {error && <p className="error">{error}</p>}
      {sent && (
        <div className="ot-result" data-status="sent" role="status">
          <div className="ot-result-head">
            <span className="ot-status-dot" data-status="sent" aria-hidden="true" />
            <strong>{sent.emailStatus === 'sent' ? `Emailed ${sent.email}` : `Send ${sent.email} this link`}</strong>
            <button type="button" className="btn ot-btn-tap ot-copy" data-copied={copied ? 'true' : 'false'} onClick={copy}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <code className="ot-joinlink" data-testid="join-url">{sent.joinUrl}</code>
        </div>
      )}

      <h2 className="ot-sec-h">Members <span className="ot-count">{members.length}</span></h2>
      <ul className="ot-list">
        {members.map((m) => (
          <li key={m.id} className="ot-item">
            <div className="ot-row ot-row--static">
              <span className="ot-row__main">
                <span className="ot-row__name">{m.name}{m.id === me.user.id ? <span className="muted"> (you)</span> : null}</span>
                <span className="ot-row__sub ot-row__sub--stack">
                  <span className="ot-email"><Email value={m.email} /></span>
                  <span>since {fmtDay(m.created_at)}</span>
                </span>
              </span>
              <select className="input ot-role" aria-label={`Role for ${m.name}`} value={m.role}
                disabled={m.id === me.user.id} onChange={(e) => setMemberRole(m.id, e.target.value)}>
                {ROLES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
              </select>
            </div>
          </li>
        ))}
      </ul>

      {invites.length > 0 && (
        <>
          <h2 className="ot-sec-h">Invited <span className="ot-count">{invites.length}</span></h2>
          <ul className="ot-list">
            {invites.map((i) => (
              <li key={i.id} className="ot-item">
                <div className="ot-row ot-row--static">
                  <span className="ot-row__main">
                    <span className="ot-row__name ot-email"><Email value={i.email} /></span>
                    <span className="ot-row__sub">
                      <span>{roleLabel(i.role)}</span>
                      <span>until {fmtDay(i.expires_at)}</span>
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <RolesHelp />
    </div>
  );
}
