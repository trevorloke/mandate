// Mandate 2.0 — Ledger (Finance / QuickBooks) — data
//
// Seed entities (journal, accounts, bills, filings, assets) are uploaded
// via the seed pipeline and read live through useLiveRecords. The KPI
// strip / reconciliation / compliance / reports panels read the config
// blobs below.

export const LEDGER_KPIS = {
  cash:    { label: 'CASH ON HAND',        value: '—', delta: '', sub: '', tone: 'flat' },
  q2burn:  { label: 'Q2 BURN',             value: '—', delta: '', sub: '', tone: 'flat' },
  ar:      { label: 'PLEDGES OUTSTANDING', value: '—', delta: '', sub: '', tone: 'flat' },
  ap:      { label: 'BILLS DUE',           value: '—', delta: '', sub: '', tone: 'flat' },
  filing:  { label: 'NEXT FILING',         value: '—', delta: '', sub: '', tone: 'flat' },
  comp:    { label: 'COMPLIANCE',          value: '—', delta: '', sub: '', tone: 'flat' },
};

// ── Sample journal entries (kind 'journal') ─────────────────────
// Demo data — clearly synthetic, BC-Canadian-campaign flavoured.
// Required per record: numeric debit/credit/balance; string id/date/day/
// ref/memo/account/source/type/signed; bool flagged; splits[{acct,dr,cr}].
// `type` ∈ gift|bill|payroll|expense|adj|pledge. `account` begins with a
// chart-of-accounts code so the COA recent-activity feed can match it.
export const LEDGER_JOURNAL = [
  {
    id: 'JE-1042', date: '06-22', day: 'MON', ref: 'GIFT-8851', type: 'gift',
    memo: 'Yuki Tanaka — major gift', account: '1010 Operating cash',
    debit: 2500, credit: 0, balance: 617320, source: 'Raise', signed: 'auto', flagged: false, posted: true,
    splits: [
      { acct: '1010 Operating cash', dr: 2500, cr: 0 },
      { acct: '4010 Contributions — individuals', dr: 0, cr: 2500 },
    ],
  },
  {
    id: 'JE-1043', date: '06-22', day: 'MON', ref: 'GIFT-8852', type: 'gift',
    memo: 'Grace Wong — monthly sustainer', account: '1010 Operating cash',
    debit: 100, credit: 0, balance: 617420, source: 'Raise', signed: 'auto', flagged: false, posted: true,
    splits: [
      { acct: '1010 Operating cash', dr: 100, cr: 0 },
      { acct: '4010 Contributions — individuals', dr: 0, cr: 100 },
    ],
  },
  {
    id: 'JE-1044', date: '06-21', day: 'SUN', ref: 'PLDG-8853', type: 'pledge',
    memo: 'David Okafor — pledge commitment', account: '1310 Pledges receivable',
    debit: 25000, credit: 0, balance: 25000, source: 'Raise', signed: 'M.R.', flagged: false, posted: true,
    splits: [
      { acct: '1310 Pledges receivable', dr: 25000, cr: 0 },
      { acct: '4015 Pledged contributions', dr: 0, cr: 25000 },
    ],
  },
  {
    id: 'JE-1045', date: '06-20', day: 'SAT', ref: 'BILL-4471', type: 'bill',
    memo: 'Pacific Print Co. — lit drop run', account: '6210 Printing & literature',
    debit: 4820, credit: 0, balance: 4820, source: 'Bills', signed: 'M.R.', flagged: false, posted: true,
    splits: [
      { acct: '6210 Printing & literature', dr: 4820, cr: 0 },
      { acct: '2010 Accounts payable', dr: 0, cr: 4820 },
    ],
  },
  {
    id: 'JE-1046', date: '06-20', day: 'SAT', ref: 'PAY-2208', type: 'payroll',
    memo: 'Payroll run · Jun 6–20', account: '6010 Staff wages',
    debit: 18400, credit: 0, balance: 18400, source: 'Payroll', signed: 'M.R.', flagged: false, posted: true,
    splits: [
      { acct: '6010 Staff wages', dr: 18400, cr: 0 },
      { acct: '6015 Payroll — CPP/EI', dr: 1240, cr: 0 },
      { acct: '6018 Payroll — source deductions', dr: 0, cr: 1240 },
      { acct: '1010 Operating cash', dr: 0, cr: 18400 },
    ],
  },
  {
    id: 'JE-1047', date: '06-19', day: 'FRI', ref: 'EXP-3390', type: 'expense',
    memo: 'Field office — Mount Pleasant rent', account: '6230 Office & facilities',
    debit: 2200, credit: 0, balance: 2200, source: 'Expenses', signed: 'J.P.', flagged: false, posted: true,
    splits: [
      { acct: '6230 Office & facilities', dr: 2200, cr: 0 },
      { acct: '1010 Operating cash', dr: 0, cr: 2200 },
    ],
  },
  {
    id: 'JE-1048', date: '06-19', day: 'FRI', ref: 'GIFT-8849', type: 'gift',
    memo: 'Anonymous — walk-in cash', account: '1010 Operating cash',
    debit: 1600, credit: 0, balance: 619020, source: 'Raise', signed: 'M.R.',
    flagged: true, flagReason: 'Over Elections BC $1,400 individual cycle cap — held pending split or refund.', posted: true,
    splits: [
      { acct: '1010 Operating cash', dr: 1600, cr: 0 },
      { acct: '4010 Contributions — individuals', dr: 0, cr: 1600 },
    ],
  },
  {
    id: 'JE-1049', date: '06-18', day: 'THU', ref: 'ADJ-0117', type: 'adj',
    memo: 'Reclass — gala expenses to events', account: '6240 Events & meetings',
    debit: 0, credit: 900, balance: 900, source: 'Manual', signed: 'M.R.', flagged: false, posted: true,
    splits: [
      { acct: '6240 Events & meetings', dr: 900, cr: 0 },
      { acct: '6230 Office & facilities', dr: 0, cr: 900 },
    ],
  },
];

