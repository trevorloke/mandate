import React from 'react';
import './raise-modals.css';
import { RAISE_KPIS, RAISE_STAGES, RAISE_PROSPECTS, RAISE_DONORS, RAISE_PROSPECT_DETAIL } from './raise-data';

// Mandate 2.0 — Raise modals (Log Gift + Add Donor)

const { useState: rmUS, useEffect: rmUE, useMemo: rmUM, useRef: rmUR } = React;

/* ── Donor lookup combobox ─────────────────────────── */
const DonorCombo = ({ value, onPick, onAddNew }) => {
  const [q, setQ] = rmUS(value || '');
  const [open, setOpen] = rmUS(false);
  rmUE(() => { setQ(value || ''); }, [value]);

  const all = [...(RAISE_DONORS || []), ...(RAISE_PROSPECTS || []).map(p => ({
    id: p.id, name: p.name, gift: 0, ltv: 0, list: p.tags?.[0] || '', last: p.last,
    isProspect: true, capacity: p.capacity,
  }))];
  const filtered = q.trim() ? all.filter(d => d.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6) : all.slice(0, 6);

  return (
    <div className="r-combo">
      <input
        className="r-input"
        placeholder="Type a donor name… or paste email"
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
      />
      {open && (
        <div className="r-combo__results">
          {filtered.map(d => (
            <div key={d.id} className="r-combo__row" onMouseDown={() => { onPick(d); setOpen(false); }}>
              <div>
                <div className="name">{d.name}</div>
                <div className="meta">
                  {d.isProspect ? `prospect · cap ${d.capacity}` : `${d.list} · last ${d.last}`}
                </div>
              </div>
              <div className="meta">{d.isProspect ? 'NEW' : `${d.freq || ''}`}</div>
              <div className="ltv">{d.isProspect ? d.capacity : `LTV $${(d.ltv || 0).toLocaleString()}`}</div>
            </div>
          ))}
          <div className="r-combo__row add-new" onMouseDown={() => { onAddNew && onAddNew(q); setOpen(false); }}>
            + ADD NEW DONOR{q ? ` · "${q}"` : ''}
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Log Gift Modal ────────────────────────────────── */
const LogGiftModal = ({ open, prefillDonor, onClose, onLogged, onSwitchToAdd }) => {
  const [donor, setDonor] = rmUS(null);
  const [amount, setAmount] = rmUS('');
  const [fund, setFund] = rmUS('General');
  const [method, setMethod] = rmUS('cheque');
  const [source, setSource] = rmUS('major');
  const [appeal, setAppeal] = rmUS('');
  const [recur, setRecur] = rmUS('one-time');
  const [date, setDate] = rmUS('2026-04-22');
  const [notes, setNotes] = rmUS('');
  const [pledged, setPledged] = rmUS(false);

  rmUE(() => {
    if (open && prefillDonor) {
      setDonor(prefillDonor);
    }
    if (!open) {
      // reset on close
      setTimeout(() => {
        setDonor(null); setAmount(''); setFund('General');
        setMethod('cheque'); setSource('major'); setAppeal('');
        setRecur('one-time'); setNotes(''); setPledged(false);
      }, 200);
    }
  }, [open, prefillDonor]);

  // Cycle cap math (BC: $1,400 / individual / yr)
  const CAP = 1400;
  const ytdGiven = donor?.ltv ? Math.min(donor.ltv % 1500, 1200) : 0; // playful synthetic value
  const numAmt = parseFloat(String(amount).replace(/[^\d.]/g, '')) || 0;
  const newTotal = ytdGiven + numAmt;
  const capPct = Math.min((newTotal / CAP) * 100, 120);
  const overCap = newTotal > CAP;
  const nearCap = !overCap && newTotal > CAP * 0.85;

  const canSubmit = donor && numAmt > 0;

  const submit = () => {
    if (!canSubmit) return;
    onLogged && onLogged({
      donor: donor.name,
      amount: numAmt,
      fund, method, source, appeal, recur, notes,
      pledged,
    });
    onClose();
  };

  return (
    <>
      <div className={`r-modal-mask ${open ? 'open' : ''}`} onClick={onClose}></div>
      <div className={`r-modal ${open ? 'open' : ''}`} role="dialog" aria-modal="true">
        <div className="r-mh">
          <div>
            <div className="r-mh__eyebrow">Raise · journal entry</div>
            <div className="r-mh__title">Log a gift <em>— {date}</em></div>
          </div>
          <button className="r-mh__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="r-mb">
          <div className="r-mb__form">
            {/* Donor */}
            <div className="r-form-sec">
              <div className="r-form-sec__h">
                <span>Donor</span>
                <em>required · pull from file or add new</em>
              </div>
              <div className="r-field">
                <div className="r-field__lbl">Donor name<span className="req">*</span></div>
                <DonorCombo
                  value={donor?.name || ''}
                  onPick={d => setDonor(d)}
                  onAddNew={(name) => onSwitchToAdd && onSwitchToAdd(name)}
                />
              </div>
            </div>

            {/* Amount + recurrence */}
            <div className="r-form-sec">
              <div className="r-form-sec__h">
                <span>Amount & cadence</span>
                <em>BC cycle cap $1,400/yr</em>
              </div>
              <div className="r-row amt-row">
                <div className="r-field">
                  <div className="r-field__lbl">Amount<span className="req">*</span></div>
                  <div className="r-money-input big">
                    <input
                      className="r-input"
                      placeholder="0.00"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      inputMode="decimal"
                    />
                  </div>
                  <div className="r-chips">
                    {[25, 50, 100, 250, 500, 1000].map(p => (
                      <button key={p} className={`r-chip ${numAmt === p ? 'is-active' : ''}`}
                        onClick={() => setAmount(String(p))}>${p}</button>
                    ))}
                  </div>
                </div>
                <div className="r-field">
                  <div className="r-field__lbl">Cadence</div>
                  <div className="r-seg">
                    <button className={recur === 'one-time' ? 'is-active' : ''} onClick={() => setRecur('one-time')}>One-time</button>
                    <button className={recur === 'monthly' ? 'is-active' : ''} onClick={() => setRecur('monthly')}>Monthly</button>
                    <button className={recur === 'pledge' ? 'is-active' : ''} onClick={() => setRecur('pledge')}>Pledge</button>
                  </div>
                </div>
                <div className="r-field">
                  <div className="r-field__lbl">Date received</div>
                  <input type="date" className="r-input" value={date} onChange={e => setDate(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Allocation */}
            <div className="r-form-sec">
              <div className="r-form-sec__h">
                <span>Allocation & source</span>
              </div>
              <div className="r-row cols-3">
                <div className="r-field">
                  <div className="r-field__lbl">Fund</div>
                  <select className="r-select" value={fund} onChange={e => setFund(e.target.value)}>
                    <option>General</option>
                    <option>Climate Forward</option>
                    <option>Housing campaign</option>
                    <option>Education · Cypress</option>
                    <option>Major giving</option>
                    <option>Restricted · venue</option>
                  </select>
                </div>
                <div className="r-field">
                  <div className="r-field__lbl">Source</div>
                  <select className="r-select" value={source} onChange={e => setSource(e.target.value)}>
                    <option value="major">Major gift</option>
                    <option value="online">Online (form)</option>
                    <option value="email">Email appeal</option>
                    <option value="event">Event</option>
                    <option value="recurring">Recurring renewal</option>
                    <option value="ride">Ride-along</option>
                    <option value="walk">Walk-in</option>
                  </select>
                </div>
                <div className="r-field">
                  <div className="r-field__lbl">Method</div>
                  <select className="r-select" value={method} onChange={e => setMethod(e.target.value)}>
                    <option value="cheque">Cheque</option>
                    <option value="card">Credit card</option>
                    <option value="ach">ACH / e-transfer</option>
                    <option value="wire">Wire</option>
                    <option value="cash">Cash</option>
                    <option value="stock">Stock / in-kind</option>
                  </select>
                </div>
              </div>
              <div className="r-row" style={{ marginTop: 12 }}>
                <div className="r-field">
                  <div className="r-field__lbl">Appeal / list code <em>optional</em></div>
                  <input className="r-input" value={appeal} onChange={e => setAppeal(e.target.value)} placeholder="e.g. 26-Q2-CLIMATE · BRIDGE-PARK" />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="r-form-sec">
              <div className="r-form-sec__h">
                <span>Officer note</span>
                <em>optional · feeds the moves log</em>
              </div>
              <textarea className="r-textarea" rows="3"
                placeholder="Closed at full ask. Wants to host house party. — MR"
                value={notes} onChange={e => setNotes(e.target.value)} />
              <div style={{ marginTop: 10, display: 'flex', gap: 14, fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b6855' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={pledged} onChange={e => setPledged(e.target.checked)} />
                  Mark as pledge fulfillment
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked />
                  Send receipt + thank-you sequence
                </label>
              </div>
            </div>
          </div>

          {/* Side panel */}
          <aside className="r-mb__side">
            {!donor ? (
              <div className="r-side-empty">
                Pick a donor to see history,<br/>cycle cap, and wealth screen.
                <em>or add a new one</em>
              </div>
            ) : (
              <>
                <div className="r-side-sec">
                  <div className="r-side-donor__name">{donor.name}</div>
                  <div className="r-side-donor__meta">
                    {donor.isProspect ? `Prospect · capacity ${donor.capacity}` : `${donor.list || 'Donor file'} · ${donor.freq || 'one-time'}`}
                  </div>
                  <div className="r-side-stats">
                    <div className="r-side-stat">
                      <div className="r-side-stat__lbl">LTV</div>
                      <div className="r-side-stat__val">${(donor.ltv || 0).toLocaleString()}</div>
                    </div>
                    <div className="r-side-stat">
                      <div className="r-side-stat__lbl">Last gift</div>
                      <div className="r-side-stat__val ink">${(donor.gift || 0).toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                <div className="r-side-sec">
                  <div className="r-side-sec__h">Cycle cap · this year</div>
                  <div className="r-cap-meter">
                    <div className="r-cap-meter__bar">
                      <div className={`r-cap-meter__fill ${overCap ? 'over' : nearCap ? 'warn' : ''}`}
                        style={{ width: `${Math.min(capPct, 100)}%` }}></div>
                    </div>
                    <div className="r-cap-meter__lbl">
                      <span>Given <b>${ytdGiven.toLocaleString()}</b></span>
                      <span>+ this <b className={overCap ? 'over' : ''}>${numAmt.toLocaleString()}</b></span>
                      <span>cap <b>${CAP.toLocaleString()}</b></span>
                    </div>
                  </div>
                  {overCap && (
                    <div className="r-flag err">
                      <div className="r-flag__icon">!</div>
                      <div className="r-flag__body">
                        <b>Over Elections BC limit</b>
                        ${(newTotal - CAP).toLocaleString()} above cap. Cannot deposit until split or refunded.
                      </div>
                    </div>
                  )}
                  {nearCap && !overCap && (
                    <div className="r-flag">
                      <div className="r-flag__icon">!</div>
                      <div className="r-flag__body">
                        <b>Near cap</b>
                        ${(CAP - newTotal).toLocaleString()} remaining for {donor.name.split(' ')[0]} this cycle.
                      </div>
                    </div>
                  )}
                </div>

                {donor.isProspect && RAISE_PROSPECT_DETAIL?.[donor.id] && (
                  <div className="r-side-sec">
                    <div className="r-side-sec__h">Wealth screen</div>
                    <div className="r-wealth">
                      <div className="r-wealth__score">
                        <div className="r-wealth__score-letter">A</div>
                        <div className="r-wealth__score-meta">
                          <b>{RAISE_PROSPECT_DETAIL[donor.id].wealthScore}</b>
                          {RAISE_PROSPECT_DETAIL[donor.id].affil}
                        </div>
                      </div>
                      <div className="r-wealth__row"><span>Asks · closed</span><b>{RAISE_PROSPECT_DETAIL[donor.id].asks} · {RAISE_PROSPECT_DETAIL[donor.id].closed}</b></div>
                      <div className="r-wealth__row"><span>Total given</span><b>{RAISE_PROSPECT_DETAIL[donor.id].given}</b></div>
                    </div>
                  </div>
                )}

                <div className="r-side-sec">
                  <div className="r-side-sec__h">Recent gifts</div>
                  <div className="r-recent">
                    {donor.isProspect && RAISE_PROSPECT_DETAIL?.[donor.id]?.history ? (
                      RAISE_PROSPECT_DETAIL[donor.id].history.filter(h => h.n !== '—').slice(0, 4).map((h, i) => (
                        <div className="r-recent__row" key={i}>
                          <span className="r-recent__d">{h.d.slice(5)}</span>
                          <span className="r-recent__a">{h.a}</span>
                          <span className="r-recent__amt">{h.n}</span>
                        </div>
                      ))
                    ) : (
                      <>
                        <div className="r-recent__row">
                          <span className="r-recent__d">{(donor.last || '').slice(5)}</span>
                          <span className="r-recent__a">{donor.list || 'Last gift'}</span>
                          <span className="r-recent__amt">${(donor.gift || 0).toLocaleString()}</span>
                        </div>
                        <div className="r-recent__row">
                          <span className="r-recent__d">First on file</span>
                          <span className="r-recent__a">{donor.first || '—'}</span>
                          <span className="r-recent__amt">—</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </aside>
        </div>

        <div className="r-mf">
          <div className="r-mf__hint">
            <span><kbd>⌘</kbd>+<kbd>S</kbd> save</span>
            <span><kbd>esc</kbd> cancel</span>
            <span style={{ color: overCap ? '#b94a3a' : '#8a8472' }}>
              {overCap ? 'Resolve cap before posting' : canSubmit ? 'Ready to post' : 'Donor + amount required'}
            </span>
          </div>
          <div className="r-mf__actions">
            <button className="r-mf__btn ghost" onClick={onClose}>Cancel</button>
            <button className="r-mf__btn ghost">Save draft</button>
            <button className={`r-mf__btn ${overCap ? 'warn' : ''}`} disabled={!canSubmit} onClick={submit}>
              {overCap ? 'Post & flag for review' : 'Post gift'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

/* ── Add Donor Modal ──────────────────────────────── */
const AddDonorModal = ({ open, prefillName, onClose, onAdded, onSwitchToGift }) => {
  const [first, setFirst] = rmUS('');
  const [last, setLast] = rmUS('');
  const [email, setEmail] = rmUS('');
  const [phone, setPhone] = rmUS('');
  const [address, setAddress] = rmUS('');
  const [city, setCity] = rmUS('Vancouver');
  const [postal, setPostal] = rmUS('');
  const [empName, setEmpName] = rmUS('');
  const [empTitle, setEmpTitle] = rmUS('');
  const [list, setList] = rmUS('Email · 2026 launch');
  const [capacity, setCapacity] = rmUS('5K');
  const [tags, setTags] = rmUS([]);
  const [referrer, setReferrer] = rmUS('');
  const [optIn, setOptIn] = rmUS(true);

  rmUE(() => {
    if (open && prefillName) {
      const parts = prefillName.trim().split(/\s+/);
      setFirst(parts[0] || '');
      setLast(parts.slice(1).join(' '));
    }
    if (!open) {
      setTimeout(() => {
        setFirst(''); setLast(''); setEmail(''); setPhone('');
        setAddress(''); setPostal(''); setEmpName(''); setEmpTitle('');
        setTags([]); setReferrer(''); setCapacity('5K');
      }, 200);
    }
  }, [open, prefillName]);

  const TAGS = ['climate', 'housing', 'transit', 'education', 'tech', 'founder', 'lawyer', 'union', 'first-time', 'rookie', 'PAC-eligible', 'monthly-prospect', 'major-prospect'];
  const toggleTag = (t) => setTags(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);

  const fullName = `${first} ${last}`.trim();
  const canSubmit = fullName.length > 1 && (email.length > 4 || phone.length > 6);

  // Synthetic wealth indicator based on capacity tier
  const capNum = parseInt(String(capacity).replace(/[^\d]/g, ''), 10) || 0;
  const wealthLetter = capNum >= 25 ? 'A' : capNum >= 10 ? 'B' : capNum >= 3 ? 'C' : 'D';
  const wealthBlurb = capNum >= 25 ? '$25M+ AUM range · major prospect'
    : capNum >= 10 ? '$1–10M AUM range · mid-major prospect'
    : capNum >= 3 ? '$250K–1M AUM range · mid donor'
    : 'Unscreened · base donor';

  const submit = (alsoLogGift = false) => {
    if (!canSubmit) return;
    const newDonor = {
      id: 'd-' + Date.now().toString(36),
      name: fullName,
      gift: 0, freq: 'New', ltv: 0,
      first: '2026-04', last: '2026-04-22',
      list,
    };
    onAdded && onAdded(newDonor);
    onClose();
    if (alsoLogGift) {
      setTimeout(() => onSwitchToGift && onSwitchToGift(newDonor), 240);
    }
  };

  return (
    <>
      <div className={`r-modal-mask ${open ? 'open' : ''}`} onClick={onClose}></div>
      <div className={`r-modal ${open ? 'open' : ''}`} role="dialog" aria-modal="true">
        <div className="r-mh">
          <div>
            <div className="r-mh__eyebrow">Raise · donor file</div>
            <div className="r-mh__title">Add a donor <em>— record + screen</em></div>
          </div>
          <button className="r-mh__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="r-mb">
          <div className="r-mb__form">
            <div className="r-form-sec">
              <div className="r-form-sec__h">
                <span>Identity</span>
                <em>name + one channel required</em>
              </div>
              <div className="r-row cols-2">
                <div className="r-field">
                  <div className="r-field__lbl">First name<span className="req">*</span></div>
                  <input className="r-input" value={first} onChange={e => setFirst(e.target.value)} placeholder="Mira" />
                </div>
                <div className="r-field">
                  <div className="r-field__lbl">Last name<span className="req">*</span></div>
                  <input className="r-input" value={last} onChange={e => setLast(e.target.value)} placeholder="Aoki" />
                </div>
              </div>
              <div className="r-row cols-2">
                <div className="r-field">
                  <div className="r-field__lbl">Email</div>
                  <input className="r-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="mira@example.com" />
                </div>
                <div className="r-field">
                  <div className="r-field__lbl">Phone</div>
                  <input className="r-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(604) 555-0123" />
                </div>
              </div>
            </div>

            <div className="r-form-sec">
              <div className="r-form-sec__h">
                <span>Address</span>
                <em>Elections BC requires for $100+ gifts</em>
              </div>
              <div className="r-row">
                <div className="r-field">
                  <div className="r-field__lbl">Street</div>
                  <input className="r-input" value={address} onChange={e => setAddress(e.target.value)} placeholder="1234 Cambie Street" />
                </div>
              </div>
              <div className="r-row cols-3">
                <div className="r-field">
                  <div className="r-field__lbl">City</div>
                  <input className="r-input" value={city} onChange={e => setCity(e.target.value)} />
                </div>
                <div className="r-field">
                  <div className="r-field__lbl">Province</div>
                  <select className="r-select" defaultValue="BC">
                    <option>BC</option><option>AB</option><option>ON</option><option>QC</option><option>Other</option>
                  </select>
                </div>
                <div className="r-field">
                  <div className="r-field__lbl">Postal</div>
                  <input className="r-input" value={postal} onChange={e => setPostal(e.target.value)} placeholder="V5Z 1A4" />
                </div>
              </div>
            </div>

            <div className="r-form-sec">
              <div className="r-form-sec__h">
                <span>Employment</span>
                <em>required for major-gift compliance</em>
              </div>
              <div className="r-row cols-2">
                <div className="r-field">
                  <div className="r-field__lbl">Employer</div>
                  <input className="r-input" value={empName} onChange={e => setEmpName(e.target.value)} placeholder="Climate Forward" />
                </div>
                <div className="r-field">
                  <div className="r-field__lbl">Title</div>
                  <input className="r-input" value={empTitle} onChange={e => setEmpTitle(e.target.value)} placeholder="Executive Director" />
                </div>
              </div>
            </div>

            <div className="r-form-sec">
              <div className="r-form-sec__h">
                <span>Segmentation</span>
                <em>routes them into the right list + sequence</em>
              </div>
              <div className="r-row cols-2">
                <div className="r-field">
                  <div className="r-field__lbl">Source list</div>
                  <select className="r-select" value={list} onChange={e => setList(e.target.value)}>
                    <option>Email · 2026 launch</option>
                    <option>Climate · 2024</option>
                    <option>Doorstep · 2025</option>
                    <option>Town hall · 2025</option>
                    <option>Ride-along · 2024</option>
                    <option>Major giving</option>
                    <option>Referral</option>
                    <option>Imported · screened</option>
                  </select>
                </div>
                <div className="r-field">
                  <div className="r-field__lbl">Estimated capacity</div>
                  <select className="r-select" value={capacity} onChange={e => setCapacity(e.target.value)}>
                    <option value="500">$500 · base</option>
                    <option value="3K">$3K · mid</option>
                    <option value="5K">$5K · mid-major</option>
                    <option value="10K">$10K · major</option>
                    <option value="25K">$25K · principal</option>
                    <option value="50K">$50K+ · principal</option>
                  </select>
                </div>
              </div>
              <div className="r-row cols-2">
                <div className="r-field">
                  <div className="r-field__lbl">Referred by</div>
                  <input className="r-input" value={referrer} onChange={e => setReferrer(e.target.value)} placeholder="D. Ng · board" />
                </div>
                <div className="r-field">
                  <div className="r-field__lbl">Comm. preference</div>
                  <div className="r-seg">
                    <button className={optIn ? 'is-active' : ''} onClick={() => setOptIn(true)}>Opt-in</button>
                    <button className={!optIn ? 'is-active' : ''} onClick={() => setOptIn(false)}>Mail only</button>
                  </div>
                </div>
              </div>
              <div className="r-field" style={{ marginTop: 12 }}>
                <div className="r-field__lbl">Issue tags <em>click to toggle</em></div>
                <div className="r-tag-cluster">
                  {TAGS.map(t => (
                    <button key={t} className={`r-tag ${tags.includes(t) ? 'is-on' : ''}`} onClick={() => toggleTag(t)}>
                      {tags.includes(t) ? '✓ ' : ''}{t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <aside className="r-mb__side">
            <div className="r-side-sec">
              <div className="r-side-sec__h">Live preview</div>
              <div className="r-side-donor__name">
                {fullName || <span style={{ color: '#b8b1a0', fontStyle: 'italic' }}>New donor…</span>}
              </div>
              <div className="r-side-donor__meta">{list}{empName ? ` · ${empName}` : ''}</div>
              <div className="r-side-stats">
                <div className="r-side-stat">
                  <div className="r-side-stat__lbl">Capacity</div>
                  <div className="r-side-stat__val">${capacity}</div>
                </div>
                <div className="r-side-stat">
                  <div className="r-side-stat__lbl">Tags</div>
                  <div className="r-side-stat__val ink">{tags.length}</div>
                </div>
              </div>
            </div>

            <div className="r-side-sec">
              <div className="r-side-sec__h">Wealth screen <em style={{ float: 'right', fontStyle: 'italic', textTransform: 'none', letterSpacing: 0, color: '#b8b1a0' }}>auto</em></div>
              <div className="r-wealth">
                <div className="r-wealth__score">
                  <div className="r-wealth__score-letter">{wealthLetter}</div>
                  <div className="r-wealth__score-meta">
                    <b>Capacity {capacity}</b>
                    {wealthBlurb}
                  </div>
                </div>
                <div className="r-wealth__row"><span>Real-estate match</span><b>{capNum >= 10 ? '2 properties' : capNum >= 3 ? '1 property' : 'none on file'}</b></div>
                <div className="r-wealth__row"><span>Political giving</span><b>{capNum >= 10 ? 'Yes · 4 cycles' : 'None on file'}</b></div>
                <div className="r-wealth__row"><span>Board seats</span><b>{capNum >= 25 ? '3 known' : capNum >= 10 ? '1 known' : 'none on file'}</b></div>
              </div>
              <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8a8472', lineHeight: 1.5 }}>
                Auto-screen runs after save. Manual review recommended for capacity ≥ $10K.
              </div>
            </div>

            <div className="r-side-sec">
              <div className="r-side-sec__h">Compliance check</div>
              <div className="r-wealth">
                <div className="r-wealth__row"><span>Donor type</span><b>Individual</b></div>
                <div className="r-wealth__row"><span>BC residency</span><b>{city === 'Vancouver' ? 'Confirmed' : 'Pending verify'}</b></div>
                <div className="r-wealth__row"><span>Foreign source</span><b>No flag</b></div>
                <div className="r-wealth__row"><span>Cycle cap</span><b>$1,400 / yr</b></div>
              </div>
            </div>
          </aside>
        </div>

        <div className="r-mf">
          <div className="r-mf__hint">
            <span><kbd>⌘</kbd>+<kbd>S</kbd> save</span>
            <span style={{ color: '#8a8472' }}>
              {canSubmit ? 'Ready to add to file · 4,213 → 4,214' : 'Name + email or phone required'}
            </span>
          </div>
          <div className="r-mf__actions">
            <button className="r-mf__btn ghost" onClick={onClose}>Cancel</button>
            <button className="r-mf__btn ghost" disabled={!canSubmit} onClick={() => submit(true)}>Add & log gift →</button>
            <button className="r-mf__btn" disabled={!canSubmit} onClick={() => submit(false)}>Add donor</button>
          </div>
        </div>
      </div>
    </>
  );
};

/* ── Toast ──────────────────────────────────────────── */
const RaiseToast = ({ msg, open, onUndo }) => (
  <div className={`r-toast ${open ? 'open' : ''}`}>
    <span>{msg}</span>
    {onUndo && <button className="undo" onClick={onUndo}>Undo</button>}
  </div>
);

export { LogGiftModal, AddDonorModal, RaiseToast, DonorCombo };