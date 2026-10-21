// Person profile — everything the campaign knows about one person, and every
// field action you can take on them: rate, log a call, tag, assign a role,
// request a sign, see shifts, gifts, contact history and the household.
import { useRef, useState } from 'react';
import { Link, useParams, useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RATINGS, ratingByCode, VOLUNTEER_ROLES, SOCIAL_PLATFORMS, SUGGESTED_TAGS,
  SIGN_KINDS, SIGN_STATUSES, DONOR_TIERS,
} from '@starbase/shared/canvass';
import { apiGet, fmtMoney, fmtDate } from '../api.js';
import {
  RatingChip, RatingRow, TagEditor, useAction, fmtWhen, fmtDay, telHref, smsHref,
  canDesk, invalidatePersonData,
} from './People.jsx';
import './people.css';

const TIER_LABEL = {
  superstar: DONOR_TIERS.superstar.label,
  star: DONOR_TIERS.star.label,
  monthly: 'Monthly donor',
  'one-time': 'Donor',
};
const TIER_CLASS = { superstar: 'chip chip-mark', star: 'chip chip-mark', monthly: 'chip chip-ok', 'one-time': 'chip' };

const OUTCOME_LABEL = {
  contacted: 'Contacted', no_answer: 'No answer', refused: 'Refused', moved: 'Moved', inaccessible: 'Inaccessible',
};
const CHANNEL_LABEL = { door: 'Door', phone: 'Phone', text: 'Text' };
const STATUS_CHIP = {
  assigned: 'chip', confirmed: 'chip chip-ok', declined: 'chip chip-danger', no_show: 'chip chip-danger', completed: 'chip',
  requested: 'chip chip-warn', installed: 'chip chip-ok', removed: 'chip chip-ghost',
};

