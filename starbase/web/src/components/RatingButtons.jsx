// RatingButtons — the doorstep scale as big tappable buttons.
// One row: 1 · 2 · 3 · 4, each with its meaning printed small under the
// number ("Strong yes", "Lean yes", "Undecided", "Opposed"), so the buttons
// are their own legend on every surface (door card, walk list, calls,
// profile). Tapping 4 asks one more thing — "Voting for?" — with the
// opponents' surnames (McCallum · Locke · Annis · van Vliet · Randhawa) and
// "Not sure" (= plain 4). Nothing is logged until that second tap, so an
// opposed rating is still one contact. Codes ("4B") never show: the picked
// 4 reads "4 / Locke", like its chip "4 · Locke" and the toast
// "Rated 4 · Locke" (ratingText).
// Band-tinted (support = green, undecided = ochre, opposed = red); the
// current rating gets a dark ring and a check mark, never a solid fill, so
// nothing here looks like the screen's one yellow button.
// Reusable: <RatingButtons value={person.rating} onPick={(code) => …} compact />
// Every button is at least 48px tall (field rule). Class names are rb-* so
// they never collide with other pages' rating styles; styles ship with the
// field map stylesheet so the component works anywhere.
import { useEffect, useId, useRef, useState } from 'react';
import { ratingByCode } from '@starbase/shared/canvass';
import '../pages/map.css';

const ROW_ONE = ['1', '2', '3'];
const WHO = ['4D', '4B', '4F', '4N', '4C', '4'];
// What each number means, printed under it.
const MEANING = { 1: 'Strong yes', 2: 'Lean yes', 3: 'Undecided', 4: 'Opposed' };

// "Opposed — Surrey Connect / Brenda Locke" → "Locke";
// "Opposed — Doug McCallum supporter" → "McCallum"; plain 4 → "Not sure".
export function ratingWho(code) {
  const r = ratingByCode(code);
  if (!r) return '';
  if (r.code === '4') return 'Not sure';
  const tail = r.label.split('— ')[1] || '';
  const person = (tail.split(' / ')[1] || tail.replace(/ supporter$/, '')).trim();
  return person.split(' ').slice(1).join(' ') || person || r.short;
}

// Small filled chip for a person's current rating — same band colors as the buttons.
// who: an opposed variant reads "4 · Locke" (the words on the button that
// was tapped), not the code "4B".
export function RatingChip({ code, className = '', who = false }) {
  const r = ratingByCode(code);
  const named = who && r?.band === 'opposed' && r.code !== '4';
  return (
    <span
      className={`rb-chip${named ? ' rb-chip--who' : ''} ${className}`.trim()}
      data-band={r ? r.band : 'none'}
      title={r ? r.label : 'Not yet rated'}
      aria-label={r ? `Rating ${r.short}: ${r.label}` : 'Not yet rated'}
    >
      {r ? (named ? `4 · ${ratingWho(r.code)}` : r.short) : 'unrated'}
    </span>
  );
}

// A short word for a rating, for toasts: "Lean support", "Undecided",
// "Surrey Connect", "Doug McCallum".
export function ratingWord(code) {
  const r = ratingByCode(code);
  if (!r) return '';
  if (r.code === '4') return 'Opposed';
  const tail = r.label.split('— ')[1];
  return tail ? tail.split(' / ')[0].replace(/ supporter$/, '') : r.label;
}

// The words on the buttons: "Strong yes", "Undecided", "Locke", "Opposed".
export function ratingSay(code) {
  const r = ratingByCode(code);
  if (!r) return '';
  return r.band === 'opposed' && r.code !== '4' ? ratingWho(code) : MEANING[r.code] || r.label;
}

// One spelling of a rating for toasts and history lines, the same as the
// chip and the button that was tapped: "1 · Strong yes", "4 · Locke",
// "4 · Opposed". Never the code ("4B") — volunteers never see codes.
// Toasts: `Rated ${ratingText(code)}`.
export function ratingText(code) {
  const r = ratingByCode(code);
  if (!r) return '';
  return `${r.band === 'opposed' ? '4' : r.short} · ${ratingSay(code)}`;
}

// The no-conversation outcomes, as one row of smaller quiet buttons.
// One name per outcome everywhere (map, walk list, calls, profile).
export const OUTCOMES = [
  { code: 'no_answer', label: 'No answer' },
  { code: 'refused', label: 'Refused' },
  { code: 'moved', label: 'Moved' },
  { code: 'inaccessible', label: 'No access' },
];
export const OUTCOME_LABEL = { contacted: 'Talked', ...Object.fromEntries(OUTCOMES.map((o) => [o.code, o.label])) };

