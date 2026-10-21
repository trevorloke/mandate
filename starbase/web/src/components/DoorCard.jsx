// DoorCard — the drawer for one door: who lives here, call/text with a one-tap
// "log this call/text", the big rating row for the selected person, outcome
// buttons, a note, sign request, and "add person at this door". The map
// decides where it sits (bottom sheet on phones, right panel on desktop).
// Also exports AddDoorForm — the same person.create flow for a tapped spot
// that has no door yet.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { action } from '../api.js';
import { SIGN_KINDS, ratingByCode } from '@starbase/shared/canvass';
import RatingButtons, { RatingChip } from './RatingButtons.jsx';
import '../pages/map.css';

const OUTCOME_BUTTONS = [
  { code: 'no_answer', label: 'No answer' },
  { code: 'refused', label: 'Refused' },
  { code: 'moved', label: 'Moved' },
  { code: 'inaccessible', label: 'Inaccessible' },
];
const OUTCOME_LABEL = Object.fromEntries(OUTCOME_BUTTONS.map((o) => [o.code, o.label]));
const SIGN_BUTTONS = [
  { code: 'lawn', label: 'Lawn' },
  { code: 'large', label: 'Large' },
  { code: 'billboard', label: 'Billboard' },
];
export const SIGN_LABEL = Object.fromEntries(SIGN_KINDS.map((s) => [s.code, s.label]));
const SIGN_CHIP = { installed: 'chip-ok', requested: 'chip-warn' };
// Channel for the rating + outcome taps. Door by default on the map; tapping
// Call / Text switches it so the rating that follows is logged as that call.
const CHANNEL_BUTTONS = [
  { code: 'door', label: 'Door', at: 'at the door' },
  { code: 'phone', label: 'Phone', at: 'by phone' },
  { code: 'text', label: 'Text', at: 'by text' },
];
const CHANNEL_AT = Object.fromEntries(CHANNEL_BUTTONS.map((c) => [c.code, c.at]));

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';
// Drop any extension ("604-555-0101 ext 2", "x2", "#2") before stripping to
// digits, or it gets glued onto the number and dials the wrong line.
const dialable = (phone) => String(phone || '').replace(/\s*(?:ext\.?|x|#).*$/i, '').replace(/[^\d+]/g, '');
// rated_at is a timestamptz (ISO, UTC) — show the canvasser's local date,
// not the UTC one (an evening knock in Surrey is already "tomorrow" in UTC).
const localDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA');
};
const telHref = (phone) => `tel:${dialable(phone)}`;
const smsHref = (phone, body) => `sms:${dialable(phone)}?&body=${encodeURIComponent(body)}`;

export function doorTitle(door) {
  if (!door?.address) return 'Unaddressed pin';
  return door.unit ? `${door.unit} – ${door.address}` : door.address;
}

// Optimistic edits to the map's ['doors'] cache so pins and the card react
// before the refetch lands. fn gets the cached { persons, signs, unlocated }.
// Any in-flight doors fetch started before this write would land with the
// old data and undo the patch, so cancel it; the post-write invalidate
// refetches anyway.
export function patchDoors(queryClient, fn) {
  queryClient.cancelQueries({ queryKey: ['doors'] });
  queryClient.setQueryData(['doors'], (d) => (d ? fn(d) : d));
}

// The shape /api/map/doors returns for a person, from a person.create result.
const doorPerson = (p, fallback = {}) => ({
  id: p.id,
  name: p.name,
  phone: p.phone ?? null,
  email: p.email ?? null,
  address: p.address ?? fallback.address ?? null,
  unit: p.unit ?? fallback.unit ?? null,
  lat: p.lat ?? fallback.lat,
  lng: p.lng ?? fallback.lng,
  rating: null,
  rated_at: null,
  tags: p.tags || [],
});

// Everything that can change when a door is touched. ['person'] as a prefix,
// not just ['person', id]: every profile also lists its household (name +
// rating), so rating or adding someone here changes their housemates' pages.
// Only mounted queries refetch; the rest are just marked stale.
function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of ['doors', 'persons', 'person', 'signs', 'contacts', 'brief']) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
}

