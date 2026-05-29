// Small shared helpers.

// Derive a person's current age from a date-of-birth string (any value the
// native <input type="date"> produces, i.e. 'YYYY-MM-DD', or anything Date
// can parse). Returns an integer, or null when dob is missing/unparseable.
// We store dob — not age — so the number never goes stale.
export function deriveAge(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

// Display age for a person/voter record: prefer the derived age from dob,
// falling back to a legacy stored `age` for records created before the switch.
export function ageOf(rec) {
  const a = deriveAge(rec?.dob);
  return a != null ? a : (rec?.age ?? null);
}
