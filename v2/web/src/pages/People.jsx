// People — live search over /api/persons, inline add form (?new=1).
import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { apiGet, action } from '../api.js';

function AddPersonForm({ onClose }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', kind: 'person', email: '', phone: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await action('person.create', {
        name: form.name.trim(),
        kind: form.kind,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['persons'] });
      queryClient.invalidateQueries({ queryKey: ['brief'] });
      navigate(`/people/${res.person.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <span className="eyebrow">Add person</span>
      <div className="form-row">
        <div className="field">
          <label htmlFor="np-name">Name (required)</label>
          <input id="np-name" className="input" required autoFocus value={form.name} onChange={set('name')} />
        </div>
        <div className="field">
          <label htmlFor="np-kind">Kind</label>
          <select id="np-kind" className="input" value={form.kind} onChange={set('kind')}>
            <option value="person">Person</option>
            <option value="org">Organization</option>
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="np-email">Email</label>
          <input id="np-email" className="input" type="email" value={form.email} onChange={set('email')} />
        </div>
        <div className="field">
          <label htmlFor="np-phone">Phone</label>
          <input id="np-phone" className="input" value={form.phone} onChange={set('phone')} />
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy}>Save person</button>{' '}
      <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
    </form>
  );
}

export default function People() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const showNew = params.get('new') === '1';
  const [q, setQ] = useState('');

  const persons = useQuery({
    queryKey: ['persons', q],
    queryFn: () => apiGet(`/persons?q=${encodeURIComponent(q)}&limit=100`),
    placeholderData: keepPreviousData,
  });
  const rows = persons.data?.persons ?? [];

  return (
    <>
      <div className="page-head">
        <h1>People</h1>
        {!showNew && (
          <button type="button" className="btn btn-primary" onClick={() => setParams({ new: '1' })}>
            Add person
          </button>
        )}
      </div>

      {showNew && <AddPersonForm onClose={() => setParams({})} />}

      <div className="field">
        <label htmlFor="people-q">Search</label>
        <input
          id="people-q" className="input" type="search" placeholder="Name or email…"
          value={q} onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {persons.isError && <p className="error">{persons.error.message}</p>}
      <table className="table">
        <thead>
          <tr><th>Name</th><th>Kind</th><th>Email</th><th>Phone</th></tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="rowlink" onClick={() => navigate(`/people/${p.id}`)}>
              <td><Link to={`/people/${p.id}`} onClick={(e) => e.stopPropagation()}>{p.name}</Link></td>
              <td><span className="chip">{p.kind}</span></td>
              <td>{p.email || <span className="muted">—</span>}</td>
              <td className="mono">{p.phone || <span className="muted">—</span>}</td>
            </tr>
          ))}
          {rows.length === 0 && !persons.isLoading && (
            <tr><td colSpan={4} className="muted">{q ? `No one matches “${q}”.` : 'No people yet.'}</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}
