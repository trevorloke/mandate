// Margin charts — all custom SVG, no chart dependency (spec §11.1, §12.1). Black
// and yellow, high contrast, zero decoration.
import { pctInt, num } from './format';

const INK = '#111111';
const YEL = '#ffd400';
const GREY = '#9b958a';

// Win-probability gauge — a semicircle dial.
export function Gauge({ p, label = 'win probability' }) {
  const W = 220, H = 130, cx = W / 2, cy = 118, r = 92;
  const ang = Math.PI * (1 - (p || 0));               // p=0 → left, p=1 → right
  const x = cx + r * Math.cos(ang), y = cy - r * Math.sin(ang);
  const arc = (frac, color, width) => {
    const a0 = Math.PI, a1 = Math.PI * (1 - frac);
    const x0 = cx + r * Math.cos(a0), y0 = cy - r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy - r * Math.sin(a1);
    return <path d={`M ${x0} ${y0} A ${r} ${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${x1} ${y1}`} fill="none" stroke={color} strokeWidth={width} strokeLinecap="butt" />;
  };
  return (
    <svg className="mg-gauge" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} ${pctInt(p)}`}>
      {arc(1, '#eee7c2', 16)}
      {arc(p || 0, YEL, 16)}
      <line x1={cx} y1={cy} x2={x} y2={y} stroke={INK} strokeWidth="3" />
      <circle cx={cx} cy={cy} r="5" fill={INK} />
      <text x={cx} y={64} textAnchor="middle" className="mg-gauge__val">{pctInt(p)}</text>
      <text x={cx} y={H - 2} textAnchor="middle" className="mg-gauge__lbl">{label}</text>
    </svg>
  );
}

// Seat histogram with the majority threshold marked.
export function SeatHistogram({ histogram, threshold, p10, p90 }) {
  if (!histogram || !histogram.length) return null;
  const W = 520, H = 200, pad = 28;
  const maxFreq = Math.max(...histogram.map((b) => b.freq));
  const seats = histogram.map((b) => b.seats);
  const minS = Math.min(...seats), maxS = Math.max(...seats);
  const span = Math.max(1, maxS - minS);
  const bw = (W - pad * 2) / (span + 1);
  const x = (s) => pad + (s - minS) * bw;
  const y = (f) => H - pad - (f / maxFreq) * (H - pad * 2);
  return (
    <svg className="mg-hist" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="seat distribution">
      {histogram.map((b) => {
        const inBand = b.seats >= Math.round(p10) && b.seats <= Math.round(p90);
        return <rect key={b.seats} x={x(b.seats) + 2} y={y(b.freq)} width={bw - 4} height={H - pad - y(b.freq)} fill={inBand ? YEL : '#efe7bf'} stroke={INK} strokeWidth="0.5" />;
      })}
      {threshold != null && (
        <g>
          <line x1={x(threshold) + bw / 2} y1={pad - 6} x2={x(threshold) + bw / 2} y2={H - pad} stroke={INK} strokeWidth="2" strokeDasharray="4 3" />
          <text x={x(threshold) + bw / 2} y={pad - 10} textAnchor="middle" className="mg-hist__thr">majority {threshold}</text>
        </g>
      )}
      {[minS, Math.round((minS + maxS) / 2), maxS].map((s) => (
        <text key={s} x={x(s) + bw / 2} y={H - 8} textAnchor="middle" className="mg-hist__tick">{s}</text>
      ))}
    </svg>
  );
}

// Margin density (single mode) — a simple histogram of the margin distribution.
export function MarginDensity({ values, p10, p90 }) {
  if (!values || values.length < 2) return null;
  const W = 520, H = 180, pad = 26, bins = 31;
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = (hi - lo) || 1;
  const counts = new Array(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.floor(((v - lo) / span) * bins))]++;
  const maxC = Math.max(...counts);
  const bw = (W - pad * 2) / bins;
  const zeroX = pad + ((0 - lo) / span) * (W - pad * 2);
  return (
    <svg className="mg-density" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="margin distribution">
      {counts.map((c, i) => {
        const v = lo + (i / bins) * span;
        const h = (c / maxC) * (H - pad * 2);
        return <rect key={i} x={pad + i * bw} y={H - pad - h} width={bw - 1} height={h} fill={v >= 0 ? YEL : '#e7d9d6'} stroke={INK} strokeWidth="0.4" />;
      })}
      <line x1={zeroX} y1={pad - 4} x2={zeroX} y2={H - pad} stroke={INK} strokeWidth="2" />
      <text x={zeroX} y={pad - 8} textAnchor="middle" className="mg-hist__thr">tie</text>
      <text x={pad} y={H - 6} className="mg-hist__tick">{pctInt(lo)}</text>
      <text x={W - pad} y={H - 6} textAnchor="end" className="mg-hist__tick">{pctInt(hi)}</text>
      {void p10}{void p90}
    </svg>
  );
}

// Tornado / sensitivity — horizontal bars from the base win prob.
export function Tornado({ base, rows }) {
  if (!rows || !rows.length) return null;
  const W = 520, rowH = 30, pad = 150, H = rows.length * rowH + 30;
  const all = rows.flatMap((r) => [r.low, r.high, base]);
  const lo = Math.min(...all), hi = Math.max(...all);
  const span = (hi - lo) || 1;
  const x = (p) => pad + ((p - lo) / span) * (W - pad - 16);
  return (
    <svg className="mg-tornado" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="sensitivity">
      <line x1={x(base)} y1={20} x2={x(base)} y2={H - 6} stroke={INK} strokeWidth="1.5" strokeDasharray="3 3" />
      {rows.map((r, i) => {
        const yy = 24 + i * rowH;
        const a = x(Math.min(r.low, r.high)), b = x(Math.max(r.low, r.high));
        return (
          <g key={r.label}>
            <text x={pad - 8} y={yy + 14} textAnchor="end" className="mg-tornado__lbl">{r.label}</text>
            <rect x={a} y={yy + 4} width={Math.max(2, b - a)} height={rowH - 12} fill={YEL} stroke={INK} strokeWidth="0.6" />
            <text x={b + 4} y={yy + 14} className="mg-tornado__val">{pctInt(r.swing)}</text>
          </g>
        );
      })}
      <text x={x(base)} y={16} textAnchor="middle" className="mg-hist__tick">base {pctInt(base)}</text>
    </svg>
  );
}

// Stacked gap decomposition — gap bar + how much each pool can close.
export function GapBar({ gap, pools }) {
  const W = 520, H = 78;
  const total = Math.max(gap, pools.persuasion + pools.mobilization + pools.registration, 1);
  const scale = (W - 16) / total;
  const seg = (label, val, color, x) => val > 0 && (
    <g key={label}>
      <rect x={x} y={38} width={val * scale} height={26} fill={color} stroke={INK} strokeWidth="0.6" />
      {val * scale > 46 && <text x={x + 6} y={55} className="mg-gap__seg">{label}</text>}
    </g>
  );
  let cx = 8;
  const segs = [];
  for (const [label, val, color] of [['persuasion', pools.persuasion, YEL], ['mobilization', pools.mobilization, '#e9c200'], ['registration', pools.registration, '#cdb84e']]) {
    segs.push(seg(label, val, color, cx)); cx += val * scale;
  }
  return (
    <svg className="mg-gap" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="gap decomposition">
      <rect x={8} y={8} width={Math.max(2, gap * scale)} height={20} fill="none" stroke={INK} strokeWidth="1.5" />
      <text x={12} y={23} className="mg-gap__seg" fill={INK}>gap {num(gap)}</text>
      {segs}
      {void GREY}
    </svg>
  );
}
