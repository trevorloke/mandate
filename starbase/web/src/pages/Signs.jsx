// Signs — every sign request, from lawn sign to billboard. Three counters,
// filter chips (kind + status, kept in the URL), an inline-editable table,
// and ?new=1 opens 'Place a sign' (at a supporter's address, or any address).
// ?new=1&person=<id> preselects the supporter.
import { useEffect, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SIGN_KINDS, SIGN_STATUSES } from '@starbase/shared/canvass';
import { apiGet, action } from '../api.js';
import { PersonPicker } from './Shifts.jsx';
import './shifts.css';

const kindLabel = (code) => SIGN_KINDS.find((k) => k.code === code)?.label ?? code;
// GET /api/persons/:id 500s on a malformed uuid, so ?person=junk is ignored.
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const STATUS_TONE = { requested: 'warn', installed: 'ok', removed: 'muted' };

const invalidateSigns = (queryClient, personId) => {
  for (const key of ['signs', 'brief', 'doors']) queryClient.invalidateQueries({ queryKey: [key] });
  if (personId) queryClient.invalidateQueries({ queryKey: ['person', personId] });
};

// ── Note cell: edit in place, saves on blur / Enter ──
function NoteCell({ sign, onSave }) {
  const [value, setValue] = useState(sign.note ?? '');
  const [state, setState] = useState(null); // null | 'saving' | 'saved'
  useEffect(() => { setValue(sign.note ?? ''); }, [sign.note]);

  const save = async () => {
    if (value === (sign.note ?? '')) return;
    setState('saving');
    const ok = await onSave(value);
    setState(ok ? 'saved' : null);
    if (!ok) setValue(sign.note ?? '');
  };

  return (
    <span className="ops-note">
      <input
        className="input ops-note-input"
        aria-label={`Note for the sign at ${sign.address || sign.person_name || 'this location'}`}
        placeholder="add a note"
        value={value}
        onChange={(e) => { setValue(e.target.value); setState(null); }}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
      />
      {state === 'saved' && <span className="ok-text mono" aria-live="polite">✓</span>}
    </span>
  );
}

