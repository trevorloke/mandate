// Frontend-side seed: takes the prototype data files (already imported by modules)
// and bulk-uploads each bucket via the API, so the workspace gets populated.
import { api } from '../auth/api';

// Lazy imports — only loaded when seeding is triggered.
async function loadAllData() {
  const [
    ground, beacon1, beacon2, raise, raiseGlr,
    ledger, coalition, civic, opp, site, events, academy, command,
  ] = await Promise.all([
    import('../ground-data'),
    import('../beacon-data'),
    import('../beacon-data2'),
    import('../raise-data'),
    import('../raise-glr-data'),
    import('../ledger-data'),
    import('../coalition-data'),
    import('../civic-data'),
    import('../opp-data'),
    import('../site-data'),
    import('../events-data'),
    import('../academy-data'),
    import('../command-data'),
  ]);
  return { ground, beacon1, beacon2, raise, raiseGlr, ledger, coalition, civic, opp, site, events, academy, command };
}

// Map each (module, kind) bucket to a function returning the records.
function buildBuckets(d) {
  return [
    // ground
    { module: 'ground', kind: 'voter',     records: d.ground.VOTERS || [] },
    { module: 'ground', kind: 'canvasser', records: d.ground.CANVASSERS || [] },
    { module: 'ground', kind: 'shift',     records: d.ground.SHIFTS || [] },
    { module: 'ground', kind: 'pd',        records: d.ground.PDS || [] },
    { module: 'ground', kind: 'script',    records: d.ground.SCRIPTS || [] },

    // beacon
    { module: 'beacon', kind: 'account',      records: d.beacon1.BEACON_ACCOUNTS || [] },
    { module: 'beacon', kind: 'post',         records: d.beacon1.BEACON_POSTS || [] },
    { module: 'beacon', kind: 'mention',      records: d.beacon1.BEACON_LISTENING || [] },
    { module: 'beacon', kind: 'press_outlet', records: d.beacon2.BEACON_PRESS_OUTLETS || [] },

    // raise
    { module: 'raise', kind: 'donor',     records: d.raise.RAISE_DONORS || [] },
    { module: 'raise', kind: 'prospect',  records: d.raise.RAISE_PROSPECTS || [] },
    { module: 'raise', kind: 'gift',      records: d.raiseGlr.RAISE_GIFTS || [] },
    { module: 'raise', kind: 'pledge',    records: (d.raise.RAISE_PROSPECTS || []).filter(p => p.stageKey === 'committed' || p.stage === 'Verbal yes') },

    // ledger
    { module: 'ledger', kind: 'journal', records: d.ledger.LEDGER_JOURNAL || [] },
    { module: 'ledger', kind: 'account', records: d.ledger.LEDGER_COA || [] },
    { module: 'ledger', kind: 'bill',    records: d.ledger.LEDGER_BILLS || [] },
    { module: 'ledger', kind: 'filing',         records: (d.ledger.LEDGER_FILINGS && d.ledger.LEDGER_FILINGS.queue) || [] },
    { module: 'ledger', kind: 'filing_history', records: (d.ledger.LEDGER_FILINGS && d.ledger.LEDGER_FILINGS.history) || [] },
    { module: 'ledger', kind: 'filing_current', records: (d.ledger.LEDGER_FILINGS && d.ledger.LEDGER_FILINGS.current) ? [d.ledger.LEDGER_FILINGS.current] : [] },
    { module: 'ledger', kind: 'asset',   records: (d.ledger.LEDGER_ASSETS && d.ledger.LEDGER_ASSETS.items) || [] },

    // coalition
    { module: 'coalition', kind: 'org',         records: Object.entries(d.coalition.COA_ORGS || {}).map(([slug, v]) => ({ slug, ...v })) },
    { module: 'coalition', kind: 'endorsement', records: d.coalition.COA_LEDGER || [] },
    { module: 'coalition', kind: 'ask',         records: d.coalition.COA_ASKS || [] },
    { module: 'coalition', kind: 'comm',        records: d.coalition.COA_COMMS || [] },

    // civic
    { module: 'civic', kind: 'bill',     records: d.civic.CV_BILLS || [] },
    { module: 'civic', kind: 'case',     records: d.civic.CV_CASES || [] },
    { module: 'civic', kind: 'promise',  records: d.civic.CV_PROMISES || [] },
    { module: 'civic', kind: 'speech',   records: d.civic.CV_SPEECHES || [] },

    // opposition
    { module: 'opposition', kind: 'target',   records: d.opp.OP_TARGETS || [] },
    { module: 'opposition', kind: 'claim',    records: d.opp.OP_CLAIMS || [] },
    { module: 'opposition', kind: 'evidence', records: d.opp.OP_EVIDENCE || [] },
    { module: 'opposition', kind: 'lead',     records: d.opp.OP_LEADS || [] },

    // site
    { module: 'site', kind: 'page',       records: d.site.SITE_PAGES || [] },
    { module: 'site', kind: 'experiment', records: d.site.SITE_EXPERIMENTS || [] },
    { module: 'site', kind: 'form',       records: d.site.SITE_FORMS || [] },

    // events
    { module: 'events', kind: 'event', records: d.events.EV_LIST || [] },
    { module: 'events', kind: 'venue', records: d.events.EV_VENUES || [] },
    { module: 'events', kind: 'host',  records: d.events.EV_HOSTS || [] },

    // academy
    { module: 'academy', kind: 'course',  records: d.academy.ACAD_COURSES || [] },
    { module: 'academy', kind: 'article', records: d.academy.ACAD_ARTICLES || [] },
    { module: 'academy', kind: 'faculty', records: d.academy.ACAD_FACULTY || [] },

    // command
    { module: 'command', kind: 'channel', records: (d.command.CMD_GROUPS || []).flatMap(g => (g.items || []).map(i => ({ ...i, group: g.label }))) },
    { module: 'command', kind: 'message', records: [...(d.command.CMD_MESSAGES || []), ...((d.command.CMD_THREAD || []).map(t => ({ ...t, parentId: 'm1' })))] },
  ];
}

export async function seedDemoData(onProgress = () => {}) {
  const data = await loadAllData();
  const buckets = buildBuckets(data);
  const summary = [];
  let total = 0;

  for (let i = 0; i < buckets.length; i++) {
    const { module, kind, records } = buckets[i];
    onProgress({ i, of: buckets.length, module, kind, count: records.length });
    if (records.length === 0) continue;
    try {
      await api.bulkData(module, kind, records);
      summary.push({ module, kind, count: records.length });
      total += records.length;
    } catch (e) {
      summary.push({ module, kind, count: 0, error: e.message });
    }
  }

  return { total, buckets: summary };
}