// ── Chart of accounts (kind 'account') ──────────────────────────
// Needs header rows (kind:'header') + child rows whose `parent` matches a
// header `code`. Every account: numeric `balance`, string code/name/kind.
// Must include 1010 (default-selected) and every code the new-entry modal
// templates reference (4010,6210,2010,6010,6015,6018,6230,1310,4015).
export const LEDGER_COA = [
  // Assets
  { code: '1000', name: 'Assets',                       kind: 'header', balance: 697220 },
  { code: '1010', name: 'Operating cash',              kind: 'asset', subkind: 'bank',  parent: '1000', balance: 614820 },
  { code: '1020', name: 'Savings · reserve',           kind: 'asset', subkind: 'bank',  parent: '1000', balance: 25000 },
  { code: '1310', name: 'Pledges receivable',          kind: 'asset', subkind: 'ar',    parent: '1000', balance: 25000 },
  { code: '1500', name: 'Equipment & assets',          kind: 'asset', subkind: 'fixed', parent: '1000', balance: 32400 },
  // Liabilities
  { code: '2000', name: 'Liabilities',                  kind: 'header', balance: 6060 },
  { code: '2010', name: 'Accounts payable',            kind: 'liability', subkind: 'ap', parent: '2000', balance: 4820 },
  { code: '2050', name: 'Payroll liabilities',         kind: 'liability', subkind: 'ap', parent: '2000', balance: 1240 },
  // Revenue
  { code: '4000', name: 'Revenue',                      kind: 'header', balance: -57085 },
  { code: '4010', name: 'Contributions — individuals', kind: 'revenue', subkind: 'gift',   parent: '4000', balance: -32085 },
  { code: '4015', name: 'Pledged contributions',       kind: 'revenue', subkind: 'pledge', parent: '4000', balance: -25000 },
  // Expenses
  { code: '6000', name: 'Expenses',                     kind: 'header', balance: 27560 },
  { code: '6010', name: 'Staff wages',                 kind: 'expense', subkind: 'payroll', parent: '6000', balance: 18400 },
  { code: '6015', name: 'Payroll — CPP/EI',            kind: 'expense', subkind: 'payroll', parent: '6000', balance: 1240 },
  { code: '6018', name: 'Payroll — source deductions', kind: 'expense', subkind: 'payroll', parent: '6000', balance: 0 },
  { code: '6210', name: 'Printing & literature',       kind: 'expense', subkind: 'field',   parent: '6000', balance: 4820 },
  { code: '6230', name: 'Office & facilities',         kind: 'expense', subkind: 'admin',   parent: '6000', balance: 1300 },
  { code: '6240', name: 'Events & meetings',           kind: 'expense', subkind: 'admin',   parent: '6000', balance: 900 },
];

