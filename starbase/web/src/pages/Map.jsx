// Map — field mode. Houses as pins (one per address + unit), colored by the
// household's strongest signal; tap a pin for the door card. Place mode drops
// people who have an address but no pin, "add door" creates a person at a
// tapped spot, and ?person=<id> deep-links to (and selects) a door. Turfs are
// translucent polygons (the Turfs chip shows/hides them); tap one for its
// sheet (progress, canvassers, walk list), desk roles draw new ones point by
// point, and ?turf=<id> fits the map to (and selects) a turf. ?draw=1 opens
// straight into drawing. Plain Leaflet in a ref'd div; divIcon pins so no
// marker-image paths are involved.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiGet, action } from '../api.js';
import { ratingByCode } from '@starbase/shared/canvass';
import DoorCard, { AddDoorForm, SIGN_LABEL, doorTitle, patchDoors } from '../components/DoorCard.jsx';
import GeocodeButton from '../components/GeocodeButton.jsx';
import './map.css';

const SURREY = [49.1913, -122.849];
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'support', label: 'Support' },
  { key: 'undecided', label: 'Undecided' },
  { key: 'opposed', label: 'Opposed' },
  { key: 'unrated', label: 'Unrated' },
  { key: 'signs', label: 'Signs' },
];

const isPhone = () => window.matchMedia('(max-width: 720px)').matches;
const norm = (s) => String(s || '').trim().toLowerCase();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Leaflet hands back unwrapped longitudes after panning round the world; the
// server's zod schema wants lat ∈ [-90, 90], lng ∈ [-180, 180].
const wrapped = (latlng) => { const ll = L.latLng(latlng).wrap(); return { lat: ll.lat, lng: ll.lng }; };
// person.create is desk-only (manager/treasurer/staff); volunteers can rate,
// log, place pins and request signs, but not add people.
const CREATE_ROLES = ['manager', 'treasurer', 'staff'];
const isTyping = (el) =>
  el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

// ── Turfs ──
// New turfs cycle through hues that never read as a rating band (no green,
// yellow or red), so a turf outline can't be mistaken for support/opposed.
const TURF_COLORS = ['#2b6cb0', '#7b3fa0', '#b5651d', '#1f7a6d', '#a0306a', '#4c5a8a'];
const MAX_TURF_POINTS = 500; // turf.create: polygon max(500)
const TURFS_PREF = 'starbase:map:turfs';
const EMPTY_LIST = [];
const EMPTY_DRAFT = { points: [], naming: false };
const readTurfsPref = () => { try { return localStorage.getItem(TURFS_PREF) !== '0'; } catch { return true; } };
const writeTurfsPref = (on) => { try { localStorage.setItem(TURFS_PREF, on ? '1' : '0'); } catch { /* storage blocked */ } };

const hashIndex = (s, n) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % n; };
const isColor = (c) => typeof c === 'string' && c.length <= 20 && typeof CSS !== 'undefined' && CSS.supports?.('color', c);
const turfColor = (t) => (isColor(t?.color) ? t.color : TURF_COLORS[hashIndex(t?.id || t?.name || '', TURF_COLORS.length)]);
const validRing = (ring) => Array.isArray(ring) && ring.length >= 3
  && ring.every((p) => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])));

// Same ray-casting test the server uses for walk lists (server/lib/geo.js).
function pointInPolygon(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Doors + people inside a ring, from the map's own door model (an estimate
// for a turf that is still being drawn; the server's numbers replace it).
function countInside(doors, ring) {
  let n = 0;
  let people = 0;
  for (const d of doors) {
    if (pointInPolygon(d.lat, d.lng, ring)) { n += 1; people += d.persons.length; }
  }
  return { doors: n, people };
}

// One door per (address + unit); located people without an address group by spot.
const doorKey = (p) =>
  p.address ? `${norm(p.address)}|${norm(p.unit)}` : `@${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`;

// Household signal: any opposed → opposed; else any support → support;
// else any undecided → undecided; else unrated.
function householdBand(persons) {
  let support = false;
  let undecided = false;
  for (const p of persons) {
    const band = ratingByCode(p.rating)?.band;
    if (band === 'opposed') return 'opposed';
    if (band === 'support') support = true;
    else if (band === 'undecided') undecided = true;
  }
  return support ? 'support' : undecided ? 'undecided' : 'unrated';
}

function buildDoors(data) {
  const byKey = new Map();
  for (const p of data.persons || []) {
    const key = doorKey(p);
    let door = byKey.get(key);
    if (!door) {
      door = { key, address: p.address, unit: p.unit, lat: Number(p.lat), lng: Number(p.lng), persons: [], signs: [] };
      byKey.set(key, door);
    }
    door.persons.push(p);
  }
  const byPerson = new Map();
  for (const door of byKey.values()) for (const p of door.persons) byPerson.set(p.id, door);
  const orphanSigns = [];
  for (const s of data.signs || []) {
    const door = (s.person_id && byPerson.get(s.person_id)) || (s.address && byKey.get(`${norm(s.address)}|`)) || null;
    if (door) door.signs.push(s);
    else if (s.lat != null && s.lng != null) orphanSigns.push(s);
  }
  const doors = [...byKey.values()];
  for (const door of doors) door.band = householdBand(door.persons);
  spreadStacked(doors);
  return { doors, byPerson, orphanSigns };
}

// Units in one building share a lat/lng, so their pins would stack exactly.
// Fan the extras out on a small sunflower spiral (pixel offsets, unit order)
// so every door stays tappable; the first unit keeps the true spot.
function spreadStacked(doors) {
  const spots = new Map();
  for (const door of doors) {
    door.offset = [0, 0];
    const k = `${door.lat.toFixed(5)},${door.lng.toFixed(5)}`;
    if (!spots.has(k)) spots.set(k, []);
    spots.get(k).push(door);
  }
  for (const group of spots.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => String(a.unit || '').localeCompare(String(b.unit || ''), undefined, { numeric: true }));
    group.forEach((door, i) => {
      const r = 28 * Math.sqrt(i);
      const t = i * 2.39996; // golden angle
      door.offset = [Math.round(r * Math.cos(t)), Math.round(r * Math.sin(t))];
    });
  }
}

const EMPTY_MODEL = { doors: [], byPerson: new Map(), orphanSigns: [] };

