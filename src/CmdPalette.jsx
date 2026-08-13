// Command palette — the ⌘K "Jump to anything" overlay. Three result groups:
//   Go to          client-side module-name match (MOD2), navigate on pick
//   People & orgs  server entities → Directory
//   Records        server module records → that record's module
// Self-contained: App owns only the open flag and the route change.
import { useEffect, useMemo, useRef, useState } from 'react';
import { MOD2 } from './shell';
import { api } from './auth/api';
import './CmdPalette.css';

const GROUP_LABELS = { go: 'Go to', entities: 'People & orgs', records: 'Records' };
const EMPTY = { entities: [], records: [] };

export default function CmdPalette({ open, onClose, onGo }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(EMPTY);
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);

  // Fresh slate + focus on every open.
  useEffect(() => {
    if (!open) return;
    setQ(''); setRes(EMPTY); setSel(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // Debounced server search; stale responses are dropped on cleanup.
  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (query.length < 2) { setRes(EMPTY); return; }
    let stale = false;
    const t = setTimeout(() => {
      api.search(query)
        .then((r) => { if (!stale) setRes({ entities: r.entities || [], records: r.records || [] }); })
        .catch(() => { if (!stale) setRes(EMPTY); });
    }, 200);
    return () => { stale = true; clearTimeout(t); };
  }, [q, open]);

  // One flat list across the three groups so a single index drives selection.
  const rows = useMemo(() => {
    const nq = q.trim().toLowerCase();
    const go = nq
      ? MOD2.filter((m) => m.n.toLowerCase().includes(nq))
          .map((m) => ({ group: 'go', key: 'go:' + m.k, label: m.n, sub: m.s, route: m.k }))
      : [];
    const ents = res.entities.map((e) => ({
      group: 'entities', key: 'ent:' + e.id, label: e.name,
      sub: [e.type, e.email, e.touchpointCount ? `${e.touchpointCount} touchpoints` : '']
        .filter(Boolean).join(' · '),
      route: 'directory',
    }));
    const recs = res.records.map((r) => ({
      group: 'records', key: 'rec:' + r.id, label: r.label, sub: r.sub, route: r.module,
    }));
    return [...go, ...ents, ...recs];
  }, [q, res]);

  // Selection clamped at read time, so shrinking result sets need no effect.
  const selIdx = Math.min(sel, Math.max(rows.length - 1, 0));

  if (!open) return null;

  const activate = (row) => { if (row) onGo(row.route); };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (rows.length) setSel((selIdx + 1) % rows.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (rows.length) setSel((selIdx - 1 + rows.length) % rows.length); }
    else if (e.key === 'Enter') { e.preventDefault(); activate(rows[selIdx]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  // Rows interleaved with a group label whenever the group changes.
  const items = [];
  let lastGroup = null;
  rows.forEach((row, i) => {
    if (row.group !== lastGroup) {
      lastGroup = row.group;
      items.push(<div className="cp__group" key={'g:' + row.group}>{GROUP_LABELS[row.group]}</div>);
    }
    items.push(
      <button
        key={row.key}
        type="button"
        className={'cp__row' + (i === selIdx ? ' is-sel' : '')}
        onMouseEnter={() => setSel(i)}
        onClick={() => activate(row)}
      >
        <span className="cp__row-label">{row.label}</span>
        {row.sub ? <span className="cp__row-sub">{row.sub}</span> : null}
      </button>
    );
  });

  return (
    <div className="cp__overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cp__modal" role="dialog" aria-modal="true" aria-label="Jump to anything" onKeyDown={onKeyDown}>
        <div className="cp__input-row">
          <span className="cp__glyph">⌕</span>
          <input
            ref={inputRef}
            className="cp__input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to a module, person, or record…"
            spellCheck={false}
            autoFocus
          />
          <kbd className="cp__kbd">esc</kbd>
        </div>
        <div className="cp__results">
          {items.length ? items : (
            <div className="cp__empty">
              {q.trim().length < 2 ? 'Type to search modules, people & orgs, and records.' : 'No matches.'}
            </div>
          )}
        </div>
        <div className="cp__foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
