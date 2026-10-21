// Import people — the first thing a new campaign does. Choose a CSV (or paste
// it), match its columns to Starbase fields, check it (a dry run: nothing is
// saved), import it in chunks of 1,000, then place everyone on the map.
// The CSV is parsed here in the browser; the server validates, dedupes against
// people already on file (email → name+phone → name+address) and merges by
// filling blanks only. Desk roles only — volunteers are sent back to People.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useOutletContext } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { RATING_CODES } from '@starbase/shared/canvass';
import { apiPost } from '../api.js';
import GeocodeButton from '../components/GeocodeButton.jsx';
import { RatingChip } from '../components/RatingButtons.jsx';
import { invalidatePersonData } from './People.jsx';
import './import.css';

const DESK = ['manager', 'treasurer', 'staff'];
const CHECK_CHUNK = 2000; // server max per call
const IMPORT_CHUNK = 1000;
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const TAG_MAX = 40;

const fmtN = (n) => Number(n || 0).toLocaleString('en-CA');
const plural = (n, one, many) => `${fmtN(n)} ${n === 1 ? one : many}`;

// ─────────────────────────────────────────────────────────────────────────────
// CSV parsing
// ─────────────────────────────────────────────────────────────────────────────

const DELIMS = [',', ';', '\t'];
const DELIM_NAMES = { ',': 'comma', ';': 'semicolon', '\t': 'tab' };

// Count each candidate delimiter outside quotes on the first non-blank line.
export function detectDelimiter(text) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  let seen = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (inQuotes) continue;
    if (ch === '\n' || ch === '\r') { if (seen) break; continue; }
    if (ch in counts) counts[ch] += 1;
    if (ch.trim()) seen = true;
  }
  let best = ',';
  for (const d of DELIMS) if (counts[d] > counts[best]) best = d;
  return best;
}

// RFC 4180-ish, forgiving: quoted fields with "" escapes, delimiters and
// newlines inside quotes, CRLF / LF / CR line ends, a leading BOM, spaces
// before an opening quote, and stray text after a closing quote.
// → { delimiter, rows: string[][] } (blank lines kept as [''] so row numbers
// match the spreadsheet).
export function parseCSV(input, forced) {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delim = forced || detectDelimiter(text);
  const rows = [];
  let row = [];
  const n = text.length;
  let i = 0;
  const endRow = () => { rows.push(row); row = []; };
  while (i < n) {
    // Start of a field. Allow spaces before an opening quote.
    let j = i;
    while (j < n && (text[j] === ' ' || (text[j] === '\t' && delim !== '\t'))) j++;
    if (text[j] === '"') {
      let value = '';
      let k = j + 1;
      for (;;) {
        const q = text.indexOf('"', k);
        if (q === -1) { value += text.slice(k); k = n; break; } // unterminated: take the rest
        value += text.slice(k, q);
        if (text[q + 1] === '"') { value += '"'; k = q + 2; continue; }
        k = q + 1;
        break;
      }
      // Anything between the closing quote and the next delimiter/newline.
      let e = k;
      while (e < n && text[e] !== delim && text[e] !== '\n' && text[e] !== '\r') e++;
      value += text.slice(k, e).trim() ? text.slice(k, e) : '';
      row.push(value);
      i = e;
    } else {
      let e = i;
      while (e < n && text[e] !== delim && text[e] !== '\n' && text[e] !== '\r') e++;
      row.push(text.slice(i, e));
      i = e;
    }
    if (i >= n) { endRow(); break; }
    const ch = text[i];
    if (ch === delim) {
      i += 1;
      if (i >= n) { row.push(''); endRow(); }
    } else {
      // newline: \r\n, \n or \r
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      endRow();
    }
  }
  return { delimiter: delim, rows };
}

const isBlankRow = (cells) => cells.every((c) => !String(c).trim());

// Bytes → text. UTF-8 first; UTF-16 when it has a BOM (Excel "Unicode text");
// otherwise Windows-1252, which is what older Excel saves as "CSV".
function decodeBytes(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return new TextDecoder('windows-1252').decode(b);
  }
}

const isSpreadsheetBinary = (buf, name) => {
  const b = new Uint8Array(buf.slice(0, 4));
  const zip = b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04; // .xlsx / .numbers
  const ole = b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0; // .xls
  return zip || ole || /\.(xlsx|xlsm|xls|numbers|ods)$/i.test(name || '');
};

