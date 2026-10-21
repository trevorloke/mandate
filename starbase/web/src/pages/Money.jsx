// Money — the gift ledger. Type-ahead donor picker (never type IDs),
// dollars in / cents on the wire, compliance banner on cap crossings,
// optimistic void with a 7s UNDO toast, cursor-paginated load more.
import { useEffect, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import {
  useInfiniteQuery, useQuery, useQueryClient, keepPreviousData,
} from '@tanstack/react-query';
import { apiGet, action, fmtMoney, fmtDate, todayISO, dollarsToCents } from '../api.js';
import './people.css';

// gift.log / gift.void / gift.restore and GET /records/* are desk-only
// (server: MONEY_ROLES; volunteers get 403 on both reads and writes).
const MONEY_ROLES = ['manager', 'treasurer', 'staff'];
// Registry: gift.method / gift.cadence select options.
const METHODS = ['card', 'etransfer', 'cheque', 'cash', 'in-kind'];
const CADENCES = [
  { code: 'one-time', label: 'One-time' },
  { code: 'monthly', label: 'Monthly' },
];

// ── Donor picker: type-ahead against /api/persons?q=, arrow keys, inline create ──
function DonorPicker({ value, onChange }) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [createError, setCreateError] = useState(null);
  const [creating, setCreating] = useState(false);
  const boxRef = useRef(null);

  const search = useQuery({
    queryKey: ['persons', 'search', q],
    queryFn: () => apiGet(`/persons?q=${encodeURIComponent(q)}&limit=8`),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const matches = search.data?.persons ?? [];
  const trimmed = q.trim();
  const canCreate = trimmed.length > 0
    && !matches.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  const items = canCreate
    ? [...matches, { id: '__create__', name: trimmed }]
    : matches;

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(items.length - 1, 0)));
  }, [items.length]);

  useEffect(() => {
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const choose = async (item) => {
    if (!item || creating) return;
    setCreateError(null);
    if (item.id === '__create__') {
      setCreating(true);
      try {
        const res = await action('person.create', { name: item.name.slice(0, 300) });
        queryClient.invalidateQueries({ queryKey: ['persons'] });
        queryClient.invalidateQueries({ queryKey: ['brief'] });
        onChange(res.person);
      } catch (e) {
        setCreateError(e.message); // keep the typed name so they can retry
        return;
      } finally {
        setCreating(false);
      }
    } else {
      onChange(item);
    }
    setQ('');
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { if (open && items.length) { e.preventDefault(); choose(items[active]); } }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  if (value) {
    return (
      <div>
        <span className="chip">{value.name}</span>{' '}
        <button type="button" className="btn btn-quiet" onClick={() => onChange(null)}>Change donor</button>
      </div>
    );
  }

  return (
    <div className="picker" ref={boxRef}>
      <input
        id="gift-donor"
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls="donor-options"
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Start typing a name…"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && items.length > 0 && (
        <ul className="picker-list" id="donor-options" role="listbox">
          {items.map((item, i) => (
            <li
              key={item.id}
              role="option"
              aria-selected={i === active}
              className={(i === active ? 'active ' : '') + (item.id === '__create__' ? 'create' : '')}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(item); }}
            >
              {item.id === '__create__'
                ? <>+ Create new person “{item.name}”</>
                : <>{item.name}{item.email && <span className="meta">{item.email}</span>}</>}
            </li>
          ))}
        </ul>
      )}
      {createError && <p className="error">{createError}</p>}
    </div>
  );
}

