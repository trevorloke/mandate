// A/B subject lines + open and click stats for Outreach's newsletters and
// press releases (server: server/ext/abtests). Used by pages/Outreach.jsx:
//   AbFields        the quiet "Try two subject lines" reveal in Write
//   useBlastStat    one send's counts from GET /api/blasts/stats
//   abState         a test's state as one line ("Testing · A 12% vs B 18%
//                   opened · winner picked 3:00 pm", "Winner B · sent to
//                   everyone") — only what the server counted
//   SendStats       "Opened 42% · Clicked 8%" (of delivered)
//   TestingList     tests running now, on the tab's first look
//   OpensNote       the one line on Apple Mail under More
import { useId } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet } from '../api.js';
import './abtests.css';

export const AB_MIN = 50;
const PCTS = [10, 20, 30];
const WAITS = [1, 2, 4, 12, 24];
export const AB_DEFAULT = { subject_b: '', pct: 20, wait_hours: 4, metric: 'opens' };

const plural = (n, one, many) => (n === 1 ? one : many);
const hours = (h) => `${h} ${plural(h, 'hour', 'hours')}`;
const pctOf = (n, of) => (of > 0 ? Math.round((100 * n) / of) : 0);

// Shares GET /api/blasts/stats under the 'blasts' key, so every send
// (which invalidates ['blasts']) refreshes it too. While a test runs it is
// read again every 30 s (opens arrive, the winner goes out); when a test
// finishes, the send list is read again so its counts match the winner line.
const STATS_KEY = ['blasts', 'stats'];
const testingIds = (d) => (d?.stats || []).filter((s) => s.ab?.status === 'testing').map((s) => s.id).join(',');
export const useBlastStats = () => {
  const qc = useQueryClient();
  return useQuery({
    queryKey: STATS_KEY,
    queryFn: async () => {
      const prev = qc.getQueryData(STATS_KEY);
      const next = await apiGet('/blasts/stats');
      if (prev && testingIds(prev) !== testingIds(next)) qc.invalidateQueries({ queryKey: ['blasts'], exact: true });
      return next;
    },
    refetchInterval: (q) => (testingIds(q.state.data) ? 30_000 : false),
  });
};
export const useBlastStat = (id) => {
  const q = useBlastStats();
  return id ? q.data?.stats?.find((s) => s.id === id) || null : null;
};

// The same split the server makes: pct% each to A and B, the rest wait.
export const abPlan = (total, pct) => {
  const size = Math.floor(((total || 0) * pct) / 100);
  return { a: size, b: size, rest: Math.max(0, (total || 0) - 2 * size) };
};
export const abAsk = (plan, waitHours) =>
  `A to ${plan.a}, B to ${plan.b} now · the winner to ${plan.rest} after ${hours(waitHours)}?`;

// "3:00 pm", "tomorrow 3:00 pm", "Oct 24, 3:00 pm".
export const fmtTime = (ts) => {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return t;
  const next = new Date(now);
  next.setDate(now.getDate() + 1);
  if (d.toDateString() === next.toDateString()) return `tomorrow ${t}`;
  return `${d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}, ${t}`;
};

// One line for a test that has started. `stat` (from useBlastStat) carries
// the per-group counts; `counts` the send's { total, sent, failed, queued }.
// Answers null for a send with no test, or one that hasn't started.
export const abState = (ab, stat, counts) => {
  if (!ab || ab.status === 'saved') return null;
  const groups = stat?.ab;
  if (ab.status === 'testing') {
    const verb = ab.metric === 'clicks' ? 'clicked' : 'opened';
    const rate = (g) => pctOf(ab.metric === 'clicks' ? g.clicked : g.opened, g.delivered);
    const rates = groups ? ` · A ${rate(groups.a)}% vs B ${rate(groups.b)}% ${verb}` : '';
    return { tone: 'queued', line: `Testing${rates} · winner picked ${fmtTime(ab.decide_at)}` };
  }
  const w = `Winner ${String(ab.winner || 'a').toUpperCase()}`;
  const c = counts;
  if (!c || c.sent == null) return { tone: 'queued', line: w };
  if (c.total > 0 && c.sent === c.total) return { tone: 'sent', line: `${w} · sent to everyone` };
  const rest = [c.failed ? `${c.failed} failed` : null, c.queued ? `${c.queued} not sent` : null].filter(Boolean);
  return { tone: c.sent > 0 ? 'queued' : 'failed', line: `${w} · sent to ${c.sent} of ${c.total}${rest.length ? ` — ${rest.join(' · ')}` : ''}` };
};