// ── Place a sign ──
function PlaceSignForm({ presetPersonId, canCreatePerson, onSaved, onClose }) {
  const [kind, setKind] = useState('lawn');
  const [mode, setMode] = useState('person'); // 'person' | 'address'
  const [person, setPerson] = useState(null);
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState('requested');
  const [note, setNote] = useState('');
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
    if (mode === 'person' && !person) { setError('pick the supporter hosting the sign'); return; }
    if (mode === 'address' && !addr) { setError('enter the address for the sign'); return; }
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
    <form className="card" onSubmit={submit}>
      <span className="eyebrow">Place a sign</span>

      <div className="field">
        <label id="sign-kind-label">Kind</label>
        <div className="ops-seg" role="group" aria-labelledby="sign-kind-label">
          {SIGN_KINDS.map((k) => (
            <button key={k.code} type="button" aria-pressed={kind === k.code} onClick={() => setKind(k.code)}>
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label id="sign-where-label">Where</label>
        <div className="ops-seg" role="group" aria-labelledby="sign-where-label">
          <button type="button" aria-pressed={mode === 'person'} onClick={() => setMode('person')}>At a supporter’s</button>
          <button type="button" aria-pressed={mode === 'address'} onClick={() => setMode('address')}>At an address</button>
        </div>
      </div>

      {mode === 'person' && (
        <div className="field">
          <label htmlFor="sign-person">Supporter</label>
          {person ? (
            <div className="ops-picked">
              <span className="chip">{person.name}</span>
              <span className="ops-meta">{person.address || 'no address on file'}</span>
              <button type="button" className="btn btn-quiet ops-tap" onClick={() => setPerson(null)}>Change</button>
            </div>
          ) : (
            <PersonPicker
              id="sign-person"
              placeholder="Type a name or address…"
              meta={(p) => p.address || 'no address on file'}
              allowCreate={canCreatePerson}
              onPick={(p) => setPerson(p)}
            />
          )}
        </div>
      )}

      {(mode === 'address' || person) && (
        <div className="field">
          <label htmlFor="sign-address">
            {mode === 'address' ? 'Address' : 'Different address? (optional)'}
          </label>
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
            <span className="ops-meta">No address on file — add one so the install crew can find it.</span>
          )}
        </div>
      )}

      <div className="form-row">
        <div className="field">
          <label htmlFor="sign-status">Status</label>
          <select id="sign-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {SIGN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field" style={{ flexGrow: 3 }}>
          <label htmlFor="sign-note">Note</label>
          <input id="sign-note" className="input" placeholder="Corner lot, facing the road"
            value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      <div className="ops-actions">
        <button type="submit" className="btn btn-primary ops-tap" disabled={busy}>{busy ? 'Saving…' : 'Place sign'}</button>
        <button type="button" className="btn btn-quiet ops-tap" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

// ── The screen ──
export default function Signs() {
  const queryClient = useQueryClient();
  const { me } = useOutletContext() ?? {};
  // Signs are open to every role, but person.create is desk-only (403 for volunteers).
  const canCreatePerson = me?.role !== 'volunteer';
  const [params, setParams] = useSearchParams();
  const showNew = params.get('new') === '1';
  const presetPersonId = params.get('person');
  const kindFilter = params.get('kind');
  const statusFilter = params.get('status');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const signsQ = useQuery({ queryKey: ['signs'], queryFn: () => apiGet('/signs') });
  const all = signsQ.data?.signs ?? [];

  const byStatus = Object.fromEntries(SIGN_STATUSES.map((s) => [s, 0]));
  const byKind = Object.fromEntries(SIGN_KINDS.map((k) => [k.code, 0]));
  for (const s of all) {
    byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
    byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;
  }
  const rows = all.filter((s) => (!kindFilter || s.kind === kindFilter) && (!statusFilter || s.status === statusFilter));

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
    setNotice(`${kindLabel(sign.kind)} ${sign.status}${sign.address ? ` — ${sign.address}` : ''}`);
    closeForm();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Field</span>
          <h1>Signs</h1>
        </div>
        {!showNew && (
          <button type="button" className="btn btn-primary ops-tap" onClick={openForm}>Place a sign</button>
        )}
      </div>

      <div className="ops-counters">
        {SIGN_STATUSES.map((s) => (
          <div key={s} className="ops-counter" data-status={s}>
            <span className="n">{byStatus[s] ?? 0}</span>
            <span className="eyebrow">{s}</span>
          </div>
        ))}
      </div>

      {notice && <p className="ok-text mono" role="status">✓ {notice}</p>}

      {showNew && (
        <PlaceSignForm
          key={presetPersonId || 'new'}
          presetPersonId={presetPersonId}
          canCreatePerson={canCreatePerson}
          onSaved={onSaved}
          onClose={closeForm}
        />
      )}

      <div className="ops-filters">
        <div className="ops-filter-group" role="group" aria-label="Filter by kind">
          <span className="eyebrow">Kind</span>
          <button type="button" className="ops-chip-btn" aria-pressed={!kindFilter} onClick={() => setFilter('kind', null)}>
            All
          </button>
          {SIGN_KINDS.map((k) => (
            <button key={k.code} type="button" className="ops-chip-btn" aria-pressed={kindFilter === k.code}
              onClick={() => setFilter('kind', kindFilter === k.code ? null : k.code)}>
              {k.label}<span className="n">{byKind[k.code] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="ops-filter-group" role="group" aria-label="Filter by status">
          <span className="eyebrow">Status</span>
          <button type="button" className="ops-chip-btn" aria-pressed={!statusFilter} onClick={() => setFilter('status', null)}>
            All
          </button>
          {SIGN_STATUSES.map((s) => (
            <button key={s} type="button" className="ops-chip-btn" aria-pressed={statusFilter === s}
              onClick={() => setFilter('status', statusFilter === s ? null : s)}>
              {s}<span className="n">{byStatus[s] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {signsQ.isPending && <p className="muted">Loading signs…</p>}
      {signsQ.isError && <p className="error">{signsQ.error.message}</p>}

      {signsQ.isSuccess && all.length === 0 && (
        <p className="ops-empty">No signs yet. Every supporter who says “put one on my lawn” goes here.</p>
      )}
      {signsQ.isSuccess && all.length > 0 && rows.length === 0 && (
        <p className="ops-empty">No signs match these filters.</p>
      )}

      {rows.length > 0 && (
        <table className="table ops-table">
          <thead>
            <tr>
              <th>Kind</th>
              <th>Address</th>
              <th>Supporter</th>
              <th>Status</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="name">{kindLabel(s.kind)}</td>
                <td data-label="Address" className="wrap-any">{s.address || <span className="muted">—</span>}</td>
                <td data-label="Supporter">
                  {s.person_id
                    ? <Link to={`/people/${s.person_id}`}>{s.person_name || 'View person'}</Link>
                    : <span className="muted">—</span>}
                </td>
                <td data-label="Status">
                  <select
                    className="ops-status"
                    data-tone={STATUS_TONE[s.status]}
                    aria-label={`Status for the sign at ${s.address || s.person_name || 'this location'}`}
                    value={s.status}
                    disabled={busyId === s.id}
                    onChange={(e) => update(s, { status: e.target.value })}
                  >
                    {SIGN_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                  </select>
                </td>
                <td data-label="Note">
                  <NoteCell sign={s} onSave={(note) => update(s, { note })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
