import React, { useState as cvUS, useMemo as cvUM } from 'react';
import { CV_MEMBER, CV_BILLS, CV_COMMITTEES, CV_HEARINGS, CV_PROMISES, CV_OFFICE_WEEK, CV_LETTERS, CV_STAFF, CV_SPEND, CV_TRENDS } from './civic-data';

// Civic 2.0 — Committees, Promises, Community, Letters, Spend, Staff, Trends

// ════════════════════════════════════════════════════════════
// COMMITTEES — committees + upcoming hearings
// ════════════════════════════════════════════════════════════
function CvCommittees() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
      <div className="cv2__card">
        <div className="cv2__card-title">
          <span>My committee assignments</span>
          <span className="cv2__card-title-r">{CV_COMMITTEES.length} active</span>
        </div>
        <div>
          {CV_COMMITTEES.map(c => (
            <div key={c.id} className="cv2__cttee">
              <div>
                <div className="cv2__cttee-name">{c.name}</div>
                <div className="cv2__cttee-role">{c.role} · cadence {c.cadence}</div>
              </div>
              <div className="cv2__cttee-stats">
                <div>{c.hearings} hearings</div>
                <div>{c.witnesses} witnesses</div>
                <div>{c.reports} reports</div>
              </div>
              <div className="cv2__cttee-meta">
                Next: {c.nextMeeting.slice(5)} · {c.members} members · {c.role==='Chair' ? 'agenda you' : 'agenda by chair'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="cv2__card">
        <div className="cv2__card-title">
          <span>Upcoming hearings</span>
          <span className="cv2__card-title-r">{CV_HEARINGS.length} scheduled</span>
        </div>
        <div>
          {CV_HEARINGS.map(h => {
            const cttee = CV_COMMITTEES.find(c => c.id === h.cttee);
            return (
              <div key={h.id} className="cv2__hearing">
                <div className="cv2__hearing-head">
                  <div className="cv2__hearing-date">
                    {h.date.slice(5, 10)}
                    <div style={{ fontSize: 9.5, color: 'var(--cv-ink-3)', marginTop: 2 }}>{h.date.slice(11)}</div>
                  </div>
                  <div>
                    <div className="cv2__hearing-title">{h.title}</div>
                    <div className="cv2__hearing-witnesses">
                      {cttee?.name} · witnesses · {h.witnesses.join(' · ')}
                    </div>
                  </div>
                  <span className={'cv2__chip ' + (
                    h.prep.includes('signed') || h.prep.includes('draft') ? 'ok' :
                    h.prep === 'pending' || h.prep.includes('invitations') ? 'warn' : 'danger'
                  )}>
                    {h.prep}
                  </span>
                </div>
                <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--cv-accent-2)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  TOPICS · {h.topics.join(' · ')}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// PROMISES — campaign → governing ledger
// ════════════════════════════════════════════════════════════
function CvPromises() {
  const kept = CV_PROMISES.filter(p => p.status === 'kept').length;
  const onTrack = CV_PROMISES.filter(p => p.status === 'on-track').length;
  const slipping = CV_PROMISES.filter(p => p.status === 'slipping' || p.status === 'at-risk').length;

  return (
    <div>
      {/* Headline metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        <div className="cv2__card">
          <div className="cv2__card-title"><span>Promises · made</span></div>
          <div className="cv2__fy-headline">{CV_PROMISES.length}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cv-accent-2)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>since campaign · 2024</div>
        </div>
        <div className="cv2__card">
          <div className="cv2__card-title"><span>Kept</span></div>
          <div className="cv2__fy-headline" style={{ color: 'var(--cv-accent)' }}>{kept}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cv-accent-2)' }}>{Math.round(kept/CV_PROMISES.length*100)}% of total</div>
        </div>
        <div className="cv2__card">
          <div className="cv2__card-title"><span>On track</span></div>
          <div className="cv2__fy-headline">{onTrack}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cv-accent-2)' }}>active · in stages</div>
        </div>
        <div className="cv2__card">
          <div className="cv2__card-title"><span>At risk · slipping</span></div>
          <div className="cv2__fy-headline" style={{ color: 'var(--cv-warn)' }}>{slipping}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cv-accent-2)' }}>need attention</div>
        </div>
      </div>

      <div className="cv2__card">
        <div className="cv2__card-title">
          <span>Promise ledger · campaign → governing</span>
          <span className="cv2__card-title-r">every promise has receipts · linked to bills, OICs, public records</span>
        </div>
        <div className="cv2__promises-table">
          <div className="cv2__promise-row head">
            <span>#</span>
            <span>Promise · segment</span>
            <span>Stage</span>
            <span>Status</span>
            <span>Progress</span>
            <span style={{ textAlign: 'right' }}>Cost</span>
            <span style={{ textAlign: 'right' }}>◯</span>
          </div>
          {CV_PROMISES.map((p, i) => (
            <div key={p.id} className="cv2__promise-row">
              <span className="cv2__promise-num">{String(i+1).padStart(2, '0')}</span>
              <div>
                <div className="cv2__promise-title">{p.title}</div>
                <div className="cv2__promise-segment">
                  {p.segment} · owner: {p.owner}
                  {p.linkedBill && <span> · linked {CV_BILLS.find(b => b.id === p.linkedBill)?.num || p.linkedBill}</span>}
                </div>
              </div>
              <span className={'cv2__promise-stage ' + p.status}>{p.stage}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cv-ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {p.status.replace(/-/g, ' ')}
              </span>
              <div className={'cv2__promise-pct-bar' + (p.status === 'kept' ? ' kept' : '')}>
                <span style={{ width: (p.pct*100) + '%' }} />
              </div>
              <span className="cv2__promise-cost">{p.cost}</span>
              <span className="cv2__promise-receipts" title={p.evidence.join(' · ')}>{p.receipts}◯</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// COMMUNITY — week calendar
// ════════════════════════════════════════════════════════════
function CvCommunity() {
  const totalBooked = CV_OFFICE_WEEK.reduce((a,c)=>a+c.booked, 0);
  const totalCap = CV_OFFICE_WEEK.reduce((a,c)=>a+c.capacity, 0);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cv-accent-2)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        <span>Constituency calendar · week of Mar 9</span>
        <span>{totalBooked}/{totalCap} attendees · {Math.round(totalBooked/totalCap*100)}% utilization</span>
      </div>

      <div className="cv2__week">
        {CV_OFFICE_WEEK.map(c => (
          <div key={c.id} className="cv2__week-cell">
            <div className="cv2__week-day">
              <span>{c.day} · {c.date}</span>
              {c.kind !== 'off' && <span style={{ color: 'var(--cv-ink-3)' }}>{c.booked}/{c.capacity}</span>}
            </div>
            {c.kind !== 'off' ? (
              <div className={'cv2__week-event ' + c.kind}>
                <div className="cv2__week-time">{c.time}</div>
                <div className="cv2__week-what">{c.what}</div>
                <div className="cv2__week-where">{c.where}</div>
              </div>
            ) : (
              <div className={'cv2__week-event off'}>
                <div className="cv2__week-what">{c.what}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// LETTERS — correspondence inbox/outbox
// ════════════════════════════════════════════════════════════
function CvLetters() {
  const [dir, setDir] = cvUS('all');
  const rows = CV_LETTERS.filter(l => dir === 'all' || l.dir === dir);

  return (
    <div>
      <div className="cv2__cases-filter">
        <span>DIRECTION</span>
        {[['all','all'],['in','inbox'],['out','outbox']].map(([k,l]) => (
          <button key={k} className={'cv2__cases-filter-btn' + (dir===k ? ' is-on' : '')} onClick={() => setDir(k)}>
            {l}
          </button>
        ))}
        <span style={{ marginLeft: 'auto' }}>
          {CV_LETTERS.filter(l=>l.dir==='in').length} in · {CV_LETTERS.filter(l=>l.dir==='out').length} out · {CV_LETTERS.filter(l=>l.status==='new').length} new
        </span>
      </div>

      <table className="hsd">
        <thead>
          <tr><th>At</th><th>Dir</th><th>From / To</th><th>Subject</th><th>Channel</th><th>Status</th><th>Owner</th><th>Pri</th></tr>
        </thead>
        <tbody>
          {rows.map(l => (
            <tr key={l.id}>
              <td className="mono" style={{ fontSize: 10.5 }}>{l.at}</td>
              <td className="mono" style={{ color: l.dir==='in' ? 'var(--cv-ink)' : 'var(--cv-accent)', fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {l.dir==='in' ? '↘ in' : '↗ out'}
              </td>
              <td><a className="cv2__link">{l.who}</a></td>
              <td>{l.subj}</td>
              <td className="mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cv-accent-2)' }}>{l.channel}</td>
              <td>
                <span className={'cv2__chip ' + (
                  l.status === 'new' ? 'info' :
                  l.status === 'sent' || l.status === 'signed · sent' ? 'ok' :
                  l.status.includes('drafted') ? 'warn' : 'mid'
                )}>{l.status}</span>
              </td>
              <td className="mono" style={{ fontSize: 11 }}>{l.owner || '—'}</td>
              <td>
                <span className={'cv2__chip ' + (l.priority === 'high' ? 'danger' : l.priority === 'med' ? 'mid' : '')}>{l.priority}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// SPEND — riding allowance
// ════════════════════════════════════════════════════════════
function CvSpend() {
  const totalUsed = CV_SPEND.reduce((a,r)=>a+r.used, 0);
  const totalBudget = CV_SPEND.reduce((a,r)=>a+r.budget, 0);
  return (
    <div>
      <div className="cv2__spend-grid">
        <div className="cv2__card">
          <div className="cv2__card-title">
            <span>Riding allowance · FY 2025/26 spend</span>
            <span className="cv2__card-title-r">FY 62% elapsed</span>
          </div>
          <div className="cv2__fy-headline">
            ${CV_MEMBER.allowance.spentYTD.toLocaleString()}
            <span> / ${CV_MEMBER.allowance.annual.toLocaleString()}</span>
          </div>
          <div style={{ marginTop: 12 }}>
            {CV_SPEND.map(r => (
              <div key={r.cat} className="cv2__spend-row">
                <span>{r.cat}</span>
                <div className="cv2__spend-bar"><span style={{ width: ((r.used/r.budget)*100) + '%' }} /></div>
                <span className="cv2__spend-num">${r.used.toLocaleString()}</span>
                <span className="cv2__spend-pct">{Math.round((r.used/r.budget)*100)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="cv2__card">
          <div className="cv2__card-title"><span>Fiscal year · summary</span></div>
          <div style={{ display: 'grid', gap: 8, fontSize: 12.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--cv-ink-3)' }}>Spent YTD</span>
              <span className="mono">${CV_MEMBER.allowance.spentYTD.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--cv-ink-3)' }}>Budgeted</span>
              <span className="mono">${totalBudget.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--cv-ink-3)' }}>Burn vs. plan</span>
              <span className="mono">{Math.round((totalUsed/totalBudget)*100)}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--cv-rule)', paddingTop: 8, marginTop: 6, fontWeight: 600 }}>
              <span>Annual cap</span>
              <span className="mono">${CV_MEMBER.allowance.annual.toLocaleString()}</span>
            </div>
          </div>
          <div className="cv2__fy-note">
            On pace. If current trend holds, you'll finish the FY at <b>~97%</b> spend — well inside caps.
            No overrun categories. Translation services lagging — consider expanding offering.
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// STAFF
// ════════════════════════════════════════════════════════════
function CvStaff() {
  return (
    <div className="cv2__card">
      <div className="cv2__card-title">
        <span>Staff register · {CV_STAFF.length} seats</span>
        <span className="cv2__card-title-r">{CV_STAFF.filter(s=>s.on).length} on shift today</span>
      </div>
      <table className="hsd">
        <thead>
          <tr><th>Name</th><th>Role</th><th>Location</th><th>Status</th><th className="num">Caseload</th><th>Seniority</th><th>Email</th></tr>
        </thead>
        <tbody>
          {CV_STAFF.map(s => (
            <tr key={s.id}>
              <td><a className="cv2__link">{s.name}</a></td>
              <td>{s.role}</td>
              <td className="mono" style={{ fontSize: 11 }}>{s.location}</td>
              <td><span className={'cv2__chip ' + (s.on ? 'ok' : 'mid')}>{s.on ? 'on today' : 'off'}</span></td>
              <td className="num">{s.caseload}</td>
              <td className="mono" style={{ fontSize: 11 }}>{s.seniority}</td>
              <td className="mono" style={{ fontSize: 10.5, color: 'var(--cv-ink-3)' }}>{s.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// TRENDS — constituent insights
// ════════════════════════════════════════════════════════════
function CvTrends() {
  const max = Math.max(...CV_TRENDS.map(t => t.case));
  return (
    <div className="cv2__card">
      <div className="cv2__card-title">
        <span>Constituent issue trends · 90 days · casework × canvass × survey</span>
        <span className="cv2__card-title-r">cross-module signal</span>
      </div>
      <div>
        <div className="cv2__trend-row" style={{ borderBottom: '1.5px solid var(--cv-rule-st)', paddingBottom: 8, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cv-accent-2)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          <span>Issue</span>
          <span>Casework / canvass / survey</span>
          <span style={{ textAlign: 'left' }}>Note</span>
          <span style={{ textAlign: 'right' }}>Δ</span>
        </div>
        {CV_TRENDS.map(t => (
          <div key={t.k} className="cv2__trend-row">
            <span className="cv2__trend-label">{t.k}</span>
            <div className="cv2__trend-bars">
              <div className="cv2__trend-mini">
                <span>{t.case} cases</span>
                <div className="cv2__trend-mini-bar"><span style={{ width: (t.case/max*100) + '%' }} /></div>
              </div>
              <div className="cv2__trend-mini">
                <span>{Math.round(t.canvass*100)}% canv</span>
                <div className="cv2__trend-mini-bar"><span style={{ width: (t.canvass*100) + '%' }} /></div>
              </div>
              <div className="cv2__trend-mini">
                <span>{Math.round(t.survey*100)}% surv</span>
                <div className="cv2__trend-mini-bar"><span style={{ width: (t.survey*100) + '%' }} /></div>
              </div>
            </div>
            <span className="cv2__trend-note">{t.note}</span>
            <span className={'cv2__trend-delta ' + (t.delta >= 0 ? 'up' : 'down')}>
              {t.delta >= 0 ? '▲' : '▼'} {Math.abs(t.delta*100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { CvCommittees, CvPromises, CvCommunity, CvLetters, CvSpend, CvStaff, CvTrends };