// Bank reconciliation worksheet (config). rows[]: { id, date, desc, note?,
// ref, side('dr'|'cr'), amt:number, cleared:bool, flag?:bool }.
export const LEDGER_RECONCILE = {
  account: '1010 Operating cash', bank: 'Vancity Business Chequing',
  statementDate: 'May 31 2026',
  statementBalance: 614820.00, bookBalance: 614820.00, variance: 0,
  lastReconciled: 'Apr 30 2026', cleared: 0, outstanding: 0, totalEntries: 6,
  rows: [
    { id: 'rc-1', date: 'May 28', desc: 'Deposit — gala receipts', ref: 'DEP-2204', side: 'cr', amt: 8650.00, cleared: true },
    { id: 'rc-2', date: 'May 29', desc: 'Pacific Print Co.', note: 'cheque #1182', ref: 'CHQ-1182', side: 'dr', amt: 4820.00, cleared: false },
    { id: 'rc-3', date: 'May 30', desc: 'Payroll run', ref: 'PAY-2207', side: 'dr', amt: 18400.00, cleared: true },
    { id: 'rc-4', date: 'May 30', desc: 'Telus Business', note: 'cheque #1183', ref: 'CHQ-1183', side: 'dr', amt: 412.30, cleared: false },
    { id: 'rc-5', date: 'May 31', desc: 'Online donations batch', ref: 'DEP-2205', side: 'cr', amt: 3240.00, cleared: true },
    { id: 'rc-6', date: 'May 31', desc: 'Anvil Legal LLP', note: 'flagged — PO missing', ref: 'CHQ-1184', side: 'dr', amt: 5400.00, cleared: false, flag: true },
  ],
};

// ── Vendor bills (kind 'bill') ──────────────────────────────────
// Each record: numeric `amt`; string id/vendor/kind/due('YYYY-MM-DD')/
// approver/terms/status/notes. status ∈ open|review|flagged|paid.
export const LEDGER_BILLS = [
  { id: 'BILL-4471', vendor: 'Pacific Print Co.',   kind: 'Printing',     amt: 4820.00, due: '2026-06-28', approver: 'M.R.',  terms: 'Net 7',  status: 'open',    signed: 'signed',   urgent: true,  notes: 'Mount Pleasant lit drop · run of 12,000' },
  { id: 'BILL-4472', vendor: 'Burrard Digital',     kind: 'Digital ads',  amt: 3200.00, due: '2026-07-05', approver: 'J.P.',  terms: 'Net 15', status: 'open',    signed: 'signed',   urgent: false, notes: 'June social + search spend' },
  { id: 'BILL-4473', vendor: 'Strathcona Catering', kind: 'Events',       amt: 1875.50, due: '2026-07-02', approver: 'auto',  terms: 'Net 10', status: 'review',  signed: 'unsigned', urgent: false, notes: 'Spring gala balance · awaiting receipt' },
  { id: 'BILL-4474', vendor: 'Telus Business',      kind: 'Utilities',    amt: 412.30,  due: '2026-07-12', approver: 'auto',  terms: 'Net 30', status: 'open',    signed: 'signed',   urgent: false, notes: 'Field office phone + internet' },
  { id: 'BILL-4475', vendor: 'Anvil Legal LLP',     kind: 'Professional', amt: 5400.00, due: '2026-06-26', approver: 'M.R.',  terms: 'Net 7',  status: 'flagged', signed: 'unsigned', urgent: true,  notes: 'Compliance review · flag: PO missing' },
];

