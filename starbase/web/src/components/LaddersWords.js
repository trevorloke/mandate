// Ladders — the words a step is shown in. An email or a follow-up stores
// {{first_name}} / {{campaign}} (what the server fills in); every field and
// line on screen shows "[first name]" / "[campaign]" instead, and what's
// typed as those words is stored as the codes underneath. Plain JS (no JSX)
// so the server's tests can check it against the server's own fill-in.

export const FILLS = [
  { code: '{{first_name}}', word: '[first name]', button: '+ First name' },
  { code: '{{campaign}}', word: '[campaign]', button: '+ Campaign' },
];
const WORD = { first_name: '[first name]', campaign: '[campaign]' };
const CODES = /\{\{\s*(first_name|campaign)\s*\}\}/gi;

// "Hi {{ first_name }}" → "Hi [first name]".
export const toWords = (text) => String(text ?? '').replace(CODES, (_, k) => WORD[k.toLowerCase()]);
// "Hi [First name]" (or [first_name], [firstname]) → "Hi {{first_name}}".
export const toCodes = (text) => String(text ?? '')
  .replace(/\[\s*first[\s_-]*name\s*\]/gi, '{{first_name}}')
  .replace(/\[\s*campaign\s*\]/gi, '{{campaign}}');

// "{first_name} won't fill in — use + First name": anything in braces that
// isn't one of the two, or a [name] / [campaign …] that isn't either, would
// go out as typed. Takes the stored text (codes).
export const unfilled = (text) => {
  const rest = String(text || '').replace(CODES, '');
  const m = rest.match(/\{+[^{}\n]{0,40}\}*/) || rest.match(/[^\s{}]{0,40}\}+/)
    || rest.match(/\[[^[\]\n]{0,40}(?:name|camp)[^[\]\n]{0,40}\]/i);
  if (!m) return null;
  const use = /camp/i.test(m[0]) ? '+ Campaign' : /name/i.test(m[0]) ? '+ First name' : '+ First name or + Campaign';
  return `${m[0].trim()} won’t fill in — use ${use}`;
};

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const waitWords = (s) => plural(Number(s.n) || 0, s.unit === 'hours' ? 'hour' : 'day');

// One step as one line: "Wait 1 day", "Email · Thanks, [first name]".
export const stepLine = (s) => {
  if (!s) return '';
  if (s.kind === 'wait') return `Wait ${waitWords(s)}`;
  if (s.kind === 'email') return `Email · ${toWords(s.subject)}`;
  if (s.kind === 'tag') return `Tag · ${s.tag}`;
  if (s.kind === 'untag') return `Remove tag · ${s.tag}`;
  if (s.kind === 'followup') return `Follow-up · ${toWords(s.text)}`;
  return 'Stop';
};

// Under an email card: who it can reach, and how many said yes so far.
export const emailWho = (n) => `Goes only to people who said yes to email · ${
  Number.isFinite(n) ? `${plural(n, 'person', 'people')} said yes` : '…'}`;