// "Opened 42% · Clicked 8%" — of the emails the service delivered.
export function SendStats({ stat }) {
  if (!stat || !(stat.delivered > 0)) return null;
  return (
    <span className="ab-stats" data-testid="send-stats">
      Opened {pctOf(stat.opened, stat.delivered)}% · Clicked {pctOf(stat.clicked, stat.delivered)}%
    </span>
  );
}

// Under More: why opens run high. Shown once anything has been delivered.
export function OpensNote() {
  const q = useBlastStats();
  if (!q.data?.stats?.some((s) => s.delivered > 0)) return null;
  return <p className="ot-note ab-note">Apple Mail can open emails by itself, so opens run high.</p>;
}

// In Write: a quiet reveal for Subject B and the test's three settings.
// value null = one subject line. A list under 50 sends normally.
export function AbFields({ idPrefix, audienceCount, noun, value, onChange }) {
  const uid = useId();
  const open = value != null;
  const small = audienceCount != null && audienceCount < AB_MIN;
  const id = (k) => `${idPrefix}-ab-${k}`;
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div className="ab-fields">
      <button type="button" className="disclose disclose--inline ab-toggle" aria-expanded={open} aria-controls={uid}
        onClick={() => onChange(open ? null : { ...AB_DEFAULT })}>
        Try two subject lines
      </button>
      {open && (
        <div id={uid} className="ab-body">
          {small ? (
            <p className="ot-note" data-testid="ab-small">
              A/B needs at least {AB_MIN} {noun(AB_MIN)} — this sends normally.
            </p>
          ) : (
            <>
              <div className="field">
                <label htmlFor={id('subject')}>Subject B</label>
                <input id={id('subject')} className="input" value={value.subject_b} maxLength={300} autoFocus
                  onChange={(e) => set({ subject_b: e.target.value })} />
              </div>
              <div className="ab-opts">
                <div className="field">
                  <label htmlFor={id('pct')}>Test group</label>
                  <select id={id('pct')} className="input" value={value.pct} onChange={(e) => set({ pct: Number(e.target.value) })}>
                    {PCTS.map((p) => <option key={p} value={p}>{p}% each</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={id('wait')}>Wait</label>
                  <select id={id('wait')} className="input" value={value.wait_hours} onChange={(e) => set({ wait_hours: Number(e.target.value) })}>
                    {WAITS.map((h) => <option key={h} value={h}>{hours(h)}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={id('metric')}>Winner by</label>
                  <select id={id('metric')} className="input" value={value.metric} onChange={(e) => set({ metric: e.target.value })}>
                    <option value="opens">Opens</option>
                    <option value="clicks">Clicks</option>
                  </select>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Tests running now, on the tab's first look: subject A, subject B, and
// where the test stands. Nothing while no test runs. `skip`: the send whose
// result is already on screen (said once, not twice).
export function TestingList({ blasts, kind, skip }) {
  const stats = useBlastStats();
  const rows = (stats.data?.stats || []).filter((s) => s.ab?.status === 'testing' && s.id !== skip)
    .map((s) => ({ s, b: (blasts || []).find((b) => b.id === s.id) }))
    .filter(({ b }) => b && b.kind === kind);
  if (rows.length === 0) return null;
  return (
    <section className="ot-sec" aria-label="Testing">
      <h2 className="ot-sec-h">Testing <span className="ot-count">{rows.length}</span></h2>
      <ul className="ot-list">
        {rows.map(({ s, b }) => (
          <li key={b.id} className="ot-item" data-testid="ab-testing-row">
            <div className="ot-row ot-row--static ot-row--wrap">
              <span className="ot-row__main">
                <span className="ot-row__name">{b.subject}</span>
                <span className="ab-b">B · {s.ab.subject_b}</span>
                <span className="ab-line" data-tone="queued">{abState(s.ab, s, null).line}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
