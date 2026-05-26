import React, { useMemo, useState } from 'react';
import './conductor.css';
import { modByKey, useNav2 } from './shell';
import { CONDUCTOR } from './data';
import { useLiveRecords, invalidateLive } from './auth/useLiveRecords';
import { api } from './auth/api';

// Mandate 2.0 — Conductor drawer

const WINDOWS = ['NOW', 'TODAY', 'WEEK'];
const NEXT_WINDOW = { NOW: 'TODAY', TODAY: 'WEEK', WEEK: null };
const FALLBACK_MOD = { k: 'general', n: 'General', tag: 'GEN', ac: 'var(--text-3)' };

const Conductor = ({ open, onClose }) => {
  const { go } = useNav2();
  const { records: asks } = useLiveRecords('conductor', 'ask', CONDUCTOR);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const byWindow = useMemo(() => {
    const o = {};
    WINDOWS.forEach(w => o[w] = asks.filter(c => c.window === w));
    return o;
  }, [asks]);

  const refresh = () => invalidateLive('conductor', 'ask');

  const complete = async (c) => {
    if (busy || !c._dbId) return;
    setBusy(true);
    try { await api.deleteData('conductor', 'ask', c._dbId); refresh(); }
    finally { setBusy(false); }
  };

  const defer = async (c) => {
    if (busy || !c._dbId) return;
    setBusy(true);
    try {
      const next = NEXT_WINDOW[c.window];
      if (next == null) {
        await api.deleteData('conductor', 'ask', c._dbId);
      } else {
        const { _dbId, ...data } = c;
        await api.updateData('conductor', 'ask', _dbId, { ...data, window: next });
      }
      refresh();
    } finally { setBusy(false); }
  };

  const submit = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await api.createData('conductor', 'ask', {
        id: 'c-' + Date.now(),
        window: 'NOW',
        mod: 'opposition',
        ask: text,
        body: 'Added from Conductor input.',
        action: 'Review',
      });
      setDraft('');
      refresh();
    } finally { setBusy(false); }
  };

  const total = asks.length;

  return (
    <>
      <div className={'conductor__scrim' + (open ? ' is-open' : '')} onClick={onClose} />
      <aside className={'conductor' + (open ? ' is-open' : '')}>
        <header className="conductor__hd">
          <div className="conductor__title">
            <span className="conductor__mark">M</span>
            <span>Conductor</span>
          </div>
          <button className="conductor__close" onClick={onClose}>✕</button>
          <p className="conductor__dek">
            {total === 0
              ? 'All clear — no asks in the queue. Add one below, or seed your workspace to see what cross-module asks look like.'
              : (<><b>NOW · {byWindow.NOW.length} {byWindow.NOW.length === 1 ? 'ASK' : 'ASKS'}</b> — asks that cross modules land here. You approve; the play runs.</>)}
          </p>
        </header>

        <div className="conductor__body">
          {WINDOWS.map(w => (
            byWindow[w].length > 0 && (
              <React.Fragment key={w}>
                <div className="conductor__window">
                  <span className="conductor__window-label">{w}</span>
                  <span className="conductor__window-meta">{byWindow[w].length} {byWindow[w].length === 1 ? 'ask' : 'asks'}</span>
                </div>
                {byWindow[w].map(c => {
                  const m = modByKey(c.mod) || FALLBACK_MOD;
                  return (
                    <div key={c._dbId || c.id} className="conductor__ask" style={{ '--mod-c': m.ac }}>
                      <div className="conductor__ask-icon">
                        <span className="conductor__ask-dot" />
                        <span className="conductor__ask-tag">{m.tag}</span>
                      </div>
                      <div>
                        <div className="conductor__ask-head">{c.ask}</div>
                        <div className="conductor__ask-body">{c.body}</div>
                        <div className="conductor__ask-actions">
                          <button className="conductor__ask-btn" disabled={busy} onClick={() => complete(c)}>{c.action}</button>
                          <button className="conductor__ask-btn conductor__ask-btn--ghost" onClick={() => { go(c.mod); onClose && onClose(); }}>Open {m.n}</button>
                          <button className="conductor__ask-btn conductor__ask-btn--ghost" disabled={busy} onClick={() => defer(c)}>Defer</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            )
          ))}

          <div className="conductor__input">
            <span className="conductor__input-ey">Ask the Conductor</span>
            <div className="conductor__input-row">
              <textarea
                className="conductor__input-ta"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); } }}
                placeholder="Ask Conductor anything — or paste a brief and it'll route the work."
                disabled={busy}
              />
              <button className="conductor__input-send" disabled={busy || !draft.trim()} onClick={submit}>Send</button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export { Conductor };