const stripHandle = (h) => String(h || '').trim().replace(/^@/, '');
const isUrl = (h) => /^https?:\/\//i.test(String(h || '').trim());
const SOCIAL_URL = {
  facebook: (h) => `https://facebook.com/${stripHandle(h)}`,
  instagram: (h) => `https://instagram.com/${stripHandle(h)}`,
  x: (h) => `https://x.com/${stripHandle(h)}`,
  tiktok: (h) => `https://tiktok.com/@${stripHandle(h)}`,
  youtube: (h) => `https://youtube.com/@${stripHandle(h)}`,
  linkedin: (h) => `https://linkedin.com/in/${stripHandle(h)}`,
  bluesky: (h) => `https://bsky.app/profile/${stripHandle(h)}`,
  other: (h) => (isUrl(h) ? h.trim() : null),
};
const socialHref = (platform, handle) => (isUrl(handle) ? handle.trim() : SOCIAL_URL[platform]?.(handle) ?? null);
const PLATFORM_LABEL = { x: 'X', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', bluesky: 'Bluesky' };
const platformLabel = (p) => PLATFORM_LABEL[p] || p.charAt(0).toUpperCase() + p.slice(1);

// ─────────────────────────────────────────────────────────────────────────────
// Header: name, kind, rating, donor tier, tags (+ editor)
// ─────────────────────────────────────────────────────────────────────────────
function Header({ person, donor, refresh, desk }) {
  const [editingTags, setEditingTags] = useState(false);
  const act = useAction(refresh);
  const r = ratingByCode(person.rating);
  const tags = Array.isArray(person.tags) ? person.tags : [];

  return (
    <header className="profile-head">
      <span className="eyebrow"><Link to="/people">People</Link> / {person.kind === 'org' ? 'organization' : 'person'}</span>
      <h1>{person.name}</h1>
      <div className="profile-meta">
        <RatingChip code={person.rating} />
        {r
          ? <span className="muted">{r.label}{person.rated_at ? ` · rated ${fmtDay(person.rated_at)}` : ''}</span>
          : <span className="muted">Not yet rated</span>}
        {/* donor is null for volunteers (the server hides money from them) */}
        {donor?.tier && TIER_LABEL[donor.tier] && (
          <span className={TIER_CLASS[donor.tier]} title={`${fmtMoney(donor.yearCents)} this year${Number(donor.monthlyCents) ? ` · ${fmtMoney(donor.monthlyCents)}/mo` : ''}`}>
            {TIER_LABEL[donor.tier]}
          </span>
        )}
      </div>
      <div className="profile-meta" style={{ marginTop: 'var(--s-2)' }}>
        <span className="eyebrow">Tags</span>
        {tags.length === 0 && !editingTags && <span className="muted">none</span>}
        {!editingTags && tags.map((t) => (
          <Link key={t} to={`/people?tag=${encodeURIComponent(t)}`} className="chip" style={{ textDecoration: 'none' }}>{t}</Link>
        ))}
        {desk && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditingTags((v) => !v)}>
            {editingTags ? 'Done' : 'Edit tags'}
          </button>
        )}
      </div>
      {desk && editingTags && (
        <TagEditor
          tags={tags}
          suggestions={SUGGESTED_TAGS}
          disabled={act.busy}
          autoFocus
          onChange={(next) => act.run('person.update', { id: person.id, tags: next })}
        />
      )}
      {act.error && <p className="error">{act.error}</p>}
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Contact card + edit form + socials
// ─────────────────────────────────────────────────────────────────────────────
function EditDetailsForm({ person, refresh, onClose }) {
  const [form, setForm] = useState({
    name: person.name || '', kind: person.kind || 'person', phone: person.phone || '', email: person.email || '',
    address: person.address || '', unit: person.unit || '', city: person.city || '', postal: person.postal || '',
  });
  const act = useAction(refresh);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const v = (s) => (s && s.trim() ? s.trim() : null);

  const submit = async (e) => {
    e.preventDefault();
    const res = await act.run('person.update', {
      id: person.id,
      name: form.name.trim(),
      kind: form.kind,
      phone: v(form.phone), email: v(form.email),
      address: v(form.address), unit: v(form.unit), city: v(form.city), postal: v(form.postal),
    });
    if (res) onClose();
  };

  return (
    <form className="card inline-form" onSubmit={submit}>
      <span className="eyebrow">Edit details</span>
      <div className="form-row">
        <div className="field">
          <label htmlFor="ed-name">Name</label>
          <input id="ed-name" className="input" required maxLength={300} value={form.name} onChange={set('name')} />
        </div>
        <div className="field" style={{ flex: '0 1 150px' }}>
          <label htmlFor="ed-kind">Kind</label>
          <select id="ed-kind" className="input" value={form.kind} onChange={set('kind')}>
            <option value="person">Person</option>
            <option value="org">Organization</option>
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="ed-phone">Phone</label>
          <input id="ed-phone" className="input mono" type="tel" inputMode="tel" maxLength={40} value={form.phone} onChange={set('phone')} />
        </div>
        <div className="field">
          <label htmlFor="ed-email">Email</label>
          <input id="ed-email" className="input" type="email" maxLength={320} value={form.email} onChange={set('email')} />
        </div>
      </div>
      <div className="form-row">
        <div className="field" style={{ flex: '2 1 200px' }}>
          <label htmlFor="ed-address">Street address</label>
          <input id="ed-address" className="input" maxLength={1000} value={form.address} onChange={set('address')} />
        </div>
        <div className="field" style={{ flex: '0 1 90px' }}>
          <label htmlFor="ed-unit">Unit</label>
          <input id="ed-unit" className="input" maxLength={40} value={form.unit} onChange={set('unit')} />
        </div>
        <div className="field">
          <label htmlFor="ed-city">City</label>
          <input id="ed-city" className="input" maxLength={120} value={form.city} onChange={set('city')} />
        </div>
        <div className="field" style={{ flex: '0 1 120px' }}>
          <label htmlFor="ed-postal">Postal</label>
          <input id="ed-postal" className="input mono" maxLength={20} value={form.postal} onChange={set('postal')} />
        </div>
      </div>
      {act.error && <p className="error">{act.error}</p>}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={act.busy}>Save</button>
        <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

// The server's socials schema is a partial record keyed ONLY by
// SOCIAL_PLATFORMS (zod rejects any other key with "Unrecognized key"), values
// strings ≤300. Send only known, non-empty keys so one stray legacy key on
// file can't make every save fail.
const cleanSocials = (s) => Object.fromEntries(
  SOCIAL_PLATFORMS
    .filter((p) => typeof s?.[p] === 'string' && s[p].trim())
    .map((p) => [p, s[p].trim().slice(0, 300)]),
);

function Socials({ person, refresh, desk }) {
  const [platform, setPlatform] = useState('instagram');
  const [handle, setHandle] = useState('');
  const [adding, setAdding] = useState(false);
  const act = useAction(refresh);
  const socials = cleanSocials(person.socials);
  const entries = Object.entries(socials);

  const save = async (next) => act.run('person.update', { id: person.id, socials: cleanSocials(next) });
  const add = async (e) => {
    e.preventDefault();
    const h = handle.trim();
    if (!h) return;
    const res = await save({ ...socials, [platform]: h });
    if (res) { setHandle(''); setAdding(false); }
  };
  const remove = (p) => {
    const next = { ...socials };
    delete next[p];
    save(next);
  };

  return (
    <>
      <div className="card-head" style={{ marginTop: 'var(--s-3)' }}>
        <span className="eyebrow">Socials</span>
        {desk && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Close' : '+ Add'}
          </button>
        )}
      </div>
      {entries.length === 0 && !adding && <p className="muted" style={{ margin: 0 }}>No social handles on file.</p>}
      {entries.length > 0 && (
        <ul className="contact-lines">
          {entries.map(([p, h]) => {
            const href = socialHref(p, h);
            return (
              <li key={p}>
                <span className="k">{platformLabel(p)}</span>
                <span className="v">
                  {href ? <a href={href} target="_blank" rel="noopener noreferrer">{h}</a> : h}
                </span>
                {desk && (
                  <span className="act">
                    <button type="button" className="chip-x" aria-label={`Remove ${platformLabel(p)}`} disabled={act.busy} onClick={() => remove(p)}>×</button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {desk && adding && (
        <form className="socials-add" onSubmit={add}>
          <div className="field">
            <label htmlFor="soc-platform">Platform</label>
            <select id="soc-platform" className="input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {SOCIAL_PLATFORMS.map((p) => <option key={p} value={p}>{platformLabel(p)}</option>)}
            </select>
          </div>
          <div className="field wide">
            <label htmlFor="soc-handle">Handle or URL</label>
            <input id="soc-handle" className="input" autoFocus maxLength={300} value={handle} onChange={(e) => setHandle(e.target.value)}
              placeholder={platform === 'other' ? 'https://…' : '@handle'} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={act.busy || !handle.trim()}>Save</button>
        </form>
      )}
      {act.error && <p className="error">{act.error}</p>}
    </>
  );
}

function ContactCard({ person, refresh, onLog, me, desk }) {
  const [editing, setEditing] = useState(false);
  if (desk && editing) return <EditDetailsForm person={person} refresh={refresh} onClose={() => setEditing(false)} />;

  const first = (person.name || '').split(/\s+/)[0];
  const mine = (me?.user?.name || '').split(/\s+/)[0];
  const body = `Hi ${first}, it's ${mine} with ${me?.workspace?.name || 'the campaign'}.`;
  const addr = [
    [person.address, person.unit ? `#${person.unit}` : null].filter(Boolean).join(' '),
    [person.city, person.postal].filter(Boolean).join('  '),
  ].filter(Boolean);

  return (
    <section className="card">
      <div className="card-head">
        <span className="eyebrow">Contact</span>
        {desk && <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(true)}>Edit details</button>}
      </div>
      <ul className="contact-lines">
        <li>
          <span className="k">Phone</span>
          <span className="v">
            {person.phone
              ? <a className="mono" href={telHref(person.phone)}>{person.phone}</a>
              : <span className="muted">none</span>}
          </span>
          {person.phone && (
            <span className="act">
              <a className="btn btn-sm" href={telHref(person.phone)} onClick={() => onLog('phone')}>Call</a>
              <a className="btn btn-sm" href={smsHref(person.phone, body)} onClick={() => onLog('text')}>Text</a>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => onLog('phone')}>Log call</button>
            </span>
          )}
        </li>
        <li>
          <span className="k">Email</span>
          <span className="v">
            {person.email ? <a href={`mailto:${person.email}`}>{person.email}</a> : <span className="muted">none</span>}
          </span>
        </li>
        <li>
          <span className="k">Address</span>
          <span className="v addr-lines">
            {addr.length ? addr.map((l, i) => <div key={i}>{l}</div>) : <span className="muted">none</span>}
          </span>
          {person.address && (
            <span className="act">
              {/* Map selects ?person=<id>, and offers to place a pin when there is none
                  (person.locate is open to volunteers too). */}
              {person.lat != null && person.lng != null
                ? <Link className="btn btn-quiet btn-sm" to={`/map?person=${person.id}`}>On map</Link>
                : <Link className="btn btn-quiet btn-sm" to={`/map?person=${person.id}`} title="No pin yet — place one on the map">Place pin</Link>}
            </span>
          )}
        </li>
      </ul>
      <Socials person={person} refresh={refresh} desk={desk} />
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rating card: channel toggle + rating row + outcomes → contact.log
// ─────────────────────────────────────────────────────────────────────────────
function RatingCard({ person, refresh, channel, setChannel, cardRef }) {
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');
  const act = useAction(refresh);

  const log = async (outcome, rating) => {
    const res = await act.run('contact.log', {
      person_id: person.id, channel, outcome, rating: rating || undefined, note: note.trim() || undefined,
    });
    if (res) {
      setNote('');
      const saved = res.queued ? 'Saved offline — sends when you’re back online · ' : '';
      setStatus(saved + (rating
        ? `Logged ${CHANNEL_LABEL[channel].toLowerCase()} · rated ${rating} (${ratingByCode(rating)?.label})`
        : `Logged ${CHANNEL_LABEL[channel].toLowerCase()} · ${OUTCOME_LABEL[outcome].toLowerCase()}`));
    }
  };

  return (
    <section className="card" ref={cardRef}>
      <div className="card-head">
        <span className="eyebrow">Rate this contact</span>
        <div className="channel-toggle" role="group" aria-label="Channel">
          {['door', 'phone', 'text'].map((c) => (
            <button key={c} type="button" aria-pressed={channel === c} onClick={() => setChannel(c)}>{CHANNEL_LABEL[c]}</button>
          ))}
        </div>
      </div>
      <div className="rate-block">
        <div>
          <span className="eyebrow label">Rating — tap one to log a contact</span>
          <RatingRow value={person.rating} onPick={(code) => log('contacted', code)} disabled={act.busy} />
          <div className="chip-row" aria-hidden="true">
            {RATINGS.filter((r) => r.code.length > 1).map((r) => (
              <span key={r.code} className="hint">{r.short} {r.label.replace(/^Opposed — /, '')}</span>
            ))}
          </div>
        </div>
        <div>
          <span className="eyebrow label">Couldn't reach them</span>
          <div className="outcome-row">
            {['no_answer', 'refused', 'moved', 'inaccessible'].map((o) => (
              <button key={o} type="button" className="btn btn-tap" disabled={act.busy} onClick={() => log(o)}>
                {OUTCOME_LABEL[o]}
              </button>
            ))}
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="contact-note">Note (optional, saved with the next tap)</label>
          <input id="contact-note" className="input" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Wants a lawn sign; call back after 6" />
        </div>
        {act.error ? <p className="error" style={{ margin: 0 }}>{act.error}</p> : <div className="status-line">{status}</div>}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Volunteer roles
// ─────────────────────────────────────────────────────────────────────────────
function RolesCard({ person, roles, refresh, desk }) {
  const [role, setRole] = useState('');
  const [detail, setDetail] = useState('');
  const act = useAction(refresh);
  const def = VOLUNTEER_ROLES.find((r) => r.code === role);
  const label = (code) => VOLUNTEER_ROLES.find((r) => r.code === code)?.label || code;

  const add = async (e) => {
    e.preventDefault();
    if (!role) return;
    const res = await act.run('volunteer.assign', { person_id: person.id, role, detail: detail.trim() || undefined });
    if (res) { setRole(''); setDetail(''); }
  };

  return (
    <section className="card">
      <span className="eyebrow">Volunteer roles</span>
      {roles.length === 0
        ? <p className="muted" style={{ margin: 0 }}>Not signed up for anything yet.</p>
        : (
          <div className="role-chips">
            {roles.map((r) => (
              <span key={r.id} className="chip removable">
                {label(r.role)}{r.detail ? <span className="d"> · {r.detail}</span> : null}
                {desk && (
                  <button type="button" className="chip-x" aria-label={`Remove ${label(r.role)}`} disabled={act.busy}
                    onClick={() => act.run('volunteer.unassign', { id: r.id })}>×</button>
                )}
              </span>
            ))}
          </div>
        )}
      {desk && <form className="role-add" onSubmit={add}>
        <div className="field">
          <label htmlFor="role-pick">Add a role</label>
          <select id="role-pick" className="input" value={role} onChange={(e) => { setRole(e.target.value); setDetail(''); }}>
            <option value="">—</option>
            {VOLUNTEER_ROLES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
        </div>
        {def?.detail && (
          <div className="field">
            <label htmlFor="role-detail">{def.detail}</label>
            <input id="role-detail" className="input" maxLength={200} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={def.detail} />
          </div>
        )}
        <button type="submit" className="btn btn-primary" disabled={!role || act.busy}>Assign</button>
      </form>}
      {act.error && <p className="error">{act.error}</p>}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Signs at this address
// ─────────────────────────────────────────────────────────────────────────────
function SignsCard({ person, signs, refresh }) {
  const act = useAction(refresh);
  const kindLabel = (k) => SIGN_KINDS.find((s) => s.code === k)?.label || k;
  return (
    <section className="card">
      <span className="eyebrow">Signs at this address</span>
      {signs.length === 0 && <p className="muted" style={{ margin: 0 }}>No signs yet.</p>}
      {signs.map((s) => (
        <div key={s.id} className="sign-row">
          <span>
            <strong>{kindLabel(s.kind)}</strong>
            {s.note ? <span className="muted"> · {s.note}</span> : null}
          </span>
          <span className="head-actions">
            <span className={STATUS_CHIP[s.status] || 'chip'}>{s.status}</span>
            <select className="input" aria-label="Sign status" value={s.status} disabled={act.busy}
              onChange={(e) => act.run('sign.update', { id: s.id, status: e.target.value })}>
              {SIGN_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
          </span>
        </div>
      ))}
      <div className="chip-row">
        {SIGN_KINDS.map((k) => (
          <button key={k.code} type="button" className="btn btn-sm" disabled={act.busy}
            onClick={() => act.run('sign.place', { kind: k.code, person_id: person.id })}>
            Request {k.code}
          </button>
        ))}
      </div>
      {!person.address && <p className="hint" style={{ marginTop: 'var(--s-2)' }}>Add an address first so the sign crew knows where to go.</p>}
      {act.error && <p className="error">{act.error}</p>}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shifts, gifts, contact history, household
// ─────────────────────────────────────────────────────────────────────────────
function ShiftsCard({ shifts }) {
  return (
    <section className="card">
      <span className="eyebrow">Shifts</span>
      {shifts.length === 0
        ? <p className="muted" style={{ margin: 0 }}>No shifts assigned. <Link to="/shifts">See upcoming shifts →</Link></p>
        : (
          <ul className="list-plain">
            {shifts.map((s) => (
              <li key={s.assignment_id}>
                <span>
                  <Link to={`/shifts/${s.id}`}>{s.title}</Link>
                  <br />
                  <span className="muted mono" style={{ fontSize: 12 }}>{fmtWhen(s.starts_at)}{s.location ? ` · ${s.location}` : ''}</span>
                </span>
                <span className={STATUS_CHIP[s.status] || 'chip'}>{String(s.status || '').replace('_', ' ')}</span>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

function GiftsSection({ person, gifts, totals }) {
  return (
    <section>
      <div className="card-head">
        <h2 style={{ margin: 0 }}>Gifts</h2>
        <Link className="btn btn-primary" to={`/money?new=1&person=${person.id}`}>Log a gift</Link>
      </div>
      {totals.length > 0 && (
        <div className="chip-row" style={{ marginBottom: 'var(--s-3)' }}>
          {/* total_cents is a sum()::bigint — may arrive as a string; fmtMoney coerces with Number() */}
          {totals.map((t) => (
            <span key={t.year} className="chip">
              {t.year} · <strong className="mono">{fmtMoney(Number(t.total_cents))}</strong>
            </span>
          ))}
        </div>
      )}
      <table className="table">
        <thead>
          <tr><th>Date</th><th className="num">Amount</th><th>Method</th><th>Cadence</th><th>Note</th><th></th></tr>
        </thead>
        <tbody>
          {gifts.map((g) => (
            <tr key={g.id}>
              <td className="mono">{fmtDate(g.date)}</td>
              <td className="num">{fmtMoney(g.amount_cents)}</td>
              <td>{g.method ? <span className="chip">{g.method}</span> : <span className="muted">—</span>}</td>
              <td>
                {g.cadence === 'monthly'
                  ? <span className="chip chip-mark">monthly</span>
                  : <span className="chip chip-ghost">one-time</span>}
              </td>
              <td className="muted">{g.note || ''}</td>
              <td>{g.flagged && <span className="chip chip-warn" title={g.flag_reason || ''}>flagged</span>}</td>
            </tr>
          ))}
          {gifts.length === 0 && (
            <tr><td colSpan={6} className="muted">No gifts recorded.</td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function ContactHistory({ contacts }) {
  return (
    <section className="card">
      <span className="eyebrow">Contact history</span>
      {contacts.length === 0
        ? <p className="muted" style={{ margin: 0 }}>No contacts logged yet — rate them above to start the record.</p>
        : (
          <ul className="timeline">
            {contacts.map((c) => (
              <li key={c.id}>
                <span className="when">{fmtWhen(c.created_at)}</span>
                <span className="what">
                  <span className="chip">{CHANNEL_LABEL[c.channel] || c.channel}</span>
                  <span>{OUTCOME_LABEL[c.outcome] || c.outcome}</span>
                  {c.rating && <RatingChip code={c.rating} size="sm" />}
                  {c.by_name && <span className="by">by {c.by_name}</span>}
                  {c.note && <span className="note">{c.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

function HouseholdCard({ person, household }) {
  return (
    <section className="card">
      <span className="eyebrow">Household</span>
      {!person.address
        ? <p className="muted" style={{ margin: 0 }}>Add an address to see who else lives here.</p>
        : household.length === 0
          ? <p className="muted" style={{ margin: 0 }}>No one else on file at this address.</p>
          : (
            <ul className="list-plain">
              {household.map((h) => (
                <li key={h.id}>
                  <Link to={`/people/${h.id}`}>{h.name}</Link>
                  <RatingChip code={h.rating} />
                </li>
              ))}
            </ul>
          )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The screen
// ─────────────────────────────────────────────────────────────────────────────
export default function Person() {
  const { id } = useParams();
  const { me } = useOutletContext() ?? {};
  const desk = canDesk(me);
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState('door');
  const ratingRef = useRef(null);

  const profile = useQuery({
    queryKey: ['person', id],
    queryFn: () => apiGet(`/persons/${id}`),
  });

  // Awaited by useAction so controls stay disabled until the profile refetches.
  // Covers the map (['doors']: pins, ratings, unlocated count after an address
  // edit), signs, Today, housemates' profiles, and Outreach's press audience
  // (['blasts'].mediaContacts counts media-tagged people with an email).
  const refresh = () => invalidatePersonData(queryClient);

  // "Log call" / "Text" from the contact card: preset the channel, jump to the rating card.
  const onLog = (ch) => {
    setChannel(ch);
    ratingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (profile.isLoading) return <p className="muted">Loading…</p>;
  if (profile.isError || !profile.data?.person) {
    return (
      <p className="error">
        {profile.error?.status === 404 || !profile.data?.person
          ? 'No one on file with that link — they may have been removed.'
          : profile.error.message}{' '}
        <Link to="/people">Back to People</Link>
      </p>
    );
  }
  // Volunteers get gifts: [], totals: [], donor: null from the server.
  const {
    person, gifts = [], totals = [], contacts = [], roles = [], signs = [], shifts = [], donor = null, household = [],
  } = profile.data;

  return (
    <>
      <Header person={person} donor={donor} refresh={refresh} desk={desk} />

      <div className="profile-grid">
        <ContactCard person={person} refresh={refresh} onLog={onLog} me={me} desk={desk} />
        <RatingCard person={person} refresh={refresh} channel={channel} setChannel={setChannel} cardRef={ratingRef} />
      </div>

      <div className="profile-grid">
        <RolesCard person={person} roles={roles} refresh={refresh} desk={desk} />
        <SignsCard person={person} signs={signs} refresh={refresh} />
      </div>

      <div className="profile-grid">
        <ShiftsCard shifts={shifts} />
        <HouseholdCard person={person} household={household} />
      </div>

      {desk && <GiftsSection person={person} gifts={gifts} totals={totals} />}

      <div style={{ marginTop: 'var(--s-4)' }}>
        <ContactHistory contacts={contacts} />
      </div>
    </>
  );
}
