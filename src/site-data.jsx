// Site 2.0 — data
//
// All entity seeds (pages, collections, experiments, forms) and
// decorative dashboards (donate funnel, audience, deploys, health) are
// empty. Pages read live records via useLiveRecords. The layer tree is
// a default editor scaffold (config), kept for the page builder.

// ── Seed: pages (kind 'page') ──────────────────────────────────────────
const SITE_PAGES = [
  {
    id: 'sp-home', route: '/', title: 'Home — Kestrel for BC [SAMPLE]', status: 'published',
    template: 'Landing · Hero', author: 'A. Reyes', updated: '2h ago',
    views7d: 18420, conv7d: 4.2, abTest: 'x-hero',
  },
  {
    id: 'sp-donate', route: '/donate', title: 'Chip in [SAMPLE]', status: 'published',
    template: 'Conversion', author: 'A. Reyes', updated: '1d ago',
    views7d: 6210, conv7d: 8.7, abTest: null,
  },
  {
    id: 'sp-issues-housing', route: '/issues/housing', title: 'Housing for working families [SAMPLE]', status: 'published',
    template: 'Issue page', author: 'M. Okafor', updated: '3d ago',
    views7d: 3940, conv7d: 2.1, abTest: null,
  },
  {
    id: 'sp-volunteer', route: '/volunteer', title: 'Join the team [SAMPLE]', status: 'in-review',
    template: 'Conversion', author: 'J. Lindqvist', updated: '5h ago',
    views7d: 1180, conv7d: 6.4, abTest: null,
  },
  {
    id: 'sp-events', route: '/events', title: 'Upcoming events [SAMPLE]', status: 'draft',
    template: 'CMS feed', author: 'M. Okafor', updated: '6d ago',
    views7d: 0, conv7d: null, abTest: null,
  },
];

const SITE_LAYER_TREE = [];
const SITE_COLLECTIONS = [];
const SITE_CMS_ISSUES = [];

// ── Seed: experiments (kind 'experiment') ──────────────────────────────
const SITE_EXPERIMENTS = [
  {
    id: 'sx-hero', name: 'Home hero headline [SAMPLE]', page: '/', metric: 'Donate CTR',
    status: 'running', runningDays: 9, visitors: 18420, winner: null,
    confidence: 0.62, lift: '+6.3%', pauseReason: null,
    variants: [
      { name: 'A', label: 'Control · "A fair shot"', rate: 4.10, conv: 378, visitors: 9210, avg: '' },
      { name: 'B', label: 'Variant · "It is time"',  rate: 4.55, conv: 419, visitors: 9210, avg: '' },
    ],
  },
  {
    id: 'sx-donate-amt', name: 'Donate default amount [SAMPLE]', page: '/donate', metric: 'Avg gift',
    status: 'won', runningDays: 21, visitors: 6210, winner: 'B',
    confidence: 0.97, lift: '+14.0%', pauseReason: null,
    variants: [
      { name: 'A', label: 'Default $25', rate: 8.20, conv: 255, visitors: 3105, avg: '$31' },
      { name: 'B', label: 'Default $40', rate: 9.35, conv: 290, visitors: 3105, avg: '$44' },
    ],
  },
  {
    id: 'sx-volunteer-form', name: 'Volunteer form length [SAMPLE]', page: '/volunteer', metric: 'Completion',
    status: 'paused', runningDays: 4, visitors: 1180, winner: null,
    confidence: 0.18, lift: '−2.1%', pauseReason: 'Sample too small — resuming after rally push.',
    variants: [
      { name: 'A', label: 'Long · 8 fields',  rate: 41.0, conv: 242, visitors: 590, avg: '' },
      { name: 'B', label: 'Short · 4 fields', rate: 40.1, conv: 237, visitors: 590, avg: '' },
    ],
  },
];

// ── Seed: forms (kind 'form') ──────────────────────────────────────────
const SITE_FORMS = [
  {
    id: 'sf-donate', name: 'Donation form [SAMPLE]', page: '/donate',
    fields: ['amount', 'name', 'email', 'postal', 'card'],
    completionTime: '1m 10s', submits7d: 541, views7d: 6210, complete: 8.7, errors: 6,
  },
  {
    id: 'sf-volunteer', name: 'Volunteer signup [SAMPLE]', page: '/volunteer',
    fields: ['name', 'email', 'phone', 'riding', 'availability', 'skills', 'consent', 'notes'],
    completionTime: '2m 30s', submits7d: 76, views7d: 1180, complete: 41.0, errors: 14,
  },
  {
    id: 'sf-rsvp', name: 'Event RSVP [SAMPLE]', page: '/events',
    fields: ['name', 'email', 'event', 'guests'],
    completionTime: '0m 45s', submits7d: 132, views7d: 2040, complete: 22.5, errors: 3,
  },
  {
    id: 'sf-contact', name: 'Contact the campaign [SAMPLE]', page: '/contact',
    fields: ['name', 'email', 'subject', 'message'],
    completionTime: '1m 50s', submits7d: 48, views7d: 910, complete: 15.2, errors: 2,
  },
];

const SITE_DONATE_FUNNEL = [];
const SITE_AUDIENCE = {
  uniques7d: 0, returning7d: 0, sessions7d: 0,
  topPages: [], devices: [], sources: [], geo: [],
};
const SITE_DEPLOYS = [];
const SITE_HEALTH = {
  uptime: '—', p95: '—', errors24h: 0, checks: [],
  // Lighthouse panel reads .lighthouse.{perf,a11y,bp,seo}.
  lighthouse: { perf: 0, a11y: 0, bp: 0, seo: 0 },
};

export { SITE_PAGES, SITE_LAYER_TREE, SITE_COLLECTIONS, SITE_CMS_ISSUES, SITE_EXPERIMENTS, SITE_FORMS, SITE_DONATE_FUNNEL, SITE_AUDIENCE, SITE_DEPLOYS, SITE_HEALTH };
