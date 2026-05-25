import React from 'react';
import './civic.css';
import { CV_MEMBER, CV_ORDER_TODAY, CV_BILLS as CV_BILLS_FB, CV_CASES as CV_CASES_FB, CV_CASE_CATS, CV_VOTES, CV_MOTIONS, CV_SPEECHES as CV_SPEECHES_FB, CV_PROMISES as CV_PROMISES_FB, CV_LETTERS, CV_CASE_PIPE_STAGES } from './civic-data';
import { useLiveRecords } from './auth/useLiveRecords';
import EmptyModule from './EmptyModule';
import { CvCommittees, CvPromises, CvCommunity, CvLetters, CvSpend, CvStaff, CvTrends } from './civic-tabs';
import { TODAY } from './data';

// Civic 2.0 — shell + Today / Bills / Cases / Hansard tabs

const { useState: cvUS, useMemo: cvUM } = React;

const CV_TABS = [
  { k: 'today',     label: 'Today',         badge: 'live' },
  { k: 'bills',     label: 'Bills',         badge: '7' },
  { k: 'cases',     label: 'Casework',      badge: '47' },
  { k: 'hansard',   label: 'Hansard',       badge: 'wk' },
  { k: 'committees',label: 'Committees',    badge: '3' },
  { k: 'promises',  label: 'Promises' },
  { k: 'community', label: 'Community' },
  { k: 'letters',   label: 'Correspondence', badgeWarn: '1 new' },
  { k: 'spend',     label: 'Allowance' },
  { k: 'staff',     label: 'Staff' },
  { k: 'trends',    label: 'Insights' },
];

