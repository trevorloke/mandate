// DoorCard — the drawer for one door. Rating first: the selected person's
// name, the big rating buttons, then one row of quiet "no conversation"
// outcomes. Everything else (note, call/text with a one-tap "log this call",
// channel, sign request, add a person, profile) sits under "More". Several
// people at one door → simple tabs at the top. The map decides where it sits
// (bottom sheet on phones, right panel on desktop).
// Also exports AddDoorForm — the same person.create flow for a tapped spot
// that has no door yet.
//
// Offline: every write here goes through the outbox (src/offline.js) — knocks
// (logContact), a new person or door (person.create, on an id made here, so
// they can be knocked at once), sign requests and their Undo — so a tap with
// no signal is saved on the phone and sent later, in order, exactly once.
// The card shows it straight away (queued.js has the words, shared with the
// walk list, Calls and the profile); a person or sign not sent yet says
// "Not sent yet" (the map lays the outbox over its doors).
//
// A sign request's toast offers Undo only when the server has sign.cancel
// (GET /api/actions): it takes the request back — off every list and count —
// so "Lawn sign cancelled" is true. Never "taken down": it never went up. A
// request still on the phone is simply taken off it ("Lawn sign cancelled");
// one that may already have gone sends its cancel after it ("Undo saved…").
//
// Contacts are append-only: after a tap the toast offers "Change", which
// puts focus back on the rating row — the next tap logs the correction.
//
// A note typed after the rating (knock, rate, jot) is never lost: closing
// the card (✕, another pin, the empty map, leaving the screen) or switching
// to another person at the door sends it on its own — the same path as
// "Save note" — and the toast says "Note saved".
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiGet, ApiError } from '../api.js';
import { logContact, queueAction, undoQueued } from '../offline.js';
import { isOffline, queuedText } from './queued.js';
import { SIGN_KINDS } from '@starbase/shared/canvass';
import RatingButtons, { More, OutcomeButtons, OUTCOME_LABEL, PersonTabs, focusRating, ratingText } from './RatingButtons.jsx';
import '../pages/map.css';

// "Wants a sign?" — one tap files a request (Undo is on the toast). A kind
// this door already has (requested or up) isn't offered again.
const SIGN_BUTTONS = [
  { code: 'lawn', label: 'Lawn sign' },
  { code: 'large', label: 'Large sign' },
  { code: 'billboard', label: 'Billboard' },
];
export const SIGN_LABEL = Object.fromEntries(SIGN_KINDS.map((s) => [s.code, s.label]));
// "To put up" is a neutral ochre chip (fk-wait), never the brand yellow.
const SIGN_CHIP = { installed: 'chip-ok', requested: 'fk-wait' };
// The Signs screen's words, everywhere a sign shows.
const SIGN_STATUS = { requested: 'To put up', installed: 'Up', removed: 'Taken down' };
// Channel for the rating + outcome taps. Door by default on the map; tapping
// Call / Text switches it so the rating that follows is logged as that call.
// "How you reached them: At the door · Phone call · Text" at the bottom of
// More sets it by hand (kept away from the Call / Text buttons, which dial).
const CHANNEL_BUTTONS = [
  { code: 'door', label: 'At the door' },
  { code: 'phone', label: 'Phone call' },
  { code: 'text', label: 'Text' },
];
const CHANNEL_CHIP = { phone: 'By phone', text: 'By text' };

