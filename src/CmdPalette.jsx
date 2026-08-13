// Command palette — the ⌘K "do anything" overlay. Four result groups:
//   Actions        quick-add verbs, view toggle, admin export — run on pick
//   Go to          client-side module-name match (MOD2), navigate on pick
//   People & orgs  server entities → Directory
//   Records        server module records → that record's module
// Self-contained: App owns only the open flag and the route change.
import { useEffect, useMemo, useRef, useState } from 'react';
import { MOD2 } from './shell';
import { MODULE_META, plainName } from './simple-map';
import { api } from './auth/api';
import './CmdPalette.css';

const GROUP_LABELS = { actions: 'Actions', go: 'Go to', entities: 'People & orgs', records: 'Records' };
const EMPTY = { entities: [], records: [] };

export default function CmdPalette({
  open, onClose, onGo, route, hasSimpleView, viewMode, onViewMode, canWrite, isAdmin,
}) {
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

  // One flat list across the groups so a single index drives selection.
  const rows = useMemo(() => {
    const nq = q.trim().toLowerCase();

    // Action candidates: quick-add verbs, view toggle, admin export.
    const quickAdds = canWrite
      ? Object.values(MODULE_META).flatMap((meta) =>
          meta.actions
            .filter((a) => a.bucket)
            .map((a) => ({
              group: 'actions', key: 'act:qa:' + a.bucket, label: a.label, sub: meta.plain,
              run: () => {
                onClose();
                window.dispatchEvent(new CustomEvent('mandate:quickadd', { detail: { bucket: a.bucket } }));
              },
            })))
      : [];
    const viewToggle = hasSimpleView
      ? {
          group: 'actions', key: 'act:view',
          label: viewMode === 'simple' ? 'Switch to Full view' : 'Switch to Simple view',
          sub: plainName(route),
          run: () => { onViewMode(viewMode === 'simple' ? 'pro' : 'simple'); onClose(); },
        }
      : null;
    const exportAll = isAdmin
      ? {
          group: 'actions', key: 'act:export',
          label: 'Export all data (JSON)', sub: 'Full workspace snapshot',
          run: () => { window.open('/api/workspace/backup/export', '_blank'); onClose(); },
        }
      : null;

    // Plain name leads; the codename rides as the sub (Simple-release idiom).
    const goRow = (m) => ({ group: 'go', key: 'go:' + m.k, label: plainName(m.k), sub: m.n, route: m.k });

    if (!nq) {
      // Default slate: toggle, first 5 verbs, export, then every module.
      const acts = [viewToggle, ...quickAdds.slice(0, 5), exportAll].filter(Boolean);
      return [...acts, ...MOD2.map(goRow)];
    }

    const hit = (r) => r.label.toLowerCase().includes(nq) || (r.sub || '').toLowerCase().includes(nq);
    const acts = [...quickAdds, viewToggle, exportAll].filter(Boolean).filter(hit);
    const go = MOD2.filter((m) => m.n.toLowerCase().includes(nq) || plainName(m.k).toLowerCase().includes(nq))
      .map(goRow);
    const ents = res.entities.map((e) => ({
      group: 'entities', key: 'ent:' + e.id, label: e.name,
      sub: [e.type, e.email, e.touchpointCount ? `${e.touchpointCount} touchpoints` : '']
        .filter(Boolean).join(' · '),
      route: 'directory',
    }));
    const recs = res.records.map((r) => ({
      group: 'records', key: 'rec:' + r.id, label: r.label, sub: r.sub, route: r.module,
    }));
    return [...acts, ...go, ...ents, ...recs];
  }, [q, res, route, hasSimpleView, viewMode, onViewMode, canWrite, isAdmin, onClose]);

  // Selection clamped at read time, so shrinking result sets need no effect.
  const selIdx = Math.min(sel, Math.max(rows.length - 1, 0));

  if (!open) return null;

  const activate = (row) => {
    if (!row) return;
    if (row.run) row.run(); else onGo(row.route);
  };

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
        className={'cp__row' + (row.run ? ' cp__row--act' : '') + (i === selIdx ? ' is-sel' : '')}
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
      <div className="cp__modal" role="dialog" aria-modal="true" aria-label="Do anything" onKeyDown={onKeyDown}>
        <div className="cp__input-row">
          <span className="cp__glyph">⌕</span>
          <input
            ref={inputRef}
            className="cp__input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type an action, module, person, or record…"
            spellCheck={false}
            autoFocus
          />
          <kbd className="cp__kbd">esc</kbd>
        </div>
        <div className="cp__results">
          {items.length ? items : <div className="cp__empty">No matches.</div>}
        </div>
        <div className="cp__foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>n</kbd> new record</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
