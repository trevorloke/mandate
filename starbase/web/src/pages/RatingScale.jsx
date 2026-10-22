// Rating scale (managers): the campaign's words on the doorstep buttons and
// its "Voting for?" list. The four steps stay 1 · 2 · 3 · 4 — only their
// words change. Candidates: rename in place, ↑ ↓ to reorder, + Add, and
// "Take off" (asks in place: "Take Locke off the list? Yes · No"); someone
// off the list sits under "Off the list" with how many people they have and
// "Put back". "Not sure" always stays last. Nothing changes until the one
// yellow Save; the buttons under "What volunteers see" are the real ones,
// drawn from what's on screen. Codes never show: the server makes them
// (shared/scale.js) and they never change meaning.
// Reached from the account menu (managers), beside Team.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Navigate, useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LIMITS, UNSURE_WORD, cleanWord, makeCode, normalizeScale } from '@starbase/shared/scale';
import { apiGet, action } from '../api.js';
import RatingButtons from '../components/RatingButtons.jsx';
import { SCALE_KEY } from '../components/scale.js';
import { NeedsSignal, NoSignal, noSignal, useOnline } from '../components/NoSignal.jsx';
import './people.css';
import './scale.css';

export default function RatingScale() {
  const { me } = useOutletContext();
  if (me?.role !== 'manager') return <Navigate to="/" replace />;
  return <Editor />;
}

// The scale → what the screen edits: the four words and one list (on the
// list first, in order; then those off it). New rows have no code yet.
let seq = 0;
const draftOf = (scale) => ({
  words: Object.fromEntries(scale.steps.map((s) => [s.code, s.word])),
  list: [...scale.candidates.filter((c) => !c.off), ...scale.candidates.filter((c) => c.off)]
    .map((c) => ({ key: c.code, code: c.code, name: c.name, off: c.off })),
});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lower = (s) => cleanWord(s).toLowerCase();

const Num = ({ code, band }) => <span className="sc-num rb-chip" data-band={band} aria-hidden="true">{code}</span>;

