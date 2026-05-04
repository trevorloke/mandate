// Mandate 2.0 — Fabric: hover-preview + full dossier
// ObjRef wraps any inline reference to a first-class object. Hover → mini card. Click → full dossier drawer.
import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { modByKey } from './shell';
import './fabric.css';

// ── Object catalog — anything referenced by <ObjRef> must resolve here.
const OBJ = {
  // CLAIMS (opposition)
  'vance-housing': {
    kind: 'claim',
    label: 'Vance housing quote',
    meta: 'Vancouver Sun · A4 · 07:15 today',
    module: 'opposition',
    head: '"Market will sort itself out"',
    body: 'Harold Vance (UP, Meridian West) to Vancouver Sun. In print A4 this morning. Reach: 80,000. Our counter draft is 34 words, approved by comms, awaiting manager sign-off.',
    facts: [
      ['Who', 'Harold Vance · Unity · Meridian West'],
      ['Where', 'Vancouver Sun · A4'],
      ['Reach', '80,000'],
      ['Status', 'Counter drafted · awaiting approval'],
    ],
    actions: ['Approve counter', 'Open in Opposition', 'Attach to Bill 14'],
  },
  'bill-14': {
    kind: 'bill',
    label: 'Bill 14',
    meta: 'Residential Tenancy Amendment · 2nd reading 14:30',
    module: 'civic',
    head: 'Bill 14 — Residential Tenancy Amendment Act',
    body: 'Second reading today at 14:30. Caucus whip: hard yes. Wong soft no. Speech slot available at 13:50. Drafted remarks in Civic.',
    facts: [
      ['Stage', 'Second reading'],
      ['When', 'Today · 14:30'],
      ['Whip', 'Hard yes'],
      ['Risks', 'Wong · soft no'],
    ],
    actions: ['Confirm attendance', 'Open in Civic', 'Draft remarks'],
  },

  // ORGS (coalition)
  'bcfl': {
    kind: 'org',
    label: 'BC Federation of Labour',
    meta: 'Tier 1 · 500k members · endorsed',
    module: 'coalition',
    head: 'BC Federation of Labour',
    body: 'Signed endorsement letter received from S. Nkomo. Release window 07:50. Press list queued in Beacon. Past support: 2020 +94 index.',
    facts: [
      ['Members', '500,000'],
      ['Tier', '1'],
      ['Contact', 'S. Nkomo'],
      ['Endorsed', 'Yes · today'],
    ],
    actions: ['Open in Coalition', 'See release in Beacon', 'Log touch'],
  },

  // PEOPLE
  'cheung': {
    kind: 'person',
    label: 'M. Cheung',
    meta: 'Major donor pipeline · $5k soft',
    module: 'raise',
    head: 'Marlene Cheung',
    body: 'Soft-committed to $5,000. Best call window 11:00–11:30. Prep card in Raise. Past gift: $2,500 (2022). Issue focus: childcare, small business.',
    facts: [
      ['Pipeline', '$5,000 soft'],
      ['Rating', 'A (warm)'],
      ['Last gift', '$2,500 · 2022'],
      ['Issues', 'Childcare · small biz'],
    ],
    actions: ['Call now', 'Open in Raise', 'Schedule ask'],
  },

  // TURFS
  '31b': {
    kind: 'turf',
    label: 'Universe 31-B · Metrotown',
    meta: '1,420 doors · lit-drop',
    module: 'ground',
    head: 'Universe 31-B — Metrotown east',
    body: 'Persuasion universe, lit-drop mode. 1,420 doors in range. 12 canvassers confirmed tonight, 8 slots open. Last cut: +0.6pp support.',
    facts: [
      ['Doors', '1,420'],
      ['Mode', 'Lit-drop'],
      ['Shift', 'Tonight · 17:00–20:00'],
      ['Fill', '12 of 20'],
    ],
    actions: ['Fill slots', 'Open in Ground', 'Route plan'],
  },

  // DONATIONS / TRANSACTIONS
  'q2-filing': {
    kind: 'filing',
    label: 'Q2 Elections BC filing',
    meta: 'Reconciled · awaiting signature',
    module: 'ledger',
    head: 'Q2 filing — Elections BC',
    body: 'Reconciled to bank. $847.20 variance resolved (meals #3102). Awaiting candidate signature before submission.',
    facts: [
      ['Period', 'Q2 2026'],
      ['Cash on hand', '$214,630'],
      ['Status', 'Signature pending'],
      ['Due', 'July 15'],
    ],
    actions: ['Review', 'Open in Ledger', 'Request signature'],
  },
};

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
