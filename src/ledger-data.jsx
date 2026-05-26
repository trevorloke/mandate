// Mandate 2.0 — Ledger (Finance / QuickBooks) — data
//
// All entity seeds and decorative dashboard blobs are empty. Pages read
// entity records (journal, accounts, bills, filings, assets) live from
// the database via useLiveRecords. The KPI strip / reconciliation /
// compliance / reports panels render empty frames until real data exists.

export const LEDGER_KPIS = {
  cash:    { label: 'CASH ON HAND',        value: '—', delta: '', sub: '', tone: 'flat' },
  q2burn:  { label: 'Q2 BURN',             value: '—', delta: '', sub: '', tone: 'flat' },
  ar:      { label: 'PLEDGES OUTSTANDING', value: '—', delta: '', sub: '', tone: 'flat' },
  ap:      { label: 'BILLS DUE',           value: '—', delta: '', sub: '', tone: 'flat' },
  filing:  { label: 'NEXT FILING',         value: '—', delta: '', sub: '', tone: 'flat' },
  comp:    { label: 'COMPLIANCE',          value: '—', delta: '', sub: '', tone: 'flat' },
};

export const LEDGER_JOURNAL = [];
export const LEDGER_COA = [];
export const LEDGER_RECONCILE = {
  account: '—', bank: '—', statementDate: '',
  statementBalance: 0, bookBalance: 0, variance: 0,
  lastReconciled: '', cleared: 0, outstanding: 0, totalEntries: 0,
  rows: [],
};
export const LEDGER_BILLS = [];

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

export const LEDGER_FILINGS = { current: null, history: [], queue: [] };
export const LEDGER_COMPLIANCE = { scoreSeries: [], rules: [], audit: [] };
export const LEDGER_ASSETS = {
  summary: { totalValue: 0, items: 0, categories: 0, depreciation: 0, nextAudit: '' },
  categories: [],
  items: [],
};
export const LEDGER_REPORTS = { pnl: [], expenseMix: [], donorMix: [], runway: [] };