export const OFFLINE_MSG = 'Needs signal — try again';
const SIGNED_OUT_MSG = 'Signed out — sign in, then try again';
// fetch() rejects with a TypeError (not an ApiError) when there's no network.
const offlineError = (err) => isOffline() || !(err instanceof ApiError);
// What to tell the canvasser when the server says no.
const refusalMsg = (err, fallback) => {
  if (offlineError(err)) return OFFLINE_MSG;
  if (err.status === 401) return SIGNED_OUT_MSG;
  return err.message || fallback;
};

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';
// GET /api/actions lists what this sign-in may do (same key as Shifts/Team).
const ACTIONS_QUERY = { queryKey: ['actions'], queryFn: () => apiGet('/actions'), staleTime: 5 * 60_000 };
const hasAction = (data, name) => Array.isArray(data?.actions) && data.actions.includes(name);
// Drop any extension ("604-555-0101 ext 2", "x2", "#2") before stripping to
// digits, or it gets glued onto the number and dials the wrong line.
const dialable = (phone) => String(phone || '').replace(/\s*(?:ext\.?|x|#).*$/i, '').replace(/[^\d+]/g, '');
// rated_at is a timestamptz (ISO, UTC) — show the canvasser's local date,
// not the UTC one (an evening knock in Surrey is already "tomorrow" in UTC).
const localDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
};
const telHref = (phone) => `tel:${dialable(phone)}`;
const smsHref = (phone, body) => `sms:${dialable(phone)}?&body=${encodeURIComponent(body)}`;
const isDnc = (p) => Array.isArray(p?.tags) && p.tags.includes('do-not-contact');

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
// ['turfs'] / ['turf', id]: turf stats (doors done, rated) and the walk
// list's done ticks come from contacts and ratings, and a new door lands in
// whichever turf it falls inside.
// Only mounted queries refetch; the rest are just marked stale.
function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of ['doors', 'persons', 'person', 'signs', 'contacts', 'brief', 'turfs', 'turf']) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
}

