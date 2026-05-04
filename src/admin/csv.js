// Tiny CSV parser/serializer. Handles quotes, commas, newlines.
// Export: array of objects → CSV string with header row
// Import: CSV string → array of objects

export function toCSV(records, fields) {
  if (!records.length) return '';
  // Determine columns: use provided fields, else union of keys
  const cols = fields && fields.length
    ? fields
    : Array.from(records.reduce((s, r) => { Object.keys(r).forEach(k => s.add(k)); return s; }, new Set()));
  const head = cols.map(escape).join(',');
  const rows = records.map(r => cols.map(c => escape(serialize(r[c]))).join(','));
  return [head, ...rows].join('\n');
}

function serialize(v) {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function escape(s) {
  s = String(s);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function fromCSV(text) {
  const lines = parseCSV(text);
  if (!lines.length) return [];
  const head = lines[0];
  return lines.slice(1).map(row => {
    const obj = {};
    head.forEach((col, i) => {
      obj[col] = parseValue(row[i] ?? '');
    });
    return obj;
  });
}

// Parse a CSV string into rows of strings, handling quoted fields.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n' || c === '\r') {
      // newline ends a row (skip \r\n)
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0]) rows.push(row);
      row = []; i++; continue;
    }
    field += c; i++;
  }
  // last field
  if (field || row.length) {
    row.push(field);
    if (row.length > 1 || row[0]) rows.push(row);
  }
  return rows;
}

// Try to coerce string back to number/bool/JSON
function parseValue(s) {
  if (s === '') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s.startsWith('{') || s.startsWith('[')) {
    try { return JSON.parse(s); } catch { return s; }
  }
  return s;
}

export function downloadFile(filename, content, type = 'text/csv') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
