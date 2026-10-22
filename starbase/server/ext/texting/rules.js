// The texting rules, in one place so the server and the tests agree:
// phone numbers, opt-out keywords, the first text's footer, quiet hours.
// No database, no network.

export const NO_TEXT_TAG = 'do-not-text';
export const NO_CONTACT_TAG = 'do-not-contact';
export const FOOTER = 'Reply STOP to opt out';
export const DEFAULT_TEMPLATE = "Hi {{first_name}}, it's {{my_name}} with {{campaign}}. Can we count on your support?";
export const DEFAULT_FROM = 9;   // texts may go from 9 am …
export const DEFAULT_UNTIL = 21; // … until 9 pm, campaign time
export const MAX_BODY = 1000;
export const PER_MINUTE = 20;    // one person tapping Send never gets near this

// E.164 (+16045550101) from whatever was typed; null when it can't be a
// number. An extension ("ext 2", "x2", "#2") is dropped, never dialled.
export const e164 = (raw) => {
  const s = String(raw ?? '').replace(/\s*(?:ext\.?|x|#).*$/i, '').trim();
  const plus = s.startsWith('+');
  const d = s.replace(/\D/g, '');
  if (!plus && d.length === 10 && /^[2-9]/.test(d)) return `+1${d}`;
  if (!plus && d.length === 11 && d[0] === '1') return `+${d}`;
  if (plus && d.length >= 8 && d.length <= 15) return `+${d}`;
  return null;
};

// "604-555-0101" for screens; anything else as given.
export const showPhone = (p) => {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(String(p || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(p || '');
};

// SQL: the digits of a free-typed persons.phone, extension dropped, so a
// reply from +16045550101 finds "604-555-0101", "(604) 555 0101" or "+1 604…".
export const PHONE_DIGITS_SQL = (col) =>
  `right(regexp_replace(regexp_replace(coalesce(${col}, ''), '\\s*(ext\\.?|x|#).*$', '', 'i'), '\\D', '', 'g'), 10)`;
export const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

// Opt-out and opt-in words. A reply that is only one of these (any case,
// trailing punctuation ignored) changes the number's status at once.
const STOP_WORDS = new Set([
  'STOP', 'STOPALL', 'STOP ALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT',
  'OPTOUT', 'OPT OUT', 'REVOKE', 'STOP PLEASE', 'PLEASE STOP', 'STOP TEXTING', 'STOP TEXTING ME',
]);
const START_WORDS = new Set(['START', 'UNSTOP']);
export const keywordOf = (body) => {
  const w = String(body ?? '').trim().replace(/[\s.!,;:)]+$/, '').replace(/\s+/g, ' ').toUpperCase();
  if (STOP_WORDS.has(w)) return 'stop';
  if (START_WORDS.has(w)) return 'start';
  return null;
};

// The first text in a conversation names the campaign and ends with the
// opt-out line. The footer is added here (once); naming the campaign is up
// to the sender — a first text that doesn't is refused, never rewritten.
export const namesCampaign = (body, campaign) =>
  String(body || '').toLowerCase().includes(String(campaign || '').trim().toLowerCase());
export const endsWithFooter = (body) => /reply stop to opt out\.?\s*$/i.test(String(body || ''));
export const withFooter = (body) => (endsWithFooter(body) ? String(body).trim() : `${String(body).trim()}\n${FOOTER}`);
export const hasBlanks = (body) => /\{\{[^}]*\}\}/.test(String(body || ''));

// Quiet hours: texts and campaign calls go only inside [from, until), in
// the campaign's time zone. Hours are whole (0–24).
export const localMinutes = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour')?.value) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value);
  return h * 60 + m;
};
export const isQuiet = (date, timeZone, from, until) => {
  const m = localMinutes(date, timeZone);
  return !(m >= from * 60 && m < until * 60);
};
export const hourWord = (h) => (h === 0 || h === 24 ? 'midnight' : h === 12 ? 'noon' : h < 12 ? `${h} am` : `${h - 12} pm`);
export const windowWord = (from, until) => (from === 0 && until === 24 ? 'any time' : `${hourWord(from)}–${hourWord(until)}`);

// The clock, swappable in tests (quiet hours depend on it).
let clock = () => new Date();
export const now = () => clock();
export const _setClockForTest = (fn) => { clock = fn || (() => new Date()); };