function Civic2() {
  const [tab, setTab] = cvUS('today');
  const [mode, setMode] = cvUS('member'); // member | candidate
  const { records: CV_BILLS, isEmpty: noBills } = useLiveRecords('civic', 'bill', CV_BILLS_FB);
  const { records: CV_CASES, isEmpty: noCases } = useLiveRecords('civic', 'case', CV_CASES_FB);
  const { records: CV_PROMISES, isEmpty: noPromises } = useLiveRecords('civic', 'promise', CV_PROMISES_FB);
  if (noBills && noCases && noPromises) return <EmptyModule module="CIVIC" label="Civic" accent="var(--m-civic)" />;

  return (
    <div className="cv2" data-screen-label="09 Civic · MLA Desk">

      {/* ─── Seal bar ─── */}
      <div className="cv2__seal">
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div className="cv2__crest">{CV_MEMBER.initials}</div>
          <div className="cv2__title">
            <div className="cv2__title-name">{CV_MEMBER.name}</div>
            <div className="cv2__title-sub">{CV_MEMBER.role} · {CV_MEMBER.session}</div>
          </div>
        </div>

        <div /> {/* spacer */}

        <div className="cv2__kpis">
          <div className="cv2__kpi">
            <span className="cv2__kpi-v">{CV_MEMBER.caseloadOpen}</span>
            <span className="cv2__kpi-k">open cases</span>
          </div>
          <div className="cv2__kpi">
            <span className="cv2__kpi-v">{Math.round(CV_MEMBER.voteAttendance*100)}%</span>
            <span className="cv2__kpi-k">vote attend.</span>
          </div>
          <div className="cv2__kpi">
            <span className="cv2__kpi-v">{CV_BILLS.filter(b => !b.myVote).length}</span>
            <span className="cv2__kpi-k">votes queued</span>
          </div>
          <div className="cv2__kpi">
            <span className="cv2__kpi-v">${(CV_MEMBER.allowance.spentYTD/1000).toFixed(0)}k</span>
            <span className="cv2__kpi-k">YTD spend</span>
          </div>
          <div className="cv2__kpi">
            <span className="cv2__kpi-v">{CV_PROMISES.filter(p => p.status==='kept').length}/{CV_PROMISES.length}</span>
            <span className="cv2__kpi-k">promises kept</span>
          </div>
        </div>

        <div className="cv2__mode">
          <button className={mode==='member'    ? 'is-on' : ''} onClick={() => setMode('member')}>Member</button>
          <button className={mode==='candidate' ? 'is-on' : ''} onClick={() => setMode('candidate')}>Candidate</button>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <div className="cv2__tabs">
        {CV_TABS.map(t => (
          <button key={t.k}
                  className={'cv2__tab' + (tab === t.k ? ' is-on' : '')}
                  onClick={() => setTab(t.k)}>
            {t.label}
            {t.badge && <span className="cv2__tab-badge">{t.badge}</span>}
            {t.badgeWarn && <span className="cv2__tab-badge warn">{t.badgeWarn}</span>}
          </button>
        ))}
      </div>

      {/* ─── Body ─── */}
      <div className="cv2__body">
        {tab === 'today'      && <CvToday />}
        {tab === 'bills'      && <CvBills />}
        {tab === 'cases'      && <CvCases />}
        {tab === 'hansard'    && <CvHansard />}
        {tab === 'committees' && <CvCommittees />}
        {tab === 'promises'   && <CvPromises />}
        {tab === 'community'  && <CvCommunity />}
        {tab === 'letters'    && <CvLetters />}
        {tab === 'spend'      && <CvSpend />}
        {tab === 'staff'      && <CvStaff />}
        {tab === 'trends'     && <CvTrends />}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// TODAY
// ════════════════════════════════════════════════════════════
function CvToday() {
  const { records: CV_BILLS } = useLiveRecords('civic', 'bill', CV_BILLS_FB);
  const { records: CV_CASES } = useLiveRecords('civic', 'case', CV_CASES_FB);
  return (
    <div className="cv2__today">
      <div className="cv2__card cv2__today-order">
        <div className="cv2__card-title">
          <span>Order of the day · Wed Mar 11</span>
          <span className="cv2__card-title-r">7 entries · session day 47</span>
        </div>
        <div className="cv2__order">
          {CV_ORDER_TODAY.map(o => (
            <div key={o.t} className="cv2__order-row">
              <div className="cv2__order-time">{o.t}</div>
              <div className={'cv2__order-dot ' + o.kind} />
              <div>
                <div className="cv2__order-what">{o.what}</div>
                <div className="cv2__order-detail">{o.detail}</div>
                <div className="cv2__order-where">{o.where}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Whip */}
      <div className="cv2__card">
        <div className="cv2__card-title">
          <span>Whip · this week</span>
          <span className="cv2__card-title-r">{CV_BILLS.filter(b=>b.whip!=='free').length} whipped</span>
        </div>
        <div>
          {CV_BILLS.filter(b => b.whip !== 'free').slice(0, 5).map(b => (
            <div key={b.id} style={{ display:'grid', gridTemplateColumns:'70px 1fr auto', gap:10, padding:'8px 0', borderTop:'1px solid var(--cv-rule)', fontSize:12.5, alignItems:'baseline' }}>
              <span className="cv2__bill-num" style={{ fontSize: 11 }}>{b.num}</span>
              <span style={{ lineHeight: 1.3 }}>
                {b.title}
                <div style={{ fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--cv-accent-2)', marginTop:2, letterSpacing:'0.06em' }}>
                  {b.next}
                </div>
              </span>
              <span className={'cv2__chip ' + (b.myVote==='yea'||b.myVote==='sponsor' ? 'ok' : (b.myVote==='nay' ? 'danger' : 'mid'))}>
                {b.whip} · {b.myVote || '—'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Cases overdue/today */}
      <div className="cv2__card">
        <div className="cv2__card-title">
          <span>Cases · overdue & due today</span>
          <span className="cv2__card-title-r">{CV_CASES.filter(c => c.sla?.includes('overdue') || c.sla === 'due today').length}</span>
        </div>
        <div>
          {CV_CASES.filter(c => c.sla?.includes('overdue') || c.sla === 'due today').map(c => (
            <div key={c.id} style={{ display:'grid', gridTemplateColumns:'8px 1fr auto', gap:10, padding:'8px 0', borderTop:'1px solid var(--cv-rule)', fontSize:12.5, alignItems:'center' }}>
              <span className={'cv2__urg ' + c.urgency} style={{ marginTop: 4 }} />
              <div>
                <div style={{ fontWeight: 500 }}>{c.constituent}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--cv-accent-2)', letterSpacing:'0.04em' }}>
                  {c.ref} · {c.category.toLowerCase()}
                </div>
              </div>
              <span className="cv2__chip danger">{c.sla}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Inbox preview */}
      <div className="cv2__card">
        <div className="cv2__card-title">
          <span>Correspondence · inbox</span>
          <span className="cv2__card-title-r">{CV_LETTERS.filter(l => l.dir==='in').length} in</span>
        </div>
        <div>
          {CV_LETTERS.slice(0, 5).map(l => (
            <div key={l.id} style={{ display:'grid', gridTemplateColumns:'42px 12px 1fr auto', gap:8, padding:'7px 0', borderTop:'1px solid var(--cv-rule)', fontSize:12, alignItems:'center' }}>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--cv-accent-2)', letterSpacing:'0.04em' }}>{l.at}</span>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color: l.dir==='in' ? 'var(--cv-ink)' : 'var(--cv-accent)' }}>
                {l.dir==='in' ? '↘' : '↗'}
              </span>
              <div>
                <div style={{ lineHeight: 1.25 }}>{l.subj}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--cv-accent-2)' }}>{l.who}</div>
              </div>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--cv-accent-2)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{l.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// BILLS
// ════════════════════════════════════════════════════════════
function CvBills() {
  const { records: CV_BILLS } = useLiveRecords('civic', 'bill', CV_BILLS_FB);
  const { records: CV_PROMISES } = useLiveRecords('civic', 'promise', CV_PROMISES_FB);
  const [filter, setFilter] = cvUS('all');

  const filtered = CV_BILLS.filter(b => {
    if (filter === 'all') return true;
    if (filter === 'mine') return b.myBill;
    if (filter === 'queued') return !b.myVote;
    if (filter === 'gov') return b.sponsor.includes('Hon.');
    if (filter === 'member') return b.sponsor.includes('Member');
    return true;
  });

  return (
    <div>
      <div className="cv2__cases-filter">
        <span>FILTER</span>
        {['all','mine','queued','gov','member'].map(f => (
          <button key={f} className={'cv2__cases-filter-btn' + (filter===f ? ' is-on' : '')} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
        <span style={{ marginLeft: 'auto' }}>{filtered.length} of {CV_BILLS.length} bills</span>
      </div>

      <div className="cv2__bills">
        {/* LEFT: bill register w/ readings */}
        <div className="cv2__card">
          <div className="cv2__card-title">
            <span>Bill register · 42nd Parl · 2nd Sess</span>
            <span className="cv2__card-title-r">★ private member's bill</span>
          </div>
          <div>
            {filtered.map(b => (
              <div key={b.id} className="cv2__bill-row">
                <div className="cv2__bill-head">
                  <div className={'cv2__bill-num' + (b.myBill ? ' mybill' : '')}>{b.num}</div>
                  <div>
                    <div className="cv2__bill-title">{b.title}</div>
                    <div className="cv2__bill-meta">
                      {b.sponsor.toUpperCase()} · {b.cosigners} co-signers · {b.amendments} amend.
                    </div>
                  </div>
                  <span className={'cv2__chip ' + (b.myVote==='yea (intent)' || b.myVote==='yea' || b.myVote==='sponsor' ? 'ok' : (b.myVote==='nay' ? 'danger' : 'mid'))}>
                    {b.myVote || 'unvoted'}
                  </span>
                </div>

                <div className="cv2__bill-summary">{b.summary}</div>

                {/* Reading-stage tracker */}
                <div className="cv2__readings">
                  {b.readings.map((r, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <span className="cv2__rstage-arr">→</span>}
                      <div className={'cv2__rstage ' + r.status}>
                        <span className="cv2__rstage-label">{r.stage}</span>
                        <span className="cv2__rstage-date">{r.date}</span>
                      </div>
                    </React.Fragment>
                  ))}
                </div>

                {/* Bar w/ support + meta */}
                <div className="cv2__bill-bar">
                  <div className="cv2__bill-support">
                    <span>SUPPORT</span>
                    <div className={'cv2__bill-support-bar' + (b.inFavor < 0.5 ? ' lo' : '')}>
                      <span style={{ width: (b.inFavor*100) + '%' }} />
                    </div>
                    <span>{Math.round(b.inFavor*100)}%</span>
                  </div>
                  <span className="cv2__bill-meta-r">WHIP · {b.whip.toUpperCase()}</span>
                  <span className="cv2__bill-meta-r">NEXT · {b.next}</span>
                  <span className="cv2__bill-meta-r">ISSUES · {b.issues.join(' · ')}</span>
                  {b.linked.promise && <span className="cv2__chip info">{(CV_PROMISES.find(p=>p.id===b.linked.promise)?.title || '').slice(0,28)}…</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Recent voting record */}
        <div className="cv2__card">
          <div className="cv2__card-title">
            <span>Recent voting record</span>
            <span className="cv2__card-title-r">{Math.round(CV_MEMBER.voteAttendance*100)}% attendance · last 8</span>
          </div>
          <div className="cv2__voterec">
            {CV_VOTES.map(v => (
              <div key={v.id} className="cv2__voterec-row">
                <span className="cv2__voterec-bill">{v.bill}</span>
                <div>
                  <div className="cv2__voterec-title">{v.title}</div>
                  <div className="cv2__voterec-meta">
                    {v.at.slice(5)} · {v.tally} · {v.result.toUpperCase()} · {v.whipHeld ? 'whip held' : (v.reason || 'free')}
                  </div>
                </div>
                <span className={'cv2__chip ' + (v.myVote==='yea' ? 'ok' : (v.myVote==='nay' ? 'danger' : 'warn'))}>
                  {v.myVote}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// CASES — pipeline (kanban) + register + categories
// ════════════════════════════════════════════════════════════
function CvCases() {
  const { records: CV_CASES } = useLiveRecords('civic', 'case', CV_CASES_FB);
  const [urg, setUrg] = cvUS('all');
  const rows = CV_CASES.filter(c => urg === 'all' || c.urgency === urg);

  // Bucket cases by status for the pipeline view
  const byStatus = {};
  CV_CASE_PIPE_STAGES.forEach(s => byStatus[s.k] = []);
  CV_CASES.forEach(c => {
    if (!byStatus[c.status]) byStatus[c.status] = [];
    byStatus[c.status].push(c);
  });
  // Add a "new" bucket — fold latest 2 from ack-sent/in-progress
  byStatus['new'] = CV_CASES.filter(c => c.touches <= 1).slice(0, 3);

  return (
    <div>
      <div className="cv2__cases-filter">
        <span>URGENCY</span>
        {['all','high','medium','low'].map(u => (
          <button key={u} className={'cv2__cases-filter-btn' + (urg===u ? ' is-on' : '')} onClick={() => setUrg(u)}>
            {u}
          </button>
        ))}
        <span style={{ marginLeft: 'auto' }}>
          {rows.length} cases shown · {CV_CASES.filter(c => c.status === 'in-progress').length} in-progress · {CV_CASES.filter(c => c.sla?.includes('overdue')).length} overdue
        </span>
      </div>

      {/* Pipeline */}
      <div className="cv2__pipe">
        {CV_CASE_PIPE_STAGES.map(s => (
          <div key={s.k} className="cv2__pipe-col">
            <div className="cv2__pipe-head">
              <span>{s.label}</span>
              <span className="cv2__pipe-count">{(byStatus[s.k]||[]).length}</span>
            </div>
            {(byStatus[s.k]||[]).slice(0, 4).map(c => (
              <div key={c.id} className={'cv2__pipe-card ' + c.urgency}>
                <div className="cv2__pipe-card-name">{c.constituent}</div>
                <div className="cv2__pipe-card-issue">{c.issue}</div>
                <div className="cv2__pipe-card-foot">
                  <span>{c.assigned}</span>
                  <span style={{ color: c.sla?.includes('overdue') ? 'var(--cv-danger)' : 'var(--cv-accent-2)' }}>{c.sla}</span>
                </div>
              </div>
            ))}
            {(byStatus[s.k]||[]).length > 4 && (
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--cv-accent-2)', textAlign:'center', padding:'4px 0' }}>
                +{(byStatus[s.k]||[]).length - 4} more
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Register + categories */}
      <div className="cv2__cases-grid">
        <div>
          <table className="hsd">
            <thead>
              <tr>
                <th>Ref</th><th>U</th><th>Constituent</th><th>Issue</th><th>Assigned</th><th>Status</th><th>SLA</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id}>
                  <td className="mono" style={{ fontSize: 10.5, color: 'var(--cv-accent-2)' }}>{c.ref.slice(-4)}</td>
                  <td><span className={'cv2__urg ' + c.urgency} /></td>
                  <td>
                    <div><a className="cv2__link">{c.constituent}</a></div>
                    <div className="mono" style={{ fontSize: 9.5, color: 'var(--cv-ink-3)' }}>{c.postal}</div>
                  </td>
                  <td>
                    <div>{c.issue}</div>
                    <div className="mono" style={{ fontSize: 9.5, color: 'var(--cv-accent-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.category}</div>
                  </td>
                  <td className="mono" style={{ fontSize: 11 }}>{c.assigned}</td>
                  <td>
                    <span className={'cv2__chip ' + (c.status==='resolved' ? 'ok' : c.status==='waiting-ministry' ? 'warn' : c.status==='ack-sent' ? 'mid' : 'info')}>
                      {c.status.replace(/-/g, ' ')}
                    </span>
                  </td>
                  <td className="mono" style={{ fontSize: 11, color: c.sla?.includes('overdue') ? 'var(--cv-danger)' : 'var(--cv-ink-2)' }}>
                    {c.sla}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="cv2__card">
          <div className="cv2__card-title">
            <span>By category · 30 days</span>
            <span className="cv2__card-title-r">{CV_CASE_CATS.reduce((a,c)=>a+c.count,0)} total</span>
          </div>
          <div>
            {CV_CASE_CATS.map(c => (
              <div key={c.k} className="cv2__catbar">
                <span style={{ fontFamily:'var(--font-display)', fontSize:13.5, letterSpacing:'-0.005em' }}>{c.k}</span>
                <div className="cv2__catbar-bar"><span style={{ width: (c.count/14*100) + '%' }} /></div>
                <span className="cv2__catbar-trend" style={{ color: c.trend >= 0 ? 'var(--cv-warn)' : 'var(--cv-accent)' }}>
                  {c.trend >= 0 ? '▲' : '▼'}{Math.abs(c.trend*100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// HANSARD — votes + motions + speeches
// ════════════════════════════════════════════════════════════
function CvHansard() {
  const { records: CV_SPEECHES } = useLiveRecords('civic', 'speech', CV_SPEECHES_FB);
  return (
    <div>
      <div style={{ marginBottom: 16, display:'flex', gap:24, fontFamily:'var(--font-mono)', fontSize:10, color:'var(--cv-accent-2)', letterSpacing:'0.1em', textTransform:'uppercase' }}>
        <span>HANSARD · OFFICIAL RECORD</span>
        <span>{CV_VOTES.length} divisions · {CV_MOTIONS.length} motions · {CV_SPEECHES.length} speeches</span>
      </div>

      <div className="cv2__hansard">
        {/* Votes */}
        <div className="cv2__card">
          <div className="cv2__card-title">
            <span>Recorded divisions</span>
            <span className="cv2__card-title-r">{CV_VOTES.filter(v=>v.whipHeld).length}/{CV_VOTES.length} whip held</span>
          </div>
          <table className="hsd" style={{ border: 0 }}>
            <thead>
              <tr><th>Bill</th><th>Title · result</th><th>Vote</th></tr>
            </thead>
            <tbody>
              {CV_VOTES.map(v => (
                <tr key={v.id}>
                  <td className="mono" style={{ fontSize: 10.5, color: 'var(--cv-accent-2)', letterSpacing: '0.06em' }}>
                    {v.bill}
                    <div style={{ fontSize: 9.5, color: 'var(--cv-ink-3)', marginTop: 2 }}>{v.at.slice(5)}</div>
                  </td>
                  <td>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 13.5, letterSpacing: '-0.005em' }}>{v.title}</div>
                    <div className="mono" style={{ fontSize: 9.5, color: 'var(--cv-ink-3)', marginTop: 3, letterSpacing: '0.04em' }}>
                      {v.result} · {v.tally} · {v.duration} · {v.division}
                      {!v.whipHeld && v.reason ? ' · ' + v.reason : ''}
                    </div>
                  </td>
                  <td>
                    <span className={'cv2__chip ' + (v.myVote==='yea' ? 'ok' : v.myVote==='nay' ? 'danger' : 'warn')}>{v.myVote}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Motions tabled */}
        <div className="cv2__card">
          <div className="cv2__card-title">
            <span>Motions · tabled / debated</span>
            <span className="cv2__card-title-r">{CV_MOTIONS.filter(m => m.ours).length} my own</span>
          </div>
          <div>
            {CV_MOTIONS.map(m => (
              <div key={m.id} className="cv2__motion-row">
                <div className="cv2__motion-num">{m.num} · {m.tabledBy}</div>
                <div className="cv2__motion-title">{m.title}</div>
                <div className="cv2__motion-meta">
                  <span>{m.at.slice(5)}</span>
                  <span style={{ textTransform: 'uppercase' }}>{m.status}</span>
                  {m.tally !== '—' && <span>{m.tally}</span>}
                  {m.ours && <span style={{ color: 'var(--cv-accent)' }}>★ my own</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Speeches given */}
        <div className="cv2__card" style={{ gridColumn: '1 / -1' }}>
          <div className="cv2__card-title">
            <span>Speeches · my contributions</span>
            <span className="cv2__card-title-r">
              {CV_SPEECHES.reduce((a,s)=>a+s.words,0).toLocaleString()} words · {CV_SPEECHES.filter(s=>s.clipped).length} clipped for socials
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0 24px' }}>
            {CV_SPEECHES.map(s => (
              <div key={s.id} className="cv2__speech-row">
                <div className="cv2__speech-stage">{s.stage} · {s.at.slice(5)}</div>
                <div className="cv2__speech-title">{s.title}</div>
                <div className="cv2__speech-meta">
                  <span>{s.duration}</span>
                  <span>{s.words} words</span>
                  <span>HANSARD {s.hansardRef}</span>
                  {s.clipped && <span style={{ color: 'var(--cv-accent)' }}>★ clipped</span>}
                  <span>· {s.topics.join(' · ')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export { Civic2, CvToday, CvBills, CvCases, CvHansard };
