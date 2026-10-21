// Money — what came in, and what needs the desk.
//   Top: one big "Raised this year" number, then "Needs you": pledges from the
//   donate page to mark received (→ a gift, cap-checked) or cancel, and gifts
//   flagged over the contribution limit.
//   One yellow "Log a gift" (?new=1; ?person=<id> preselects the donor):
//   donor, amount, date — method, cadence and note under "More details".
//   Type-ahead donor picker (never type IDs); a compliance banner on a cap crossing.
//   The ledger: rows of donor, amount, date (+ monthly / flagged chips). Tap a
//   row for method, note, the donor's profile and Void (optimistic, 7s Undo).
//   Under "More": the donate page link and paid & closed pledges.
//   Dollars on screen, integer cents on the wire; cursor-paginated load more.
import { useEffect, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import {
  useInfiniteQuery, useQuery, useQueryClient, keepPreviousData,
} from '@tanstack/react-query';
import { apiGet, action, fmtMoney, fmtDate, todayISO, dollarsToCents } from '../api.js';
import './shifts.css';

// gift.log / gift.void / gift.restore and GET /records/* are desk-only
// (server: MONEY_ROLES; volunteers get 403 on both reads and writes).
const MONEY_ROLES = ['manager', 'treasurer', 'staff'];
// Registry: gift.method / gift.cadence select options.
const METHODS = ['card', 'etransfer', 'cheque', 'cash', 'in-kind'];
const CADENCES = [
  { code: 'one-time', label: 'One-time' },
  { code: 'monthly', label: 'Monthly' },
];
// The ledger opens on the latest few; the rest is one tap ("All gifts").
const LATEST = 3;

// "$3,325" for the big number; rows keep the cents.
const fmtBig = (cents) => fmtMoney(cents).replace(/\.00$/, '');
// "Aug 2" (this year) or "Aug 2, 2025"
const shortDate = (value) => {
  const [y, m, d] = fmtDate(value).split('-').map(Number);
  if (!y || !m || !d) return fmtDate(value);
  const date = new Date(y, m - 1, d);
  const opts = { month: 'short', day: 'numeric' };
  if (y !== new Date().getFullYear()) opts.year = 'numeric';
  return date.toLocaleDateString('en-CA', opts);
};
const localDay = (ts) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? fmtDate(ts) : shortDate(d.toLocaleDateString('en-CA'));
};

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
      <div className="ops-picked">
        <span className="chip ops-chip-lg">{value.name}</span>
        <button type="button" className="btn btn-quiet ops-tap" onClick={() => onChange(null)}>Change</button>
      </div>
    );
  }

  return (
    <div className="picker ops-picker" ref={boxRef}>
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
                ? <>+ Add new person “{item.name}”</>
                : <>{item.name}{item.email && <span className="meta">{item.email}</span>}</>}
            </li>
          ))}
        </ul>
      )}
      {createError && <p className="error">{createError}</p>}
    </div>
  );
}

