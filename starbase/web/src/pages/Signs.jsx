// Signs — every sign, from lawn sign to billboard.
//   Desk: three big counters (Requested · Installed · Removed) are the status
//   filter. It opens on Requested — the to-do list — when any are waiting;
//   tap the pressed counter again for every sign (?status=all). The kind
//   toggle (Lawn / Large / Billboard) sits under "More". Both live in the URL
//   (?status=, ?kind=). Rows: address, kind chip, status chip. Tap a row for
//   the supporter, the status switch and the note.
//   Volunteers (the sign crew): "Signs to put up" — only the requested signs,
//   one "Put up ✓" per row (toast + Undo). "Add a sign" and the full desk list
//   (?all=1) sit under "More".
//   ?new=1 opens "Add sign" (at a supporter's address, or any address);
//   ?new=1&person=<id> preselects the supporter. Status and note sit under
//   "More details".
import { useEffect, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SIGN_KINDS, SIGN_STATUSES } from '@starbase/shared/canvass';
import { apiGet, action } from '../api.js';
import { PersonPicker } from './Shifts.jsx';
import './shifts.css';

const kindLabel = (code) => SIGN_KINDS.find((k) => k.code === code)?.label ?? code;
// Most common first: lawn signs, then large, then billboards.
const KIND_ORDER = ['lawn', 'large', 'billboard'];
const KINDS = [...SIGN_KINDS].sort((a, b) => KIND_ORDER.indexOf(a.code) - KIND_ORDER.indexOf(b.code));
// One word per kind for chips and the toggle; the full label stays in the form.
const KIND_SHORT = { lawn: 'Lawn', large: 'Large', billboard: 'Billboard' };
const kindShort = (code) => KIND_SHORT[code] ?? kindLabel(code);
const STATUS_LABEL = { requested: 'Requested', installed: 'Installed', removed: 'Removed' };
const statusLabel = (s) => STATUS_LABEL[s] ?? s;
// Requested is amber outline, never the yellow of the one primary button.
const STATUS_CHIP = { requested: 'ops-chip-amber', installed: 'chip-ok', removed: 'ops-chip-muted' };
// GET /api/persons/:id 500s on a malformed uuid, so ?person=junk is ignored.
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const where = (s) => s.address || s.person_name || 'this location';

const invalidateSigns = (queryClient, personId) => {
  for (const key of ['signs', 'brief', 'doors']) queryClient.invalidateQueries({ queryKey: [key] });
  if (personId) queryClient.invalidateQueries({ queryKey: ['person', personId] });
};

// ── Note: edit in place, saves on blur / Enter ──
function NoteField({ sign, onSave }) {
  const [value, setValue] = useState(sign.note ?? '');
  const [state, setState] = useState(null); // null | 'saving' | 'saved'
  useEffect(() => { setValue(sign.note ?? ''); }, [sign.note]);
  const id = `sign-note-${sign.id}`;

  const save = async () => {
    if (value === (sign.note ?? '')) return;
    setState('saving');
    const ok = await onSave(value);
    setState(ok ? 'saved' : null);
    if (!ok) setValue(sign.note ?? '');
  };

  return (
    <div className="field">
      <label htmlFor={id}>Note {state === 'saved' && <span className="ok-text" aria-live="polite">✓ saved</span>}</label>
      <input
        id={id}
        className="input ops-note-input"
        placeholder="Add a note"
        value={value}
        onChange={(e) => { setValue(e.target.value); setState(null); }}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
      />
    </div>
  );
}

// ── One sign: a row that opens in place ──
function SignRow({ s, open, onToggle, busy, onUpdate }) {
  const bodyId = `sign-${s.id}`;
  return (
    <li className="ops-item" data-open={open ? '' : undefined}>
      <button type="button" className="ops-row" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <span className="ops-row__main">
          <span className="ops-row__name">{s.address || s.person_name || '—'}</span>
          <span className="ops-row__sub"><span className="chip">{kindShort(s.kind)}</span></span>
        </span>
        <span className="ops-row__end">
          <span className={`chip ops-chip-lg ${STATUS_CHIP[s.status] ?? ''}`.trim()}>{statusLabel(s.status)}</span>
        </span>
      </button>
      {open && (
        <div className="ops-body" id={bodyId}>
          <p>
            {s.person_id && <><Link to={`/people/${s.person_id}`}>{s.person_name || 'Supporter'}</Link>{' · '}</>}
            <span className="ops-meta">{kindLabel(s.kind)}</span>
          </p>
          <div className="ops-seg" role="group" aria-label={`Status for the sign at ${where(s)}`}>
            {SIGN_STATUSES.map((st) => (
              <button key={st} type="button" aria-pressed={s.status === st} disabled={busy}
                onClick={() => { if (s.status !== st) onUpdate({ status: st }); }}>
                {statusLabel(st)}
              </button>
            ))}
          </div>
          <NoteField sign={s} onSave={(note) => onUpdate({ note })} />
        </div>
      )}
    </li>
  );
}

