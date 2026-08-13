// Keyboard-shortcuts help panel — toggled by "?" (handled in App).
import './ShortcutsOverlay.css';

const SECTIONS = [
  {
    label: 'Everywhere',
    rows: [
      { keys: ['⌘K', 'Ctrl K'], or: true, desc: 'Jump or act on anything' },
      { keys: ['N'], desc: 'New record (Quick Add)' },
      { keys: ['⌘J', 'Ctrl J'], or: true, desc: 'Conductor' },
      { keys: ['?'], desc: 'This panel' },
      { keys: ['Esc'], desc: 'Close / back out' },
    ],
  },
  {
    label: 'In the palette',
    rows: [
      { keys: ['↑', '↓'], desc: 'Navigate' },
      { keys: ['↵'], desc: 'Open / run' },
    ],
  },
];

export default function ShortcutsOverlay({ open, onClose }) {
  if (!open) return null;
  return (
    <div
      className="sk__overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="sk__modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <header className="sk__head">
          <span className="sk__title">Keyboard Shortcuts</span>
          <button className="sk__close" onClick={onClose} aria-label="Close">×</button>
        </header>
        {SECTIONS.map((sec) => (
          <section key={sec.label} className="sk__section">
            <div className="sk__group">{sec.label}</div>
            {sec.rows.map((row) => (
              <div key={row.desc} className="sk__row">
                <span className="sk__keys">
                  {row.keys.map((k, i) => (
                    <span key={k} className="sk__key">
                      {i > 0 && row.or && <span className="sk__or">/</span>}
                      <kbd>{k}</kbd>
                    </span>
                  ))}
                </span>
                <span className="sk__desc">{row.desc}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