// ── Log a gift: donor, amount, date — the rest under "More details" ──
function GiftForm({ presetPersonId, onSaved, onClose }) {
  const [donor, setDonor] = useState(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState('');
  const [cadence, setCadence] = useState('one-time');
  const [note, setNote] = useState('');
  const [more, setMore] = useState(false);
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
    if (!donor) { setError('Pick a donor first'); return; }
    if (cents === null) { setError('Enter dollars, like 50 or 49.99'); return; }
    // amount_cents is z.number().int().nonnegative(); a $0 gift is never intended.
    if (cents === 0) { setError('The amount must be more than $0'); return; }
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
    <form className="card ops-form" onSubmit={submit} aria-label="Log a gift">
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
      </div>

      <button type="button" className="ops-more" aria-expanded={more} aria-controls="gift-more"
        onClick={() => setMore((v) => !v)}>
        More details
      </button>
      {more && (
        <div id="gift-more" className="ops-more-body">
          <div className="form-row">
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
        </div>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      <div className="ops-actions">
        <button type="submit" className="btn btn-primary ops-tap" disabled={busy}>{busy ? 'Saving…' : 'Save gift'}</button>
        <button type="button" className="btn btn-quiet ops-tap" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

// ── Pledges: online donations waiting on the desk ──
// The donate page (/d/:slug) records a pledge; it becomes a gift when Stripe
// confirms payment, or when the treasurer marks it received here (e-transfer,
// cheque…). Receiving runs the same cap check as a desk gift.
const OPEN_PLEDGE = new Set(['pledged', 'pending']);
const PLEDGE_STATUS = {
  pledged:   { label: 'pledged', cls: 'chip chip-warn', title: 'Waiting for the donor to send it' },
  pending:   { label: 'card pending', cls: 'chip chip-warn', title: 'Started card checkout; Stripe has not confirmed payment' },
  paid:      { label: 'paid by card', cls: 'chip chip-ok', title: 'Stripe confirmed payment' },
  received:  { label: 'received', cls: 'chip chip-ok', title: 'Marked received at the desk' },
  cancelled: { label: 'cancelled', cls: 'chip ops-chip-muted', title: 'Cancelled — no gift recorded' },
};
const PledgeStatus = ({ status }) => {
  const s = PLEDGE_STATUS[status] || { label: status, cls: 'chip' };
  return <span className={s.cls} title={s.title}>{s.label}</span>;
};
// A plain fact, so a quiet outline chip — yellow is kept for problems.
const MonthlyChip = () => <span className="chip">monthly</span>;

function PledgeRow({ p, onReceived, onChanged }) {
  const [mode, setMode] = useState(null); // null | 'receive' | 'cancel'
  const [method, setMethod] = useState('etransfer');
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const open = OPEN_PLEDGE.has(p.status);

  const receive = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await action('pledge.receive', { id: p.id, method, date });
      onReceived(res, p);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const cancel = async () => {
    setError(null);
    setBusy(true);
    try {
      await action('pledge.cancel', { id: p.id });
      onChanged(`Cancelled ${p.name}’s ${fmtMoney(p.amount_cents)} pledge`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const back = () => { setMode(null); setError(null); };
  const idp = `pl-${p.id.slice(0, 8)}`;
  return (
    <li className="ops-item">
      <div className="ops-row ops-row--static">
        <span className="ops-row__main">
          <span className="ops-row__name">{p.person_id ? <Link to={`/people/${p.person_id}`}>{p.name}</Link> : p.name}</span>
          <span className="ops-row__sub">
            {localDay(p.created_at)}
            {p.cadence === 'monthly' && <MonthlyChip />}
            {p.status !== 'pledged' && <PledgeStatus status={p.status} />}
          </span>
        </span>
        <span className="ops-row__end"><span className="ops-row__amt">{fmtMoney(p.amount_cents)}</span></span>
      </div>

      {open && mode === null && (
        <div className="ops-pledge-acts">
          <button type="button" className="btn ops-tap" onClick={() => setMode('receive')}>Received</button>
          <button type="button" className="btn btn-quiet ops-tap" onClick={() => setMode('cancel')}>Cancel</button>
        </div>
      )}

      {open && mode === 'receive' && (
        <form className="ops-body" onSubmit={receive} aria-label={`Mark ${p.name}’s pledge received`}>
          {p.status === 'pending' && <p className="ops-meta">Card checkout started — only if paid another way.</p>}
          {p.cadence === 'monthly' && <p className="ops-meta">Records this month’s gift only.</p>}
          <div className="form-row">
            <div className="field">
              <label htmlFor={`${idp}-method`}>Paid by</label>
              <select id={`${idp}-method`} className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${idp}-date`}>Date received</label>
              <input id={`${idp}-date`} className="input mono" type="date" required value={date}
                max={todayISO()} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="ops-actions">
            <button type="submit" className="btn ops-solid ops-tap" disabled={busy || !date}>
              {busy ? 'Saving…' : `Record ${fmtMoney(p.amount_cents)}`}
            </button>
            <button type="button" className="btn btn-quiet ops-tap" disabled={busy} onClick={back}>Back</button>
          </div>
        </form>
      )}

      {open && mode === 'cancel' && (
        <div className="ops-body">
          <div className="ops-confirm" role="group" aria-label="Confirm cancel">
            <span>Cancel this pledge?</span>
            <button type="button" className="btn ops-danger ops-tap" disabled={busy} onClick={cancel}>
              {busy ? 'Cancelling…' : 'Yes'}
            </button>
            <button type="button" className="btn btn-quiet ops-tap" disabled={busy} onClick={back}>No</button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      )}
    </li>
  );
}

// ── A gift over the limit (from the brief); tap for the reason ──
function FlaggedRow({ f, personId }) {
  const [open, setOpen] = useState(false);
  const bodyId = `fl-${f.id}`;
  return (
    <li className="ops-item">
      <button type="button" className="ops-row" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
        <span className="ops-row__main">
          <span className="ops-row__name">{f.donor}</span>
          <span className="ops-row__sub">{shortDate(f.date)}<span className="chip chip-warn">over limit</span></span>
        </span>
        <span className="ops-row__end"><span className="ops-row__amt">{fmtMoney(f.amount_cents)}</span></span>
      </button>
      {open && (
        <div className="ops-body" id={bodyId}>
          {f.flag_reason && <p>{f.flag_reason}</p>}
          {personId && (
            <div className="ops-actions">
              <Link className="btn btn-quiet ops-tap ops-link" to={`/people/${personId}`}>Donor</Link>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ── One ledger row; tap for method, note, donor and Void ──
function GiftRow({ g, open, onToggle, onVoid }) {
  const bodyId = `gift-${g.id}`;
  return (
    <li className="ops-item" data-open={open ? '' : undefined}>
      <button type="button" className="ops-row" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <span className="ops-row__main">
          <span className="ops-row__name">{g.person_name ?? '…'}</span>
          <span className="ops-row__sub">
            {shortDate(g.date)}
            {g.cadence === 'monthly' && <MonthlyChip />}
            {g.flagged && <span className="chip chip-warn" title={g.flag_reason || ''}>flagged</span>}
          </span>
        </span>
        <span className="ops-row__end"><span className="ops-row__amt">{fmtMoney(g.amount_cents)}</span></span>
      </button>
      {open && (
        <div className="ops-body" id={bodyId}>
          {(g.method || g.note) && (
            <p className="ops-chips">
              {g.method && <span className="chip">{g.method}</span>}
              {g.note && <span className="ops-meta">{g.note}</span>}
            </p>
          )}
          {g.flagged && g.flag_reason && <p className="ops-meta">{g.flag_reason}</p>}
          <div className="ops-actions">
            <Link className="btn btn-quiet ops-tap ops-link" to={`/people/${g.person_id}`}>Donor</Link>
            <button type="button" className="btn btn-quiet ops-tap" onClick={onVoid}>Void</button>
          </div>
        </div>
      )}
    </li>
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
  const [openId, setOpenId] = useState(null);
  const [pledgeNote, setPledgeNote] = useState(null);
  const [more, setMore] = useState(false);
  const [allGifts, setAllGifts] = useState(false);
  const toastTimer = useRef(null);

  const gifts = useInfiniteQuery({
    queryKey: ['records', 'gift'],
    queryFn: ({ pageParam }) =>
      apiGet(`/records/gift?limit=50${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: null,
    getNextPageParam: (last) => last?.next ?? undefined,
    enabled: canMoney,
  });
  const pledges = useQuery({ queryKey: ['pledges'], queryFn: () => apiGet('/pledges'), enabled: canMoney });
  const brief = useQuery({ queryKey: ['brief'], queryFn: () => apiGet('/brief'), enabled: canMoney });

  // Newest gift date first (the ledger itself pages in entry order).
  const rows = (gifts.data?.pages ?? []).flatMap((p) => p?.records ?? []).filter((g) => !voided.has(g.id))
    .sort((a, b) => fmtDate(b.date).localeCompare(fmtDate(a.date)));
  const allPledges = pledges.data?.pledges ?? [];
  const openPledges = allPledges.filter((p) => OPEN_PLEDGE.has(p.status));
  const closedPledges = allPledges.filter((p) => !OPEN_PLEDGE.has(p.status));
  const flagged = (brief.data?.flagged ?? []).filter((f) => !voided.has(f.id));
  // The latest few skip gifts already listed under "Needs you"; "All gifts" shows every one.
  const flaggedIds = new Set(flagged.map((f) => f.id));
  const latest = rows.filter((g) => !flaggedIds.has(g.id)).slice(0, LATEST);
  const personOf = Object.fromEntries(rows.map((g) => [g.id, g.person_id]));
  const slug = pledges.data?.slug;

  // The big number: this calendar year from the ledger once it's all loaded;
  // until then (or past one page) the brief's running total.
  const year = String(new Date().getFullYear());
  const allLoaded = gifts.isSuccess && !gifts.hasNextPage;
  let raised = null;
  if (allLoaded) {
    raised = {
      label: 'Raised this year',
      cents: rows.filter((g) => fmtDate(g.date).startsWith(year)).reduce((n, g) => n + (Number(g.amount_cents) || 0), 0),
    };
  } else if (brief.data?.money) {
    raised = { label: 'Raised so far', cents: brief.data.money.totalCents };
  }
  const weekCents = brief.data?.money?.weekCents ?? 0;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['records', 'gift'] });
    queryClient.invalidateQueries({ queryKey: ['brief'] });
    queryClient.invalidateQueries({ queryKey: ['person'] });
  };
  const refreshPledges = () => {
    queryClient.invalidateQueries({ queryKey: ['pledges'] });
    invalidate();
  };

  const onSaved = (res) => {
    setBanner(res.compliance?.over ? res.gift.flag_reason : null);
    setParams({});
    invalidate();
  };

  const onReceived = (res, p) => {
    const g = res.gift || {};
    setPledgeNote(`Recorded ${fmtMoney(g.amount_cents ?? p.amount_cents)} from ${p.name}${g.flagged ? ' — flagged' : ''}`);
    setBanner(res.compliance?.over ? g.flag_reason : null);
    refreshPledges();
  };
  const onPledgeChanged = (text) => {
    setPledgeNote(text);
    refreshPledges();
  };

  const voidGift = async (id) => {
    setError(null);
    setOpenId(null);
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
      <div className="ops-page">
        <div className="ops-head"><h1>Money</h1></div>
        <p className="ops-empty">Handed a donation? Tell the campaign desk.</p>
      </div>
    );
  }

  const needs = openPledges.length + flagged.length;

  return (
    <div className="ops-page">
      <div className="ops-head">
        <h1>Money</h1>
        <div className="ops-head__actions">
          <Link className="btn btn-quiet ops-tap" to="/filings">Filings</Link>
          {!showNew && (
            <button type="button" className="btn btn-primary ops-tap" onClick={() => setParams({ new: '1' })}>
              Log a gift
            </button>
          )}
        </div>
      </div>

      {banner && (
        <div className="banner" role="status">
          <span><strong>Over the limit.</strong> {banner}</span>
          <button type="button" className="btn btn-quiet ops-tap" onClick={() => setBanner(null)}>Dismiss</button>
        </div>
      )}

      {showNew && (
        <GiftForm presetPersonId={presetPersonId} onSaved={onSaved} onClose={() => setParams({})} />
      )}

      <div className="ops-hero">
        <span className="eyebrow">{raised?.label ?? 'Raised'}</span>
        <span className="n">{raised ? fmtBig(raised.cents) : '—'}</span>
        {weekCents > 0 && <span className="sub">+{fmtBig(weekCents)} this week</span>}
      </div>

      {pledgeNote && <p className="ops-done" role="status">✓ {pledgeNote}</p>}
      {pledges.isError && <p className="error">{pledges.error.message}</p>}
      {needs > 0 && (
        <section className="ops-needs" aria-labelledby="needs-head">
          <span className="eyebrow" id="needs-head">Needs you · {needs}</span>
          <ul className="ops-rows">
            {openPledges.map((p) => (
              <PledgeRow key={p.id} p={p} onReceived={onReceived} onChanged={onPledgeChanged} />
            ))}
            {flagged.map((f) => <FlaggedRow key={f.id} f={f} personId={personOf[f.id]} />)}
          </ul>
        </section>
      )}

      <span className="eyebrow ops-label">Gifts</span>
      {error && <p className="error">{error}</p>}
      {gifts.isError && <p className="error">{gifts.error.message}</p>}
      {rows.length === 0 && gifts.isSuccess && <p className="ops-empty">No gifts yet.</p>}
      {rows.length > 0 && (
        <ul className="ops-rows" id="gift-list">
          {(allGifts ? rows : latest).map((g) => (
            <GiftRow
              key={g.id}
              g={g}
              open={openId === g.id}
              onToggle={() => setOpenId((cur) => (cur === g.id ? null : g.id))}
              onVoid={() => voidGift(g.id)}
            />
          ))}
        </ul>
      )}
      {(rows.length > latest.length || gifts.hasNextPage) && (
        <button type="button" className="ops-more" aria-expanded={allGifts} aria-controls="gift-list"
          onClick={() => setAllGifts((v) => !v)}>
          All gifts · {gifts.hasNextPage ? `${rows.length}+` : rows.length}
        </button>
      )}
      {allGifts && gifts.hasNextPage && (
        <div className="ops-actions">
          <button type="button" className="btn ops-tap" disabled={gifts.isFetchingNextPage}
            onClick={() => gifts.fetchNextPage()}>
            {gifts.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      <div className="ops-foot">
        <button type="button" className="ops-more" aria-expanded={more} aria-controls="money-more"
          onClick={() => setMore((v) => !v)}>
          More
        </button>
        {more && (
          <div id="money-more" className="ops-more-body">
            <p>
              Donate page{slug ? <>: <a className="mono" href={`/d/${slug}`} target="_blank" rel="noopener noreferrer">/d/{slug}</a></> : null}
              {' · '}<Link to="/outreach/website">Set up</Link>
            </p>
            {closedPledges.length > 0 && (
              <>
                <span className="eyebrow ops-label">Paid &amp; closed pledges · {closedPledges.length}</span>
                <ul className="ops-rows">
                  {closedPledges.map((p) => (
                    <PledgeRow key={p.id} p={p} onReceived={onReceived} onChanged={onPledgeChanged} />
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div className="toast ops-toast" role="status">
          <span>Gift voided</span>
          <button type="button" className="btn ops-tap" onClick={undoVoid}>Undo</button>
        </div>
      )}
    </div>
  );
}