function PersonFields({ idPrefix, form, set, withAddress }) {
  const [more, setMore] = useState(false);
  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-name`}>Name</label>
        <input id={`${idPrefix}-name`} className="input" required autoFocus maxLength={300} autoComplete="off" value={form.name} onChange={set('name')} />
      </div>
      {withAddress && (
        <div className="form-row">
          <div className="field" style={{ flex: '3 1 180px' }}>
            <label htmlFor={`${idPrefix}-address`}>Address</label>
            <input id={`${idPrefix}-address`} className="input" required maxLength={1000} autoComplete="off" placeholder="12345 72 Ave" value={form.address} onChange={set('address')} />
          </div>
          <div className="field" style={{ flex: '1 1 80px' }}>
            <label htmlFor={`${idPrefix}-unit`}>Unit</label>
            <input id={`${idPrefix}-unit`} className="input" maxLength={40} autoComplete="off" value={form.unit} onChange={set('unit')} />
          </div>
        </div>
      )}
      {more || form.phone ? (
        <div className="field">
          <label htmlFor={`${idPrefix}-phone`}>Phone</label>
          <input id={`${idPrefix}-phone`} className="input" type="tel" inputMode="tel" maxLength={40} autoComplete="off" autoFocus={more && !form.phone} value={form.phone} onChange={set('phone')} />
        </div>
      ) : (
        <button type="button" className="door-form__more disclose disclose--inline" aria-expanded={false} onClick={() => setMore(true)}>Phone</button>
      )}
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
    if (!form.name.trim()) { setError('Add a name'); return; }
    setBusy(true);
    setError(null);
    try {
      // Through the outbox: no signal, it's saved here and the door shows it.
      const name = form.name.trim();
      const r = await queueAction('person.create', {
        name,
        phone: form.phone.trim() || undefined,
        address: door.address || undefined,
        unit: door.unit || undefined,
        lat: door.lat,
        lng: door.lng,
      }, { who: name });
      if (r.queued) { toast(queuedText(r, name)); onDone(r.client_id); return; }
      const res = r.result;
      toast(`Added ${res.person.name}`);
      patchDoors(queryClient, (d) => ({
        ...d,
        persons: [...d.persons.filter((p) => p.id !== res.person.id), doorPerson(res.person, door)],
      }));
      refresh();
      onDone(res.person.id);
    } catch (err) {
      const msg = refusalMsg(err, 'Not saved — try again');
      setError(msg);
      if (offlineError(err)) toast(msg);
      setBusy(false);
    }
  };

  return (
    <form className="door-form door-form--inline" onSubmit={submit} aria-label="Add a person at this door">
      <PersonFields idPrefix="dp" form={form} set={set} />
      {error && <p className="error">{error}</p>}
      <div className="door-form__actions">
        <button type="submit" className="btn door-act" disabled={busy}>Save person</button>
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
    if (!form.name.trim() || !form.address.trim()) { setError('Add a name and address'); return; }
    setBusy(true);
    setError(null);
    try {
      const name = form.name.trim();
      const r = await queueAction('person.create', {
        name,
        address: form.address.trim(),
        unit: form.unit.trim() || undefined,
        phone: form.phone.trim() || undefined,
        lat: latlng.lat,
        lng: latlng.lng,
      }, { who: name });
      if (r.queued) { toast(queuedText(r, name)); onDone(r.client_id); return; }
      const res = r.result;
      toast(`Added ${res.person.name}`);
      patchDoors(queryClient, (d) => ({
        ...d,
        persons: [...d.persons.filter((p) => p.id !== res.person.id), doorPerson(res.person, latlng)],
      }));
      refresh();
      onDone(res.person.id);
    } catch (err) {
      const msg = refusalMsg(err, 'Not saved — try again');
      setError(msg);
      if (offlineError(err)) toast(msg);
      setBusy(false);
    }
  };

  return (
    <form className="door-card door-form" onSubmit={submit} aria-label="New door">
      <header className="mapsheet-head">
        <h2 className="mapsheet-title">New door</h2>
        <button type="button" className="btn btn-quiet mapsheet-close" onClick={onCancel} aria-label="Close">✕</button>
      </header>
      <div className="door-form__body">
        <PersonFields idPrefix="nd" form={form} set={set} withAddress />
        {error && <p className="error">{error}</p>}
        <div className="door-form__actions">
          <button type="submit" className="btn btn-primary door-act" disabled={busy}>Add door</button>
          <button type="button" className="btn btn-quiet door-act" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </form>
  );
}

// Mount with key={door.key} so per-door state (optimistic ratings, pending
// call log, note) resets naturally when the user moves to another door.
export default function DoorCard({ door, selectedId, onSelect, onClose, toast, me, canCreate = true }) {
  const queryClient = useQueryClient();
  const location = useLocation();
  // The profile's back link reads this: "← Map", back to this door (the URL
  // carries ?person=, so the card opens again).
  const fromHere = { from: { to: `${location.pathname}${location.search}`, label: 'Map' } };
  const refresh = useRefresh();
  const rateRef = useRef(null);
  const [local, setLocal] = useState({});     // optimistic ratings by person id
  const [pending, setPending] = useState(null); // { id, channel } after a tel:/sms: tap
  const [channel, setChannel] = useState('door');
  const [note, setNoteState] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [more, setMore] = useState(false);
  // Whether Undo on a sign request can really cancel it (sign.cancel).
  useEffect(() => { queryClient.prefetchQuery(ACTIONS_QUERY); }, [queryClient]);

  const persons = door.persons;
  const sel = persons.find((p) => p.id === selectedId) || persons[0];
  const ratingOf = (p) => (p.id in local ? local[p.id] : p.rating);
  const noteText = note.trim();
  const multi = persons.length > 1;

  // The note lives in a ref too, so closing the card (unmount) can still send
  // it. A note that goes out with a tap is cleared at once (and put back if
  // the server refuses), so it can never be sent twice.
  const noteRef = useRef('');
  const setNote = (v) => { noteRef.current = v; setNoteState(v); };
  const latest = useRef(null);
  useLayoutEffect(() => { latest.current = { sel, channel, toast, refresh, multi }; });
  const sendNote = async (person, via, text, { toast: say, refresh: reload, multi: many }) => {
    const who = many ? `${firstName(person.name)} · ` : '';
    try {
      const r = await logContact({ person_id: person.id, channel: via, outcome: 'contacted', note: text }, { who: person.name });
      say(r.queued ? `${who}${queuedText(r, 'Note')}` : `${who}Note saved`);
      if (!r.queued) reload();
    } catch (err) {
      say(refusalMsg(err, 'Note not saved — try again'));
    }
  };
  // Card closed with a note still in the box: send it on its own.
  useEffect(() => () => {
    const text = noteRef.current.trim();
    const ctx = latest.current;
    if (!text || !ctx?.sel) return;
    noteRef.current = '';
    sendNote(ctx.sel, ctx.channel, text, ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Another person at the door: their note is theirs, so send it first.
  const pickPerson = (id) => {
    const text = noteRef.current.trim();
    if (text && sel && id !== sel.id) {
      setNote('');
      sendNote(sel, channel, text, { toast, refresh, multi });
    }
    onSelect(id);
  };

  // Optimistic rating on the card and on the pin (via the doors cache).
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
  const backToDoor = () => { setPending(null); setChannel('door'); };

  const log = async (person, via, outcome, rating = null) => {
    if (busy) return;
    setBusy(true);
    const prev = { code: ratingOf(person), at: person.rated_at ?? null };
    if (rating) setRating(person, rating, new Date().toISOString());
    const sentNote = noteRef.current.trim();
    if (sentNote) setNote('');
    try {
      // The outbox: sends now when there's signal, saves on the phone when
      // there isn't (and replays exactly once — the server dedupes on its id).
      const r = await logContact({
        person_id: person.id,
        channel: via,
        outcome,
        rating: rating || undefined,
        note: sentNote || undefined,
      }, { who: person.name });
      if (pending) backToDoor(); // the call/text is logged — the next tap is back at the door
      // Append-only: "Change" brings the rating row back; the next tap logs the fix.
      const change = { label: 'Change', onClick: () => focusRating(rateRef.current) };
      if (r.queued) {
        // Keep the optimistic rating; Shell refreshes everything once the
        // outbox sends. Refetching now would only pause (offline) or fail.
        toast(queuedText(r), change);
        return;
      }
      const who = multi ? `${firstName(person.name)} · ` : '';
      const what = rating
        ? `Rated ${ratingText(rating)}`
        : outcome === 'contacted'
          ? (via === 'door' ? 'Note saved' : via === 'phone' ? 'Call logged' : 'Text logged')
          : `${OUTCOME_LABEL[outcome]}${via !== 'door' ? ` (${via})` : ''}`;
      toast(`${who}${what}`, change);
      refresh();
    } catch (err) {
      // Only a refusal lands here (bad input, no permission) — network
      // trouble is queued above, never thrown.
      if (rating) setRating(person, prev.code, prev.at);
      if (sentNote && !noteRef.current) setNote(sentNote);
      toast(refusalMsg(err, 'Not saved — try again'));
    } finally {
      setBusy(false);
    }
  };

  const placeSign = async (kind) => {
    if (!sel || busy) return;
    setBusy(true);
    try {
      // Through the outbox (client_id: a replay is the same request).
      const r = await queueAction('sign.place', {
        person_id: sel.id,
        kind,
        lat: door.lat,
        lng: door.lng,
        address: door.address || undefined,
      }, { who: sel.name });
      if (r.queued) {
        // The map shows it from the outbox ("Not sent yet"); Undo takes it back.
        toast(queuedText(r, SIGN_LABEL[kind]), { label: 'Undo', onClick: () => undoQueuedSign(r.client_id, kind) });
        return;
      }
      const res = r.result;
      const sign = res?.sign;
      // Undo only where the server can truly take it back; never by filing
      // the request as "taken down".
      const canCancel = hasAction(await queryClient.fetchQuery(ACTIONS_QUERY).catch(() => null), 'sign.cancel');
      toast(`${SIGN_LABEL[kind]} requested`, sign?.id && canCancel ? { label: 'Undo', onClick: () => undoSign(sign) } : null);
      if (sign?.id) {
        patchDoors(queryClient, (d) => ({
          ...d,
          signs: [...(d.signs || []).filter((s) => s.id !== sign.id), { ...sign, lat: door.lat, lng: door.lng }],
        }));
      }
      refresh();
    } catch (err) {
      toast(refusalMsg(err, 'Not saved — try again'));
    } finally {
      setBusy(false);
    }
  };

  // The toast's Undo: sign.cancel takes the request back — gone from the map,
  // the sign crew's list, Today and every count. A sign already put up is
  // refused (409) and the toast says so. Runs after the card closed too.
  const undoSign = async (sign) => {
    const label = SIGN_LABEL[sign.kind] || 'Sign';
    const drop = () => patchDoors(queryClient, (d) => ({ ...d, signs: (d.signs || []).filter((s) => s.id !== sign.id) }));
    try {
      // No signal: the cancel waits on the phone (the map hides the sign meanwhile).
      const r = await queueAction('sign.cancel', { id: sign.id }, { who: sel?.name });
      if (r.queued) { toast(queuedText(r, 'Undo')); return; }
      drop();
      toast(`${label} cancelled`);
      refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Already gone (a second Undo, or cancelled elsewhere).
        drop();
        toast(`${label} already cancelled`);
        refresh();
        return;
      }
      toast(refusalMsg(err, 'Not undone — try again'));
    }
  };
  // Undo on a request still on the phone: take it off the phone, or — if it
  // may already have gone — send its cancel after it.
  const undoQueuedSign = (cid, kind) => {
    const label = SIGN_LABEL[kind] || 'Sign';
    const u = undoQueued(cid);
    if (u === 'removed') toast(`${label} cancelled`);
    else if (u === 'queued') toast(queuedText({}, 'Undo'));
    else if (u?.sent?.sign?.id) undoSign(u.sent.sign);
    else toast(`${label} already sent`);
  };
  const haveSign = new Set(door.signs.filter((s) => s.status !== 'removed').map((s) => s.kind));
  const signOffer = SIGN_BUTTONS.filter((s) => !haveSign.has(s.code));

  const smsBody = (p) =>
    `Hi ${firstName(p.name)}, it's ${me?.user?.name || 'a volunteer'} with ${me?.workspace?.name || 'the campaign'}.`;

  const dnc = isDnc(sel);
  const moreId = `door-more-${sel?.id || 'none'}`;

  return (
    <aside className="door-card" aria-label={`Door: ${doorTitle(door)}`}>
      <header className="mapsheet-head">
        <div className="door-head">
          <h2 className="mapsheet-title door-head__name">
            {multi ? doorTitle(door) : sel?.name}
            {!multi && dnc && <span className="chip chip-danger door-dnc">Do not contact</span>}
            {!multi && sel?.pending && <span className="chip fk-wait door-dnc">Not sent yet</span>}
          </h2>
          {!multi && <span className="door-head__addr">{doorTitle(door)}</span>}
        </div>
        <button type="button" className="btn btn-quiet mapsheet-close" onClick={onClose} aria-label="Close door card">✕</button>
      </header>

      {sel && (
        <section className="door-rate" ref={rateRef} aria-label={`Rate ${sel.name}`}>
          <PersonTabs persons={persons} value={sel.id} onPick={pickPerson} ratingOf={ratingOf} />
          {multi && dnc && <p className="door-dnc-line"><span className="chip chip-danger">Do not contact</span> {firstName(sel.name)}</p>}
          {multi && sel.pending && <p className="door-dnc-line"><span className="chip fk-wait">Not sent yet</span> {firstName(sel.name)}</p>}
          {channel !== 'door' && (
            <p className="door-via">
              <span className="chip fk-wait">{CHANNEL_CHIP[channel]}</span>
              <button type="button" className="fk-link" onClick={backToDoor}>At the door instead</button>
            </p>
          )}
          <RatingButtons
            key={sel.id}
            value={ratingOf(sel)}
            disabled={busy}
            onPick={(code) => log(sel, channel, 'contacted', code)}
          />
          <OutcomeButtons disabled={busy} onPick={(code) => log(sel, channel, code)} />
        </section>
      )}

      {sel && (
        <More id={moreId} open={more} onToggle={() => setMore((m) => !m)}>
          <div className="field door-note">
            <label htmlFor="door-note" className="fk-sr">Note</label>
            <textarea
              id="door-note"
              className="input"
              rows={2}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onFocus={() => toast(null)}
              placeholder="Note"
            />
            {noteText && (
              <button type="button" className="btn door-act door-note__only" disabled={busy} onClick={() => log(sel, channel, 'contacted')}>
                Save note
              </button>
            )}
          </div>

          <div className="door-more__row">
            {sel.phone ? (
              <>
                <a className="btn door-act" href={telHref(sel.phone)} onClick={() => startReach(sel, 'phone')}>Call</a>
                <a className="btn door-act" href={smsHref(sel.phone, smsBody(sel))} onClick={() => startReach(sel, 'text')}>Text</a>
                <span className="door-more__phone mono">{sel.phone}</span>
              </>
            ) : (
              <span className="muted door-more__phone">No phone</span>
            )}
          </div>
          {pending?.id === sel.id && (
            <div className="door-loglink" role="group" aria-label={`Log this ${pending.channel === 'phone' ? 'call' : 'text'}`}>
              <span className="door-loglink__label">Log this {pending.channel === 'phone' ? 'call' : 'text'}</span>
              <button type="button" className="btn door-act" disabled={busy} onClick={() => log(sel, pending.channel, 'contacted')}>Reached</button>
              <button type="button" className="btn door-act" disabled={busy} onClick={() => log(sel, pending.channel, 'no_answer')}>No answer</button>
              <button type="button" className="btn btn-quiet door-act" onClick={backToDoor}>Skip</button>
            </div>
          )}

          <div className="door-more__sec">
            <span className="door-more__label" id="door-sign-label">{signOffer.length ? 'Wants a sign?' : 'Signs'}</span>
            {door.signs.length > 0 && (
              <div className="door-signs-have">
                {door.signs.map((s) => (
                  <span key={s.id} className={`chip ${s.pending ? 'fk-wait' : SIGN_CHIP[s.status] || ''}`} title={SIGN_LABEL[s.kind]}>
                    {SIGN_LABEL[s.kind]} · {s.pending ? 'Not sent yet' : SIGN_STATUS[s.status] || s.status}
                  </span>
                ))}
              </div>
            )}
            {signOffer.length > 0 && (
              <div className="door-sign-btns" role="group" aria-labelledby="door-sign-label">
                {signOffer.map((s) => (
                  <button
                    key={s.code} type="button" className="btn door-act" disabled={busy}
                    title={`Request a ${SIGN_LABEL[s.code].toLowerCase()}`}
                    aria-label={`Request a ${SIGN_LABEL[s.code].toLowerCase()}`}
                    onClick={() => placeSign(s.code)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {canCreate && (
            adding ? (
              <AddPersonInline
                door={door}
                toast={toast}
                onCancel={() => setAdding(false)}
                onDone={(id) => { setAdding(false); pickPerson(id); }}
              />
            ) : (
              <button type="button" className="btn door-act door-add-btn" onClick={() => setAdding(true)}>
                + Person at this door
              </button>
            )
          )}

          <div className="door-more__sec">
            <span className="door-more__label" id="door-channel-label">How you reached them</span>
            <div className="door-channel" role="radiogroup" aria-labelledby="door-channel-label">
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

          <div className="door-more__foot">
            {!sel.pending && <Link className="btn btn-quiet door-act" to={`/people/${sel.id}`} state={fromHere}>Profile</Link>}
            {sel.rated_at && <span className="muted mono door-more__when">Rated {localDate(sel.rated_at)}</span>}
          </div>
        </More>
      )}
    </aside>
  );
}