function pinIcon(door, selected) {
  const single = door.persons.length === 1;
  const label = single ? ratingByCode(door.persons[0].rating)?.short || '·' : String(door.persons.length);
  const cls = ['map-pin', `map-pin--${door.band}`, single ? '' : 'map-pin--multi', selected ? 'map-pin--selected' : ''].filter(Boolean).join(' ');
  return L.divIcon({
    className: 'map-pin-wrap',
    html: `<div class="${cls}"><span class="map-pin__label">${esc(label)}</span></div>`,
    iconSize: [30, 40],
    iconAnchor: [15 - door.offset[0], 38 - door.offset[1]],
  });
}

// Sign glyphs sit at the top-right of their door pin (i staggers several);
// i < 0 means a sign with no door — anchor it on its own spot.
function signIcon(status, i, offset = [0, 0]) {
  return L.divIcon({
    className: 'map-sign-wrap',
    html: `<div class="map-sign map-sign--${esc(status)}"><i class="map-sign__face"></i><i class="map-sign__post"></i></div>`,
    iconSize: [16, 20],
    iconAnchor: i < 0 ? [8, 20] : [-12 - i * 12 - offset[0], 46 - offset[1]],
  });
}

const meIcon = () => L.divIcon({ className: 'map-me-wrap', html: '<div class="map-me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });

// Pan so a latlng is not hidden under the overlays: the filter strip on top
// and the drawer (right panel on desktop, bottom sheet on phones). Measures
// the real DOM, so it holds whatever the chrome wraps to.
function revealLatLng(map, ll, page) {
  const size = map.getSize();
  const box = map.getContainer().getBoundingClientRect();
  const topEl = page?.querySelector('.map-top');
  const sheet = page?.querySelector('.map-sheet');
  const top = topEl ? Math.max(0, topEl.getBoundingClientRect().bottom - box.top) + 8 : 96;
  let right = size.x;
  let bottom = size.y;
  if (sheet) {
    const r = sheet.getBoundingClientRect();
    if (isPhone()) bottom = Math.min(bottom, r.top - box.top);
    else right = Math.min(right, r.left - box.left);
  }
  if (bottom - top < 80) bottom = top + 80; // tiny viewports: best effort
  const pt = map.latLngToContainerPoint(ll);
  if (pt.x > 24 && pt.x < right - 24 && pt.y > top + 40 && pt.y < bottom - 12) return;
  map.setView(ll, Math.max(map.getZoom(), 16), { animate: false });
  // Put the pin (tip at ll, body ~38px above) in the middle of the free area.
  const cx = right / 2;
  const cy = (top + bottom) / 2 + 19;
  map.panBy([size.x / 2 - cx, size.y / 2 - cy], { animate: false });
}

// Fit a turf into the part of the map the overlays leave free (filter strip
// on top, the sheet on the right on desktop or along the bottom on phones).
// onlyIfHidden: leave the view alone when every corner is already in sight.
function fitTurf(map, ring, page, { onlyIfHidden = false, maxZoom = 17 } = {}) {
  const size = map.getSize();
  const box = map.getContainer().getBoundingClientRect();
  const topEl = page?.querySelector('.map-top');
  const sheet = page?.querySelector('.map-sheet');
  const gap = 16;
  let top = gap;
  let right = gap;
  let bottom = gap;
  if (topEl && topEl.offsetParent !== null) top = Math.max(gap, topEl.getBoundingClientRect().bottom - box.top + 8);
  if (sheet) {
    const r = sheet.getBoundingClientRect();
    if (isPhone()) bottom = Math.max(gap, box.bottom - r.top + 8);
    else right = Math.max(gap, box.right - r.left + 8);
  }
  // Tiny viewports: keep at least a sliver of map to fit into.
  if (size.y - top - bottom < 120) bottom = Math.max(gap, size.y - top - 120);
  if (size.x - right - gap < 120) right = gap;
  if (onlyIfHidden && ring.every((ll) => {
    const pt = map.latLngToContainerPoint(ll);
    return pt.x >= gap && pt.x <= size.x - right && pt.y >= top && pt.y <= size.y - bottom;
  })) return;
  map.fitBounds(L.latLngBounds(ring), { paddingTopLeft: [gap, top], paddingBottomRight: [right, bottom], maxZoom, animate: false });
}

// The first corner of a turf being drawn: a 44px tap target (tap it to close
// the shape once there are 3+ corners) around a visible dot.
const draftStartIcon = (closable) => L.divIcon({
  className: `map-draft-start${closable ? ' is-closable' : ''}`,
  html: '<span class="map-draft-dot"></span>',
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

function TurfGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="map-glyph">
      <path d="M5 7l8-3 7 6-3 9-11-2z" />
      <circle cx="5" cy="7" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="13" cy="4" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="20" cy="10" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="17" cy="19" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="6" cy="17" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LocateGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  );
}

// People with an address but no pin yet. Server search, client filter.
function PlacePicker({ unlocated, onPick, onClose }) {
  const [q, setQ] = useState('');
  const persons = useQuery({
    queryKey: ['persons', 'unlocated', q],
    queryFn: () => apiGet(`/persons?q=${encodeURIComponent(q)}&limit=500`),
    placeholderData: keepPreviousData,
  });
  const rows = (persons.data?.persons ?? []).filter((p) => p.lat == null && p.address);
  const partial = !q && persons.data && rows.length < unlocated;
  return (
    <aside className="map-sheet map-place-picker" aria-label="People not on the map yet">
      <header className="mapsheet-head">
        <div>
          <span className="eyebrow">Place on the map</span>
          <h2 className="mapsheet-title">Who are we placing?</h2>
        </div>
        <button type="button" className="btn btn-quiet mapsheet-close" onClick={onClose} aria-label="Close">✕</button>
      </header>
      <div className="field">
        <label htmlFor="place-q">Search</label>
        <input
          id="place-q" className="input" type="search" autoFocus placeholder="Name, address or phone…"
          value={q} onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {persons.isError && <p className="error" style={{ padding: '0 16px' }}>{persons.error.message}</p>}
      <ul className="map-place-list">
        {rows.map((p) => (
          <li key={p.id}>
            <button type="button" className="map-place-row" onClick={() => onPick(p)}>
              <span className="map-place-row__name">{p.name}</span>
              <span className="map-place-row__addr muted">{p.unit ? `${p.unit} – ` : ''}{p.address}</span>
            </button>
          </li>
        ))}
        {partial && rows.length > 0 && (
          <li className="muted map-place-empty">
            Showing {rows.length} of {unlocated} — search by name or street to find the rest.
          </li>
        )}
        {persons.isPending && persons.fetchStatus === 'paused' && (
          <li className="muted map-place-empty">You’re offline — this list loads when you have signal.</li>
        )}
        {rows.length === 0 && !persons.isPending && (
          <li className="muted map-place-empty">
            {q ? `No one unplaced matches “${q}”.` : 'Everyone with an address is already on the map.'}
          </li>
        )}
      </ul>
    </aside>
  );
}

function TurfBar({ done, total }) {
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <span
      className="turf-bar" role="progressbar" aria-label="Doors done"
      aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(done, total)}
    >
      <span className="turf-bar__fill" style={{ width: `${pct}%` }} />
    </span>
  );
}

