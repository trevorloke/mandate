import React from 'react';
import './coalition-directory.css';
import { COA_LEDGER as COA_LEDGER_FB, COA_ORGS } from './coalition-data';
import { useLiveRecords } from './auth/useLiveRecords';

// Mandate 2.0 — Coalition · DIRECTORY tab
// Org cards + deep file pane (history, contacts, asks, affiliations)

const { useState: cdUS } = React;

const STATUS_TONE = {
  public:'#2a4d35', committed:'#6b8b73', warm:'#c5874f',
  prospect:'#5a7a8a', hostile:'#b94a3a',
};

const fmtK = (n) => {
  if (!n) return '—';
  if (n >= 1_000_000) return (n/1_000_000).toFixed(1) + 'M';
  if (n >= 1000) return (n/1000).toFixed(0) + 'k';
  return n.toLocaleString();
};

// Deep-file fallback, keyed by slug so it can be matched against live org records.
const ORG_FILES_FB = Object.entries(COA_ORGS).map(([slug, v]) => ({ slug, ...v }));

const CoaDirectory = () => {
  const { records: COA_LEDGER } = useLiveRecords('coalition', 'endorsement', COA_LEDGER_FB);
  const { records: orgFiles } = useLiveRecords('coalition', 'org', ORG_FILES_FB);
  const [sel, setSel] = cdUS('bcfl');
  const [filter, setFilter] = cdUS('all');

  const orgs = COA_LEDGER;
  const filtered = filter === 'all' ? orgs : orgs.filter(o => o.status === filter);

  const open = COA_LEDGER.find(o => o.slug === sel);
  const file = orgFiles.find(o => o.slug === sel); // deep file may not exist for all

  return (
    <div className="cd">
      <div className="cd__head">
        <div>
          <div className="cd__eyebrow">Coalition · directory</div>
          <h2>Organisation files <em>— 22 in network</em></h2>
        </div>
        <div className="cd__filters">
          {['all','public','committed','warm','prospect','hostile'].map(k => (
            <button key={k} className={`cd__filter ${filter===k?'on':''}`} onClick={()=>setFilter(k)}>
              {k.toUpperCase()}
              <em>{k==='all'?orgs.length:orgs.filter(o=>o.status===k).length}</em>
            </button>
          ))}
        </div>
      </div>

      <div className="cd__layout">
        {/* card grid */}
        <div className="cd__grid">
          {filtered.map(o => {
            const isSel = sel === o.slug;
            return (
              <div
                key={o.id}
                className={`cd__card cd__card--${o.status} ${isSel?'on':''}`}
                onClick={()=>setSel(o.slug)}
              >
                <div className="cd__card-stripe" style={{background:STATUS_TONE[o.status]}} />
                <div className="cd__card-body">
                  <div className="cd__card-meta">
                    <span className="cd__card-id">{o.id}</span>
                    <span className={`cd__card-status status--${o.status}`}>{o.status}</span>
                  </div>
                  <h4>{o.org}</h4>
                  <div className="cd__card-sector">{o.sector}</div>
                  <div className="cd__card-stats">
                    <div><span>members</span><b>{fmtK(o.members)}</b></div>
                    <div><span>reach</span><b>{fmtK(o.reach)}</b></div>
                    <div><span>champ</span><b>{o.champion}</b></div>
                  </div>
                  {o.note && <p className="cd__card-note">{o.note.slice(0,90)}{o.note.length>90?'…':''}</p>}
                </div>
              </div>
            );
          })}
        </div>

        {/* deep file pane */}
        <div className="cd__file">
          {open ? (
            <>
              <div className={`cd__file-head cd__file-head--${open.status}`}>
                <div className="cd__file-eyebrow">{open.id} · ORG FILE</div>
                <h3>{open.org}</h3>
                <div className="cd__file-meta">
                  <span>{open.sector}</span>
                  {file?.founded && <span>· founded {file.founded}</span>}
                  {file?.hq && <span>· {file.hq}</span>}
                  {file?.web && <span>· {file.web}</span>}
                </div>
              </div>

              <div className="cd__file-stats">
                <div><span>MEMBERS</span><b>{fmtK(open.members)}</b></div>
                <div><span>REACH</span><b>{fmtK(open.reach)}</b></div>
                <div><span>$ COMMIT</span><b>${open.money.toLocaleString()}</b></div>
                {file?.affiliates && <div><span>AFFILIATES</span><b>{file.affiliates}</b></div>}
              </div>

              {file?.contacts && (
                <div className="cd__file-section">
                  <div className="cd__file-h">CONTACTS</div>
                  <div className="cd__contacts">
                    {file.contacts.map((c,i) => (
                      <div key={i} className={`cd__contact cd__contact--${c.tier}`}>
                        <div className="cd__contact-avatar">{c.name.split(' ').map(p=>p[0]).join('').slice(0,2)}</div>
                        <div className="cd__contact-body">
                          <b>{c.name}</b>
                          <em>{c.title}</em>
                        </div>
                        <span className="cd__contact-tier">{c.tier}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="cd__file-section">
                <div className="cd__file-h">STRATEGY</div>
                <p className="cd__file-p">{open.strategy}</p>
              </div>

              {file?.history && (
                <div className="cd__file-section">
                  <div className="cd__file-h">TOUCH HISTORY</div>
                  <div className="cd__history">
                    {file.history.map((h,i) => (
                      <div key={i} className="cd__h-row">
                        <span className="cd__h-date">{h.date.slice(5)}</span>
                        <span className={`cd__h-kind cd__h-kind--${h.kind}`}>{h.kind}</span>
                        <span className="cd__h-text">{h.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {file?.asks && (
                <div className="cd__file-section">
                  <div className="cd__file-h">ASKS · MOVES</div>
                  <div className="cd__asks">
                    {file.asks.map((a,i) => (
                      <div key={i} className={`cd__ask cd__ask--${a.stage}`}>
                        <span className="cd__ask-id">{a.id}</span>
                        <span className="cd__ask-text">{a.text}</span>
                        <span className={`cd__ask-stage stage--${a.stage}`}>{a.stage}</span>
                        <span className={`cd__ask-value v--${a.value}`}>{a.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {file?.affiliated && (
                <div className="cd__file-section">
                  <div className="cd__file-h">AFFILIATED ORGS</div>
                  <div className="cd__affil">
                    {file.affiliated.map(slug => {
                      const a = COA_LEDGER.find(o => o.slug === slug);
                      return a ? (
                        <button key={slug} className="cd__affil-chip" onClick={()=>setSel(slug)}>
                          <i className="dot" style={{background:STATUS_TONE[a.status]}} />
                          {a.org}
                        </button>
                      ) : null;
                    })}
                  </div>
                </div>
              )}

              {open.risks && open.risks.length > 0 && (
                <div className="cd__file-section">
                  <div className="cd__file-h">RISKS</div>
                  {open.risks.map((r,i) => (
                    <div key={i} className="cd__risk">
                      <span className="cd__risk-kind">{r.kind}</span>
                      <span>{r.text}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="cd__file-actions">
                <button>Open in Civic</button>
                <button>Log touch</button>
                <button>+ New ask</button>
                <button className="primary">Schedule meeting</button>
              </div>
            </>
          ) : (
            <div className="cd__empty">Select an organisation.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export { CoaDirectory };