// Text → { headers, records: [{ cells, row }], delimiter } or { error }.
function readTable(text) {
  if (!text || !text.trim()) return { error: 'That file is empty. Choose a CSV with a header row and at least one person.' };
  const { delimiter, rows } = parseCSV(text);
  const headerAt = rows.findIndex((r) => !isBlankRow(r));
  if (headerAt === -1) return { error: 'That file is empty. Choose a CSV with a header row and at least one person.' };
  const records = [];
  for (let i = headerAt + 1; i < rows.length; i++) {
    if (!isBlankRow(rows[i])) records.push({ cells: rows[i], row: i + 1 }); // spreadsheet row number
  }
  if (records.length === 0) {
    return { error: 'There’s a header row but no people under it. Check you saved the whole sheet.' };
  }
  let width = Math.min(500, Math.max(rows[headerAt].length, ...records.slice(0, 500).map((r) => r.cells.length)));
  // Drop trailing columns with no header and nothing in them ("a,b," on every line).
  const emptyCol = (i) => !String(rows[headerAt][i] ?? '').trim() && records.every((r) => !String(r.cells[i] ?? '').trim());
  while (width > 1 && emptyCol(width - 1)) width -= 1;
  const headers = Array.from({ length: width }, (_, i) => String(rows[headerAt][i] ?? '').trim() || `Column ${i + 1}`);
  return { headers, records, delimiter };
}

// ─────────────────────────────────────────────────────────────────────────────
// Column mapping
// ─────────────────────────────────────────────────────────────────────────────

const FIELDS = [
  { key: 'name', label: 'Full name' },
  { key: 'first', label: 'First name' },
  { key: 'last', label: 'Last name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Street address' },
  { key: 'unit', label: 'Unit / apt' },
  { key: 'city', label: 'City' },
  { key: 'postal', label: 'Postal code' },
  { key: 'tags', label: 'Tags' },
  { key: 'rating', label: 'Rating (1–4)' },
];
const SKIP = '';
const fieldLabel = (key) => FIELDS.find((f) => f.key === key)?.label || key;
const FIELD_WORD = { email: 'email', phone: 'phone', address: 'address', unit: 'unit', city: 'city', postal: 'postal code', tags: 'tags', rating: 'rating' };
const MULTI = new Set(['tags']); // several columns can feed tags; every other field takes one column

