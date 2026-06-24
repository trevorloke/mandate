// Margin CSV export — pure string builders (client-side; the demo has no
// backend). Honest values only: probabilities and shares with intervals, never
// bare points.
const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const row = (arr) => arr.map(esc).join(',');
const pc = (x) => (x == null ? '' : Math.round(x * 100));
const sh1 = (x) => (x == null ? '' : (x * 100).toFixed(1));

// Build a CSV capturing the headline forecast + (seat) per-unit detail or
// (single) the margin summary. `model` is the in-memory object from margin.jsx.
export function forecastCsv(model) {
  const { config, summary } = model;
  const lines = [];
  lines.push(row(['metric', 'value', 'low_80', 'high_80', 'low_95', 'high_95']));

  if (summary.mode === 'single') {
    lines.push(row(['win_probability_pct', pc(summary.pWin), '', '', '', '']));
    lines.push(row(['vote_share_pct', sh1(summary.share.mean), sh1(summary.share.p10), sh1(summary.share.p90), sh1(summary.share.p2_5), sh1(summary.share.p97_5)]));
    lines.push(row(['margin_pct', pc(summary.margin.mean), pc(summary.margin.p10), pc(summary.margin.p90), pc(summary.margin.p2_5), pc(summary.margin.p97_5)]));
  } else {
    lines.push(row(['majority_probability_pct', pc(summary.pMajority), '', '', '', '']));
    lines.push(row(['largest_party_pct', pc(summary.pLargest), '', '', '', '']));
    lines.push(row(['seats', Math.round(summary.seats.median), Math.round(summary.seats.p10), Math.round(summary.seats.p90), Math.round(summary.seats.p2_5), Math.round(summary.seats.p97_5)]));
    lines.push('');
    lines.push(row(['unit', 'region', 'your_win_prob_pct', 'mean_margin_pct', 'confidence']));
    for (const u of summary.perUnit) lines.push(row([u.unit_id, u.region, pc(u.winProb), pc(u.meanMargin), u.confidence]));
  }
  lines.push('');
  lines.push(row(['system', model.config.system?.family || '']));
  lines.push(row(['seed', model.levers.seed]));
  lines.push(row(['iterations', model.levers.iterations]));
  lines.push(row(['note', 'synthetic sample data; directional, not census-grade']));
  void config;
  return lines.join('\n');
}

// Trigger a browser download of CSV text (no backend, no storage).
export function downloadCsv(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
