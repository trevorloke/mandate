// Charitable Impact number mechanics + Margin's honesty rules (spec §9, §11):
// % symbol, "to" for ranges, numerals for 10 and up, BC not B.C., and NEVER
// false precision — win probability is rounded to whole percents, seats to
// whole numbers, shares to one decimal. No bare point estimates in the UI.

export const pctInt = (x) => `${Math.round((x || 0) * 100)}%`;

// Honest rounding for headline odds: "about 6 in 10".
export const aboutInTen = (x) => `about ${Math.round((x || 0) * 10)} in 10`;

export const num = (n) => Math.round(n).toLocaleString('en-CA');

// Numerals for 10 and up; words for one to nine (CI house style).
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
export const counted = (n) => { const r = Math.round(n); return r >= 10 || r < 0 ? num(r) : WORDS[r]; };

// Range with "to" (never an en dash in copy).
export const range = (lo, hi, fmt = num) => `${fmt(lo)} to ${fmt(hi)}`;
export const share1 = (x) => `${(x * 100).toFixed(1)}%`;     // one decimal for vote share
export const seatRange = (lo, hi) => `${Math.round(lo)} to ${Math.round(hi)}`;

// A signed point string, e.g. "+3 pts" / "-2 pts".
export const pts = (x) => `${x > 0 ? '+' : ''}${Math.round(x * 100)} pts`;