// Canadian regulator catalog is configuration, not data — kept as a
// reference list so filing-management UIs have jurisdictions to choose
// from. Counts/dates/amounts come from live filing records.
export const LEDGER_REGULATORS = [
  { id:'ebc', short:'Elections BC',      long:'Elections BC — Local Election Campaign Financing Act',
    role:'primary',  cycle:'Quarterly · Annual', filer:'Financial Agent', applies:'Provincial campaign' },
  { id:'cra', short:'CRA · T2',          long:'Canada Revenue Agency — non-profit return',
    role:'standard', cycle:'Annual',             filer:'Treasurer',       applies:'Federal · all entities' },
  { id:'gst', short:'GST / HST',         long:'CRA — GST/HST quarterly remittance',
    role:'standard', cycle:'Quarterly',           filer:'Bookkeeper',      applies:'Federal · taxable supplies' },
  { id:'pay', short:'T4 / T4A · Payroll',long:'CRA — Payroll source deductions',
    role:'standard', cycle:'Monthly · Annual T4', filer:'Bookkeeper',      applies:'Federal · employees' },
  { id:'wcb', short:'WorkSafeBC',         long:'WorkSafeBC — workers\' compensation premiums',
    role:'standard', cycle:'Quarterly',           filer:'Bookkeeper',      applies:'Provincial · employees' },
];

// ── Filings (kinds 'filing' [queue], 'filing_history', 'filing_current') ──
// queue[].regulator / history[].regulator / current.regulator MUST be ids
// from LEDGER_REGULATORS (ebc|cra|gst|pay|wcb).
export const LEDGER_FILINGS = {
  current: {
    id: 'EBC-Q2-2026',
    regulator: 'ebc',
    title: 'Q2 2026 campaign financing return',
    period: 'Q2 2026',
    due: '2026-07-31',
    daysToFile: 36,
    progress: 82,
    status: 'in-review',
    summary: { totalRevenue: 142850, totalExpense: 96420, netCash: 46430, itemizedDonations: 38 },
    schedules: [
      { id: 's1', code: 'A1', name: 'Contributions — individuals', items: 214, $: 121400, status: 'done' },
      { id: 's2', code: 'A2', name: 'Pledged contributions',       items: 6,   $: 25000,  status: 'done' },
      { id: 's3', code: 'B1', name: 'Campaign expenses',           items: 41,  $: 96420,  status: 'done' },
      { id: 's4', code: 'B2', name: 'Transfers',                   items: 0,   $: 0,      status: 'na' },
      { id: 's5', code: 'C1', name: 'Loans & guarantees',          items: 0,   $: 0,      status: 'na' },
      { id: 's6', code: 'D1', name: 'Anonymous / over-cap review', items: 1,   $: 1600,   status: 'flag', note: 'Walk-in cash over $1,400 cycle cap' },
    ],
    checks: [
      { id: 'c1', label: 'Debits equal credits', pass: true },
      { id: 'c2', label: 'All $100+ donors have full address', pass: true },
      { id: 'c3', label: 'No individual over $1,400 cap', pass: false, note: '1 contribution flagged for review' },
      { id: 'c4', label: 'Financial agent attestation', pass: true },
      { id: 'c5', label: 'Bank reconciliation locked', pass: false, note: 'Awaiting June statement' },
    ],
    activity: [
      { t: 'Jun 22 · 16:10', who: 'M. Reyes', what: 'Reviewed Schedule A1 — contributions reconciled' },
      { t: 'Jun 22 · 09:30', who: 'auto',     what: 'Cap check flagged 1 contribution (JE-1048)' },
      { t: 'Jun 20 · 14:02', who: 'J. Park',  what: 'Imported expense schedule from Bills' },
    ],
  },
  history: [
    { id: 'EBC-Q1-2026', regulator: 'ebc', period: 'Q1 2026', due: '2026-04-30', filed: 'Apr 24 2026', amount: 118200, flags: 0, auditor: 'Hawkins & Mei LLP', status: 'accepted' },
    { id: 'GST-Q1-2026', regulator: 'gst', period: 'Q1 2026', due: '2026-04-30', filed: 'Apr 28 2026', amount: 6240,   flags: 0, auditor: 'auto',              status: 'accepted' },
    { id: 'CRA-T2-2025', regulator: 'cra', period: 'FY 2025', due: '2026-03-31', filed: 'Mar 19 2026', amount: 0,      flags: 1, auditor: 'Hawkins & Mei LLP', status: 'accepted', annual: true },
  ],
  queue: [
    { id: 'EBC-Q2-2026',  regulator: 'ebc', period: 'Q2 2026 campaign return',     due: '2026-07-31', daysToFile: 36, owner: 'M. Reyes',        progress: 82, status: 'in-review', urgent: false },
    { id: 'GST-Q2-2026',  regulator: 'gst', period: 'Q2 2026 GST/HST remittance',  due: '2026-07-31', daysToFile: 36, owner: 'Bookkeeper',      progress: 40, status: 'open',      urgent: false },
    { id: 'PAY-JUN-2026', regulator: 'pay', period: 'June source deductions',      due: '2026-07-15', daysToFile: 20, owner: 'Anvil Legal LLP', progress: 60, status: 'open',      urgent: true, external: true },
  ],
};

