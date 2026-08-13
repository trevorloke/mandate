// ModuleGuide — a slim orientation strip rendered above every module page.
// Says in plain words what the module is, offers its first actions, and shows
// how it connects to the rest of the suite. Dismissable per module.

import { useState } from 'react';
import { MODULE_META } from './simple-map';
import { modByKey, useNav2 } from './shell';
import './ModuleGuide.css';

const storeKey = (route) => `mdt:guide:${route}`;

const readHidden = (route) => {
  try { return localStorage.getItem(storeKey(route)) === 'hidden'; }
  catch { return false; }
};

// Compact SIMPLE | FULL segmented control, shown only when App passes a mode.
function ViewSeg({ mode, onMode }) {
  return (
    <div className="mg-seg" role="group" aria-label="View mode">
      <button
        className={'mg-seg-btn' + (mode === 'simple' ? ' is-active' : '')}
        aria-pressed={mode === 'simple'}
        onClick={() => onMode?.('simple')}
      >Simple</button>
      <button
        className={'mg-seg-btn' + (mode === 'pro' ? ' is-active' : '')}
        aria-pressed={mode === 'pro'}
        onClick={() => onMode?.('pro')}
      >Full</button>
    </div>
  );
}

export default function ModuleGuide({ route, mode, onMode }) {
  const meta = MODULE_META[route];
  const { go } = useNav2();
  const [hidden, setHidden] = useState(() => readHidden(route));

  // Re-read the per-module dismissal when the route changes (state adjusted
  // during render, per React's recommended pattern — no effect needed).
  const [prevRoute, setPrevRoute] = useState(route);
  if (route !== prevRoute) {
    setPrevRoute(route);
    setHidden(readHidden(route));
  }

  if (!meta) return null;

  const setHiddenPersist = (v) => {
    setHidden(v);
    try {
      if (v) localStorage.setItem(storeKey(route), 'hidden');
      else localStorage.removeItem(storeKey(route));
    } catch { /* ignore */ }
  };

  if (hidden) {
    const pill = (
      <button
        className="mg-pill"
        title={`What is ${meta.plain}?`}
        aria-label={`Show guide for ${meta.plain}`}
        onClick={() => setHiddenPersist(false)}
      >?</button>
    );
    // The view toggle must stay reachable even with the guide dismissed.
    if (!mode) return pill;
    return (
      <div className="mg-pillrow">
        {pill}
        <span className="mg-pillrow-sep" aria-hidden="true">·</span>
        <ViewSeg mode={mode} onMode={onMode} />
      </div>
    );
  }

  const accent = modByKey(route)?.ac || 'var(--ink)';
  const conns = meta.connections || [];
  const shown = conns.slice(0, 2);
  const overflow = conns.slice(2);

  const runAction = (a) => {
    if (a.bucket) {
      window.dispatchEvent(new CustomEvent('mandate:quickadd', { detail: { bucket: a.bucket } }));
    } else if (a.route) {
      go(a.route);
    }
  };

  return (
    <div className="mg-strip" role="note" aria-label={`${meta.plain} guide`}>
      <div className="mg-id">
        <span className="mg-dot" style={{ background: accent }} aria-hidden="true" />
        <span className="mg-name">{meta.plain}</span>
        <span className="mg-desc">{meta.desc}</span>
      </div>

      {meta.actions?.length > 0 && (
        <div className="mg-actions">
          {meta.actions.map((a) => (
            <button key={a.label} className="mg-btn" onClick={() => runAction(a)}>
              {a.label}
            </button>
          ))}
        </div>
      )}

      {conns.length > 0 && (
        <div className="mg-conns">
          {shown.map((c) => (
            <span key={c} className="mg-chip" title={c}>
              <span className="mg-chip-glyph" aria-hidden="true">⇄</span>{c}
            </span>
          ))}
          {overflow.length > 0 && (
            <span className="mg-chip mg-chip--more" title={overflow.join('\n')}>
              +{overflow.length}
            </span>
          )}
        </div>
      )}

      {mode && <ViewSeg mode={mode} onMode={onMode} />}

      <button
        className="mg-close"
        title="Hide this guide"
        aria-label={`Hide guide for ${meta.plain}`}
        onClick={() => setHiddenPersist(true)}
      >×</button>
    </div>
  );
}
