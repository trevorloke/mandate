import React, { useMemo } from 'react';
import './conductor.css';
import { MOD2, modByKey, useNav2 } from './shell';
import { CONDUCTOR, WORKSPACE } from './data';

// Mandate 2.0 — Conductor drawer

const Conductor = ({ open, onClose }) => {
  const { go } = useNav2();
  const windows = ['NOW','TODAY','WEEK'];
  const byWindow = useMemo(() => {
    const o = {};
    windows.forEach(w => o[w] = CONDUCTOR.filter(c => c.window === w));
    return o;
  }, []);

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
            <b>NOW · {byWindow.NOW.length} ASKS</b> — Vance quote counter, Bill 14 attendance, Cheung call.
            Asks that cross modules land here. You approve; the Conductor runs the play.
          </p>
        </header>

        <div className="conductor__body">
          {windows.map(w => (
            byWindow[w].length > 0 && (
              <React.Fragment key={w}>
                <div className="conductor__window">
                  <span className="conductor__window-label">{w}</span>
                  <span className="conductor__window-meta">{byWindow[w].length} {byWindow[w].length===1 ? 'ask' : 'asks'}</span>
                </div>
                {byWindow[w].map(c => {
                  const m = modByKey(c.mod);
                  return (
                    <div key={c.id} className="conductor__ask" style={{ '--mod-c': m.ac }}>
                      <div className="conductor__ask-icon">
                        <span className="conductor__ask-dot" />
                        <span className="conductor__ask-tag">{m.tag}</span>
                      </div>
                      <div>
                        <div className="conductor__ask-head">{c.ask}</div>
                        <div className="conductor__ask-body">{c.body}</div>
                        <div className="conductor__ask-actions">
                          <button className="conductor__ask-btn">{c.action}</button>
                          <button className="conductor__ask-btn conductor__ask-btn--ghost" onClick={() => go(c.mod)}>Open {m.n}</button>
                          <button className="conductor__ask-btn conductor__ask-btn--ghost">Defer</button>
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
                placeholder="What&rsquo;s the fastest way to hit shift fill for Metrotown? Or: draft a reply to Vance&rsquo;s housing quote in our voice."
              />
              <button className="conductor__input-send">Send</button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export { Conductor };