// The sheet for one turf: progress, canvassers (desk roles assign/remove),
// the walk list, and delete with an in-place confirm.
function TurfSheet({ turf, me, desk, onClose, onDeleted, toast }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [pick, setPick] = useState('');
  const [confirming, setConfirming] = useState(false);
  const membersQ = useQuery({ queryKey: ['members'], queryFn: () => apiGet('/members'), enabled: desk, staleTime: 60_000 });
  const assigned = new Set(turf.members.map((m) => m.id));
  const options = (membersQ.data?.members ?? []).filter((m) => !assigned.has(m.id));
  const left = Math.max(0, turf.doors - turf.doorsDone);

  // Assignment changes the turf list and Today's "my turfs".
  const run = async (name, input) => {
    setBusy(true);
    setError(null);
    try {
      await action(name, input);
      await Promise.all(['turfs', 'brief'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      return true;
    } catch (err) {
      setError(err.message || 'That didn’t save — try again');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const assign = async (e) => {
    e.preventDefault();
    if (!pick) return;
    const who = options.find((m) => m.id === pick);
    if (await run('turf.assign', { turf_id: turf.id, user_id: pick })) {
      setPick('');
      toast(`${who?.name || 'They'} can now open this walk list`);
    }
  };

  const unassign = async (m) => {
    if (await run('turf.unassign', { turf_id: turf.id, user_id: m.id })) toast(`Took ${m.name} off ${turf.name}`);
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await action('turf.delete', { id: turf.id });
      onDeleted(turf); // close the sheet first so the URL never points at a missing turf
      queryClient.removeQueries({ queryKey: ['turf', turf.id] });
      queryClient.setQueryData(['turfs'], (d) => (d ? { ...d, turfs: d.turfs.filter((t) => t.id !== turf.id) } : d));
      for (const key of ['turfs', 'brief']) queryClient.invalidateQueries({ queryKey: [key] });
    } catch (err) {
      setError(err.message || 'Could not delete it — try again');
      setBusy(false);
    }
  };

  return (
    <aside className="map-sheet turf-sheet" aria-label={`Turf: ${turf.name}`} style={{ '--turf': turfColor(turf) }}>
      <header className="mapsheet-head">
        <div>
          <span className="eyebrow"><i className="turf-swatch" aria-hidden="true" />Turf</span>
          <h2 className="mapsheet-title">{turf.name}</h2>
        </div>
        <button type="button" className="btn btn-quiet mapsheet-close" onClick={onClose} aria-label="Close turf">✕</button>
      </header>

      <div className="turf-sheet__body">
        <div className="turf-progress">
          <span className="turf-progress__text mono"><strong>{turf.doorsDone}</strong> of {plural(turf.doors, 'door', 'doors')} done</span>
          <TurfBar done={turf.doorsDone} total={turf.doors} />
        </div>
        <dl className="turf-stats">
          <div><dt>Doors left</dt><dd>{left}</dd></div>
          <div><dt>People</dt><dd>{turf.people}</dd></div>
          <div><dt>Rated</dt><dd>{turf.rated}</dd></div>
        </dl>
        <Link className="btn btn-primary turf-act" to={`/turfs/${turf.id}`}>Open walk list</Link>

        <section className="turf-sec" aria-labelledby="turf-canvassers">
          <span className="eyebrow" id="turf-canvassers">Canvassers</span>
          {turf.members.length === 0 ? (
            <p className="muted turf-none">
              {desk ? 'No one yet. Volunteers only see turfs assigned to them.' : 'No one assigned yet.'}
            </p>
          ) : (
            <ul className="turf-members">
              {turf.members.map((m) => (
                <li key={m.id} className="turf-member">
                  <span className="turf-member__name">
                    {m.name}{m.id === me?.user?.id && <span className="muted"> (you)</span>}
                  </span>
                  {desk && (
                    <button
                      type="button" className="btn btn-quiet turf-member__remove" disabled={busy}
                      aria-label={`Take ${m.name} off this turf`} title="Take off this turf"
                      onClick={() => unassign(m)}
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {desk && (
            <form className="turf-assign" onSubmit={assign}>
              <div className="field">
                <label htmlFor="turf-assign">Assign a team member</label>
                <select
                  id="turf-assign" className="input" value={pick} disabled={busy || !options.length}
                  onChange={(e) => setPick(e.target.value)}
                >
                  <option value="">
                    {/* isPending, not isLoading: offline the fetch is paused, and
                        "everyone is on it" would be a wrong answer. */}
                    {membersQ.isPending
                      ? (membersQ.fetchStatus === 'paused' ? 'Offline — the team loads with signal' : 'Loading the team…')
                      : membersQ.isError ? 'Couldn’t load the team'
                        : options.length ? 'Choose someone…' : 'Everyone on the team is on it'}
                  </option>
                  {options.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}
                </select>
              </div>
              <button type="submit" className="btn turf-act" disabled={busy || !pick}>Assign</button>
            </form>
          )}
          {desk && membersQ.data && !options.length && me?.role === 'manager' && (
            <p className="muted turf-none">Need more canvassers? <Link to="/team">Invite them from Team</Link>.</p>
          )}
          {membersQ.isError && <p className="error">Couldn’t load the team — {membersQ.error.message}</p>}
        </section>

        {desk && (
          <section className="turf-sec">
            {confirming ? (
              <div className="turf-confirm" role="group" aria-label="Confirm delete">
                <p>
                  Delete <strong>{turf.name}</strong>? Its walk list and assignments go with it.
                  People and their knocks stay.
                </p>
                <div className="turf-confirm__btns">
                  <button type="button" className="btn turf-act turf-danger" disabled={busy} onClick={remove}>
                    {busy ? 'Deleting…' : 'Delete turf'}
                  </button>
                  <button type="button" className="btn turf-act" disabled={busy} autoFocus onClick={() => setConfirming(false)}>
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn btn-quiet turf-act turf-delete" onClick={() => { setConfirming(true); setError(null); }}>
                Delete turf
              </button>
            )}
          </section>
        )}

        {error && <p className="error" role="alert">{error}</p>}
        <Link className="turf-all muted" to="/turfs">All turfs</Link>
      </div>
    </aside>
  );
}

// After Finish: name the drawn shape. The draft stays on the map behind it.
function NameTurfForm({ points, doors, busy, error, onSave, onBack, onCancel }) {
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState(null);
  const inside = useMemo(() => countInside(doors, points), [doors, points]);
  const submit = (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) { setLocalError('Give it a name canvassers will recognize, like “Newton — 72 Ave north”'); return; }
    setLocalError(null);
    onSave(n);
  };
  const shown = localError || error;
  return (
    <form className="door-card door-form turf-name-form" onSubmit={submit} aria-label="Name this turf">
      <header className="mapsheet-head">
        <div>
          <span className="eyebrow">New turf · {plural(points.length, 'point', 'points')}</span>
          <h2 className="mapsheet-title">Name this turf</h2>
        </div>
        <button type="button" className="btn btn-quiet mapsheet-close" onClick={onCancel} disabled={busy} aria-label="Discard this turf">✕</button>
      </header>
      <p className="muted door-form__where">
        {inside.doors ? `${plural(inside.doors, 'door', 'doors')} · ${plural(inside.people, 'person', 'people')} inside` : 'No doors inside yet — people show up once they’re on the map'}
      </p>
      <div className="field">
        <label htmlFor="turf-name">Turf name</label>
        <input
          id="turf-name" className="input" autoFocus required maxLength={200} autoComplete="off"
          placeholder="Newton — 72 Ave north" value={name} onChange={(e) => setName(e.target.value)}
        />
      </div>
      {shown && <p className="error turf-form-error" role="alert">{shown}</p>}
      <div className="door-form__actions">
        <button type="submit" className="btn btn-primary door-act" disabled={busy}>{busy ? 'Saving…' : 'Save turf'}</button>
        <button type="button" className="btn door-act" disabled={busy} onClick={onBack}>Keep drawing</button>
        <button type="button" className="btn btn-quiet door-act" disabled={busy} onClick={onCancel}>Discard</button>
      </div>
    </form>
  );
}

export default function MapPage() {
  const { me } = useOutletContext();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const personParam = params.get('person');
  const turfParam = params.get('turf');
  const drawParam = params.get('draw');

  const pageRef = useRef(null);
  const canvasRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(null);
  const markersRef = useRef(new Map()); // door key → marker
  const fittedRef = useRef(false);
  const centeredOnRef = useRef(null);  // person id we last revealed
  const selectedKeyRef = useRef(null);
  const prevSelectedRef = useRef(null);
  const onMapClickRef = useRef(null);
  const onLongPressRef = useRef(null);
  const onPinClickRef = useRef(null);
  const setParamsRef = useRef(null);
  const onTurfClickRef = useRef(null);
  const onDraftStartRef = useRef(null);
  const onKeyRef = useRef(null);
  const focusedTurfRef = useRef(null); // turf id the map was last fitted to (or tapped)
  const canCreate = CREATE_ROLES.includes(me?.role);

  const [filter, setFilter] = useState('all');
  const [showTurfs, setShowTurfs] = useState(readTurfsPref);
  const [draft, setDraft] = useState(EMPTY_DRAFT); // turf being drawn: [lat, lng] points
  const [turfBusy, setTurfBusy] = useState(false);
  const [turfError, setTurfError] = useState(null);
  const [mode, setMode] = useState(null);       // null | 'place' | 'add' | 'draw'
  const [placing, setPlacing] = useState(null); // person being dropped
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addAt, setAddAt] = useState(null);     // { lat, lng } for a brand-new door
  const [locating, setLocating] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const toastTimer = useRef(null);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3500);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // A pin placed moves a person into (or out of) a turf: its counts and walk list change.
  const refresh = useCallback((personId) => {
    for (const key of ['doors', 'persons', 'signs', 'brief', 'turfs', 'turf']) queryClient.invalidateQueries({ queryKey: [key] });
    if (personId) queryClient.invalidateQueries({ queryKey: ['person', personId] });
  }, [queryClient]);
  const onGeocoded = useCallback(() => {
    for (const key of ['doors', 'brief', 'persons', 'turfs', 'turf']) queryClient.invalidateQueries({ queryKey: [key] });
  }, [queryClient]);

  // ── Data ──
  const doorsQ = useQuery({ queryKey: ['doors'], queryFn: () => apiGet('/map/doors'), placeholderData: keepPreviousData });
  const { doors, byPerson, orphanSigns } = useMemo(() => (doorsQ.data ? buildDoors(doorsQ.data) : EMPTY_MODEL), [doorsQ.data]);
  const unlocated = doorsQ.data?.unlocated ?? 0;

  const selectedDoor = personParam ? byPerson.get(personParam) || null : null;
  const selectedKey = selectedDoor?.key || null;
  // Declared before the marker effects so Leaflet handlers see the current key.
  useEffect(() => { selectedKeyRef.current = selectedKey; }, [selectedKey]);

  const visible = useMemo(
    () => doors.filter((d) => (filter === 'all' ? true : filter === 'signs' ? d.signs.length > 0 : d.band === filter)),
    [doors, filter],
  );
  const visiblePeople = visible.reduce((n, d) => n + d.persons.length, 0);

  // Deep link to someone who has no pin yet → offer to place them.
  const wantsMissing = Boolean(personParam && doorsQ.data && !selectedDoor && !doorsQ.isFetching);
  const missingQ = useQuery({
    queryKey: ['person', personParam],
    queryFn: () => apiGet(`/persons/${personParam}`),
    enabled: wantsMissing,
  });
  const missingPerson = wantsMissing ? missingQ.data?.person || null : null;
  const missingGone = wantsMissing && missingQ.isError;

  // Turfs (volunteers get only the ones assigned to them).
  const turfsQ = useQuery({ queryKey: ['turfs'], queryFn: () => apiGet('/turfs') });
  const turfs = turfsQ.data?.turfs ?? EMPTY_LIST;
  const turfById = useMemo(() => new Map(turfs.map((t) => [t.id, t])), [turfs]);
  const selectedTurf = turfParam ? turfById.get(turfParam) || null : null;
  const turfMissing = Boolean(turfParam && turfsQ.data && !selectedTurf && !turfsQ.isFetching);

  // Selection lives in the URL: /map?person=<id> or /map?turf=<id> (one at a
  // time). react-router's setter changes identity with every search change,
  // so keep `select` stable via a ref — otherwise every tap would rebuild
  // every marker on the map.
  useLayoutEffect(() => { setParamsRef.current = setParams; });
  const select = useCallback((personId) => {
    setParamsRef.current(personId ? { person: personId } : {}, { replace: true });
  }, []);
  const selectTurf = useCallback((turfId) => {
    setParamsRef.current(turfId ? { turf: turfId } : {}, { replace: true });
  }, []);

  const cancelMode = () => { setMode(null); setPlacing(null); setDraft(EMPTY_DRAFT); setTurfError(null); };
  const toggleAdd = () => { setMode((m) => (m === 'add' ? null : 'add')); setPlacing(null); setPickerOpen(false); setDraft(EMPTY_DRAFT); };
  const startPlacing = (person) => { setPlacing(person); setMode('place'); setPickerOpen(false); setAddAt(null); setDraft(EMPTY_DRAFT); };

  const setTurfsShown = (on) => { setShowTurfs(on); writeTurfsPref(on); };

  // ── Drawing a turf ──
  const startDraw = () => {
    setMode('draw');
    setPlacing(null);
    setPickerOpen(false);
    setAddAt(null);
    setDraft(EMPTY_DRAFT);
    setTurfError(null);
    if (!showTurfs) setTurfsShown(true); // existing turfs are the reference for the new edge
    select(null);
  };
  const addPoint = (latlng) => {
    if (draft.naming) return;
    if (draft.points.length >= MAX_TURF_POINTS) { toast(`A turf can have up to ${MAX_TURF_POINTS} points — tap Finish`); return; }
    const { lat, lng } = wrapped(latlng);
    const pt = [Number(lat.toFixed(6)), Number(lng.toFixed(6))];
    setDraft((d) => {
      const last = d.points[d.points.length - 1];
      if (d.naming || (last && last[0] === pt[0] && last[1] === pt[1])) return d;
      return { ...d, points: [...d.points, pt] };
    });
  };
  const undoPoint = () => setDraft((d) => (d.naming ? d : { ...d, points: d.points.slice(0, -1) }));
  const finishDraw = () => {
    if (draft.points.length < 3) return;
    setTurfError(null);
    setDraft((d) => ({ ...d, naming: true }));
  };
  const backToDrawing = () => { setTurfError(null); setDraft((d) => ({ ...d, naming: false })); };

  const saveTurf = async (name) => {
    const polygon = draft.points;
    const color = TURF_COLORS[turfs.length % TURF_COLORS.length];
    setTurfBusy(true);
    setTurfError(null);
    try {
      const res = await action('turf.create', { name, polygon, color });
      const id = res.turf.id;
      // Show it (and its sheet) now; the refetch brings the server's counts.
      queryClient.cancelQueries({ queryKey: ['turfs'] });
      queryClient.setQueryData(['turfs'], (d) => (d ? {
        ...d,
        turfs: [...d.turfs.filter((t) => t.id !== id), {
          id, name: res.turf.name || name, color, polygon, notes: null, members: [],
          ...countInside(doors, polygon), doorsDone: 0, rated: 0,
        }],
      } : d));
      for (const key of ['turfs', 'brief']) queryClient.invalidateQueries({ queryKey: [key] });
      cancelMode();
      focusedTurfRef.current = id; // it's already on screen — no refit
      selectTurf(id);
      toast(`Saved ${res.turf.name || name} — assign a canvasser next`);
    } catch (err) {
      setTurfError(err.message || 'Could not save the turf — try again');
    } finally {
      setTurfBusy(false);
    }
  };

  // /map?draw=1 (from the turf list) opens straight into drawing.
  useEffect(() => {
    if (drawParam !== '1') return;
    if (canCreate) startDraw();
    else select(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawParam]);

  const locatePerson = async (person, latlng) => {
    try {
      await action('person.locate', { id: person.id, lat: latlng.lat, lng: latlng.lng });
      toast(`Placed ${person.name} on the map`);
      // Drop the pin now; the refetch below confirms it.
      patchDoors(queryClient, (d) => ({
        ...d,
        // The server counts only people WITH an address as unlocated.
        unlocated: person.address && !d.persons.some((p) => p.id === person.id)
          ? Math.max(0, (d.unlocated || 0) - 1)
          : d.unlocated,
        persons: [
          ...d.persons.filter((p) => p.id !== person.id),
          {
            id: person.id, name: person.name, phone: person.phone ?? null, email: person.email ?? null,
            address: person.address ?? null, unit: person.unit ?? null, lat: latlng.lat, lng: latlng.lng,
            rating: person.rating ?? null, rated_at: person.rated_at ?? null, tags: person.tags || [],
          },
        ],
      }));
      cancelMode();
      centeredOnRef.current = person.id; // they tapped the spot — no need to pan
      refresh(person.id);
      select(person.id);
    } catch (err) {
      toast(err.message || 'Could not place them');
    }
  };

  const locateMe = () => {
    const map = mapRef.current;
    if (!map) return;
    if (!navigator.geolocation) { toast('Location is not available on this device'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        // The fix can land after the page unmounted (map.remove()d) — bail.
        if (mapRef.current !== map) return;
        const ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
        const layer = layersRef.current?.me;
        if (layer) {
          layer.clearLayers();
          if (pos.coords.accuracy) L.circle(ll, { radius: pos.coords.accuracy, className: 'map-me-ring', interactive: false }).addTo(layer);
          L.marker(ll, { icon: meIcon(), interactive: false, keyboard: false, zIndexOffset: 2000 }).addTo(layer);
        }
        map.setView(ll, Math.max(map.getZoom(), 16));
      },
      (err) => {
        setLocating(false);
        toast(err.code === 1 ? 'Location permission was denied' : 'Could not get your location');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  // Fresh closures for Leaflet's handlers.
  useEffect(() => {
    onMapClickRef.current = (latlng) => {
      if (mode === 'draw') { addPoint(latlng); return; }
      if (mode === 'place' && placing) { locatePerson(placing, wrapped(latlng)); return; }
      if (mode === 'add') { setAddAt(wrapped(latlng)); setMode(null); return; }
      if (personParam || turfParam) select(null); // tap on empty map closes the card
    };
    onLongPressRef.current = (latlng) => {
      if (mode === 'draw' || (mode === 'place' && placing)) return;
      if (!canCreate) { toast('Only staff can add new people — rate, log and place pins instead'); return; }
      setAddAt(wrapped(latlng));
      setMode(null);
      setPickerOpen(false);
    };
    // Pins swallow map clicks, so place mode has to handle them too: tapping
    // an existing door drops the person in that building. (While drawing,
    // pins are click-through — see .is-drawing in map.css.)
    onPinClickRef.current = (door) => {
      if (mode === 'draw') { addPoint(L.latLng(door.lat, door.lng)); return; }
      if (mode === 'place' && placing) { locatePerson(placing, { lat: door.lat, lng: door.lng }); return; }
      if (mode === 'add') setMode(null);
      if (selectedKeyRef.current === door.key) return;
      select(door.persons[0].id);
    };
    // Turf polygons don't bubble to the map, so they mirror its rules: in a
    // mode the tap is a map tap; an open door card closes like on empty map.
    onTurfClickRef.current = (turf, latlng) => {
      if (mode) { onMapClickRef.current?.(latlng); return; }
      if (personParam) { select(null); return; }
      if (pickerOpen || addAt || turfParam === turf.id) return;
      focusedTurfRef.current = turf.id; // they're looking right at it — no refit
      selectTurf(turf.id);
    };
    onDraftStartRef.current = () => { if (draft.points.length >= 3) finishDraw(); };
    // Escape backs out of whatever is open; while drawing, Enter finishes and
    // Backspace / Ctrl+Z takes back the last point.
    onKeyRef.current = (e) => {
      if (mode === 'draw' && !draft.naming && !isTyping(e.target)) {
        if (e.key === 'Enter' && draft.points.length >= 3) { e.preventDefault(); finishDraw(); return; }
        if (e.key === 'Backspace' || (e.key === 'z' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); undoPoint(); return; }
      }
      if (e.key !== 'Escape') return;
      if (mode === 'draw' && draft.naming) backToDrawing();
      else if (mode) cancelMode();
      else if (pickerOpen) setPickerOpen(false);
      else if (addAt) setAddAt(null);
      else if (personParam || turfParam) select(null);
    };
  });

  useEffect(() => {
    const onKey = (e) => onKeyRef.current?.(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Measure the app chrome so the map can fill the rest of the viewport.
  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!el) return undefined;
    // Ceil the real (fractional) heights: offsetHeight rounds down, which
    // left the sheet and map a fraction of a pixel under the tab bar.
    const h = (sel) => Math.ceil(document.querySelector(sel)?.getBoundingClientRect().height || 0);
    const measure = () => {
      el.style.setProperty('--nav-h', `${h('.nav')}px`);
      el.style.setProperty('--tabbar-h', `${h('.tabbar')}px`);
      mapRef.current?.invalidateSize();
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // ── Leaflet map ──
  useEffect(() => {
    const map = L.map(canvasRef.current, { center: SURREY, zoom: 12, zoomControl: false, attributionControl: false });
    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    // Turf polygons sit under everything else; a turf being drawn sits over
    // the other vectors (pins and its corner dots are in the marker pane).
    map.createPane('turfs').style.zIndex = 350;
    map.createPane('turfDraft').style.zIndex = 450;
    const layers = {
      turfs: L.layerGroup().addTo(map),
      draft: L.layerGroup().addTo(map),
      signs: L.layerGroup().addTo(map),
      doors: L.layerGroup().addTo(map),
      me: L.layerGroup().addTo(map),
    };
    map.on('click', (e) => onMapClickRef.current?.(e.latlng));
    map.on('contextmenu', (e) => { e.originalEvent?.preventDefault?.(); onLongPressRef.current?.(e.latlng); });
    mapRef.current = map;
    layersRef.current = layers;
    const markers = markersRef.current;
    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
      markers.clear();
      // A remount (StrictMode, fast refresh) gets a fresh map: fit it again.
      fittedRef.current = false;
      centeredOnRef.current = null;
      prevSelectedRef.current = null;
      focusedTurfRef.current = null;
    };
  }, []);

  // Turf polygons. Hidden by the Turfs chip, except a selected turf always shows.
  useEffect(() => {
    const layer = layersRef.current?.turfs;
    if (!layer) return;
    layer.clearLayers();
    const list = (showTurfs ? turfs : turfs.filter((t) => t.id === turfParam))
      .filter((t) => validRing(t.polygon))
      .sort((a, b) => (a.id === turfParam) - (b.id === turfParam)); // selected on top
    for (const t of list) {
      const selected = t.id === turfParam;
      const color = turfColor(t);
      const poly = L.polygon(t.polygon.map(([lat, lng]) => [Number(lat), Number(lng)]), {
        pane: 'turfs',
        color,
        weight: selected ? 4 : 2,
        opacity: 0.95,
        fillColor: color,
        fillOpacity: selected ? 0.16 : 0.07,
        className: `map-turf${selected ? ' map-turf--selected' : ''}`,
        bubblingMouseEvents: false,
      });
      // String tooltip content is set as innerHTML — escape the name.
      poly.bindTooltip(esc(t.name), { sticky: true, direction: 'top', offset: [0, -10], className: 'map-turf-tip' });
      poly.on('click', (e) => onTurfClickRef.current?.(t, e.latlng));
      poly.addTo(layer);
    }
  }, [turfs, showTurfs, turfParam]);

  // The turf being drawn: dashed outline, corner dots, a tappable first corner.
  useEffect(() => {
    const layer = layersRef.current?.draft;
    if (!layer) return;
    layer.clearLayers();
    if (mode !== 'draw') return;
    const pts = draft.points;
    const line = { pane: 'turfDraft', color: '#0c0c0c', weight: 2.5, dashArray: '6 6', interactive: false };
    if (pts.length >= 3) L.polygon(pts, { ...line, fillColor: '#ffd400', fillOpacity: 0.22 }).addTo(layer);
    else if (pts.length === 2) L.polyline(pts, line).addTo(layer);
    pts.forEach((p, i) => {
      if (i === 0) {
        const closable = pts.length >= 3 && !draft.naming;
        L.marker(p, {
          icon: draftStartIcon(closable),
          interactive: closable,
          keyboard: false,
          title: closable ? 'Close the turf here' : '',
          zIndexOffset: 3000,
        }).on('click', () => onDraftStartRef.current?.()).addTo(layer);
      } else {
        L.circleMarker(p, {
          pane: 'turfDraft', radius: 5, color: '#0c0c0c', weight: 2, fillColor: '#faf8f1', fillOpacity: 1, interactive: false,
        }).addTo(layer);
      }
    });
  }, [mode, draft]);

  // A double-tap while drawing is two points, not a zoom.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mode === 'draw') map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }, [mode]);

  // Pins + sign glyphs for the filtered doors.
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.doors.clearLayers();
    layers.signs.clearLayers();
    markersRef.current.clear();
    for (const door of visible) {
      const selected = door.key === selectedKeyRef.current;
      const marker = L.marker([door.lat, door.lng], {
        icon: pinIcon(door, selected),
        title: `${doorTitle(door)} — ${door.persons.map((p) => p.name).join(', ')}`,
        riseOnHover: true,
        zIndexOffset: selected ? 1000 : 0,
      });
      marker.on('click', () => onPinClickRef.current?.(door));
      marker.addTo(layers.doors);
      markersRef.current.set(door.key, marker);
      door.signs.forEach((s, i) => {
        L.marker([door.lat, door.lng], {
          icon: signIcon(s.status, i, door.offset),
          title: `${SIGN_LABEL[s.kind] || s.kind} · ${s.status}`,
          keyboard: false,
          zIndexOffset: 500,
        })
          .on('click', () => onPinClickRef.current?.(door))
          .addTo(layers.signs);
      });
    }
    if (filter === 'all' || filter === 'signs') {
      for (const s of orphanSigns) {
        // String tooltip content is set as innerHTML — escape the address.
        L.marker([Number(s.lat), Number(s.lng)], { icon: signIcon(s.status, -1), keyboard: false, zIndexOffset: 500 })
          .bindTooltip(esc(`${SIGN_LABEL[s.kind] || s.kind} · ${s.status}${s.address ? ` · ${s.address}` : ''}`))
          .addTo(layers.signs);
      }
    }
  }, [visible, orphanSigns, filter]);

  // Highlight the selected pin without rebuilding every marker.
  useEffect(() => {
    const paint = (key, on) => {
      const marker = key ? markersRef.current.get(key) : null;
      if (!marker) return;
      marker.getElement()?.querySelector('.map-pin')?.classList.toggle('map-pin--selected', on);
      marker.setZIndexOffset(on ? 1000 : 0);
    };
    paint(prevSelectedRef.current, false);
    paint(selectedKey, true);
    prevSelectedRef.current = selectedKey;
  }, [selectedKey, visible]);

  const naming = mode === 'draw' && draft.naming;
  const turfSheetOpen = Boolean(selectedTurf && !mode && !pickerOpen && !addAt && !selectedDoor);
  const hasSheet = Boolean(pickerOpen || addAt || naming || (selectedDoor && !mode) || turfSheetOpen);
  const showEmpty = doorsQ.data && doors.length === 0 && !hasSheet && !mode;

  // First data: fit the deep-linked turf, else center on the deep-linked
  // door, else fit every door.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fittedRef.current) return;
    if (turfParam && turfsQ.isPending) return; // wait to learn the turf's shape
    if (selectedTurf && validRing(selectedTurf.polygon)) {
      fittedRef.current = true;
      focusedTurfRef.current = turfParam;
      fitTurf(map, selectedTurf.polygon, pageRef.current);
      return;
    }
    if (!doorsQ.data) return;
    fittedRef.current = true;
    if (selectedDoor) {
      map.setView([selectedDoor.lat, selectedDoor.lng], 17, { animate: false });
      revealLatLng(map, L.latLng(selectedDoor.lat, selectedDoor.lng), pageRef.current);
      centeredOnRef.current = personParam;
    } else if (doors.length) {
      map.fitBounds(L.latLngBounds(doors.map((d) => [d.lat, d.lng])).pad(0.15), { maxZoom: 16, animate: false });
    }
  }, [doorsQ.data, doors, selectedDoor, personParam, turfParam, turfsQ.isPending, selectedTurf]);

  // A new selection that is off-screen or under the drawer → bring it into view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedDoor || centeredOnRef.current === personParam) return;
    centeredOnRef.current = personParam;
    revealLatLng(map, L.latLng(selectedDoor.lat, selectedDoor.lng), pageRef.current);
  }, [personParam, selectedDoor]);

  // A turf selected from outside (a link, a new turf elsewhere) → fit it.
  // Tapped turfs set focusedTurfRef first, so the map holds still for them.
  useEffect(() => {
    if (!turfParam) { focusedTurfRef.current = null; return; }
    const map = mapRef.current;
    if (!map || !fittedRef.current || !selectedTurf || focusedTurfRef.current === turfParam) return;
    focusedTurfRef.current = turfParam;
    if (validRing(selectedTurf.polygon)) fitTurf(map, selectedTurf.polygon, pageRef.current);
  }, [turfParam, selectedTurf]);

  // Naming a new turf: if the sheet covers part of the shape, slide it into
  // view (never zooming in past where they drew it).
  useEffect(() => {
    const map = mapRef.current;
    if (!naming || !map || draft.points.length < 3) return;
    fitTurf(map, draft.points, pageRef.current, { onlyIfHidden: true, maxZoom: map.getZoom() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naming]);

  // Opening a turf's sheet: refresh its counts (doors knocked from the door
  // card or another phone since the list loaded).
  useEffect(() => {
    if (!turfParam) return;
    const state = queryClient.getQueryState(['turfs']);
    if (state?.dataUpdatedAt && Date.now() - state.dataUpdatedAt > 5000) {
      queryClient.invalidateQueries({ queryKey: ['turfs'] });
    }
  }, [turfParam, queryClient]);

  const drawCount = draft.points.length;
  const pageCls = ['map-page', hasSheet && 'has-sheet', mode && 'is-moded', mode === 'draw' && 'is-drawing'].filter(Boolean).join(' ');

  return (
    <div className={pageCls} ref={pageRef}>
      <div className="map-canvas" ref={canvasRef} role="application" aria-label="Canvass map" />

      <div className="map-top">
        {mode === 'draw' ? (
          naming ? null : (
            <div className="map-mode map-mode--draw">
              <span role="status">
                {drawCount === 0
                  ? 'Tap the map to drop the first corner of the turf'
                  : drawCount < 3
                    ? <>Keep tapping corners — <strong>{plural(drawCount, 'point', 'points')}</strong> so far</>
                    : <><strong>{plural(drawCount, 'point', 'points')}</strong> — tap Finish (or the first point) to close it</>}
              </span>
              <span className="map-mode__btns">
                <button type="button" className="btn" onClick={undoPoint} disabled={!drawCount}>Undo point</button>
                <button type="button" className="btn map-mode__go" onClick={finishDraw} disabled={drawCount < 3}>Finish</button>
                <button type="button" className="btn" onClick={cancelMode}>Cancel</button>
              </span>
            </div>
          )
        ) : mode === 'place' && placing ? (
          <div className="map-mode" role="status">
            <span>
              Tap where <strong>{placing.name}</strong> lives
              {placing.address ? ` — ${placing.unit ? `${placing.unit} – ` : ''}${placing.address}` : ''}
            </span>
            <button type="button" className="btn" onClick={cancelMode}>Cancel</button>
          </div>
        ) : mode === 'add' ? (
          <div className="map-mode" role="status">
            <span>Tap the map where the new door is</span>
            <button type="button" className="btn" onClick={cancelMode}>Cancel</button>
          </div>
        ) : missingPerson ? (
          <div className="map-mode" role="status">
            <span><strong>{missingPerson.name}</strong> isn't on the map yet</span>
            <span className="map-mode__btns">
              <button type="button" className="btn" onClick={() => { startPlacing(missingPerson); select(null); }}>Place</button>
              <button type="button" className="btn" onClick={() => select(null)}>Dismiss</button>
            </span>
          </div>
        ) : missingGone ? (
          <div className="map-mode" role="status">
            <span>That person isn't in this workspace (or was removed)</span>
            <button type="button" className="btn" onClick={() => select(null)}>Dismiss</button>
          </div>
        ) : turfMissing ? (
          <div className="map-mode" role="status">
            <span>
              {canCreate ? 'That turf was deleted or the link is wrong' : 'That turf isn’t assigned to you — ask your organizer'}
            </span>
            <button type="button" className="btn" onClick={() => select(null)}>Dismiss</button>
          </div>
        ) : (
          <>
            <div className="map-filters" role="group" aria-label="Map filters">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={`map-fchip${filter === f.key ? ' is-on' : ''}`}
                  data-band={f.key}
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
              <button
                type="button"
                className={`map-fchip map-fchip--toggle${showTurfs ? ' is-on' : ''}`}
                data-band="turfs"
                aria-pressed={showTurfs}
                title={showTurfs ? 'Hide turf outlines' : 'Show turf outlines'}
                onClick={() => setTurfsShown(!showTurfs)}
              >
                Turfs{turfs.length ? ` · ${turfs.length}` : ''}
              </button>
            </div>
            <div className="map-meta">
              <span className="map-pill" aria-live="polite">
                {doorsQ.isPending
                  ? (doorsQ.fetchStatus === 'paused' ? 'Offline — doors load with signal' : 'Loading doors…')
                  : `${plural(visible.length, 'door', 'doors')} · ${plural(visiblePeople, 'person', 'people')}`}
              </span>
              {turfs.length > 0 && (
                <Link className="map-pill map-pill--action" to={!canCreate && turfs.length === 1 ? `/turfs/${turfs[0].id}` : '/turfs'}>
                  {canCreate ? 'Walk lists' : turfs.length === 1 ? 'My walk list' : 'My walk lists'}
                </Link>
              )}
              {canCreate && (
                <button type="button" className="map-pill map-pill--action" onClick={startDraw}>
                  <TurfGlyph /> Draw turf
                </button>
              )}
              {unlocated > 0 && (
                <span className="map-pill map-pill--warn">
                  {plural(unlocated, 'person', 'people')} not on the map yet
                  <span className="map-pill__btns">
                    <button type="button" className="btn btn-primary map-pill__btn" onClick={() => { setPickerOpen(true); setAddAt(null); cancelMode(); }}>
                      Place
                    </button>
                    {canCreate && <GeocodeButton compact onDone={onGeocoded} />}
                  </span>
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="map-fabs">
        {canCreate && mode !== 'draw' && (
          <button
            type="button"
            className={`map-fab${mode === 'add' ? ' is-on' : ''}`}
            title="Add a door (or long-press the map)"
            aria-label="Add a door"
            aria-pressed={mode === 'add'}
            onClick={toggleAdd}
          >
            +
          </button>
        )}
        <button type="button" className="map-fab" title="Locate me" aria-label="Locate me" onClick={locateMe} disabled={locating}>
          <LocateGlyph />
        </button>
      </div>

      {doorsQ.isError ? (
        <p className="error map-error">{doorsQ.error.message}</p>
      ) : turfsQ.isError && !turfsQ.data ? (
        <p className="error map-error">Turfs didn’t load — {turfsQ.error.message}</p>
      ) : null}
      {showEmpty && (
        <div className="card map-empty">
          <span className="eyebrow">Nothing on the map yet</span>
          <p>
            {unlocated > 0
              ? `${plural(unlocated, 'person has', 'people have')} an address but no pin — tap Place to drop them.`
              : canCreate
                ? 'Tap + (or long-press the map) to add the first door.'
                : 'Doors appear here once staff add people with an address.'}
          </p>
        </div>
      )}

      {pickerOpen && <PlacePicker unlocated={unlocated} onPick={startPlacing} onClose={() => setPickerOpen(false)} />}

      {addAt && !pickerOpen && (
        <div className="map-sheet">
          <AddDoorForm
            latlng={addAt}
            toast={toast}
            onCancel={() => setAddAt(null)}
            onDone={(id) => { setAddAt(null); centeredOnRef.current = id; select(id); }}
          />
        </div>
      )}

      {selectedDoor && !pickerOpen && !addAt && !mode && (
        <div className="map-sheet">
          <DoorCard
            key={selectedDoor.key}
            door={selectedDoor}
            selectedId={personParam}
            onSelect={select}
            onClose={() => select(null)}
            toast={toast}
            me={me}
            canCreate={canCreate}
          />
        </div>
      )}

      {naming && (
        <div className="map-sheet">
          <NameTurfForm
            points={draft.points}
            doors={doors}
            busy={turfBusy}
            error={turfError}
            onSave={saveTurf}
            onBack={backToDrawing}
            onCancel={cancelMode}
          />
        </div>
      )}

      {turfSheetOpen && (
        <TurfSheet
          key={selectedTurf.id}
          turf={selectedTurf}
          me={me}
          desk={canCreate}
          toast={toast}
          onClose={() => select(null)}
          onDeleted={(t) => { select(null); toast(`Deleted ${t.name}`); }}
        />
      )}

      {toastMsg && <div className="toast map-toast" role="status">{toastMsg}</div>}
    </div>
  );
}
