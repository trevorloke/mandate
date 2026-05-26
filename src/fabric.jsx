// Mandate 2.0 — Fabric: hover-preview + full dossier
// ObjRef wraps any inline reference to a first-class object. Hover → mini card. Click → full dossier drawer.
import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { modByKey } from './shell';
import './fabric.css';

// ── Object catalog. <ObjRef id="..."> looks up entries here for the hover
// preview + dossier drawer. Populated lazily by features that register their
// records as referenced objects; empty by default so no simulated entries.
const OBJ = {};

// ── ObjRef — inline reference that pops a preview on hover
const ObjRef = ({ kind, id, children, subtle = false }) => {
  const [hover, setHover] = useState(false);
  const [rect, setRect] = useState(null);
  const anchorRef = useRef(null);
  const obj = OBJ[id];

  const showPreview = (e) => {
    if (!anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setRect({ x: r.left + r.width/2, y: r.bottom + 6 });
    setHover(true);
  };
  const hidePreview = () => setHover(false);
  const openDossier = (e) => {
    e.preventDefault();
    if (!obj) return;
    window.__mdt_openDossier && window.__mdt_openDossier(id);
  };

  return (
    <>
      <span
        ref={anchorRef}
        className={'obj-ref' + (subtle ? ' obj-ref--subtle' : '')}
        data-kind={kind}
        onMouseEnter={showPreview}
        onMouseLeave={hidePreview}
        onClick={openDossier}>
        {children}
      </span>
      {hover && obj && rect && (
        <ObjPreview obj={obj} anchor={rect} />
      )}
    </>
  );
};

// ── ObjPreview — the mini card that floats under the reference
const ObjPreview = ({ obj, anchor }) => {
  const m = modByKey(obj.module);
  // Position: center under anchor, clamped to viewport
  const w = 320;
  let x = anchor.x - w/2;
  if (x < 12) x = 12;
  if (x + w > window.innerWidth - 12) x = window.innerWidth - w - 12;
  return ReactDOM.createPortal(
    <div className="obj-prev" style={{ left: x, top: anchor.y, width: w }}>
      <div className="obj-prev__hd" style={{ '--mod-c': m.ac }}>
        <span className="obj-prev__kind">{obj.kind}</span>
        <span className="obj-prev__mod">
          <span className="obj-prev__mod-dot" />
          {m.n}
        </span>
      </div>
      <div className="obj-prev__title">{obj.head}</div>
      <div className="obj-prev__body">{obj.body}</div>
      <div className="obj-prev__facts">
        {obj.facts.map(([k,v], i) => (
          <div key={i} className="obj-prev__fact">
            <span className="obj-prev__fact-k">{k}</span>
            <span className="obj-prev__fact-v">{v}</span>
          </div>
        ))}
      </div>
      <div className="obj-prev__foot">
        <span>Click for full dossier</span>
        <kbd>↩</kbd>
      </div>
    </div>,
    document.body
  );
};

// ── Dossier drawer — click = full panel, side-docked
const DossierDrawer = () => {
  const [id, setId] = useState(null);
  useEffect(() => {
    window.__mdt_openDossier = (id) => setId(id);
    return () => { window.__mdt_openDossier = null; };
  }, []);
  const obj = id ? OBJ[id] : null;
  const open = !!obj;
  const m = obj ? modByKey(obj.module) : null;

  return (
    <>
      <div className={'dossier__scrim' + (open ? ' is-open' : '')} onClick={() => setId(null)} />
      <aside className={'dossier' + (open ? ' is-open' : '')}>
        {obj && (
          <>
            <header className="dossier__hd" style={{ '--mod-c': m.ac }}>
              <div className="dossier__eyebrow">
                <span className="dossier__kind">{obj.kind}</span>
                <span className="dossier__sep">·</span>
                <span className="dossier__mod">{m.n}</span>
              </div>
              <h2 className="dossier__title">{obj.head}</h2>
              <div className="dossier__meta">{obj.meta}</div>
              <button className="dossier__close" onClick={() => setId(null)}>✕</button>
            </header>
            <div className="dossier__body">
              <p className="dossier__lede">{obj.body}</p>
              <div className="dossier__facts">
                {obj.facts.map(([k,v], i) => (
                  <div key={i} className="dossier__fact">
                    <div className="dossier__fact-k">{k}</div>
                    <div className="dossier__fact-v">{v}</div>
                  </div>
                ))}
              </div>
              <div className="dossier__actions">
                {obj.actions.map((a,i) => (
                  <button key={i} className={'dossier__btn' + (i===0 ? ' dossier__btn--primary' : '')}>{a}</button>
                ))}
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
};

export { OBJ, ObjRef, ObjPreview, DossierDrawer };
