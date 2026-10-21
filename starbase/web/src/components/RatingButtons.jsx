// RatingButtons — the doorstep scale as big tappable buttons.
// Row one: 1 · 2 · 3 · 4. Row two: the opposed variants 4D · 4B · 4F · 4N · 4C.
// Colored by band (support = green, undecided = yellow, opposed = red); the
// label text lives in title/aria so the button face stays a short code.
// Reusable: <RatingButtons value={person.rating} onPick={(code) => …} compact />
// Class names are rb-* so they never collide with other pages' rating styles.
// Styles ship with the field map stylesheet so the component works anywhere.
import { ratingByCode } from '@starbase/shared/canvass';
import '../pages/map.css';

const ROW_ONE = ['1', '2', '3', '4'];
const ROW_TWO = ['4D', '4B', '4F', '4N', '4C'];

// Small filled chip for a person's current rating — same band colors as the buttons.
export function RatingChip({ code, className = '' }) {
  const r = ratingByCode(code);
  return (
    <span
      className={`rb-chip ${className}`.trim()}
      data-band={r ? r.band : 'none'}
      title={r ? r.label : 'Not yet rated'}
      aria-label={r ? `Rating ${r.short}: ${r.label}` : 'Not yet rated'}
    >
      {r ? r.short : 'unrated'}
    </span>
  );
}

function Row({ codes, value, onPick, disabled }) {
  return (
    <div className="rb-row">
      {codes.map((code) => {
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
            onClick={() => onPick?.(code)}
          >
            {r.short}
          </button>
        );
      })}
    </div>
  );
}

export default function RatingButtons({ value = null, onPick, compact = false, disabled = false }) {
  return (
    <div className={`rb${compact ? ' rb--compact' : ''}`} role="group" aria-label="Rating">
      <Row codes={ROW_ONE} value={value} onPick={onPick} disabled={disabled} />
      <Row codes={ROW_TWO} value={value} onPick={onPick} disabled={disabled} />
    </div>
  );
}