// ── Log-a-gift form ──
function GiftForm({ presetPersonId, onSaved, onClose }) {
  const [donor, setDonor] = useState(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState('');
  const [cadence, setCadence] = useState('one-time');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const preset = useQuery({
    queryKey: ['person', presetPersonId],
    queryFn: () => apiGet(`/persons/${presetPersonId}`),
    enabled: !!presetPersonId,
  });
  useEffect(() => {
    if (preset.data?.person) setDonor((d) => d ?? preset.data.person);
  }, [preset.data]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const cents = dollarsToCents(amount);
    if (!donor) { setError('pick a donor first'); return; }
    if (cents === null) { setError('enter an amount in dollars, like 50 or 49.99'); return; }
    // amount_cents is z.number().int().nonnegative(); a $0 gift is never intended.
    if (cents === 0) { setError('the amount must be more than $0'); return; }
    setBusy(true);
    try {
      const res = await action('gift.log', {
        person_id: donor.id,
        amount_cents: cents,
        date,
        method: method || undefined,
        cadence,
        note: note.trim() || undefined,
      });
      onSaved(res);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <span className="eyebrow">Log a gift</span>
      <div className="field">
        <label htmlFor="gift-donor">Donor</label>
        <DonorPicker value={donor} onChange={setDonor} />
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="gift-amount">Amount ($)</label>
          <input id="gift-amount" className="input mono" inputMode="decimal" required placeholder="0.00"
            value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="gift-date">Date</label>
          <input id="gift-date" className="input mono" type="date" required
            value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="gift-method">Method</label>
          <select id="gift-method" className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">—</option>
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="gift-cadence">Cadence</label>
          <select id="gift-cadence" className="input" value={cadence} onChange={(e) => setCadence(e.target.value)}>
            {CADENCES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="gift-note">Note</label>
        <input id="gift-note" className="input" maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && <p className="error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy}>Save gift</button>{' '}
      <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
    </form>
  );
}

// ── The screen ──
export default function Money() {
  const queryClient = useQueryClient();
  const { me } = useOutletContext() ?? {};
  const canMoney = MONEY_ROLES.includes(me?.role);
  const [params, setParams] = useSearchParams();
  const showNew = params.get('new') === '1' && canMoney; // the global 'n' key lands here too
  const presetPersonId = params.get('person');

  const [banner, setBanner] = useState(null);
  const [voided, setVoided] = useState(() => new Set());
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);
  const toastTimer = useRef(null);

  const gifts = useInfiniteQuery({
    queryKey: ['records', 'gift'],
    queryFn: ({ pageParam }) =>
      apiGet(`/records/gift?limit=50${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: null,
    getNextPageParam: (last) => last?.next ?? undefined,
    enabled: canMoney,
  });

  const rows = (gifts.data?.pages ?? []).flatMap((p) => p?.records ?? []).filter((g) => !voided.has(g.id));

  // Donor names arrive joined on each ledger row (person_name).
  const donorName = Object.fromEntries(rows.map((g) => [g.person_id, g.person_name]));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['records', 'gift'] });
    queryClient.invalidateQueries({ queryKey: ['brief'] });
    queryClient.invalidateQueries({ queryKey: ['person'] });
  };

  const onSaved = (res) => {
    setBanner(res.compliance?.over ? res.gift.flag_reason : null);
    setParams({});
    invalidate();
  };

  const voidGift = async (id) => {
    setError(null);
    setVoided((s) => new Set(s).add(id)); // optimistic remove
    clearTimeout(toastTimer.current);
    setToast({ id });
    toastTimer.current = setTimeout(() => setToast(null), 7000);
    try {
      await action('gift.void', { id });
      // The donor's profile shows gifts, yearly totals and the donor tier.
      queryClient.invalidateQueries({ queryKey: ['brief'] });
      queryClient.invalidateQueries({ queryKey: ['person'] });
    } catch (e) {
      setVoided((s) => { const n = new Set(s); n.delete(id); return n; });
      setToast(null);
      setError(e.message);
    }
  };

  const undoVoid = async () => {
    const { id } = toast;
    clearTimeout(toastTimer.current);
    setToast(null);
    try {
      await action('gift.restore', { id });
      setVoided((s) => { const n = new Set(s); n.delete(id); return n; });
      invalidate();
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  if (!canMoney) {
    return (
      <>
        <div className="page-head"><h1>Money</h1></div>
        <p className="muted">
          Gifts and contribution limits are handled by the campaign desk (manager, treasurer, staff).
          If someone hands you a donation, note it on their profile and let the desk know.
        </p>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1>Money</h1>
        <div className="head-actions">
          <Link className="btn btn-quiet" to="/filings">Filings →</Link>
          {!showNew && (
            <button type="button" className="btn btn-primary" onClick={() => setParams({ new: '1' })}>
              Log a gift
            </button>
          )}
        </div>
      </div>

      {banner && (
        <div className="banner" role="status">
          <span><strong>Over the contribution limit.</strong> {banner}</span>
          <button type="button" className="btn btn-quiet" onClick={() => setBanner(null)}>Dismiss</button>
        </div>
      )}

      {showNew && (
        <GiftForm presetPersonId={presetPersonId} onSaved={onSaved} onClose={() => setParams({})} />
      )}

      {error && <p className="error">{error}</p>}
      {gifts.isError && <p className="error">{gifts.error.message}</p>}

      <table className="table">
        <thead>
          <tr><th>Date</th><th>Donor</th><th className="num">Amount</th><th>Method</th><th>Cadence</th><th></th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.id}>
              <td className="mono">{fmtDate(g.date)}</td>
              <td>
                <Link to={`/people/${g.person_id}`}>{donorName[g.person_id] ?? '…'}</Link>
              </td>
              <td className="num">{fmtMoney(g.amount_cents)}</td>
              <td>{g.method ? <span className="chip">{g.method}</span> : <span className="muted">—</span>}</td>
              <td>
                {g.cadence === 'monthly'
                  ? <span className="chip chip-mark">monthly</span>
                  : <span className="chip chip-ghost">one-time</span>}
              </td>
              <td>{g.flagged && <span className="chip chip-warn" title={g.flag_reason || ''}>flagged</span>}</td>
              <td>
                <button type="button" className="btn btn-quiet" onClick={() => voidGift(g.id)}>Void</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && !gifts.isLoading && (
            <tr><td colSpan={7} className="muted">No gifts yet — press “n” anywhere to log one.</td></tr>
          )}
        </tbody>
      </table>

      {gifts.hasNextPage && (
        <p>
          <button type="button" className="btn" disabled={gifts.isFetchingNextPage}
            onClick={() => gifts.fetchNextPage()}>
            {gifts.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </p>
      )}

      {toast && (
        <div className="toast" role="status">
          <span>Gift voided</span>
          <button type="button" className="btn" onClick={undoVoid}>Undo</button>
        </div>
      )}
    </>
  );
}