function Editor() {
  const qc = useQueryClient();
  // Fresh from the server every time the screen opens.
  const q = useQuery({ queryKey: SCALE_KEY, queryFn: () => apiGet('/scale'), staleTime: 0 });
  // How many people have each rating (Today's numbers): said for those off the list.
  const brief = useQuery({ queryKey: ['brief'], queryFn: () => apiGet('/brief') });
  const saved = useMemo(() => (q.data?.scale ? normalizeScale(q.data.scale) : null), [q.data]);
  const [draft, setDraft] = useState(null);
  const [base, setBase] = useState(null);
  const [confirm, setConfirm] = useState(null); // key of the row asking "Take … off the list?"
  const [adding, setAdding] = useState('');
  const [addError, setAddError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(null);
  const [error, setError] = useState(null);
  const addId = useId();
  const yesRef = useRef(null);
  const online = useOnline();
  useEffect(() => {
    if (saved && !draft) { const d = draftOf(saved); setDraft(d); setBase(d); }
  }, [saved, draft]);
  useEffect(() => { if (confirm) yesRef.current?.focus(); }, [confirm]);

  // The buttons as volunteers will see them: the words and the list on screen.
  const preview = useMemo(() => {
    if (!draft) return null;
    const taken = draft.list.filter((c) => c.code).map((c) => c.code);
    return normalizeScale({
      words: Object.fromEntries(Object.entries(draft.words).map(([k, w]) => [k, cleanWord(w) || saved?.steps.find((s) => s.code === k)?.word])),
      candidates: draft.list.filter((c) => cleanWord(c.name)).map((c) => {
        const code = c.code || makeCode(c.name, taken);
        taken.push(code);
        return { code, name: c.name, off: c.off };
      }),
    });
  }, [draft, saved]);

  if (noSignal(q)) {
    return <div className="sc-page"><h1>Rating scale</h1><NoSignal /></div>;
  }
  if (!draft) return q.isError ? <p className="error">{q.error.message}</p> : <p className="muted">Loading…</p>;

  const counts = brief.data?.ratings || {};
  const on = draft.list.filter((c) => !c.off);
  const offList = draft.list.filter((c) => c.off);
  const changed = !same(draft, base);
  const edit = (fn) => { setDraft((d) => fn(d)); setSaid(null); setError(null); };
  const setWord = (code, w) => edit((d) => ({ ...d, words: { ...d.words, [code]: w } }));
  const setName = (key, name) => edit((d) => ({ ...d, list: d.list.map((c) => (c.key === key ? { ...c, name } : c)) }));
  const setOff = (key, off) => {
    setConfirm(null);
    // Off the list goes to the end; put back, to the end of the list.
    edit((d) => {
      const row = { ...d.list.find((c) => c.key === key), off };
      const rest = d.list.filter((c) => c.key !== key);
      const ons = rest.filter((c) => !c.off);
      const offs = rest.filter((c) => c.off);
      return { ...d, list: off ? [...ons, ...offs, row] : [...ons, row, ...offs] };
    });
  };
  const move = (key, by) => edit((d) => {
    const ons = d.list.filter((c) => !c.off);
    const i = ons.findIndex((c) => c.key === key);
    const j = i + by;
    if (i < 0 || j < 0 || j >= ons.length) return d;
    [ons[i], ons[j]] = [ons[j], ons[i]];
    return { ...d, list: [...ons, ...d.list.filter((c) => c.off)] };
  });
  const add = (e) => {
    e.preventDefault();
    const name = cleanWord(adding);
    if (!name) return;
    const k = name.toLowerCase();
    const old = offList.find((c) => lower(c.name) === k);
    if (old) { setAddError(`${old.name} is off the list — Put back below`); return; }
    if (on.some((c) => lower(c.name) === k)) { setAddError(`${name} is already on the list`); return; }
    if (Object.values(draft.words).some((w) => lower(w) === k) || k === UNSURE_WORD.toLowerCase()) { setAddError(`“${name}” is already on the buttons`); return; }
    seq += 1;
    edit((d) => ({ ...d, list: [...d.list.filter((c) => !c.off), { key: `new-${seq}`, code: null, name, off: false }, ...d.list.filter((c) => c.off)] }));
    setAdding('');
    setAddError(null);
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await action('scale.save', {
        words: Object.fromEntries(Object.entries(draft.words).map(([k, w]) => [k, cleanWord(w)])),
        candidates: draft.list.map((c) => ({ code: c.code || undefined, name: cleanWord(c.name), off: c.off })),
      });
      qc.setQueryData(SCALE_KEY, { scale: r.scale });
      // The signed-in copy carries the scale too (kept for an offline start).
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['brief'] });
      const d = draftOf(normalizeScale(r.scale));
      setDraft(d);
      setBase(d);
      setSaid('Saved');
    } catch (err) {
      const m = String(err.message || 'Not saved');
      setError(m.charAt(0).toUpperCase() + m.slice(1));
    } finally {
      setBusy(false);
    }
  };
  const full = on.length >= LIMITS.offered;

  return (
    <div className="sc-page">
      <h1>Rating scale</h1>

      <section className="sc-sec" aria-labelledby="sc-words">
        <h2 id="sc-words" className="eyebrow sc-h">Words on the buttons</h2>
        <ul className="sc-list">
          {saved.steps.map((s) => (
            <li key={s.code} className="sc-row">
              <Num code={s.code} band={s.band} />
              <input className="input sc-input" value={draft.words[s.code]} maxLength={LIMITS.word}
                aria-label={`Words for ${s.code}`} onChange={(e) => setWord(s.code, e.target.value)} />
            </li>
          ))}
        </ul>
      </section>

      <section className="sc-sec" aria-labelledby="sc-who">
        <h2 id="sc-who" className="eyebrow sc-h">Voting for? <span className="sc-count">{on.length}</span></h2>
        <ul className="sc-list">
          {on.map((c, i) => (
            <li key={c.key} className="sc-row sc-cand">
              {confirm === c.key ? (
                <div className="sc-confirm" role="group" aria-label={`Take ${c.name} off the list`}>
                  <span>Take {cleanWord(c.name) || 'them'} off the list?</span>
                  <button type="button" ref={yesRef} className="btn pp-btn sc-danger" onClick={() => setOff(c.key, true)}>Yes</button>
                  <button type="button" className="btn btn-quiet pp-btn" onClick={() => setConfirm(null)}>No</button>
                </div>
              ) : (
                <>
                  <input className="input sc-input" value={c.name} maxLength={LIMITS.name}
                    aria-label={`Candidate ${i + 1}`} onChange={(e) => setName(c.key, e.target.value)} />
                  <button type="button" className="btn btn-quiet pp-btn sc-move" aria-label={`Move ${c.name} up`}
                    disabled={i === 0} onClick={() => move(c.key, -1)}>↑</button>
                  <button type="button" className="btn btn-quiet pp-btn sc-move" aria-label={`Move ${c.name} down`}
                    disabled={i === on.length - 1} onClick={() => move(c.key, 1)}>↓</button>
                  {c.code
                    ? <button type="button" className="btn btn-quiet pp-btn" onClick={() => setConfirm(c.key)}>Take off</button>
                    : <button type="button" className="btn btn-quiet pp-btn" onClick={() => edit((d) => ({ ...d, list: d.list.filter((x) => x.key !== c.key) }))}>Remove</button>}
                </>
              )}
            </li>
          ))}
          <li className="sc-row sc-fixed"><span className="sc-fixed__name">{UNSURE_WORD}</span><span className="muted sc-fixed__note">Always last</span></li>
        </ul>
        <form className="sc-add" onSubmit={add}>
          <label htmlFor={addId} className="pp-sr">New candidate</label>
          <input id={addId} className="input sc-input" value={adding} maxLength={LIMITS.name} disabled={full}
            placeholder={full ? `${LIMITS.offered} at most` : 'Add a candidate'}
            onChange={(e) => { setAdding(e.target.value); setAddError(null); }} />
          <button type="submit" className="btn pp-btn" disabled={full || !cleanWord(adding)}>Add</button>
        </form>
        {addError && <p className="error" role="alert">{addError}</p>}
      </section>

      {offList.length > 0 && (
        <section className="sc-sec" aria-labelledby="sc-off">
          <h2 id="sc-off" className="eyebrow sc-h">Off the list <span className="sc-count">{offList.length}</span></h2>
          <p className="sc-line">Their old ratings stay; volunteers can’t pick them.</p>
          <ul className="sc-list">
            {offList.map((c) => (
              <li key={c.key} className="sc-row sc-gone">
                <span className="sc-gone__name">{c.name}</span>
                <span className="muted mono sc-gone__n">{Number(counts[c.code]) || 0} rated</span>
                <button type="button" className="btn btn-quiet pp-btn" onClick={() => setOff(c.key, false)}>Put back</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="sc-sec sc-preview" aria-labelledby="sc-see">
        <h2 id="sc-see" className="eyebrow sc-h">What volunteers see</h2>
        <RatingButtons key={JSON.stringify(preview)} scale={preview} askFirst onPick={() => {}} />
      </section>

      <div className="sc-save">
        <button type="button" className="btn btn-primary pp-btn" disabled={busy || !changed || !online} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {!online ? (changed && <NeedsSignal className="sc-line" />)
          : said && !changed ? <span className="sc-line" role="status">✓ {said}</span>
            : changed && !busy && <span className="sc-line">Not saved yet</span>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
