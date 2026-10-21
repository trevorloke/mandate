// Filings — deadline list with days-left badges, add form (?new=1),
// one-click "Mark filed".
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, action, fmtDate, todayISO, daysUntil } from '../api.js';

function DueBadge({ filing }) {
  if (filing.status === 'filed') return <span className="chip chip-ok">filed</span>;
  const n = daysUntil(filing.due_date);
  if (n < 0) return <span className="chip chip-danger">{-n}d overdue</span>;
  if (n === 0) return <span className="chip chip-warn">due today</span>;
  return <span className="chip">{n}d left</span>;
}

function AddFilingForm({ onDone, onClose }) {
  const [form, setForm] = useState({ name: '', due_date: todayISO(), status: 'upcoming', note: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await action('filing.create', {
        name: form.name.trim(),
        due_date: form.due_date,
        status: form.status,
        note: form.note.trim() || undefined,
      });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <span className="eyebrow">Add filing</span>
      <div className="form-row">
        <div className="field">
          <label htmlFor="nf-name">Filing</label>
          <input id="nf-name" className="input" required autoFocus placeholder="Financing report…"
            value={form.name} onChange={set('name')} />
        </div>
        <div className="field">
          <label htmlFor="nf-due">Due date</label>
          <input id="nf-due" className="input mono" type="date" required
            value={form.due_date} onChange={set('due_date')} />
        </div>
        <div className="field">
          <label htmlFor="nf-status">Status</label>
          <select id="nf-status" className="input" value={form.status} onChange={set('status')}>
            <option value="upcoming">upcoming</option>
            <option value="filed">filed</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="nf-note">Note</label>
        <input id="nf-note" className="input" value={form.note} onChange={set('note')} />
      </div>
      {error && <p className="error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy}>Save filing</button>{' '}
      <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
    </form>
  );
}

export default function Filings() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const showNew = params.get('new') === '1';
  const [error, setError] = useState(null);

  const filings = useInfiniteQuery({
    queryKey: ['records', 'filing'],
    queryFn: ({ pageParam }) =>
      apiGet(`/records/filing?limit=50${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: null,
    getNextPageParam: (last) => last.next,
  });
  const rows = (filings.data?.pages ?? []).flatMap((p) => p.records);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['records', 'filing'] });
    queryClient.invalidateQueries({ queryKey: ['brief'] });
  };

  const markFiled = async (id) => {
    setError(null);
    try {
      await action('filing.update', { id, status: 'filed' });
      invalidate();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>Filings</h1>
        {!showNew && (
          <button type="button" className="btn btn-primary" onClick={() => setParams({ new: '1' })}>
            Add filing
          </button>
        )}
      </div>

      {showNew && <AddFilingForm onDone={() => { setParams({}); invalidate(); }} onClose={() => setParams({})} />}

      {error && <p className="error">{error}</p>}
      {filings.isError && <p className="error">{filings.error.message}</p>}

      <table className="table">
        <thead>
          <tr><th>Filing</th><th>Due</th><th>Status</th><th>Note</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.id}>
              <td>{f.name}</td>
              <td className="mono">{fmtDate(f.due_date)}</td>
              <td><DueBadge filing={f} /></td>
              <td className="muted">{f.note || ''}</td>
              <td>
                {f.status === 'upcoming' && (
                  <button type="button" className="btn" onClick={() => markFiled(f.id)}>Mark filed</button>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && !filings.isLoading && (
            <tr><td colSpan={5} className="muted">No filings tracked yet.</td></tr>
          )}
        </tbody>
      </table>

      {filings.hasNextPage && (
        <p>
          <button type="button" className="btn" disabled={filings.isFetchingNextPage}
            onClick={() => filings.fetchNextPage()}>
            {filings.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </p>
      )}
    </>
  );
}