// ── Sign crew: one sign waiting to go up ──
function PutUpRow({ s, busy, onPutUp }) {
  return (
    <li className="ops-item">
      <div className="ops-row ops-row--static">
        <span className="ops-row__main">
          <span className="ops-row__name">{s.address || s.person_name || '—'}</span>
          <span className="ops-row__sub">
            <span className="chip">{kindShort(s.kind)}</span>
            {s.note && <span className="ops-row__note">{s.note}</span>}
          </span>
        </span>
        <span className="ops-row__end">
          <button type="button" className="btn ops-solid ops-tap ops-putup" disabled={busy}
            aria-label={`Put up the sign at ${where(s)}`} onClick={onPutUp}>
            Put up ✓
          </button>
        </span>
      </div>
    </li>
  );
}

// ── Add a sign ──
function PlaceSignForm({ presetPersonId, canCreatePerson, onSaved, onClose }) {
  const [kind, setKind] = useState('lawn');
  const [mode, setMode] = useState('person'); // 'person' | 'address'
  const [person, setPerson] = useState(null);
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState('requested');
  const [note, setNote] = useState('');
  const [more, setMore] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const preset = useQuery({
    queryKey: ['person', presetPersonId],
    queryFn: () => apiGet(`/persons/${presetPersonId}`),
    enabled: isUuid(presetPersonId),
  });
  useEffect(() => {
    if (preset.data?.person) setPerson((p) => p ?? preset.data.person);
  }, [preset.data]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const addr = address.trim();
    if (mode === 'person' && !person) { setError('Pick the supporter'); return; }
    if (mode === 'address' && !addr) { setError('Enter the address'); return; }
    setBusy(true);
    try {
      const res = await action('sign.place', {
        kind,
        status,
        person_id: mode === 'person' ? person.id : undefined,
        address: addr || undefined,
        note: note.trim() || undefined,
      });
      onSaved(res.sign, mode === 'person' ? person.id : null);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="card ops-form" onSubmit={submit} aria-label="Add sign">
      <div className="field">
        <label id="sign-kind-label">Kind</label>
        <div className="ops-seg" role="group" aria-labelledby="sign-kind-label">
          {KINDS.map((k) => (
            <button key={k.code} type="button" aria-pressed={kind === k.code} onClick={() => setKind(k.code)}>
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label id="sign-where-label">Where</label>
        <div className="ops-seg" role="group" aria-labelledby="sign-where-label">
          <button type="button" aria-pressed={mode === 'person'} onClick={() => setMode('person')}>Supporter</button>
          <button type="button" aria-pressed={mode === 'address'} onClick={() => setMode('address')}>Address</button>
        </div>
      </div>

      {mode === 'person' && (
        <div className="field">
          <label htmlFor="sign-person">Supporter</label>
          {person ? (
            <div className="ops-picked">
              <span className="chip ops-chip-lg">{person.name}</span>
              <span className="ops-meta">{person.address || 'No address on file'}</span>
              <button type="button" className="btn btn-quiet ops-tap" onClick={() => setPerson(null)}>Change</button>
            </div>
          ) : (
            <PersonPicker
              id="sign-person"
              placeholder="Supporter’s name"
              meta={(p) => p.address || 'no address'}
              allowCreate={canCreatePerson}
              onPick={(p) => setPerson(p)}
            />
          )}
        </div>
      )}

      {(mode === 'address' || person) && (
        <div className="field">
          <label htmlFor="sign-address">{mode === 'address' ? 'Address' : 'Different address?'}</label>
          <input
            id="sign-address"
            className="input"
            autoComplete="street-address"
            required={mode === 'address'}
            placeholder={mode === 'address' ? '104 Ave & King George Blvd' : person?.address || 'Street address'}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          {mode === 'person' && person && !person.address && !address.trim() && (
            <span className="ops-meta">No address on file — add one here.</span>
          )}
        </div>
      )}

      <button type="button" className="ops-more" aria-expanded={more} aria-controls="sign-more"
        onClick={() => setMore((v) => !v)}>
        More details
      </button>
      {more && (
        <div id="sign-more" className="ops-more-body">
          <div className="field">
            <label htmlFor="sign-status">Status</label>
            <select id="sign-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {SIGN_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sign-note">Note</label>
            <input id="sign-note" className="input" placeholder="Corner lot, facing the road"
              value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      <div className="ops-actions">
        <button type="submit" className="btn btn-primary ops-tap" disabled={busy}>{busy ? 'Saving…' : 'Add sign'}</button>
        <button type="button" className="btn btn-quiet ops-tap" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

// ── The screen ──
export default function Signs() {
  const queryClient = useQueryClient();
  const { me } = useOutletContext() ?? {};
  // person.create is desk-only (403 for volunteers), so they can't add a new person here.
  const canCreatePerson = me?.role !== 'volunteer';
  const [params, setParams] = useSearchParams();
  const showNew = params.get('new') === '1';
  const presetPersonId = params.get('person');
  const kindFilter = params.get('kind');
  const statusParam = params.get('status');
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  // Sign crew: "Put up" toast with Undo; More (Add a sign · All signs) folded.
  const crew = me?.role === 'volunteer' && params.get('all') !== '1';
  const [toast, setToast] = useState(null);
  const [more, setMore] = useState(false);
  // Desk: the kind toggle under "More" starts open when a kind is already set.
  const [kindsOpen, setKindsOpen] = useState(() => !!params.get('kind'));
  const toastTimer = useRef(null);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const signsQ = useQuery({ queryKey: ['signs'], queryFn: () => apiGet('/signs') });
  const all = signsQ.data?.signs ?? [];
  const ofKind = all.filter((s) => !kindFilter || s.kind === kindFilter);
  // The counters count within the chosen kind, so they always match the list.
  const byStatus = Object.fromEntries(SIGN_STATUSES.map((s) => [s, 0]));
  for (const s of ofKind) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
  // No ?status → Requested (the to-do list) when any wait, else everything.
  const statusFilter = statusParam === 'all'
    ? null
    : (SIGN_STATUSES.includes(statusParam) ? statusParam : (byStatus.requested > 0 ? 'requested' : null));
  const rows = ofKind.filter((s) => !statusFilter || s.status === statusFilter);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };
  const openForm = () => {
    const next = new URLSearchParams(params);
    next.set('new', '1');
    setParams(next);
    setNotice(null);
  };
  const closeForm = () => {
    const next = new URLSearchParams(params);
    next.delete('new');
    next.delete('person');
    setParams(next);
  };

  const patchCache = (id, patch) => queryClient.setQueryData(['signs'], (cur) => cur && ({
    ...cur,
    signs: cur.signs.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  }));

  const update = async (sign, patch) => {
    setError(null);
    setBusyId(sign.id);
    patchCache(sign.id, patch);
    try {
      await action('sign.update', { id: sign.id, ...patch });
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusyId(null);
      invalidateSigns(queryClient, sign.person_id);
    }
  };

  const onSaved = (sign, personId) => {
    invalidateSigns(queryClient, personId);
    setNotice(`${kindShort(sign.kind)} sign ${sign.status}${sign.address ? ` — ${sign.address}` : ''}`);
    closeForm();
  };

  const showToast = (t) => {
    clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), 7000);
  };
  const putUp = async (sign) => {
    setNotice(null);
    const ok = await update(sign, { status: 'installed' });
    if (ok) showToast({ sign, text: 'Sign put up ✓' });
  };
  const undoPutUp = async () => {
    const { sign } = toast;
    clearTimeout(toastTimer.current);
    setToast(null);
    await update(sign, { status: 'requested' });
  };

  if (crew) {
    const toPutUp = all.filter((s) => s.status === 'requested');
    return (
      <div className="ops-page">
        <div className="ops-head"><h1>Signs to put up</h1></div>

        {showNew && (
          <PlaceSignForm
            key={presetPersonId || 'new'}
            presetPersonId={presetPersonId}
            canCreatePerson={canCreatePerson}
            onSaved={onSaved}
            onClose={closeForm}
          />
        )}
        {notice && <p className="ops-done" role="status">✓ {notice}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {signsQ.isPending && <p className="muted">Loading…</p>}
        {signsQ.isError && <p className="error">{signsQ.error.message}</p>}
        {signsQ.isSuccess && toPutUp.length === 0 && <p className="ops-empty">Nothing to put up right now.</p>}

        {toPutUp.length > 0 && (
          <ul className="ops-rows">
            {toPutUp.map((s) => (
              <PutUpRow key={s.id} s={s} busy={busyId === s.id} onPutUp={() => putUp(s)} />
            ))}
          </ul>
        )}

        <div className="ops-foot">
          <button type="button" className="ops-more" aria-expanded={more} aria-controls="signs-more"
            onClick={() => setMore((v) => !v)}>
            More
          </button>
          {more && (
            <div id="signs-more" className="ops-more-body ops-actions">
              {!showNew && <button type="button" className="btn ops-tap" onClick={openForm}>Add a sign</button>}
              <button type="button" className="btn btn-quiet ops-tap" onClick={() => { const next = new URLSearchParams(params); next.set('all', '1'); setParams(next); }}>
                All signs · {all.length}
              </button>
            </div>
          )}
        </div>

        {toast && (
          <div className="toast ops-toast" role="status">
            <span>{toast.text}</span>
            <button type="button" className="btn ops-tap" onClick={undoPutUp}>Undo</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ops-page">
      {me?.role === 'volunteer' && (
        <Link to="/signs" className="ops-back">← Signs to put up</Link>
      )}
      <div className="ops-head">
        <h1>Signs</h1>
        {!showNew && (
          <button type="button" className="btn btn-primary ops-tap" onClick={openForm}>Add sign</button>
        )}
      </div>

      {showNew && (
        <PlaceSignForm
          key={presetPersonId || 'new'}
          presetPersonId={presetPersonId}
          canCreatePerson={canCreatePerson}
          onSaved={onSaved}
          onClose={closeForm}
        />
      )}
      {notice && <p className="ops-done" role="status">✓ {notice}</p>}

      <div className="ops-counters" role="group" aria-label="Show signs by status">
        {SIGN_STATUSES.map((s) => (
          <button key={s} type="button" className="ops-counter" data-status={s} aria-pressed={statusFilter === s}
            onClick={() => setFilter('status', statusFilter === s ? 'all' : s)}>
            <span className="n">{byStatus[s] ?? 0}</span>
            <span className="l">{statusLabel(s)}</span>
          </button>
        ))}
      </div>

      <button type="button" className="ops-more ops-more--tight" aria-expanded={kindsOpen} aria-controls="signs-kinds"
        onClick={() => setKindsOpen((v) => !v)}>
        More{kindFilter ? ` · ${kindShort(kindFilter)}` : ''}
      </button>
      {kindsOpen && (
        <div id="signs-kinds" className="ops-seg ops-filter" role="group" aria-label="Kind of sign">
          <button type="button" aria-pressed={!kindFilter} onClick={() => setFilter('kind', null)}>All</button>
          {KINDS.map((k) => (
            <button key={k.code} type="button" aria-pressed={kindFilter === k.code} title={k.label}
              onClick={() => setFilter('kind', kindFilter === k.code ? null : k.code)}>
              {kindShort(k.code)}
            </button>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {signsQ.isPending && <p className="muted">Loading…</p>}
      {signsQ.isError && <p className="error">{signsQ.error.message}</p>}

      {signsQ.isSuccess && all.length === 0 && <p className="ops-empty">No signs yet.</p>}
      {signsQ.isSuccess && all.length > 0 && rows.length === 0 && <p className="ops-empty">None here.</p>}

      {rows.length > 0 && (
        <ul className="ops-rows">
          {rows.map((s) => (
            <SignRow
              key={s.id}
              s={s}
              open={openId === s.id}
              onToggle={() => setOpenId((cur) => (cur === s.id ? null : s.id))}
              busy={busyId === s.id}
              onUpdate={(patch) => update(s, patch)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
