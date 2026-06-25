// Tide CSV export — one row per reading, for spreadsheets and the record.
const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const pc = (x) => (x == null ? '' : Math.round(x * 100));

const HEADER = ['topic', 'captured_at', 'volume', 'momentum_pct', 'sentiment_pos_pct', 'sentiment_neu_pct', 'sentiment_neg_pct', 'confidence_pct', 'panel_n', 'top_age', 'top_gender', 'top_region', 'why'];

// rows: [{ topic, capturedAt, volume, momentum, sentiment:{pos,neu,neg}, confidence, panelN, demographics:{top:{age,gender,region}}, why }]
export function readingsCsv(rows) {
  const out = [HEADER.join(',')];
  for (const r of rows) {
    const top = r.demographics?.top || {};
    const at = r.capturedAt ? new Date(r.capturedAt).toISOString() : '';
    out.push([
      r.topic, at, Math.round(r.volume || 0), pc(r.momentum),
      pc(r.sentiment?.pos), pc(r.sentiment?.neu), pc(r.sentiment?.neg),
      pc(r.confidence), r.panelN ?? '', top.age || '', top.gender || '', top.region || '', r.why || '',
    ].map(esc).join(','));
  }
  return out.join('\n');
}
