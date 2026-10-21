// Map — field mode. Houses as pins (one per address + unit), colored by the
// household's strongest signal; tap a pin for the door card. Place mode drops
// people who have an address but no pin, "add door" creates a person at a
// tapped spot, and ?person=<id> deep-links to (and selects) a door. Plain
// Leaflet in a ref'd div; divIcon pins so no marker-image paths are involved.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiGet, action } from '../api.js';
import { ratingByCode } from '@starbase/shared/canvass';
import DoorCard, { AddDoorForm, SIGN_LABEL, doorTitle, patchDoors } from '../components/DoorCard.jsx';
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
        {rows.length === 0 && !persons.isLoading && (
          <li className="muted map-place-empty">
            {q ? `No one unplaced matches “${q}”.` : 'Everyone with an address is already on the map.'}
          </li>
        )}
      </ul>
    </aside>
  );
}

export default function MapPage() {
  const { me } = useOutletContext();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const personParam = params.get('person');

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
  const canCreate = CREATE_ROLES.includes(me?.role);

  const [filter, setFilter] = useState('all');
  const [mode, setMode] = useState(null);       // null | 'place' | 'add'
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

  const refresh = useCallback((personId) => {
    for (const key of ['doors', 'persons', 'signs', 'brief']) queryClient.invalidateQueries({ queryKey: [key] });
    if (personId) queryClient.invalidateQueries({ queryKey: ['person', personId] });
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

  // Selection lives in the URL: /map?person=<id>. react-router's setter
  // changes identity with every search change, so keep `select` stable via a
  // ref — otherwise every tap would rebuild every marker on the map.
  useLayoutEffect(() => { setParamsRef.current = setParams; });
  const select = useCallback((personId) => {
    setParamsRef.current(personId ? { person: personId } : {}, { replace: true });
  }, []);

  const cancelMode = () => { setMode(null); setPlacing(null); };
  const toggleAdd = () => { setMode((m) => (m === 'add' ? null : 'add')); setPlacing(null); setPickerOpen(false); };
  const startPlacing = (person) => { setPlacing(person); setMode('place'); setPickerOpen(false); setAddAt(null); };

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
      if (mode === 'place' && placing) { locatePerson(placing, wrapped(latlng)); return; }
      if (mode === 'add') { setAddAt(wrapped(latlng)); setMode(null); return; }
      if (personParam) select(null); // tap on empty map closes the card
    };
    onLongPressRef.current = (latlng) => {
      if (mode === 'place' && placing) return;
      if (!canCreate) { toast('Only staff can add new people — rate, log and place pins instead'); return; }
      setAddAt(wrapped(latlng));
      setMode(null);
      setPickerOpen(false);
    };
    // Pins swallow map clicks, so place mode has to handle them too: tapping
    // an existing door drops the person in that building.
    onPinClickRef.current = (door) => {
      if (mode === 'place' && placing) { locatePerson(placing, { lat: door.lat, lng: door.lng }); return; }
      if (mode === 'add') setMode(null);
      if (selectedKeyRef.current === door.key) return;
      select(door.persons[0].id);
    };
  });

  // Escape backs out of whatever is open.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (mode) cancelMode();
      else if (pickerOpen) setPickerOpen(false);
      else if (addAt) setAddAt(null);
      else if (personParam) select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, pickerOpen, addAt, personParam, select]);

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
    const layers = { signs: L.layerGroup().addTo(map), doors: L.layerGroup().addTo(map), me: L.layerGroup().addTo(map) };
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
    };
  }, []);

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

  // First data: center on the deep-linked door, else fit every door.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !doorsQ.data || fittedRef.current) return;
    fittedRef.current = true;
    if (selectedDoor) {
      map.setView([selectedDoor.lat, selectedDoor.lng], 17, { animate: false });
      revealLatLng(map, L.latLng(selectedDoor.lat, selectedDoor.lng), pageRef.current);
      centeredOnRef.current = personParam;
    } else if (doors.length) {
      map.fitBounds(L.latLngBounds(doors.map((d) => [d.lat, d.lng])).pad(0.15), { maxZoom: 16, animate: false });
    }
  }, [doorsQ.data, doors, selectedDoor, personParam]);

  // A new selection that is off-screen or under the drawer → bring it into view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedDoor || centeredOnRef.current === personParam) return;
    centeredOnRef.current = personParam;
    revealLatLng(map, L.latLng(selectedDoor.lat, selectedDoor.lng), pageRef.current);
  }, [personParam, selectedDoor]);

  const hasSheet = Boolean(pickerOpen || addAt || (selectedDoor && !mode));
  const showEmpty = doorsQ.data && doors.length === 0 && !hasSheet && !mode;

  return (
    <div className={`map-page${hasSheet ? ' has-sheet' : ''}`} ref={pageRef}>
      <div className="map-canvas" ref={canvasRef} role="application" aria-label="Canvass map" />

      <div className="map-top">
        {mode === 'place' && placing ? (
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
        ) : (
          <>
            <div className="map-filters" role="group" aria-label="Filter pins">
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
            </div>
            <div className="map-meta">
              <span className="map-pill" aria-live="polite">
                {doorsQ.isLoading ? 'Loading doors…' : `${plural(visible.length, 'door', 'doors')} · ${plural(visiblePeople, 'person', 'people')}`}
              </span>
              {unlocated > 0 && (
                <span className="map-pill map-pill--warn">
                  {plural(unlocated, 'person', 'people')} not on the map yet
                  <button type="button" className="btn btn-primary map-pill__btn" onClick={() => { setPickerOpen(true); setAddAt(null); cancelMode(); }}>
                    Place
                  </button>
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="map-fabs">
        {canCreate && (
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

      {doorsQ.isError && <p className="error map-error">{doorsQ.error.message}</p>}
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

      {toastMsg && <div className="toast map-toast" role="status">{toastMsg}</div>}
    </div>
  );
}
