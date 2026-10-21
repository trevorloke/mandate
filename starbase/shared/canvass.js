// Canvass + field constants — one shared vocabulary for server validation
// and web rendering. The rating scale is the campaign's own doorstep scale.

export const RATINGS = [
  { code: '1',  label: 'Strong support',   short: '1',  band: 'support' },
  { code: '2',  label: 'Lean support',     short: '2',  band: 'support' },
  { code: '3',  label: 'Undecided',        short: '3',  band: 'undecided' },
  { code: '4',  label: 'Opposed — support unknown',                      short: '4',  band: 'opposed' },
  { code: '4D', label: 'Opposed — Doug McCallum supporter',              short: '4D', band: 'opposed' },
  { code: '4B', label: 'Opposed — Surrey Connect / Brenda Locke',        short: '4B', band: 'opposed' },
  { code: '4F', label: 'Opposed — Surrey First / Linda Annis',           short: '4F', band: 'opposed' },
  { code: '4N', label: 'Opposed — SurreyNow / Troy van Vliet',           short: '4N', band: 'opposed' },
  { code: '4C', label: 'Opposed — Surrey Conservatives / Honveer Randhawa', short: '4C', band: 'opposed' },
];
export const RATING_CODES = RATINGS.map((r) => r.code);
export const ratingByCode = (c) => RATINGS.find((r) => r.code === c) || null;

export const CHANNELS = ['door', 'phone', 'text'];
export const OUTCOMES = ['contacted', 'no_answer', 'refused', 'moved', 'inaccessible'];

export const SIGN_KINDS = [
  { code: 'billboard', label: 'Billboard (4×8)' },
  { code: 'large',     label: 'Large sign (4×4)' },
  { code: 'lawn',      label: 'Lawn sign' },
];
export const SIGN_KIND_CODES = SIGN_KINDS.map((s) => s.code);
export const SIGN_STATUSES = ['requested', 'installed', 'removed'];

export const VOLUNTEER_ROLES = [
  { code: 'driver',              label: 'Driver' },
  { code: 'scrutineer',          label: 'Scrutineer' },
  { code: 'doorknocking',        label: 'Doorknocking' },
  { code: 'mainstreeting',       label: 'Mainstreeting' },
  { code: 'phoning',             label: 'Phoning' },
  { code: 'data_entry',          label: 'Data entry' },
  { code: 'event_hosting',       label: 'Event hosting' },
  { code: 'zone_house_captain',  label: 'Zone house captain' },
  { code: 'highrise_captain',    label: 'Hi-rise building captain', detail: 'Building (name or address)' },
  { code: 'food',                label: 'Food' },
  { code: 'translation',         label: 'Translation', detail: 'Language' },
  { code: 'burmashave',          label: 'Burmashave' },
  { code: 'community_committee', label: 'Community committee', detail: 'Community (Newton, Whalley, …)' },
  { code: 'policy',              label: 'Policy' },
  { code: 'administration',      label: 'Administration' },
];
export const VOLUNTEER_ROLE_CODES = VOLUNTEER_ROLES.map((r) => r.code);

export const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'x', 'tiktok', 'youtube', 'linkedin', 'bluesky', 'other'];

// Tags are free-form; these seed the picker so the vocabulary stays consistent.
export const SUGGESTED_TAGS = [
  'media', 'VIP', 'endorser', 'host', 'donor-prospect', 'lapsed',
  'newsletter', 'petition', 'youth', 'senior', 'business', 'faith',
  'union', 'do-not-contact',
];

// Donor tiers, derived from real gifts — never self-declared.
//   star:      $1,000+ in the calendar year, or $100+/mo recurring
//   superstar: $3,000+ in the calendar year, or $250+/mo recurring
export const DONOR_TIERS = {
  star:      { yearCents: 100000, monthlyCents: 10000, label: 'Star' },
  superstar: { yearCents: 300000, monthlyCents: 25000, label: 'Superstar' },
};

export const donorTier = ({ yearCents = 0, monthlyCents = 0 }) => {
  if (yearCents >= DONOR_TIERS.superstar.yearCents || monthlyCents >= DONOR_TIERS.superstar.monthlyCents) return 'superstar';
  if (yearCents >= DONOR_TIERS.star.yearCents || monthlyCents >= DONOR_TIERS.star.monthlyCents) return 'star';
  if (monthlyCents > 0) return 'monthly';
  if (yearCents > 0) return 'one-time';
  return null;
};

export const SHIFT_STATUSES = ['assigned', 'confirmed', 'declined', 'no_show', 'completed'];
