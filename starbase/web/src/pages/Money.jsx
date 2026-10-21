// Money — the gift ledger. Type-ahead donor picker (never type IDs),
// dollars in / cents on the wire, compliance banner on cap crossings,
// optimistic void with a 7s UNDO toast, cursor-paginated load more.
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  useInfiniteQuery, useQuery, useQueries, useQueryClient, keepPreviousData,
} from '@tanstack/react-query';
import { apiGet, action, fmtMoney, fmtDate, todayISO, dollarsToCents } from '../api.js';

const METHODS = ['card', 'etransfer', 'cheque', 'cash', 'in-kind'];

// ── Donor picker: type-ahead against /api/persons?q=, arrow keys, inline create ──
function DonorPicker({ value, onChange }) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
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
    if (!item) return;
    if (item.id === '__create__') {
      const res = await action('person.create', { name: item.name });
      queryClient.invalidateQueries({ queryKey: ['persons'] });
      queryClient.invalidateQueries({ queryKey: ['brief'] });
      onChange(res.person);
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
    </div>
  );
}

// ── Log-a-gift form ──
function GiftForm({ presetPersonId, onSaved, onClose }) {
  const [donor, setDonor] = useState(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState('');
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
    setBusy(true);
    try {
      const res = await action('gift.log', {
        person_id: donor.id,
        amount_cents: cents,
        date,
        method: method || undefined,
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
      </div>
      <div className="field">
        <label htmlFor="gift-note">Note</label>
        <input id="gift-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
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
  const [params, setParams] = useSearchParams();
  const showNew = params.get('new') === '1';
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
    getNextPageParam: (last) => last.next,
  });

  const rows = (gifts.data?.pages ?? []).flatMap((p) => p.records).filter((g) => !voided.has(g.id));

  // Donor names: lazy per-person profile fetch, cached by react-query.
  const personIds = [...new Set(rows.map((g) => g.person_id))];
  const donorQueries = useQueries({
    queries: personIds.map((id) => ({
      queryKey: ['person', id],
      queryFn: () => apiGet(`/persons/${id}`),
      staleTime: 5 * 60_000,
    })),
  });
  const donorName = Object.fromEntries(
    personIds.map((id, i) => [id, donorQueries[i].data?.person?.name]),
  );

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
      queryClient.invalidateQueries({ queryKey: ['brief'] });
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

  return (
    <>
      <div className="page-head">
        <h1>Money</h1>
        {!showNew && (
          <button type="button" className="btn btn-primary" onClick={() => setParams({ new: '1' })}>
            Log a gift
          </button>
        )}
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
          <tr><th>Date</th><th>Donor</th><th className="num">Amount</th><th>Method</th><th></th><th></th></tr>
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
              <td>{g.flagged && <span className="chip chip-warn" title={g.flag_reason || ''}>flagged</span>}</td>
              <td>
                <button type="button" className="btn btn-quiet" onClick={() => voidGift(g.id)}>Void</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && !gifts.isLoading && (
            <tr><td colSpan={6} className="muted">No gifts yet — press “n” anywhere to log one.</td></tr>
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