function PersonFields({ idPrefix, form, set, withAddress }) {
  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-name`}>Name (required)</label>
        <input id={`${idPrefix}-name`} className="input" required autoFocus maxLength={300} autoComplete="off" value={form.name} onChange={set('name')} />
      </div>
      {withAddress && (
        <div className="form-row">
          <div className="field" style={{ flex: '3 1 180px' }}>
            <label htmlFor={`${idPrefix}-address`}>Address (required)</label>
            <input id={`${idPrefix}-address`} className="input" required maxLength={1000} autoComplete="off" placeholder="12345 72 Ave" value={form.address} onChange={set('address')} />
          </div>
          <div className="field" style={{ flex: '1 1 80px' }}>
            <label htmlFor={`${idPrefix}-unit`}>Unit</label>
            <input id={`${idPrefix}-unit`} className="input" maxLength={40} autoComplete="off" value={form.unit} onChange={set('unit')} />
          </div>
        </div>
      )}
      <div className="field">
        <label htmlFor={`${idPrefix}-phone`}>Phone</label>
        <input id={`${idPrefix}-phone`} className="input" type="tel" inputMode="tel" maxLength={40} autoComplete="off" value={form.phone} onChange={set('phone')} />
      </div>
    </>
  );
}

// Inline "add person at this door" — inherits the door's address/unit/lat/lng.
function AddPersonInline({ door, onDone, onCancel, toast }) {
  const queryClient = useQueryClient();
  const refresh = useRefresh();
  const [form, setForm] = useState({ name: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await action('person.create', {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        address: door.address || undefined,
        unit: door.unit || undefined,
        lat: door.lat,
        lng: door.lng,
      });
      toast(`Added ${res.person.name} at this door`);
      patchDoors(queryClient, (d) => ({
        ...d,
        persons: [...d.persons.filter((p) => p.id !== res.person.id), doorPerson(res.person, door)],
      }));
      refresh();
      onDone(res.person.id);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="door-form" onSubmit={submit}>
      <span className="eyebrow">Add person at this door</span>
      <p className="muted door-form__where">{doorTitle(door)}</p>
      <PersonFields idPrefix="dp" form={form} set={set} />
      {error && <p className="error">{error}</p>}
      <div className="door-form__actions">
        <button type="submit" className="btn btn-primary door-act" disabled={busy}>Save person</button>
        <button type="button" className="btn btn-quiet door-act" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// A brand-new door at a tapped spot: name + address (+ unit, phone).
export function AddDoorForm({ latlng, onDone, onCancel, toast }) {
  const queryClient = useQueryClient();
  const refresh = useRefresh();
  const [form, setForm] = useState({ name: '', address: '', unit: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    // Whitespace passes `required`; the server trims names (→ 400) and a
    // blank address would make an unaddressed pin, not a door.
    if (!form.name.trim() || !form.address.trim()) { setError('Name and address are required'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await action('person.create', {
        name: form.name.trim(),
        address: form.address.trim(),
        unit: form.unit.trim() || undefined,
        phone: form.phone.trim() || undefined,
        lat: latlng.lat,
        lng: latlng.lng,
      });
      toast(`Added ${res.person.name} — new door on the map`);
      patchDoors(queryClient, (d) => ({
        ...d,
        persons: [...d.persons.filter((p) => p.id !== res.person.id), doorPerson(res.person, latlng)],
      }));
      refresh();
      onDone(res.person.id);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="door-card door-form" onSubmit={submit}>
      <header className="mapsheet-head">
        <div>
          <span className="eyebrow">New door</span>
          <h2 className="mapsheet-title">Who lives here?</h2>
        </div>
        <button type="button" className="btn btn-quiet mapsheet-close" onClick={onCancel} aria-label="Close">✕</button>
      </header>
      <p className="muted mono door-form__where">{latlng.lat.toFixed(5)}, {latlng.lng.toFixed(5)}</p>
      <PersonFields idPrefix="nd" form={form} set={set} withAddress />
      {error && <p className="error">{error}</p>}
      <div className="door-form__actions">
        <button type="submit" className="btn btn-primary door-act" disabled={busy}>Add door</button>
        <button type="button" className="btn btn-quiet door-act" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// Mount with key={door.key} so per-door state (optimistic ratings, pending
// call log, note) resets naturally when the user moves to another door.
export default function DoorCard({ door, selectedId, onSelect, onClose, toast, me, canCreate = true }) {
  const queryClient = useQueryClient();
  const refresh = useRefresh();
  const [local, setLocal] = useState({});     // optimistic ratings by person id
  const [pending, setPending] = useState(null); // { id, channel } after a tel:/sms: tap
  const [channel, setChannel] = useState('door');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const persons = door.persons;
  const sel = persons.find((p) => p.id === selectedId) || persons[0];
  const ratingOf = (p) => (p.id in local ? local[p.id] : p.rating);
  const noteText = note.trim();

  // Optimistic rating on the card chip and on the pin (via the doors cache).
  const setRating = (person, code, ratedAt) => {
    setLocal((l) => ({ ...l, [person.id]: code }));
    patchDoors(queryClient, (d) => ({
      ...d,
      persons: d.persons.map((p) => (p.id === person.id ? { ...p, rating: code, rated_at: ratedAt } : p)),
    }));
  };

  // A tel:/sms: tap: remember it (for the one-tap log) and switch the channel.
  const startReach = (p, via) => {
    setPending({ id: p.id, channel: via });
    setChannel(via);
    if (sel?.id !== p.id) onSelect(p.id);
  };

  const log = async (person, via, outcome, rating = null) => {
    if (busy) return;
    setBusy(true);
    const prev = { code: ratingOf(person), at: person.rated_at ?? null };
    if (rating) setRating(person, rating, new Date().toISOString());
    try {
      await action('contact.log', {
        person_id: person.id,
        channel: via,
        outcome,
        rating: rating || undefined,
        note: noteText || undefined,
      });
      setNote('');
      if (pending) {
        // The call/text is logged — the next tap is back at the door.
        setPending(null);
        setChannel('door');
      }
      const what = rating
        ? `${rating} · ${ratingByCode(rating)?.label}`
        : outcome === 'contacted'
          ? (via === 'door' ? 'note' : via === 'phone' ? 'call' : 'text')
          : `${OUTCOME_LABEL[outcome].toLowerCase()}${via !== 'door' ? ` (${via})` : ''}`;
      toast(`Logged ${what} — ${person.name}`);
      refresh();
    } catch (err) {
      if (rating) setRating(person, prev.code, prev.at);
      toast(err.message || 'Could not log that');
    } finally {
      setBusy(false);
    }
  };

  const placeSign = async (kind) => {
    if (!sel || busy) return;
    setBusy(true);
    try {
      const res = await action('sign.place', {
        person_id: sel.id,
        kind,
        lat: door.lat,
        lng: door.lng,
        address: door.address || undefined,
      });
      toast(`${SIGN_LABEL[kind]} requested — ${sel.name}`);
      if (res?.sign?.id) {
        patchDoors(queryClient, (d) => ({
          ...d,
          signs: [...(d.signs || []).filter((s) => s.id !== res.sign.id), { ...res.sign, lat: door.lat, lng: door.lng }],
        }));
      }
      refresh();
    } catch (err) {
      toast(err.message || 'Could not request that sign');
    } finally {
      setBusy(false);
    }
  };

  const smsBody = (p) =>
    `Hi ${firstName(p.name)}, it's ${me?.user?.name || 'a volunteer'} with ${me?.workspace?.name || 'the campaign'}.`;

  return (
    <aside className="door-card" aria-label={`Door: ${doorTitle(door)}`}>
      <header className="mapsheet-head">
        <div>
          <span className="eyebrow">Door · {persons.length} {persons.length === 1 ? 'person' : 'people'}</span>
          <h2 className="mapsheet-title">{doorTitle(door)}</h2>
        </div>
        <button type="button" className="btn btn-quiet mapsheet-close" onClick={onClose} aria-label="Close door card">✕</button>
      </header>

      <ul className="door-people">
        {persons.map((p) => {
          const active = sel?.id === p.id;
          const dnc = Array.isArray(p.tags) && p.tags.includes('do-not-contact');
          return (
            <li key={p.id} className={`door-person${active ? ' is-active' : ''}`}>
              <button
                type="button"
                className="door-person__pick"
                aria-pressed={active}
                onClick={() => onSelect(p.id)}
              >
                <span className="door-person__who">
                  <span className="door-person__name">{p.name}</span>
                  {p.rated_at && <span className="door-person__meta muted mono">rated {localDate(p.rated_at)}</span>}
                </span>
                <span className="door-person__chips">
                  {dnc && <span className="chip chip-danger">do not contact</span>}
                  <RatingChip code={ratingOf(p)} />
                </span>
              </button>
              <div className="door-person__actions">
                {p.phone ? (
                  <>
                    <a className="btn door-act" href={telHref(p.phone)} onClick={() => startReach(p, 'phone')}>
                      Call
                    </a>
                    <a className="btn door-act" href={smsHref(p.phone, smsBody(p))} onClick={() => startReach(p, 'text')}>
                      Text
                    </a>
                    <span className="door-person__phone mono muted">{p.phone}</span>
                  </>
                ) : (
                  <span className="muted door-person__phone">no phone</span>
                )}
                <Link className="btn btn-quiet door-act" to={`/people/${p.id}`}>Profile</Link>
              </div>
              {pending?.id === p.id && (
                <div className="door-loglink" role="group" aria-label={`Log this ${pending.channel === 'phone' ? 'call' : 'text'}`}>
                  <span className="eyebrow">Log this {pending.channel === 'phone' ? 'call' : 'text'} — or tap a rating below</span>
                  <button type="button" className="btn btn-primary door-act" disabled={busy} onClick={() => log(p, pending.channel, 'contacted')}>
                    Reached
                  </button>
                  <button type="button" className="btn door-act" disabled={busy} onClick={() => log(p, pending.channel, 'no_answer')}>
                    No answer
                  </button>
                  <button type="button" className="btn btn-quiet door-act" onClick={() => { setPending(null); setChannel('door'); }}>Skip</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {sel && (
        <section className="door-section">
          <div className="door-rate-head">
            <span className="eyebrow">{persons.length > 1 ? `Rate ${firstName(sel.name)}` : 'Rating'} · {CHANNEL_AT[channel]}</span>
            <div className="door-channel" role="radiogroup" aria-label="Contact channel">
              {CHANNEL_BUTTONS.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  role="radio"
                  aria-checked={channel === c.code}
                  className={`door-channel__btn${channel === c.code ? ' is-on' : ''}`}
                  onClick={() => setChannel(c.code)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <RatingButtons
            value={ratingOf(sel)}
            disabled={busy}
            onPick={(code) => log(sel, channel, 'contacted', code)}
          />
          <div className="door-outcomes" role="group" aria-label="Outcome">
            {OUTCOME_BUTTONS.map((o) => (
              <button key={o.code} type="button" className="btn door-act" disabled={busy} onClick={() => log(sel, channel, o.code)}>
                {o.label}
              </button>
            ))}
          </div>
          <div className="field door-note">
            <label htmlFor="door-note">Note — sent with your next tap</label>
            <textarea
              id="door-note"
              className="input"
              rows={2}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Issue raised, best time to reach, lawn sign spot…"
            />
            {noteText && (
              <button type="button" className="btn btn-quiet door-act door-note__only" disabled={busy} onClick={() => log(sel, channel, 'contacted')}>
                Save note only
              </button>
            )}
          </div>
        </section>
      )}

      {sel && (
        <section className="door-section">
          <span className="eyebrow">Sign request · {firstName(sel.name)}</span>
          {door.signs.length > 0 && (
            <div className="door-signs-have">
              {door.signs.map((s) => (
                <span key={s.id} className={`chip ${SIGN_CHIP[s.status] || ''}`} title={SIGN_LABEL[s.kind]}>
                  {SIGN_LABEL[s.kind]} · {s.status}
                </span>
              ))}
            </div>
          )}
          <div className="door-sign-btns" role="group" aria-label="Request a sign">
            {SIGN_BUTTONS.map((s) => (
              <button key={s.code} type="button" className="btn door-act" disabled={busy} title={SIGN_LABEL[s.code]} onClick={() => placeSign(s.code)}>
                {s.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {canCreate && (
        <section className="door-section">
          {adding ? (
            <AddPersonInline
              door={door}
              toast={toast}
              onCancel={() => setAdding(false)}
              onDone={(id) => { setAdding(false); onSelect(id); }}
            />
          ) : (
            <button type="button" className="btn door-act door-add-btn" onClick={() => setAdding(true)}>
              + Add person at this door
            </button>
          )}
        </section>
      )}
    </aside>
  );
}