// Compliance rules engine + audit log (config).
// scoreSeries: numbers (10-period trailing). rules[]: { id, area, rule,
// jurisdiction, windowed, detail?, checks:number, flagged:number,
// status: 'green'|'amber'|'red'|'inactive' }. audit[]: { t, who, area,
// what, resolution?, ref, sev: 'flag-cleared'|'open'|'info' }.
export const LEDGER_COMPLIANCE = {
  scoreSeries: [96.4, 96.8, 97.1, 97.0, 97.5, 97.9, 98.0, 98.2, 98.1, 98.4],
  rules: [
    { id: 'C-01', area: 'Contributions', rule: 'Individual contribution cap', jurisdiction: 'Elections BC', windowed: 'calendar year', detail: 'No individual may give more than $1,400 per cycle.', checks: 4213, flagged: 1, status: 'amber' },
    { id: 'C-02', area: 'Contributions', rule: 'Full address for $100+ gifts', jurisdiction: 'Elections BC', windowed: 'per gift', detail: 'Name + full address required for reportable contributions.', checks: 312, flagged: 0, status: 'green' },
    { id: 'C-03', area: 'Contributions', rule: 'No corporate / union donations', jurisdiction: 'Elections BC', windowed: 'always', detail: 'Only individuals resident in BC may contribute.', checks: 4213, flagged: 0, status: 'green' },
    { id: 'C-04', area: 'Reporting',     rule: 'Quarterly return filed on time', jurisdiction: 'Elections BC', windowed: 'quarterly', checks: 1, flagged: 0, status: 'green' },
    { id: 'C-05', area: 'Payroll',       rule: 'Source deductions remitted', jurisdiction: 'CRA', windowed: 'monthly', detail: 'CPP/EI/tax remitted by the 15th.', checks: 6, flagged: 0, status: 'green' },
    { id: 'C-06', area: 'Tax',           rule: 'GST/HST remittance current', jurisdiction: 'CRA', windowed: 'quarterly', checks: 2, flagged: 0, status: 'green' },
    { id: 'C-07', area: 'Spending',      rule: 'Writ-period expense limit', jurisdiction: 'Elections BC', windowed: 'writ period', detail: 'Active only during the formal campaign period.', checks: 0, flagged: 0, status: 'inactive' },
  ],
  audit: [
    { t: 'Jun 22 · 09:30', who: 'auto',     area: 'Contributions', what: 'Contribution over $1,400 cap detected on walk-in cash gift.', ref: 'JE-1048 · C-01', sev: 'open' },
    { t: 'Jun 21 · 14:05', who: 'M. Reyes', area: 'Contributions', what: 'Missing address on $250 gift resolved.', resolution: 'Donor record updated with full mailing address.', ref: 'g-0005 · C-02', sev: 'flag-cleared' },
    { t: 'Jun 20 · 11:18', who: 'auto',     area: 'Payroll',       what: 'June source deductions reconciled and queued for remittance.', ref: 'PAY-2208 · C-05', sev: 'info' },
  ],
};