const normHeader = (h) =>
  String(h || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// Exact header names first, then looser "contains" rules, then the values.
const EXACT = [
  ['email', /^(e?mail|emailaddress|emailaddr|primaryemail|personalemail|homeemail|email\d|courriel)$/],
  ['first', /^(first|firstname|fname|given|givenname|forename|firstnames)$/],
  ['last', /^(last|lastname|lname|surname|familyname)$/],
  ['name', /^(name|fullname|contactname|displayname|votername|membername|donorname|person|contact|names)$/],
  ['phone', /^(phone|phonenumber|phoneno|tel|telephone|mobile|mobilephone|mobilenumber|cell|cellphone|cellnumber|homephone|primaryphone|phone\d)$/],
  ['unit', /^(unit|unitnumber|unitno|apt|aptno|aptnumber|apartment|suite|suiteno|address2|addressline2|street2)$/],
  ['address', /^(address|streetaddress|streetaddress1|address1|addressline1|street|street1|civicaddress|homeaddress|residentialaddress|mailingaddress|addr)$/],
  ['city', /^(city|town|municipality|locality|cityname)$/],
  ['postal', /^(postal|postalcode|postcode|zip|zipcode|pc)$/],
  ['tags', /^(tags?|groups?|labels?|lists?|segments?|categories|category)$/],
  ['rating', /^(rating|support|supportlevel|supportid|id|idlevel|supportscore|canvassid|canvassrating|doorrating)$/],
];
const CONTAINS = [
  ['email', /e?mail/],
  ['first', /firstname|givenname|forename/],
  ['last', /lastname|surname|familyname/],
  ['phone', /phone|mobile|cellular|^cell|^tel/],
  ['postal', /postal|postcode|zip/],
  ['unit', /^(unit|apt|suite)/],
  ['address', /address|street/],
  ['city', /(^|home|mailing|mail|res|residential|billing)city|^town|municipal/],
  ['tags', /^tags?|tags?$|groups?$|labels?$|segments?$/],
  ['rating', /support|rating/],
  ['name', /^(?!.*(user|file|middle|nick)).*name/],
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTAL_RE = /^[a-z]\d[a-z][ -]?\d[a-z]\d$/i;
const PHONE_RE = /^\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(\s*(x|ext\.?)\s*\d+)?$/i;

// "4d " → "4D", "4 D" → "4D", "1.0" → "1" (spreadsheets love a trailing .0).
const normalizeRating = (v) => String(v ?? '').replace(/\s+/g, '').toUpperCase().replace(/\.0+$/, '');
const isRating = (v) => RATING_CODES.includes(normalizeRating(v));
// share: a "Support" column may hold the odd typo; a bare "ID" column must be all ratings.
const looksLikeRatings = (values, share = 1) =>
  values.length > 0 && values.filter(isRating).length / values.length >= share;
const mostly = (values, re, share = 0.8) => values.length > 0 && values.filter((v) => re.test(v)).length / values.length >= share;
// Loose header guesses must also look right ("Email opt-in" holding yes/no is not an email column).
const VALUE_CHECK = { email: EMAIL_RE, phone: PHONE_RE, postal: POSTAL_RE };

const columnValues = (records, i, limit = 200) => {
  const out = [];
  for (const r of records) {
    const v = String(r.cells[i] ?? '').trim();
    if (v) out.push(v);
    if (out.length >= limit) break;
  }
  return out;
};

function guessMapping(headers, records) {
  const out = headers.map(() => SKIP);
  const taken = new Set();
  const values = headers.map((_, i) => columnValues(records, i));
  const claim = (i, key, loose = false) => {
    if (out[i] !== SKIP) return;
    if (!MULTI.has(key) && taken.has(key)) return;
    if (key === 'rating' && !looksLikeRatings(values[i], /^(id|idlevel)$/.test(normHeader(headers[i])) ? 1 : 0.9)) return; // "ID" only if it holds 1/2/3/4/4D…
    if (loose && VALUE_CHECK[key] && values[i].length && !mostly(values[i], VALUE_CHECK[key], 0.6)) return;
    if (key === 'name' && mostly(values[i], EMAIL_RE)) return; // a "Contact" column of emails isn't a name
    out[i] = key;
    taken.add(key);
  };
  const pass = (rules, loose) => headers.forEach((h, i) => {
    if (out[i] !== SKIP) return;
    const n = normHeader(h);
    const hit = rules.find(([, re]) => re.test(n));
    if (hit) claim(i, hit[0], loose);
  });
  pass(EXACT, false);
  pass(CONTAINS, true);
  headers.forEach((_, i) => {
    if (out[i] !== SKIP || !values[i].length) return;
    if (mostly(values[i], EMAIL_RE)) claim(i, 'email');
    else if (mostly(values[i], POSTAL_RE)) claim(i, 'postal');
    else if (mostly(values[i], PHONE_RE)) claim(i, 'phone');
  });
  return out;
}

// One CSV record → the server's row shape (only filled fields are sent).
// A rating that isn't on the scale is left off: the server rejects the whole
// row for it, and losing the person is worse than losing a bad rating.
function toRow(cells, mapping) {
  const row = {};
  mapping.forEach((key, i) => {
    if (!key) return;
    const v = String(cells[i] ?? '').trim();
    if (!v) return;
    if (key === 'tags') row.tags = row.tags ? `${row.tags};${v}` : v;
    else if (key === 'rating') { const r = normalizeRating(v); if (RATING_CODES.includes(r)) row.rating = r; }
    else row[key] = v;
  });
  return row;
}

// fetch/ApiError → one plain sentence that says what to do.
function errText(e) {
  if (!e?.status) return 'Couldn’t reach Starbase. Check your connection and try again.';
  if (e.status === 401) return 'You’ve been signed out. Sign in again in another tab, then try again.';
  if (e.status === 403) return 'Only campaign staff can import people.';
  const m = String(e.message || '').trim();
  return m ? `Starbase said: ${m}.` : `Something went wrong (${e.status}). Try again.`;
}

const displayName = (r) => r.name || [r.first, r.last].filter(Boolean).join(' ');
const displayAddress = (r) =>
  [[r.unit ? `${r.unit} –` : null, r.address].filter(Boolean).join(' '), r.city, r.postal].filter(Boolean).join(', ');
const splitTags = (s) => String(s || '').split(/[;,|]/).map((t) => t.trim()).filter(Boolean);

// Tag suggestion from the file name: "Voters List 2026.csv" → "voters-list-2026".
const slugTag = (fileName) => {
  const base = String(fileName || '').replace(/\.[a-z0-9]+$/i, '');
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug && slug.length <= TAG_MAX ? slug : '';
};

// ─────────────────────────────────────────────────────────────────────────────
// Server messages → spreadsheet row numbers and plain words
// ─────────────────────────────────────────────────────────────────────────────

const SCALE = RATING_CODES.join(', ');

function friendly(text) {
  const t = String(text || '').trim();
  if (t === 'no name') return 'No name. Fill in a full name, or a first and last name.';
  let m = /^invalid email “(.*)”$/.exec(t);
  if (m) return `“${m[1]}” doesn’t look like an email address.`;
  m = /^rating “(.*)” is not on the scale$/.exec(t);
  if (m) return `Rating “${m[1]}” isn’t on the scale (${SCALE}).`;
  m = /^([a-z]+)(?:\.\d+)?\s+(.*)$/.exec(t);
  if (m && FIELDS.some((f) => f.key === m[1])) {
    if (m[1] === 'rating') return `Rating isn’t on the scale (${SCALE}).`;
    const big = /Too big:.*?(\d+)\s*(characters|items)/i.exec(m[2]);
    if (big) return `${fieldLabel(m[1])} is too long (${big[1]} ${big[2]} max).`;
    return `${fieldLabel(m[1])}: ${m[2]}`;
  }
  return t ? t[0].toUpperCase() + t.slice(1) : 'Couldn’t read this row.';
}

// "row 3: no name" (3 = position in the chunk sent) → { row: 1042, text }.
function remapInvalid(msg, part) {
  const m = /^row (\d+):\s*(.*)$/s.exec(String(msg));
  if (!m) return { row: null, text: friendly(msg) };
  return { row: part[Number(m[1]) - 1]?.row ?? null, text: friendly(m[2]) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Small pieces
// ─────────────────────────────────────────────────────────────────────────────

function Step({ n, title, state, children }) {
  // state: 'todo' | 'now' | 'done'
  return (
    <section className={`imp-step is-${state}`} aria-labelledby={`imp-step-${n}`}>
      <div className="imp-step__num" aria-hidden="true">{state === 'done' ? '✓' : n}</div>
      <div className="imp-step__body">
        <h2 id={`imp-step-${n}`}><span className="imp-sr">Step {n}: </span>{title}</h2>
        {children}
      </div>
    </section>
  );
}

function Bar({ value, max, label }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="imp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <div className="imp-bar__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Counts({ items }) {
  return (
    <dl className="imp-counts">
      {items.map(([label, value, tone, note]) => (
        <div key={label} className={`imp-count${tone ? ` is-${tone}` : ''}`}>
          <dt className="eyebrow">{label}</dt>
          <dd>
            <span className="imp-count__n mono">{fmtN(value)}</span>
            {note && <span className="imp-count__note">{note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function InvalidList({ invalid, intro }) {
  const [all, setAll] = useState(false);
  if (!invalid.length) return null;
  const shown = all ? invalid : invalid.slice(0, 12);
  return (
    <div className="imp-invalid">
      <p className="imp-invalid__intro">{intro}</p>
      <ul className="imp-invalid__list">
        {shown.map((x, i) => (
          <li key={i}>
            {x.row != null && <span className="imp-invalid__row mono">Row {fmtN(x.row)}</span>}
            <span>{x.text}</span>
          </li>
        ))}
      </ul>
      {invalid.length > shown.length && (
        <button type="button" className="btn btn-quiet imp-tap" onClick={() => setAll(true)}>
          Show all {fmtN(invalid.length)}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The screen
// ─────────────────────────────────────────────────────────────────────────────

export default function ImportPeople() {
  const { me } = useOutletContext() ?? {};
  if (!DESK.includes(me?.role)) return <Navigate to="/people" replace />;
  return <ImportFlow />;
}

const ZERO = { created: 0, merged: 0, unchanged: 0 };

function ImportFlow() {
  const queryClient = useQueryClient();

  // Step 1 — the source
  const [source, setSource] = useState(null); // { name, headers, records, delimiter }
  const [loadError, setLoadError] = useState(null);
  const [reading, setReading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  // Step 2 — mapping
  const [mapping, setMapping] = useState([]);
  const [bumped, setBumped] = useState(null); // { col, key } — a column switched off by a pick
  const [tag, setTag] = useState('');

  // Step 3 — check (dry run). Any mapping/tag change throws it away.
  const [check, setCheck] = useState(null); // { phase, done, total, created, merged, unchanged, invalid, matches, parts, error }
  // Step 4 — import
  const [imp, setImp] = useState(null); // { phase, sent, total, created, merged, unchanged, invalid, error, resumeAt }

  const busy = reading || check?.phase === 'running' || imp?.phase === 'running';
  const locked = busy || imp?.phase === 'done' || imp?.phase === 'error';

  // Don't lose a half-sent import to a stray tab close.
  useEffect(() => {
    if (imp?.phase !== 'running') return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [imp?.phase]);

  const resetAfterSource = () => { setCheck(null); setImp(null); setBumped(null); };

  const loadText = (text, name) => {
    const t = readTable(text);
    if (t.error) { setLoadError(t.error); return; }
    setLoadError(null);
    setSource({ name, ...t });
    setMapping(guessMapping(t.headers, t.records));
    setTag('');
    resetAfterSource();
  };

  const loadFile = async (file) => {
    if (!file) return;
    setLoadError(null);
    if (file.size > MAX_FILE_BYTES) {
      setLoadError('That file is over 30 MB. Split it into smaller files and import them one at a time.');
      return;
    }
    setReading(true);
    try {
      const buf = await file.arrayBuffer();
      if (isSpreadsheetBinary(buf, file.name)) {
        setLoadError('That’s a spreadsheet file, not a CSV. In Excel or Google Sheets choose File → Save as (or Download) → CSV, then choose that file here.');
        return;
      }
      loadText(decodeBytes(buf), file.name);
    } catch {
      setLoadError('Couldn’t read that file. Try saving it again as CSV.');
    } finally {
      setReading(false);
    }
  };

  const onPick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // choosing the same file again still fires
    loadFile(file);
  };
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (locked) return;
    loadFile(e.dataTransfer?.files?.[0]);
  };
  const usePaste = () => {
    if (!pasteText.trim()) { setLoadError('Paste the CSV text first — header row on top.'); return; }
    loadText(pasteText, 'Pasted text');
    setPasteOpen(false);
  };
  const startOver = () => {
    setSource(null);
    setMapping([]);
    setTag('');
    setLoadError(null);
    setPasteText('');
    resetAfterSource();
  };

  const setField = (col, key) => {
    let bump = null;
    const next = mapping.map((k, j) => {
      if (j === col) return key;
      if (key && !MULTI.has(key) && k === key) { bump = { col: j, key }; return SKIP; }
      return k;
    });
    setMapping(next);
    setBumped(bump);
    setCheck(null);
  };
  const onTag = (v) => { setTag(v.slice(0, TAG_MAX)); setCheck(null); };

  // ── Derived ──
  const rows = useMemo(
    () => (source ? source.records.map((r) => ({ data: toRow(r.cells, mapping), row: r.row, cells: r.cells })) : []),
    [source, mapping],
  );
  const ratingCol = mapping.indexOf('rating');
  const hasName = mapping.some((k) => k === 'name' || k === 'first' || k === 'last');
  const usedCount = mapping.filter(Boolean).length;
  const usedFields = FIELDS.filter((f) => mapping.includes(f.key)).map((f) => f.label);
  const tagClean = tag.trim();
  const fileTag = source && source.name !== 'Pasted text' ? slugTag(source.name) : '';

  const examples = useMemo(
    () => (source ? source.headers.map((_, i) => columnValues(source.records, i, 3)) : []),
    [source],
  );
  // A column mapped to Rating whose values aren't on the scale: those rows fail.
  const badRatings = useMemo(() => {
    const col = ratingCol;
    if (!source || col === -1) return 0;
    return source.records.filter((r) => {
      const v = String(r.cells[col] ?? '').trim();
      return v && !isRating(v);
    }).length;
  }, [source, mapping]);

  const previewCols = [
    hasName && ['name', 'Name'],
    mapping.includes('email') && ['email', 'Email'],
    mapping.includes('phone') && ['phone', 'Phone'],
    mapping.some((k) => ['address', 'unit', 'city', 'postal'].includes(k)) && ['address', 'Address'],
    (mapping.includes('tags') || tagClean) && ['tags', 'Tags'],
    mapping.includes('rating') && ['rating', 'Rating'],
  ].filter(Boolean);

  // ── Step 3: check ──
  const runCheck = async () => {
    const total = rows.length;
    const acc = { ...ZERO, invalid: [], matches: [] };
    const parts = Math.ceil(total / CHECK_CHUNK);
    setCheck({ phase: 'running', done: 0, total, parts, ...acc });
    try {
      for (let start = 0; start < total; start += CHECK_CHUNK) {
        const part = rows.slice(start, start + CHECK_CHUNK);
        const r = await apiPost('/data/import', { rows: part.map((x) => x.data), tag: tagClean || undefined, dryRun: true });
        acc.created += r.created || 0;
        acc.merged += r.merged || 0;
        acc.unchanged += r.unchanged || 0;
        for (const msg of r.invalid || []) acc.invalid.push(remapInvalid(msg, part));
        for (const d of r.decisions || []) {
          if (d.action === 'merged' && acc.matches.length < 50) {
            acc.matches.push({ ...d, row: part[d.row - 1]?.row ?? d.row });
          }
        }
        setCheck({ phase: 'running', done: start + part.length, total, parts, ...acc });
      }
      setCheck({ phase: 'done', done: total, total, parts, ...acc });
    } catch (e) {
      setCheck({ phase: 'error', done: 0, total, parts, ...acc, error: errText(e) });
    }
  };

  // ── Step 4: import, 1,000 rows a call; each call is its own transaction ──
  const accRef = useRef(null);
  const runImport = async (from = 0) => {
    const total = rows.length;
    if (from === 0) accRef.current = { ...ZERO, invalid: [] };
    const acc = accRef.current;
    setImp({ phase: 'running', sent: from, total, ...acc });
    let start = from;
    try {
      for (; start < total; start += IMPORT_CHUNK) {
        const part = rows.slice(start, start + IMPORT_CHUNK);
        const r = await apiPost('/data/import', { rows: part.map((x) => x.data), tag: tagClean || undefined });
        acc.created += r.created || 0;
        acc.merged += r.merged || 0;
        acc.unchanged += r.unchanged || 0;
        for (const msg of r.invalid || []) acc.invalid.push(remapInvalid(msg, part));
        setImp({ phase: 'running', sent: start + part.length, total, ...acc });
      }
      setImp({ phase: 'done', sent: total, total, ...acc });
    } catch (e) {
      setImp({ phase: 'error', sent: start, total, ...acc, error: errText(e), resumeAt: start });
    } finally {
      invalidatePersonData(queryClient);
      // Merges can fill a rating or phone on people already inside a turf.
      queryClient.invalidateQueries({ queryKey: ['turfs'] });
      queryClient.invalidateQueries({ queryKey: ['turf'] });
    }
  };

  const willWrite = check?.phase === 'done' ? check.created + check.merged : 0;
  const nothingNew = check?.phase === 'done' && willWrite === 0;
  // Nothing to write because everyone is already on file (vs. every row failed).
  const nothingToDo = nothingNew && check.unchanged > 0;
  const nothingValid = nothingNew && check.unchanged === 0;
  const hasAddress = mapping.includes('address');
  const imported = imp?.phase === 'done';
  const peopleLink = tagClean ? `/people?tag=${encodeURIComponent(tagClean)}` : '/people';

  const stepState = (n) => {
    const at = !source ? 1 : !check || check.phase !== 'done' ? (check ? 3 : 2) : nothingValid ? 3 : !imported && !nothingToDo ? 4 : 5;
    if (n < at) return 'done';
    return n === at ? 'now' : 'todo';
  };

  return (
    <div className="imp-page">
      <div className="page-head imp-head">
        <div>
          <Link to="/people" className="eyebrow imp-back">← People</Link>
          <h1>Import people</h1>
        </div>
      </div>
      <p className="imp-lead">
        Bring in a voters list, a donor list or a sign-up sheet. People you already have are matched by email,
        phone or address — Starbase fills in blanks and never overwrites what’s on file.
      </p>

      {/* ── 1. Choose ── */}
      <Step n={1} title="Choose your list" state={stepState(1)}>
        {source ? (
          <div className="imp-source">
            <p>
              <strong>{source.name}</strong>
              <span className="muted">
                {' '}· {plural(source.records.length, 'row', 'rows')} · {plural(source.headers.length, 'column', 'columns')}
                {' '}· {DELIM_NAMES[source.delimiter]}-separated
              </span>
            </p>
            <button type="button" className="btn imp-tap" onClick={startOver} disabled={busy}>
              {imported ? 'Import another file' : 'Choose a different file'}
            </button>
          </div>
        ) : (
          <>
            <p className="imp-hint">A CSV from Excel, Google Sheets or another campaign tool. The first row should be the column names.</p>
            <label
              htmlFor="imp-file"
              className={`imp-drop${dragOver ? ' is-over' : ''}${reading ? ' is-busy' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <input
                id="imp-file"
                className="imp-file-input"
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                onChange={onPick}
                disabled={reading}
              />
              <span className="btn btn-primary imp-tap imp-drop__btn">
                {reading ? 'Reading…' : 'Choose a CSV file'}
              </span>
              <span className="imp-drop__or">or drag it here</span>
            </label>
            {!pasteOpen ? (
              <button type="button" className="btn btn-quiet imp-tap" onClick={() => setPasteOpen(true)}>
                Paste CSV text instead
              </button>
            ) : (
              <div className="imp-paste">
                <div className="field">
                  <label htmlFor="imp-paste">Paste CSV text (header row first)</label>
                  <textarea
                    id="imp-paste"
                    className="input mono imp-paste__text"
                    rows={7}
                    spellCheck={false}
                    placeholder={'First Name,Last Name,Email,Street Address\nJane,Doe,jane@example.com,13450 104 Ave'}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                  />
                </div>
                <div className="imp-actions">
                  <button type="button" className="btn btn-primary imp-tap" onClick={usePaste}>Use this text</button>
                  <button type="button" className="btn btn-quiet imp-tap" onClick={() => setPasteOpen(false)}>Cancel</button>
                </div>
              </div>
            )}
          </>
        )}
        {loadError && <p className="error" role="alert">{loadError}</p>}
      </Step>

      {source && (
        <>
          {/* ── 2. Match columns ── */}
          <Step n={2} title="Match your columns" state={stepState(2)}>
            {imp ? (
              <p className="imp-summary">
                {fmtN(usedCount)} of {plural(source.headers.length, 'column', 'columns')} imported as{' '}
                {usedFields.join(', ')}
                {tagClean ? <> · everyone tagged <span className="chip imp-chip">{tagClean}</span></> : null}
              </p>
            ) : (
              <>
                <p className="imp-hint">
                  We guessed where each column goes. Check them and fix any that are wrong — {fmtN(usedCount)} of{' '}
                  {plural(source.headers.length, 'column', 'columns')} will be imported.
                </p>
                <ul className="imp-map">
                  {source.headers.map((h, i) => {
                    const id = `imp-col-${i}`;
                    const ex = examples[i] || [];
                    return (
                      <li key={i} className={`imp-map__row${mapping[i] ? ' is-used' : ''}`}>
                        <div className="imp-map__src">
                          <label htmlFor={id} className="imp-map__head">{h}</label>
                          <span className="imp-map__ex">{ex.length ? ex.join(' · ') : 'empty column'}</span>
                        </div>
                        <span className="imp-map__arrow" aria-hidden="true">→</span>
                        <select
                          id={id}
                          className="input imp-map__select"
                          value={mapping[i] || SKIP}
                          disabled={locked}
                          onChange={(e) => setField(i, e.target.value)}
                        >
                          <option value={SKIP}>Don’t import</option>
                          {FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                        {bumped?.col === i && (
                          <p className="imp-map__note" role="status">
                            Switched to Don’t import — {fieldLabel(bumped.key)} can only come from one column.
                          </p>
                        )}
                        {mapping[i] === 'rating' && badRatings > 0 && (
                          <p className="imp-map__note is-warn">
                            {plural(badRatings, 'rating isn’t', 'ratings aren’t')} on the scale ({SCALE}).{' '}
                            {badRatings === 1 ? 'That person comes' : 'Those people come'} in without a rating.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {!hasName && (
                  <p className="imp-need" role="alert">
                    Everyone needs a name. Match a column to <strong>Full name</strong>, or to <strong>First name</strong> and{' '}
                    <strong>Last name</strong>.
                  </p>
                )}

                <div className="field imp-tagfield">
                  <label htmlFor="imp-tag">Tag everyone in this file (optional)</label>
                  <div className="imp-tagrow">
                    <input
                      id="imp-tag"
                      className="input"
                      maxLength={TAG_MAX}
                      placeholder="voters-list-2026"
                      value={tag}
                      disabled={locked}
                      onChange={(e) => onTag(e.target.value)}
                    />
                    {fileTag && tagClean !== fileTag && !locked && (
                      <button type="button" className="btn btn-quiet imp-tap" onClick={() => onTag(fileTag)}>
                        Use “{fileTag}”
                      </button>
                    )}
                  </div>
                  <span className="imp-hint imp-hint--sm">Makes this list easy to find later in People.</span>
                </div>

                {hasName && rows.length > 0 && (
                  <div className="imp-preview">
                    <span className="eyebrow">Preview — first {Math.min(5, rows.length)} of {fmtN(rows.length)}</span>
                    <div className="imp-preview__scroll">
                      <table className="table imp-preview__table">
                        <thead>
                          <tr>
                            <th className="mono">Row</th>
                            {previewCols.map(([k, label]) => <th key={k}>{label}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.slice(0, 5).map(({ data, row, cells }) => {
                            const tags = [...new Set([...splitTags(data.tags), ...(tagClean ? [tagClean] : [])])];
                            const rawRating = ratingCol === -1 ? '' : String(cells[ratingCol] ?? '').trim();
                            return (
                              <tr key={row}>
                                <td className="mono muted">{row}</td>
                                {previewCols.map(([k]) => (
                                  <td key={k}>
                                    {k === 'name' ? (displayName(data) || <span className="danger-text">no name</span>)
                                      : k === 'address' ? (displayAddress(data) || <span className="muted">—</span>)
                                      : k === 'tags' ? (tags.length
                                        ? <span className="imp-tags">{tags.map((t) => <span key={t} className="chip">{t}</span>)}</span>
                                        : <span className="muted">—</span>)
                                      : k === 'rating' ? (data.rating
                                        ? <RatingChip code={data.rating} />
                                        : rawRating
                                          ? <span className="muted" title="Not on the scale — comes in without a rating"><s>{rawRating}</s> unrated</span>
                                          : <span className="muted">—</span>)
                                      : (data[k] || <span className="muted">—</span>)}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </Step>

          {/* ── 3. Check ── */}
          <Step n={3} title="Check before you import" state={stepState(3)}>
            {imp && check?.phase === 'done' ? (
              <p className="imp-summary">
                Checked: {fmtN(check.created)} new · {fmtN(check.merged)} to update · {fmtN(check.unchanged)} already up to date
                {check.invalid.length ? ` · ${fmtN(check.invalid.length)} can’t import` : ''}
              </p>
            ) : (
              <>
                {(!check || check.phase === 'error') && (
                  <>
                    <p className="imp-hint">See what will happen first. Nothing is saved yet.</p>
                    <button type="button" className="btn btn-primary imp-tap" onClick={runCheck} disabled={!hasName || busy || locked}>
                      Check {plural(rows.length, 'row', 'rows')}
                    </button>
                    {check?.phase === 'error' && <p className="error" role="alert">The check didn’t finish. {check.error}</p>}
              </>
            )}
            {check?.phase === 'running' && (
              <div className="imp-running" role="status" aria-live="polite">
                <Bar value={check.done} max={check.total} label="Checking" />
                <p className="imp-hint">Checking {fmtN(check.done)} of {fmtN(check.total)}…</p>
              </div>
            )}
            {check?.phase === 'done' && (
              <div className="imp-result" role="status">
                <Counts
                  items={[
                    ['New people', check.created, 'ok'],
                    ['Matched — will update', check.merged, null, 'already here; blanks filled, tags added'],
                    ['Already up to date', check.unchanged],
                    ['Can’t import', check.invalid.length, check.invalid.length ? 'danger' : null],
                  ]}
                />
                {check.parts > 1 && (
                  <p className="imp-hint imp-hint--sm">
                    Big file, so it was checked in parts — a few repeats far apart in the file may show as new here.
                  </p>
                )}
                {check.matches.length > 0 && (
                  <details className="imp-matches">
                    <summary>Who matches people already in Starbase</summary>
                    {check.merged > check.matches.length && (
                      <p className="imp-hint imp-hint--sm">The first {fmtN(check.matches.length)} of {fmtN(check.merged)}.</p>
                    )}
                    <ul>
                      {check.matches.map((d) => (
                        <li key={`${d.row}-${d.id}`}>
                          <span className="mono muted">Row {fmtN(d.row)}</span> {d.name}
                          {d.fields?.length ? <span className="muted"> — adds {d.fields.map((f) => FIELD_WORD[f] || f).join(', ')}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <InvalidList
                  invalid={check.invalid}
                  intro={`${plural(check.invalid.length, 'row', 'rows')} can’t be imported. Fix ${check.invalid.length === 1 ? 'it' : 'them'} in your spreadsheet and import the file again later${nothingValid ? '.' : ' — the rest import fine now.'}`}
                />
              </div>
            )}
              </>
            )}
          </Step>

          {/* ── 4. Import ── */}
          {check?.phase === 'done' && (
            <Step n={4} title="Import" state={stepState(4)}>
              {nothingToDo && !imp && (
                <p className="imp-hint">Nothing new to import — everyone in this file is already up to date.</p>
              )}
              {nothingValid && !imp && (
                <p className="imp-hint">
                  None of these rows can be imported yet. Fix the rows listed above — or match a different column — then
                  check again.
                </p>
              )}
              {!nothingNew && !imp && (
                <>
                  <p className="imp-hint">
                    This adds {plural(check.created, 'new person', 'new people')}
                    {check.merged ? ` and updates ${plural(check.merged, 'person', 'people')} already here` : ''}.
                  </p>
                  <button type="button" className="btn btn-primary imp-tap" onClick={() => runImport(0)}>
                    Import now
                  </button>
                </>
              )}
              {imp && (
                <div className="imp-running" role="status" aria-live="polite">
                  {imp.phase !== 'done' && <Bar value={imp.sent} max={imp.total} label="Importing" />}
                  {imp.phase === 'running' && (
                    <p className="imp-hint">Imported {fmtN(imp.sent)} of {fmtN(imp.total)} rows… keep this page open.</p>
                  )}
                  {imp.phase === 'error' && (
                    <>
                      <p className="error" role="alert">
                        Stopped at row {fmtN(source.records[imp.resumeAt]?.row ?? imp.resumeAt + 1)}. {imp.error}
                        {imp.sent > 0 ? ' Everything before it is saved.' : ''} People already imported won’t be doubled.
                      </p>
                      <button type="button" className="btn btn-primary imp-tap" onClick={() => runImport(imp.resumeAt)}>
                        Try the rest again
                      </button>
                    </>
                  )}
                  {imp.phase === 'done' && (
                    <>
                      <p className="imp-done">
                        Done. Added {plural(imp.created, 'person', 'people')}
                        {imp.merged ? `, updated ${fmtN(imp.merged)}` : ''}
                        {imp.unchanged ? `, ${fmtN(imp.unchanged)} already up to date` : ''}.
                      </p>
                      <InvalidList
                        invalid={imp.invalid}
                        intro={`${plural(imp.invalid.length, 'row was', 'rows were')} skipped. Fix ${imp.invalid.length === 1 ? 'it' : 'them'} in your spreadsheet and import the file again — no one will be doubled.`}
                      />
                    </>
                  )}
                  {(imp.phase === 'done' || imp.phase === 'error') && imp.created + imp.merged > 0 && (
                    <Link className="btn imp-tap" to={peopleLink}>
                      {tagClean ? `See “${tagClean}” in People` : 'See them in People'}
                    </Link>
                  )}
                </div>
              )}
            </Step>
          )}

          {/* ── 5. Place on the map ── */}
          {(imported || nothingToDo) && (
            <Step n={5} title="Place them on the map" state="now">
              {hasAddress ? (
                <>
                  <p className="imp-hint">
                    Starbase looks up each street address and drops a pin, so people show up on the map and in walk lists.
                    Big lists take a few minutes — keep this page open.
                  </p>
                  <GeocodeButton />
                </>
              ) : (
                <p className="imp-hint">
                  This list has no street addresses, so there’s nothing to place yet. Add someone’s address on their page in
                  People, then place them from the map.
                </p>
              )}
              <div className="imp-actions imp-next">
                <Link className="btn imp-tap" to="/map">Open the map</Link>
                <Link className="btn btn-quiet imp-tap" to="/turfs">Turfs and walk lists</Link>
              </div>
            </Step>
          )}
        </>
      )}
    </div>
  );
}
