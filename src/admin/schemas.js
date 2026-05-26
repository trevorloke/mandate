// Field schemas for the most-edited entity types.
// Keyed by `${module}.${kind}`. Buckets without a schema fall back to the JSON editor.
//
// Field types:
//   text, textarea, number, select, multiselect, boolean, tags, date, currency, percent
//
// `idPrefix` (optional): when creating a new record, the form pre-fills the
// required `id` field with `${idPrefix}-${random}`. Omit to require manual entry
// (e.g. ledger.account where `code` carries semantic meaning).

export const SCHEMAS = {
  // ── Ground ───────────────────────────────────────────────
  'ground.voter': {
    label: 'Voter', idPrefix: 'V',
    fields: [
      { key: 'id',         label: 'ID',          type: 'text', required: true, mono: true, half: true },
      { key: 'pd',         label: 'Polling district', type: 'text', half: true, placeholder: 'PD-009' },
      { key: 'first',      label: 'First name',  type: 'text', required: true, half: true },
      { key: 'last',       label: 'Last name',   type: 'text', required: true, half: true },
      { key: 'age',        label: 'Age',         type: 'number', half: true },
      { key: 'household',  label: 'Household',   type: 'number', half: true },
      { key: 'addr',       label: 'Address',     type: 'text' },
      { key: 'tenure',     label: 'Tenure',      type: 'select', options: ['renter', 'owner', 'unknown'], half: true },
      { key: 'lang',       label: 'Language',    type: 'text', half: true, placeholder: 'English' },
      { key: 'support',    label: 'Support',     type: 'number', step: 0.01, min: 0, max: 1, half: true, hint: '0–1' },
      { key: 'ballots',    label: 'Ballots',     type: 'text',  half: true, placeholder: '2/6' },
      { key: 'issue',      label: 'Top issue',   type: 'select', options: ['housing', 'transit', 'climate', 'childcare', 'public safety', 'cost of living', 'health', 'education'] },
      { key: 'lastContact',label: 'Last contact',type: 'text', placeholder: '2d ago' },
      { key: 'tags',       label: 'Tags',        type: 'tags' },
    ],
  },

  'ground.canvasser': {
    label: 'Canvasser', idPrefix: 'CV',
    fields: [
      { key: 'id',     label: 'ID',     type: 'text', required: true, mono: true, half: true },
      { key: 'name',   label: 'Name',   type: 'text', required: true, half: true },
      { key: 'pd',     label: 'PD',     type: 'text', half: true },
      { key: 'status', label: 'Status', type: 'select', options: ['live', 'on-break', 'off'], half: true },
      { key: 'doors',  label: 'Doors today', type: 'number', half: true },
      { key: 'lift',   label: 'Lift score',  type: 'number', step: 0.01, half: true },
    ],
  },

  'ground.pd': {
    label: 'Polling district', idPrefix: 'PD',
    fields: [
      { key: 'id',      label: 'ID',         type: 'text', required: true, mono: true, half: true },
      { key: 'name',    label: 'Name',       type: 'text', required: true, half: true },
      { key: 'support', label: 'Support',    type: 'number', step: 0.01, min: 0, max: 1, half: true, hint: '0–1' },
      { key: 'turnout', label: 'Turnout',    type: 'number', step: 0.01, min: 0, max: 1, half: true, hint: '0–1' },
      { key: 'doors',   label: 'Total doors',type: 'number', half: true },
      { key: 'knocked', label: 'Knocked',    type: 'number', half: true },
      { key: 'target',  label: 'Target PD',  type: 'boolean', half: true },
      { key: 'points',  label: 'Polygon points', type: 'textarea', hint: 'SVG points string for map polygon' },
    ],
  },

  'ground.script': {
    label: 'Canvasser script', idPrefix: 'sc',
    fields: [
      { key: 'id',      label: 'ID',      type: 'text', required: true, mono: true, half: true },
      { key: 'title',   label: 'Title',   type: 'text', required: true, half: true },
      { key: 'mode',    label: 'Mode',    type: 'select', options: ['door-knock', 'phone', 'sms', 'social'], half: true },
      { key: 'issue',   label: 'Issue',   type: 'text', half: true },
      { key: 'author',  label: 'Author',  type: 'text', half: true },
      { key: 'updated', label: 'Updated', type: 'text', half: true, placeholder: 'v4.2 · today' },
    ],
  },

  'ground.shift': {
    label: 'Shift', idPrefix: 'sh',
    fields: [
      { key: 'id',     label: 'ID',     type: 'text', required: true, mono: true, half: true },
      { key: 'pd',     label: 'PD',     type: 'text', half: true },
      { key: 'day',    label: 'Day',    type: 'text', half: true, placeholder: 'SAT' },
      { key: 'date',   label: 'Date',   type: 'date', half: true },
      { key: 'start',  label: 'Start',  type: 'text', half: true, placeholder: '13:00' },
      { key: 'end',    label: 'End',    type: 'text', half: true, placeholder: '17:00' },
      { key: 'mode',   label: 'Mode',   type: 'select', options: ['canvass', 'lit-drop', 'phone-bank', 'text-bank', 'GOTV'], half: true },
      { key: 'captain',label: 'Captain',type: 'text', half: true },
      { key: 'need',   label: 'Need',   type: 'number', half: true },
      { key: 'filled', label: 'Filled', type: 'number', half: true },
    ],
  },

  // ── Raise ────────────────────────────────────────────────
  'raise.donor': {
    label: 'Donor', idPrefix: 'd',
    fields: [
      { key: 'id',     label: 'ID',     type: 'text', required: true, mono: true, half: true },
      { key: 'name',   label: 'Name',   type: 'text', required: true, half: true },
      { key: 'email',  label: 'Email',  type: 'text', half: true },
      { key: 'phone',  label: 'Phone',  type: 'text', half: true },
      { key: 'amount', label: 'Last gift', type: 'currency', half: true },
      { key: 'cumulative', label: 'Cumulative', type: 'currency', half: true },
      { key: 'tier',   label: 'Tier',   type: 'select', options: ['major', 'recurring', 'one-time', 'lapsed', 'prospect'], half: true },
      { key: 'recurring', label: 'Recurring',  type: 'boolean', half: true },
      { key: 'lastGift', label: 'Last gift date', type: 'date', half: true },
      { key: 'firstGift', label: 'First gift',    type: 'date', half: true },
      { key: 'tags',   label: 'Tags',   type: 'tags' },
      { key: 'note',   label: 'Note',   type: 'textarea' },
    ],
  },

  'raise.prospect': {
    label: 'Prospect', idPrefix: 'p',
    fields: [
      { key: 'id',        label: 'ID',         type: 'text', required: true, mono: true, half: true },
      { key: 'name',      label: 'Name',       type: 'text', required: true, half: true },
      { key: 'employer',  label: 'Employer',   type: 'text', half: true },
      { key: 'role',      label: 'Role',       type: 'text', half: true },
      { key: 'ask',       label: 'Ask amount', type: 'currency', half: true },
      { key: 'committed', label: 'Committed',  type: 'currency', half: true },
      { key: 'stage',     label: 'Stage',      type: 'select', options: ['Queued', 'In discussion', 'Verbal yes', 'Delivered', 'Lost'], half: true },
      { key: 'stageKey',  label: 'Stage key',  type: 'select', options: ['queued', 'discussing', 'committed', 'delivered', 'lost'], half: true },
      { key: 'officer',   label: 'Officer',    type: 'text', half: true },
      { key: 'nextMove',  label: 'Next move',  type: 'text', half: true },
      { key: 'note',      label: 'Note',       type: 'textarea' },
    ],
  },

  'raise.pledge': {
    label: 'Pledge', idPrefix: 'pl',
    fields: [
      { key: 'id',        label: 'ID',           type: 'text', required: true, mono: true, half: true },
      { key: 'name',      label: 'Donor name',   type: 'text', required: true, half: true },
      { key: 'ask',       label: 'Pledge amount',type: 'currency', half: true },
      { key: 'committed', label: 'Committed',    type: 'currency', half: true },
      { key: 'stage',     label: 'Stage',        type: 'select', options: ['Verbal yes', 'Delivered', 'Lost'], half: true },
      { key: 'officer',   label: 'Officer',      type: 'text', half: true },
      { key: 'note',      label: 'Note',         type: 'textarea' },
    ],
  },

  'raise.gift': {
    label: 'Gift', idPrefix: 'g',
    fields: [
      { key: 'id',       label: 'ID',       type: 'text', required: true, mono: true, half: true },
      { key: 'donor',    label: 'Donor',    type: 'text', required: true, half: true },
      { key: 'amount',   label: 'Amount',   type: 'currency', required: true, half: true },
      { key: 'date',     label: 'Date',     type: 'date', half: true },
      { key: 'fund',     label: 'Fund',     type: 'select', options: ['General', 'Major gift', 'Recurring', 'Capital', 'Pledge fulfilment'], half: true },
      { key: 'method',   label: 'Method',   type: 'select', options: ['Cheque', 'Card', 'Wire', 'Cash', 'In-kind', 'ACH'], half: true },
      { key: 'source',   label: 'Source',   type: 'select', options: ['Web', 'Event', 'Direct mail', 'Phone', 'Major gift officer', 'Recurring batch'], half: true },
      { key: 'officer',  label: 'Officer',  type: 'text', half: true },
      { key: 'note',     label: 'Note',     type: 'textarea' },
    ],
  },

  // ── Ledger ───────────────────────────────────────────────
  'ledger.journal': {
    label: 'Journal entry', idPrefix: 'JE',
    fields: [
      { key: 'id',     label: 'JE #',     type: 'text', required: true, mono: true, half: true, placeholder: 'JE-3142' },
      { key: 'ref',    label: 'Ref',      type: 'text', mono: true, half: true, placeholder: 'GIFT-8841' },
      { key: 'date',   label: 'Date',     type: 'text', half: true, placeholder: '04-22', hint: 'MM-DD' },
      { key: 'day',    label: 'Day',      type: 'select', options: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], half: true },
      { key: 'memo',   label: 'Memo',     type: 'text' },
      { key: 'account',label: 'Account',  type: 'text', placeholder: '4010 Donations · Major' },
      { key: 'source', label: 'Source',   type: 'select', options: ['Manual', 'Raise', 'Bills', 'Payroll', 'Expenses', 'Bank import'], half: true },
      { key: 'type',   label: 'Type',     type: 'select', options: ['gift', 'bill', 'payroll', 'expense', 'adj', 'pledge'], half: true },
      { key: 'debit',  label: 'Debit',    type: 'currency', half: true },
      { key: 'credit', label: 'Credit',   type: 'currency', half: true },
      { key: 'balance',label: 'Balance',  type: 'currency', half: true },
      { key: 'signed', label: 'Signed by',type: 'text', half: true, placeholder: 'M.R. or auto' },
      { key: 'posted', label: 'Posted',   type: 'boolean', half: true },
      { key: 'flagged',label: 'Flagged',  type: 'boolean', half: true },
      { key: 'flagReason', label: 'Flag reason', type: 'textarea' },
    ],
  },

  'ledger.account': {
    label: 'Account (COA)',
    fields: [
      { key: 'code',    label: 'Code',    type: 'text', required: true, mono: true, half: true, placeholder: '1010' },
      { key: 'name',    label: 'Name',    type: 'text', required: true, half: true },
      { key: 'parent',  label: 'Parent code', type: 'text', mono: true, half: true },
      { key: 'kind',    label: 'Kind',    type: 'select', options: ['header', 'asset', 'liability', 'equity', 'revenue', 'expense', 'contra'], half: true },
      { key: 'subkind', label: 'Subkind', type: 'select', options: ['', 'bank', 'cash', 'ar', 'ap', 'contra', 'fixed', 'asset', 'revenue', 'expense'], half: true },
      { key: 'balance', label: 'Balance', type: 'currency', half: true },
    ],
  },

  'ledger.bill': {
    label: 'Bill', idPrefix: 'BILL',
    fields: [
      { key: 'id',       label: 'ID',       type: 'text', required: true, mono: true, half: true },
      { key: 'vendor',   label: 'Vendor',   type: 'text', required: true, half: true },
      { key: 'kind',     label: 'Category', type: 'text', half: true, placeholder: 'Field · Materials' },
      { key: 'amt',      label: 'Amount',   type: 'currency', half: true },
      { key: 'due',      label: 'Due',      type: 'date', half: true },
      { key: 'issued',   label: 'Issued',   type: 'date', half: true },
      { key: 'status',   label: 'Status',   type: 'select', options: ['open', 'approved', 'paid', 'overdue', 'disputed'], half: true },
      { key: 'terms',    label: 'Terms',    type: 'text', half: true, placeholder: 'Net 7' },
      { key: 'approver', label: 'Approver', type: 'text', half: true },
      { key: 'urgent',   label: 'Urgent',   type: 'boolean', half: true },
      { key: 'signed',   label: 'Signed',   type: 'select', options: ['unsigned', 'signed', 'reviewed'], half: true },
      { key: 'notes',    label: 'Notes',    type: 'textarea' },
    ],
  },

  'ledger.filing': {
    label: 'Filing', idPrefix: 'FIL',
    fields: [
      { key: 'id',        label: 'ID',         type: 'text', required: true, mono: true, half: true },
      { key: 'regulator', label: 'Regulator',  type: 'select', options: ['ebc', 'cra', 'gst', 'wcb', 'provincial'], half: true },
      { key: 'period',    label: 'Period',     type: 'text', half: true, placeholder: 'Q2 2026 GST' },
      { key: 'due',       label: 'Due',        type: 'date', half: true },
      { key: 'daysToFile',label: 'Days to file', type: 'number', half: true },
      { key: 'status',    label: 'Status',     type: 'select', options: ['queued', 'ready', 'filed', 'overdue'], half: true },
      { key: 'progress',  label: 'Progress %', type: 'number', min: 0, max: 100, half: true },
      { key: 'urgent',    label: 'Urgent',     type: 'boolean', half: true },
      { key: 'owner',     label: 'Owner',      type: 'text', half: true },
      { key: 'external',  label: 'External',   type: 'boolean', half: true },
    ],
  },

  'ledger.asset': {
    label: 'Asset', idPrefix: 'AST',
    fields: [
      { key: 'id',        label: 'ID',        type: 'text', required: true, mono: true, half: true },
      { key: 'name',      label: 'Name',      type: 'text', required: true, half: true },
      { key: 'cat',       label: 'Category',  type: 'select', options: ['tech', 'signs', 'office', 'vehicles', 'av', 'misc'], half: true },
      { key: 'sn',        label: 'Serial / batch', type: 'text', mono: true, half: true },
      { key: 'acquired',  label: 'Acquired',  type: 'date', half: true },
      { key: 'cost',      label: 'Cost',      type: 'currency', half: true },
      { key: 'book',      label: 'Book value',type: 'currency', half: true },
      { key: 'status',    label: 'Status',    type: 'select', options: ['in-use', 'storage', 'disposed', 'lost'], half: true },
      { key: 'loc',       label: 'Location',  type: 'text', half: true },
      { key: 'custodian', label: 'Custodian', type: 'text', half: true },
      { key: 'flag',      label: 'Flag',      type: 'text', half: true },
    ],
  },

  // ── Coalition ───────────────────────────────────────────
  'coalition.endorsement': {
    label: 'Endorsement', idPrefix: 'EN',
    fields: [
      { key: 'id',       label: 'ID',       type: 'text', required: true, mono: true, half: true },
      { key: 'org',      label: 'Org',      type: 'text', required: true, half: true },
      { key: 'slug',     label: 'Org slug', type: 'text', mono: true, half: true, hint: 'matches coalition.org slug' },
      { key: 'sector',   label: 'Sector',   type: 'select', options: ['Labour', 'Business', 'Civic', 'Faith', 'Cultural', 'Health', 'Education', 'Environment', 'Other'], half: true },
      { key: 'champion', label: 'Champion (contact)', type: 'text', half: true },
      { key: 'status',   label: 'Status',   type: 'select', options: ['public', 'committed', 'warm', 'prospect', 'hostile', 'queued', 'in-discussion', 'verbal-yes', 'delivered', 'lost'], half: true },
      { key: 'reach',    label: 'Reach',    type: 'number', half: true },
      { key: 'members',  label: 'Members',  type: 'number', half: true },
      { key: 'money',    label: 'Money',    type: 'currency', half: true },
      { key: 'note',     label: 'Note',     type: 'textarea' },
    ],
  },

  'coalition.org': {
    label: 'Coalition org', idPrefix: 'org', idField: 'slug',
    fields: [
      { key: 'slug',      label: 'Slug',   type: 'text', required: true, mono: true, half: true, placeholder: 'bcfl' },
      { key: 'short',     label: 'Short',  type: 'text', half: true, placeholder: 'BCFL' },
      { key: 'name',      label: 'Name',   type: 'text', required: true },
      { key: 'sector',    label: 'Sector', type: 'select', options: ['Labour', 'Business', 'Civic', 'Faith', 'Cultural', 'Health', 'Education', 'Environment', 'Other'], half: true },
      { key: 'members',   label: 'Members',type: 'number', half: true },
      { key: 'reach',     label: 'Reach',  type: 'number', half: true },
      { key: 'champion',  label: 'Champion (contact)', type: 'text', half: true },
      { key: 'website',   label: 'Website',type: 'text' },
      { key: 'briefing',  label: 'Briefing', type: 'textarea' },
    ],
  },

  'coalition.ask': {
    label: 'Coalition ask', idPrefix: 'A',
    fields: [
      { key: 'id',     label: 'ID',     type: 'text', required: true, mono: true, half: true },
      { key: 'orgId',  label: 'Org ID', type: 'text', mono: true, half: true },
      { key: 'stage',  label: 'Stage',  type: 'select', options: ['Queued', 'In discussion', 'Verbal yes', 'Delivered', 'Lost'], half: true },
      { key: 'owner',  label: 'Owner',  type: 'text', half: true },
      { key: 'ask',    label: 'Ask',    type: 'text', required: true },
      { key: 'dueBy',  label: 'Due by', type: 'date', half: true },
      { key: 'value',  label: 'Value',  type: 'currency', half: true },
      { key: 'note',   label: 'Note',   type: 'textarea' },
    ],
  },

  'coalition.comm': {
    label: 'Communication', idPrefix: 'comm',
    fields: [
      { key: 'id',     label: 'ID',       type: 'text', mono: true, half: true },
      { key: 'org',    label: 'Org',      type: 'text', required: true, half: true },
      { key: 'kind',   label: 'Kind',     type: 'select', options: ['event', 'call', 'meeting', 'email', 'letter', 'press'], half: true },
      { key: 'd',      label: 'Date',     type: 'text', half: true, placeholder: '04-22', hint: 'MM-DD' },
      { key: 't',      label: 'Time',     type: 'text', half: true, placeholder: '09:00' },
      { key: 'who',    label: 'Who',      type: 'text', half: true },
      { key: 'dur',    label: 'Duration', type: 'text', half: true, placeholder: '90m' },
      { key: 'what',   label: 'What',     type: 'textarea' },
    ],
  },

  // ── Civic ───────────────────────────────────────────────
  'civic.bill': {
    label: 'Bill', idPrefix: 'cb',
    fields: [
      { key: 'id',     label: 'ID',     type: 'text', required: true, mono: true, half: true },
      { key: 'no',     label: 'Bill #', type: 'text', half: true },
      { key: 'title',  label: 'Title',  type: 'text', required: true },
      { key: 'sponsor', label: 'Sponsor', type: 'text', half: true },
      { key: 'stage',  label: 'Stage',  type: 'select', options: ['1R', '2R', 'Committee', '3R', 'Royal Assent'], half: true },
      { key: 'whip',   label: 'Whip',   type: 'select', options: ['free', 'one-line', 'two-line', 'three-line'], half: true },
      { key: 'myVote', label: 'My vote',type: 'select', options: ['', 'aye', 'nay', 'abstain'], half: true },
      { key: 'summary',label: 'Summary',type: 'textarea' },
    ],
  },

  'civic.case': {
    label: 'Casework', idPrefix: 'C',
    fields: [
      { key: 'id',        label: 'ID',         type: 'text', required: true, mono: true, half: true },
      { key: 'name',      label: 'Constituent',type: 'text', required: true, half: true },
      { key: 'category',  label: 'Category',   type: 'select', options: ['housing', 'health', 'transit', 'income', 'immigration', 'other'], half: true },
      { key: 'urgency',   label: 'Urgency',    type: 'select', options: ['routine', 'soon', 'urgent', 'critical'], half: true },
      { key: 'status',    label: 'Status',     type: 'select', options: ['new', 'in-progress', 'awaiting', 'closed'], half: true },
      { key: 'sla',       label: 'SLA',        type: 'text', half: true },
      { key: 'touches',   label: 'Touches',    type: 'number', half: true },
      { key: 'opened',    label: 'Opened',     type: 'date', half: true },
      { key: 'detail',    label: 'Detail',     type: 'textarea' },
    ],
  },

  'civic.promise': {
    label: 'Promise', idPrefix: 'pr',
    fields: [
      { key: 'id',       label: 'ID',       type: 'text', required: true, mono: true, half: true },
      { key: 'status',   label: 'Status',   type: 'select', options: ['pending', 'in-progress', 'kept', 'broken', 'partial'], half: true },
      { key: 'title',    label: 'Promise',  type: 'text', required: true },
      { key: 'category', label: 'Category', type: 'select', options: ['housing', 'transit', 'health', 'education', 'climate', 'economy', 'governance', 'other'], half: true },
      { key: 'made',     label: 'Date made',type: 'date', half: true },
      { key: 'due',      label: 'Due date', type: 'date', half: true },
      { key: 'evidence', label: 'Evidence link', type: 'text', half: true },
      { key: 'detail',   label: 'Detail',   type: 'textarea' },
    ],
  },

  'civic.speech': {
    label: 'Speech', idPrefix: 'sp',
    fields: [
      { key: 'id',     label: 'ID',     type: 'text', required: true, mono: true, half: true },
      { key: 'date',   label: 'Date',   type: 'date', half: true },
      { key: 'venue',  label: 'Venue',  type: 'text', half: true, placeholder: 'Hansard / public' },
      { key: 'topic',  label: 'Topic',  type: 'text', half: true },
      { key: 'minutes',label: 'Minutes',type: 'number', half: true },
      { key: 'audience',label:'Audience',type: 'text', half: true },
      { key: 'title',  label: 'Title',  type: 'text', required: true },
      { key: 'excerpt',label: 'Excerpt',type: 'textarea' },
    ],
  },

  // ── Opposition ──────────────────────────────────────────
  'opposition.target': {
    label: 'Target', idPrefix: 'OT',
    fields: [
      { key: 'id',           label: 'ID',     type: 'text', required: true, mono: true, half: true },
      { key: 'name',         label: 'Name',   type: 'text', required: true, half: true },
      { key: 'role',         label: 'Role',   type: 'text', half: true },
      { key: 'party',        label: 'Party',  type: 'text', half: true },
      { key: 'dossierStatus',label: 'Dossier',type: 'select', options: ['live', 'review', 'archive'], half: true },
      { key: 'heat',         label: 'Heat',   type: 'select', options: ['low', 'medium', 'high', 'critical'], half: true },
      { key: 'briefing',     label: 'Briefing', type: 'textarea' },
    ],
  },

  'opposition.claim': {
    label: 'Opposition claim', idPrefix: 'OC',
    fields: [
      { key: 'id',          label: 'ID',     type: 'text', required: true, mono: true, half: true },
      { key: 'targetId',    label: 'Target', type: 'text', half: true, mono: true },
      { key: 'topic',       label: 'Topic',  type: 'text', half: true },
      { key: 'date',        label: 'Date',   type: 'date', half: true },
      { key: 'venue',       label: 'Venue',  type: 'text', half: true },
      { key: 'reach',       label: 'Reach',  type: 'number', half: true },
      { key: 'rebuttalId',  label: 'Rebuttal ID', type: 'text', mono: true, half: true },
      { key: 'quote',       label: 'Quote',  type: 'textarea', required: true },
      { key: 'context',     label: 'Context',type: 'textarea' },
    ],
  },

  'opposition.lead': {
    label: 'Investigation lead', idPrefix: 'OL',
    fields: [
      { key: 'id',       label: 'ID',       type: 'text', required: true, mono: true, half: true },
      { key: 'targetId', label: 'Target ID',type: 'text', mono: true, half: true },
      { key: 'status',   label: 'Status',   type: 'select', options: ['cold', 'warm', 'hot', 'evidence-secured', 'dismissed'], half: true },
      { key: 'priority', label: 'Priority', type: 'select', options: ['low', 'medium', 'high', 'critical'], half: true },
      { key: 'title',    label: 'Title',    type: 'text', required: true },
      { key: 'source',   label: 'Source',   type: 'text', half: true },
      { key: 'opened',   label: 'Opened',   type: 'date', half: true },
      { key: 'detail',   label: 'Detail',   type: 'textarea' },
    ],
  },

  // ── Beacon ──────────────────────────────────────────────
  'beacon.post': {
    label: 'Social post', idPrefix: 'post',
    fields: [
      { key: 'id',       label: 'ID',       type: 'text', required: true, mono: true, half: true },
      { key: 'platform', label: 'Platform', type: 'select', options: ['x', 'ig', 'fb', 'tt', 'li', 'yt', 'news'], half: true },
      { key: 'day',      label: 'Day',      type: 'select', options: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], half: true },
      { key: 'slot',     label: 'Time slot',type: 'text', half: true, placeholder: '10:30' },
      { key: 'status',   label: 'Status',   type: 'select', options: ['DRAFT', 'SCHEDULED', 'LIVE', 'HOLD', 'REJECTED'], half: true },
      { key: 'kind',     label: 'Type',     type: 'select', options: ['text', 'image', 'video', 'thread', 'reel', 'press'], half: true },
      { key: 'author',   label: 'Author',   type: 'text', half: true },
      { key: 'approver', label: 'Approver', type: 'text', half: true },
      { key: 'headline', label: 'Headline', type: 'text' },
      { key: 'body',     label: 'Body',     type: 'textarea' },
    ],
  },

  'beacon.account': {
    label: 'Social account', idPrefix: 'acct',
    fields: [
      { key: 'id',        label: 'ID',        type: 'text', required: true, mono: true, half: true },
      { key: 'kind',      label: 'Platform',  type: 'select', options: ['x', 'ig', 'fb', 'tt', 'li', 'yt', 'news'], half: true },
      { key: 'name',      label: 'Display name', type: 'text', required: true, half: true },
      { key: 'handle',    label: 'Handle',    type: 'text', half: true, mono: true, placeholder: '@candidate' },
      { key: 'followers', label: 'Followers', type: 'text', half: true, hint: 'e.g. 24.1k' },
      { key: 'eng',       label: 'Engagement',type: 'number', step: 0.001, half: true },
    ],
  },

  'beacon.mention': {
    label: 'Listening mention', idPrefix: 'l',
    fields: [
      { key: 'id',        label: 'ID',       type: 'text', required: true, mono: true, half: true },
      { key: 'src',       label: 'Source',   type: 'text', required: true, half: true, placeholder: 'The Tyee' },
      { key: 't',         label: 'Time',     type: 'text', half: true, placeholder: '08:47' },
      { key: 'kind',      label: 'Channel',  type: 'select', options: ['news', 'x', 'reddit', 'facebook', 'linkedin', 'tiktok', 'blog', 'other'], half: true },
      { key: 'headline',  label: 'Headline', type: 'text' },
      { key: 'sentiment', label: 'Sentiment',type: 'number', step: 0.1, min: -1, max: 1, half: true, hint: '-1 to 1' },
      { key: 'reach',     label: 'Reach',    type: 'number', half: true },
      { key: 'url',       label: 'URL',      type: 'text' },
    ],
  },

  'beacon.press_outlet': {
    label: 'Press outlet', idPrefix: 'outlet',
    fields: [
      { key: 'id',        label: 'ID',       type: 'text', mono: true, half: true },
      { key: 'name',      label: 'Name',     type: 'text', required: true, half: true },
      { key: 'handle',    label: 'Handle / domain', type: 'text', half: true, placeholder: 'thetyee.ca' },
      { key: 'kind',      label: 'Kind',     type: 'select', options: ['news', 'x', 'reddit', 'facebook', 'linkedin', 'blog', 'tv', 'radio', 'other'], half: true },
      { key: 'reach',     label: 'Reach',    type: 'text', half: true, placeholder: '44K' },
      { key: 'posts',     label: 'Posts',    type: 'number', half: true },
      { key: 'sentiment', label: 'Sentiment',type: 'number', step: 0.1, min: -1, max: 1, half: true, hint: '-1 to 1' },
      { key: 'count',     label: 'Count',    type: 'number', half: true },
    ],
  },

  // ── Site ────────────────────────────────────────────────
  'site.page': {
    label: 'Page', idPrefix: 'page',
    fields: [
      { key: 'id',       label: 'ID',     type: 'text', required: true, mono: true, half: true },
      { key: 'route',    label: 'Route',  type: 'text', mono: true, half: true, placeholder: '/donate' },
      { key: 'slug',     label: 'Slug',   type: 'text', mono: true, half: true, placeholder: '/donate' },
      { key: 'title',    label: 'Title',  type: 'text', required: true },
      { key: 'status',   label: 'Status', type: 'select', options: ['draft', 'review', 'published', 'archived'], half: true },
      { key: 'editor',   label: 'Editor', type: 'text', half: true },
      { key: 'views7d',  label: 'Views 7d', type: 'number', half: true },
      { key: 'cr',       label: 'Conversion rate', type: 'number', step: 0.001, half: true, hint: '0–1' },
      { key: 'updated',  label: 'Updated',type: 'date', half: true },
    ],
  },

  'site.experiment': {
    label: 'Experiment', idPrefix: 'exp',
    fields: [
      { key: 'id',      label: 'ID',     type: 'text', required: true, mono: true, half: true },
      { key: 'page',    label: 'Page',   type: 'text', half: true },
      { key: 'name',    label: 'Name',   type: 'text', required: true },
      { key: 'status',  label: 'Status', type: 'select', options: ['draft', 'running', 'paused', 'won', 'lost', 'shipped'], half: true },
      { key: 'metric',  label: 'Metric', type: 'text', half: true, placeholder: 'CR / CTR / RPM' },
      { key: 'control', label: 'Control', type: 'text', half: true },
      { key: 'variant', label: 'Variant', type: 'text', half: true },
      { key: 'lift',    label: 'Lift',   type: 'number', step: 0.001, half: true, hint: '0–1' },
      { key: 'p',       label: 'p-value',type: 'number', step: 0.001, half: true },
      { key: 'started', label: 'Started',type: 'date', half: true },
      { key: 'note',    label: 'Note',   type: 'textarea' },
    ],
  },

  'site.form': {
    label: 'Site form', idPrefix: 'f',
    fields: [
      { key: 'id',             label: 'ID',         type: 'text', required: true, mono: true, half: true },
      { key: 'name',           label: 'Name',       type: 'text', required: true, half: true },
      { key: 'page',           label: 'Page',       type: 'text', half: true, placeholder: '/donate' },
      { key: 'fields',         label: 'Fields',     type: 'tags', hint: 'Field keys' },
      { key: 'submits7d',      label: 'Submits 7d', type: 'number', half: true },
      { key: 'views7d',        label: 'Views 7d',   type: 'number', half: true },
      { key: 'complete',       label: 'Completion %', type: 'number', step: 0.01, half: true },
      { key: 'completionTime', label: 'Median time',type: 'text', half: true, placeholder: '01:42' },
      { key: 'errors',         label: 'Errors',     type: 'number', half: true },
    ],
  },

  // ── Events ──────────────────────────────────────────────
  'events.event': {
    label: 'Event', idPrefix: 'e',
    fields: [
      { key: 'id',       label: 'ID',     type: 'text', required: true, mono: true, half: true },
      { key: 'type',     label: 'Type',   type: 'select', options: ['town-hall', 'canvass-launch', 'fundraiser', 'rally', 'forum', 'house-party', 'phone-bank', 'sign-plant'], half: true },
      { key: 'name',     label: 'Name',   type: 'text', required: true },
      { key: 'tagline',  label: 'Tagline',type: 'text' },
      { key: 'date',     label: 'Date',   type: 'date', half: true },
      { key: 'start',    label: 'Start',  type: 'text', half: true, placeholder: '19:00' },
      { key: 'end',      label: 'End',    type: 'text', half: true, placeholder: '21:00' },
      { key: 'venue',    label: 'Venue ID', type: 'text', half: true },
      { key: 'host',     label: 'Host',   type: 'text', half: true },
      { key: 'capacity', label: 'Capacity', type: 'number', half: true },
      { key: 'rsvped',   label: 'RSVP\'d',  type: 'number', half: true },
      { key: 'shifts',   label: 'Shifts (need)', type: 'number', half: true },
      { key: 'shiftsFilled', label: 'Shifts filled', type: 'number', half: true },
    ],
  },

  'events.venue': {
    label: 'Venue', idPrefix: 'venue',
    fields: [
      { key: 'id',        label: 'ID',       type: 'text', required: true, mono: true, half: true },
      { key: 'name',      label: 'Name',     type: 'text', required: true, half: true },
      { key: 'address',   label: 'Address',  type: 'text' },
      { key: 'city',      label: 'City',     type: 'text', half: true },
      { key: 'capacity',  label: 'Capacity', type: 'number', half: true },
      { key: 'cost',      label: 'Cost',     type: 'currency', half: true },
      { key: 'contact',   label: 'Contact',  type: 'text', half: true },
      { key: 'note',      label: 'Note',     type: 'textarea' },
    ],
  },

  'events.host': {
    label: 'Event host', idPrefix: 'host',
    fields: [
      { key: 'id',     label: 'ID',     type: 'text', required: true, mono: true, half: true },
      { key: 'name',   label: 'Name',   type: 'text', required: true, half: true },
      { key: 'role',   label: 'Role',   type: 'text', half: true },
      { key: 'status', label: 'Status', type: 'select', options: ['active', 'standby', 'inactive'], half: true },
      { key: 'events', label: 'Events run', type: 'number', half: true },
      { key: 'phone',  label: 'Phone',  type: 'text', half: true },
      { key: 'email',  label: 'Email',  type: 'text', half: true },
    ],
  },

  // ── Academy ─────────────────────────────────────────────
  'academy.course': {
    label: 'Course', idPrefix: 'crs',
    fields: [
      { key: 'id',         label: 'ID',       type: 'text', required: true, mono: true, half: true },
      { key: 'cat',        label: 'Category', type: 'select', options: ['Field & Canvass', 'Policy & Briefings', 'Communications', 'Compliance & Ethics', 'Leadership', 'Digital Tools'], half: true },
      { key: 'title',      label: 'Title',    type: 'text', required: true },
      { key: 'sub',        label: 'Subtitle', type: 'text' },
      { key: 'instructor', label: 'Instructor', type: 'text', half: true },
      { key: 'instructorId', label: 'Instructor ID', type: 'text', half: true, mono: true },
      { key: 'duration',   label: 'Duration', type: 'text', half: true, placeholder: '4h 12m' },
      { key: 'chapters',   label: 'Chapters', type: 'number', half: true },
      { key: 'level',      label: 'Level',    type: 'select', options: ['Onboarding', 'Foundational', 'Core', 'Intermediate', 'Advanced', 'Required'], half: true },
      { key: 'students',   label: 'Students', type: 'number', half: true },
      { key: 'rating',     label: 'Rating',   type: 'number', step: 0.1, half: true },
      { key: 'progress',   label: 'Progress', type: 'number', step: 0.01, min: 0, max: 1, half: true, hint: '0–1' },
      { key: 'featured',   label: 'Featured', type: 'boolean', half: true },
      { key: 'required',   label: 'Required', type: 'boolean', half: true },
      { key: 'completed',  label: 'Completed',type: 'boolean', half: true },
    ],
  },

  'academy.article': {
    label: 'Article', idPrefix: 'art',
    fields: [
      { key: 'id',        label: 'ID',     type: 'text', required: true, mono: true, half: true },
      { key: 'cat',       label: 'Category', type: 'text', half: true },
      { key: 'title',     label: 'Title',  type: 'text', required: true },
      { key: 'sub',       label: 'Subtitle', type: 'text' },
      { key: 'author',    label: 'Author', type: 'text', half: true },
      { key: 'authorId',  label: 'Author ID', type: 'text', half: true, mono: true },
      { key: 'date',      label: 'Date',   type: 'date', half: true },
      { key: 'readTime',  label: 'Read time', type: 'text', half: true, placeholder: '12 min' },
      { key: 'excerpt',   label: 'Excerpt', type: 'textarea' },
    ],
  },

  'academy.faculty': {
    label: 'Faculty', idPrefix: 'fac',
    fields: [
      { key: 'id',       label: 'ID',       type: 'text', required: true, mono: true, half: true },
      { key: 'name',     label: 'Name',     type: 'text', required: true, half: true },
      { key: 'title',    label: 'Title',    type: 'text' },
      { key: 'courses',  label: 'Courses',  type: 'number', half: true },
      { key: 'students', label: 'Students', type: 'number', half: true },
      { key: 'bio',      label: 'Bio',      type: 'textarea' },
    ],
  },

  // ── Command ─────────────────────────────────────────────
  'command.channel': {
    label: 'Channel', idPrefix: 'ch',
    fields: [
      { key: 'id',     label: 'ID',    type: 'text', required: true, mono: true, half: true },
      { key: 'label',  label: 'Name',  type: 'text', required: true, half: true, placeholder: 'war-room' },
      { key: 'type',   label: 'Type',  type: 'select', options: ['channel', 'dm', 'huddle'], half: true },
      { key: 'group',  label: 'Group', type: 'text', half: true },
      { key: 'unread', label: 'Unread',type: 'number', half: true },
    ],
  },

  'command.message': {
    label: 'Message', idPrefix: 'm',
    fields: [
      { key: 'id',       label: 'ID',       type: 'text', required: true, mono: true, half: true },
      { key: 't',        label: 'Time',     type: 'text', half: true, placeholder: '08:02' },
      { key: 'who',      label: 'Author',   type: 'text', required: true, half: true },
      { key: 'avatar',   label: 'Avatar',   type: 'text', half: true, placeholder: 'MR' },
      { key: 'role',     label: 'Role',     type: 'text', half: true },
      { key: 'text',     label: 'Message',  type: 'textarea', required: true },
      { key: 'thread',   label: 'Reply count', type: 'number', half: true },
      { key: 'parentId', label: 'Parent message ID', type: 'text', mono: true, half: true, hint: 'set if this is a thread reply' },
      { key: 'bot',      label: 'Bot',      type: 'boolean', half: true },
      { key: 'kind',     label: 'Kind',     type: 'select', options: ['', 'bot'], half: true },
    ],
  },

  // ── Conductor ───────────────────────────────────────────
  'conductor.ask': {
    label: 'Cross-module ask', idPrefix: 'c',
    fields: [
      { key: 'id',     label: 'ID',     type: 'text', required: true, mono: true, half: true },
      { key: 'window', label: 'Window', type: 'select', required: true, options: ['NOW', 'TODAY', 'WEEK'], half: true },
      { key: 'mod',    label: 'Module', type: 'select', required: true, options: ['opposition', 'civic', 'raise', 'ground', 'coalition', 'ledger', 'site', 'events', 'beacon', 'academy', 'command', 'general'], half: true },
      { key: 'action', label: 'Action label', type: 'text', half: true, placeholder: 'Approve & queue' },
      { key: 'ask',    label: 'Ask',    type: 'text', required: true },
      { key: 'body',   label: 'Body',   type: 'textarea' },
    ],
  },
};

export function getSchema(module, kind) {
  return SCHEMAS[`${module}.${kind}`] || null;
}