export function OutcomeButtons({ items = OUTCOMES, onPick, disabled = false }) {
  return (
    <div className="fk-outcomes" role="group" aria-label="No conversation">
      {items.map((o) => (
        <button key={o.code} type="button" className="fk-out" disabled={disabled} onClick={() => onPick(o.code)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Who at this door: simple tabs (name + current rating). Only for 2+ people.
export function PersonTabs({ persons, value, onPick, ratingOf = (p) => p.rating, label = 'Who you are talking to' }) {
  if (persons.length < 2) return null;
  return (
    <div className="fk-tabs" role="group" aria-label={label}>
      {persons.map((p) => {
        const on = p.id === value;
        const code = ratingOf(p);
        return (
          <button key={p.id} type="button" className={`fk-tab${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => onPick(p.id)}>
            <span className="fk-tab__name">{p.name}</span>
            {code && <RatingChip code={code} who />}
          </button>
        );
      })}
    </div>
  );
}

// "More" disclosure: everything that isn't the rating sits in here.
export function More({ open, onToggle, id, label = 'More', children }) {
  return (
    <div className={`fk-more${open ? ' is-open' : ''}`}>
      <button type="button" className="fk-more__btn disclose" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        {label}
      </button>
      {open && <div className="fk-more__body" id={id}>{children}</div>}
    </div>
  );
}

// Scroll something into view, clear of fixed bars at the bottom (its CSS
// scroll-margin-bottom says how much room they take). Chrome's "nearest"
// ignores scroll-margin while the element itself is on screen, so an
// element sitting under a docked bar would never move — use "end" then.
export function reveal(el) {
  if (!el?.scrollIntoView) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const below = el.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(el).scrollMarginBottom) || 0) > window.innerHeight;
  el.scrollIntoView({ block: below ? 'end' : 'nearest', behavior: reduce ? 'auto' : 'smooth' });
}

// Put focus back on the rating row (the toast's "Change").
export function focusRating(root) {
  const el = root?.querySelector('.rb-btn.is-active') || root?.querySelector('.rb-btn');
  if (!el) return;
  el.scrollIntoView?.({ block: 'nearest' });
  el.focus({ preventScroll: true });
}

export default function RatingButtons({ value = null, onPick, compact = false, disabled = false }) {
  const [askWho, setAskWho] = useState(false);
  const whoId = useId();
  const cur = ratingByCode(value);
  const opposed = cur?.band === 'opposed';
  const pick = (code) => { setAskWho(false); onPick?.(code); };
  // "Voting for?" opens under the row: bring it into view, so on the last
  // door of a list it never opens hidden under a docked bar or the tab bar.
  const whoRef = useRef(null);
  useEffect(() => { if (askWho) reveal(whoRef.current); }, [askWho]);

  return (
    <div className={`rb${compact ? ' rb--compact' : ''}`} role="group" aria-label="Rating">
      <div className="rb-row">
        {ROW_ONE.map((code) => {
          const r = ratingByCode(code);
          const active = value === code;
          return (
            <button
              key={code}
              type="button"
              className={`rb-btn rb-btn--${r.band}${active ? ' is-active' : ''}`}
              title={r.label}
              aria-label={`${r.short}: ${r.label}`}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => pick(code)}
            >
              <span className="rb-btn__code">{r.short}</span>
              <span className="rb-btn__sub">{MEANING[code]}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`rb-btn rb-btn--opposed${opposed ? ' is-active' : ''}${askWho ? ' is-asking' : ''}`}
          title="Opposed — tap, then pick who they vote for"
          aria-label={opposed
            ? `4: Opposed, ${cur.code === '4' ? 'not sure who' : `voting ${ratingWho(cur.code)}`} — change who they vote for`
            : '4: Opposed — pick who they vote for'}
          aria-expanded={askWho}
          aria-controls={whoId}
          disabled={disabled}
          onClick={() => setAskWho((o) => !o)}
        >
          {/* Picked: "4" over the name — the same words as the chip ("4 · Locke"). */}
          <span className="rb-btn__code">4</span>
          <span className="rb-btn__sub">{opposed && cur.code !== '4' ? ratingWho(cur.code) : MEANING[4]}</span>
        </button>
      </div>

      {askWho && (
        <div className="rb-who" id={whoId} ref={whoRef} role="group" aria-label="Voting for?">
          <span className="rb-who__q">Voting for?</span>
          <div className="rb-who__grid">
            {WHO.map((code) => {
              const r = ratingByCode(code);
              const active = value === code;
              return (
                <button
                  key={code}
                  type="button"
                  className={`rb-who__btn${active ? ' is-active' : ''}${code === '4' ? ' rb-who__btn--unsure' : ''}`}
                  title={r.label}
                  aria-label={`${r.short}: ${r.label}`}
                  aria-pressed={active}
                  disabled={disabled}
                  onClick={() => pick(code)}
                >
                  <span className="rb-who__name">{ratingWho(code)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