// ── Assets (kind 'asset' = items; categories/summary are config) ─
// item record: id/name/cat/sn/acquired/cost:number/book:number/custodian/
//   status/loc + optional batch/deployed/plate/warranty/insurance/flag.
// `cat` MUST match a categories[].id below (so it buckets + shows a pill).
export const LEDGER_ASSETS = {
  summary: { totalValue: 26480, items: 5, categories: 4, depreciation: 5739, nextAudit: 'Sep 30 2026' },
  categories: [
    { id: 'tech',    label: 'Tech & devices',  cycle: 'audited quarterly' },
    { id: 'vehicle', label: 'Vehicles',        cycle: 'audited annually' },
    { id: 'field',   label: 'Field equipment', cycle: 'audited quarterly' },
    { id: 'office',  label: 'Office',          cycle: 'audited annually' },
  ],
  items: [
    { id: 'AS-001', name: 'MacBook Air M3', cat: 'tech', sn: 'C02-XK9-2026', acquired: '2026-01-12', cost: 1899, book: 1520, custodian: 'M. Reyes', status: 'in-use', loc: 'HQ · Mount Pleasant', warranty: 'AppleCare to 2029' },
    { id: 'AS-002', name: 'Canvass tablet fleet', cat: 'field', sn: 'BATCH-CT-26', acquired: '2026-02-03', cost: 6400, book: 5120, custodian: 'J. Park', status: 'in-use', loc: 'Field office', batch: 16, deployed: 12 },
    { id: 'AS-003', name: 'Campaign van — Transit', cat: 'vehicle', sn: 'VIN-2HG-...8841', acquired: '2025-11-20', cost: 18900, book: 15200, custodian: 'Logistics', status: 'in-use', loc: 'Burnaby depot', plate: 'BC · MW8 14C', insurance: 'ICBC fleet to 2027' },
    { id: 'AS-004', name: 'Event PA + staging kit', cat: 'field', sn: 'PA-KIT-03', acquired: '2026-03-15', cost: 3200, book: 2880, custodian: 'Events', status: 'in-use', loc: 'HQ storage' },
    { id: 'AS-005', name: 'Standing desks (x4)', cat: 'office', sn: 'OFF-DSK-26', acquired: '2026-01-30', cost: 2200, book: 1760, custodian: 'Office mgr', status: 'in-use', loc: 'HQ · Mount Pleasant', flag: 'One unit reported wobbly — inspect at next audit' },
  ],
};

// Financial reports (config). pnl[]: { q, rev:number, exp:number, partial? }.
// expenseMix[]: { cat, v:number, pct:number }. donorMix[]: { src, v, pct }.
// runway[]: { wk, cash:number, projected? }.
export const LEDGER_REPORTS = {
  pnl: [
    { q: 'Q1 25', rev: 184000, exp: 142000 },
    { q: 'Q2 25', rev: 168000, exp: 151000 },
    { q: 'Q3 25', rev: 142000, exp: 138000 },
    { q: 'Q4 25', rev: 211000, exp: 176000 },
    { q: 'Q1 26', rev: 198000, exp: 168000 },
    { q: 'Q2 26', rev: 142850, exp: 96420, partial: true },
  ],
  expenseMix: [
    { cat: 'Staff & payroll', v: 312000, pct: 41.0 },
    { cat: 'Field & canvass', v: 168000, pct: 22.1 },
    { cat: 'Digital & ads',   v: 121000, pct: 15.9 },
    { cat: 'Events',          v: 84000,  pct: 11.0 },
    { cat: 'Office & admin',  v: 46000,  pct: 6.0 },
    { cat: 'Professional',    v: 30000,  pct: 4.0 },
  ],
  donorMix: [
    { src: 'Major gifts',     v: 642000, pct: 45.2 },
    { src: 'Recurring',       v: 398000, pct: 28.0 },
    { src: 'Email & online',  v: 241000, pct: 17.0 },
    { src: 'Events',          v: 96000,  pct: 6.8 },
    { src: 'Other',           v: 43000,  pct: 3.0 },
  ],
  runway: [
    { wk: 'W1', cash: 689000 },
    { wk: 'W2', cash: 672000 },
    { wk: 'W3', cash: 651000 },
    { wk: 'W4', cash: 635000 },
    { wk: 'W5', cash: 622000 },
    { wk: 'W6', cash: 614820 },
    { wk: 'W7', cash: 598000, projected: true },
    { wk: 'W8', cash: 581000, projected: true },
    { wk: 'W9', cash: 563000, projected: true },
    { wk: 'W10', cash: 544000, projected: true },
  ],
};
