// Team (managers): one invite row (email · role · the button), then members
// as rows with a role select, then pending invites — each with "New link"
// (and "Cancel", once the server offers it). What each role can do sits
// under "Roles". With email not connected the button says "Get invite link":
// the link it shows is the way in.
import { useEffect, useId, useRef, useState } from 'react';
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
// Not on the server yet; "Cancel" appears on an invite once GET /api/actions
// lists it (input { id }).
const CANCEL_INVITE = 'member.cancelInvite';

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

// The join link, once: who it's for, Copy link, and the link itself.
function JoinLink({ sent, testId }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  const linkRef = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { setCopied(false); }, [sent.joinUrl]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sent.joinUrl);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2400);
    } catch {
      // No clipboard (e.g. not https): select the link so a long-press copies it.
      setCopied(false);
      const sel = window.getSelection?.();
      if (sel && linkRef.current) { const r = document.createRange(); r.selectNodeContents(linkRef.current); sel.removeAllRanges(); sel.addRange(r); }
    }
  };
  return (
    <div className="ot-result" data-status="sent" role="status">
      <div className="ot-result-head">
        <span className="ot-status-dot" data-status="sent" aria-hidden="true" />
        <strong>{sent.emailStatus === 'sent' ? `Emailed ${sent.email}` : `Send ${sent.email} this link`}</strong>
        <button type="button" className="btn ot-btn-tap ot-copy" data-copied={copied ? 'true' : 'false'} onClick={copy}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <code ref={linkRef} className="ot-joinlink" data-testid={testId}>{sent.joinUrl}</code>
    </div>
  );
}

// A pending invite: email, role, until when; "New link" makes a fresh link
// (same email, same role) and shows it right here. "Cancel" asks in place.
function InvitedRow({ inv, ids, canCancel, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const newLink = async () => {
    setBusy(true); setError(null); setConfirming(false);
    try {
      const r = await action('member.invite', { email: inv.email, role: inv.role });
      setSent({ email: r.invite.email, joinUrl: r.joinUrl, emailStatus: r.email });
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    setBusy(true); setError(null);
    try {
      // Every pending link for this email stops working.
      for (const id of ids) await action(CANCEL_INVITE, { id });
      onChanged();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <li className="ot-item">
      <div className="ot-row ot-row--static ot-row--wrap">
        <span className="ot-row__main">
          <span className="ot-row__name ot-email"><Email value={inv.email} /></span>
          <span className="ot-row__sub">
            <span>{roleLabel(inv.role)}</span>
            <span>until {fmtDay(inv.expires_at)}</span>
          </span>
        </span>
        {!confirming && (
          <span className="ot-actions ot-row__acts">
            <button type="button" className="btn ot-btn-tap" disabled={busy} onClick={newLink}>
              {busy ? 'Making…' : 'New link'}
            </button>
            {canCancel && (
              <button type="button" className="btn btn-quiet ot-btn-tap" disabled={busy}
                onClick={() => { setConfirming(true); setSent(null); }}>Cancel</button>
            )}
          </span>
        )}
      </div>
      {(confirming || sent || error) && (
        <div className="ot-body">
          {confirming && (
            <div className="ot-confirm ot-confirm-danger" role="group" aria-label="Cancel invite">
              <span>Cancel this invite?</span>
              <button type="button" className="btn ot-btn-tap ot-btn-danger" disabled={busy} onClick={cancel}>
                {busy ? 'Cancelling…' : 'Yes'}
              </button>
              <button type="button" className="btn btn-quiet ot-btn-tap" disabled={busy} onClick={() => setConfirming(false)}>No</button>
            </div>
          )}
          {sent && <JoinLink sent={sent} />}
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </li>
  );
}

function RolesHelp() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="ot-more-wrap">
      <button type="button" className="ot-more disclose" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
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
  const isManager = me.role === 'manager';
  const team = useQuery({ queryKey: ['team'], queryFn: () => apiGet('/team'), enabled: isManager });
  // Is email connected? (Same read Today and Shifts use.)
  const brief = useQuery({ queryKey: ['brief'], queryFn: () => apiGet('/brief'), enabled: isManager, staleTime: Infinity });
  // Which actions this login may run — "Cancel" waits for the server.
  const allowed = useQuery({ queryKey: ['actions'], queryFn: () => apiGet('/actions'), enabled: isManager, staleTime: Infinity });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('volunteer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(null); // { email, joinUrl, emailStatus }

  if (!isManager) return <Navigate to="/" replace />;

  const emailOn = brief.data?.providers?.email === true;
  const canCancel = (allowed.data?.actions ?? []).includes(CANCEL_INVITE);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['team'] });

  const invite = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null); setSent(null);
    try {
      const r = await action('member.invite', { email: email.trim(), role });
      setSent({ email: r.invite.email, role: r.invite.role, joinUrl: r.joinUrl, emailStatus: r.email });
      setEmail('');
      refresh();
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
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const members = team.data?.members || [];
  // Newest first; a re-sent invite replaces the older row for that email.
  const invitesByEmail = new Map();
  for (const i of team.data?.invites || []) {
    const key = String(i.email).toLowerCase();
    const cur = invitesByEmail.get(key);
    if (cur) cur.ids.push(i.id);
    else invitesByEmail.set(key, { inv: i, ids: [i.id] });
  }
  const invites = [...invitesByEmail.values()];

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
        <button type="submit" className="btn btn-primary ot-btn-tap" disabled={busy}>
          {busy ? 'Inviting…' : emailOn ? 'Send invite' : 'Get invite link'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {sent && <JoinLink sent={sent} testId="join-url" />}

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
            {invites.map(({ inv, ids }) => (
              <InvitedRow key={String(inv.email).toLowerCase()} inv={inv} ids={ids} canCancel={canCancel} onChanged={refresh} />
            ))}
          </ul>
        </>
      )}

      <RolesHelp />
    </div>
  );
}
