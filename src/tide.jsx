// Tide (Attention Chart) — what the world is paying attention to, who drives it,
// how they feel, and why, read off a consented panel. Sibling to Beacon: Beacon
// broadcasts; Tide explains the attention underneath.
import { useState, useEffect, useCallback } from 'react';
import './tide.css';
import { api } from './auth/api';
import { useAuth } from './auth/AuthContext';
import { useTide } from './use-tide';
import { PanelJourney } from './tide-panel';

const pct = (x) => `${Math.round((x || 0) * 100)}%`;
const net = (s) => (s?.pos || 0) - (s?.neg || 0);
const moodWord = (s) => { const n = net(s); return n > 0.15 ? 'positive' : n < -0.15 ? 'negative' : 'mixed'; };
const fmtAge = (k) => (k && k !== 'unknown' ? k : '—');

// ── Small presentational primitives ──
function SentimentBar({ s }) {
  if (!s) return null;
  return (
    <div className="tide-sent" title={`${pct(s.pos)} positive · ${pct(s.neu)} neutral · ${pct(s.neg)} negative`}>
      <span className="tide-sent__seg tide-sent__seg--pos" style={{ width: pct(s.pos) }} />
      <span className="tide-sent__seg tide-sent__seg--neu" style={{ width: pct(s.neu) }} />
      <span className="tide-sent__seg tide-sent__seg--neg" style={{ width: pct(s.neg) }} />
    </div>
  );
}

function Momentum({ m }) {
  const up = m > 0.005, down = m < -0.005;
  const cls = up ? 'is-up' : down ? 'is-down' : 'is-flat';
  const arrow = up ? '▲' : down ? '▼' : '▬';
  return <span className={`tide-mom ${cls}`}>{arrow} {pct(Math.abs(m))}</span>;
}

function Confidence({ c }) {
  const lvl = c >= 0.66 ? 'high' : c >= 0.33 ? 'moderate' : 'low';
  return (
    <span className={`tide-conf tide-conf--${lvl}`} title={`Confidence ${pct(c)} — directional, not census-grade`}>
      {lvl} confidence
    </span>
  );
}

function Sparkline({ values }) {
  if (!values || values.length < 2) return <div className="tide-spark tide-spark--empty">—</div>;
  const max = Math.max(...values), min = Math.min(...values), span = max - min || 1;
  const W = 120, H = 28;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - ((v - min) / span) * H}`).join(' ');
  return (
    <svg className="tide-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// Share bars for one demographic dimension (age / gender / region).
function CutBars({ title, cut }) {
  const entries = Object.entries(cut || {}).sort((a, b) => b[1].share - a[1].share);
  if (!entries.length) return null;
  return (
    <div className="tide-cut">
      <div className="tide-cut__title">{title}</div>
      {entries.map(([k, v]) => (
        <div key={k} className="tide-cut__row">
          <span className="tide-cut__lbl">{fmtAge(k)}</span>
          <span className="tide-cut__bar"><span style={{ width: pct(v.share) }} /></span>
          <span className="tide-cut__val">{pct(v.share)}</span>
          <span className="tide-cut__mood" data-mood={moodWord(v.sentiment)}>{moodWord(v.sentiment)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Topic detail (selected wave) ──
function TopicDetail({ topicId, canEdit, onChanged }) {
  const [topic, setTopic] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const r = await api.tideTopic(topicId); setTopic(r.topic); } catch { /* surfaced by list */ }
  }, [topicId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  if (!topic) return <div className="tide-detail tide-detail--loading">Loading reading…</div>;
  const readings = topic.readings || [];
  const latest = readings[0];
  const volumes = [...readings].reverse().map((r) => r.volume);

  const refreshNow = async () => {
    setBusy(true);
    try { await api.tideRefresh(topicId); await load(); onChanged?.(); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete topic "${topic.name}" and its readings?`)) return;
    await api.tideDeleteTopic(topicId); onChanged?.(true);
  };

  return (
    <div className="tide-detail">
      <div className="tide-detail__hd">
        <div>
          <h3 className="tide-detail__name">{topic.name}</h3>
          <div className="tide-detail__kw">{(topic.keywords || []).map((k) => <span key={k} className="tide-kw">{k}</span>)}</div>
        </div>
        {canEdit && (
          <div className="tide-detail__actions">
            <button className="tide-btn" onClick={refreshNow} disabled={busy}>{busy ? 'Reading…' : 'Refresh now'}</button>
            <button className="tide-btn tide-btn--ghost" onClick={remove}>Delete</button>
          </div>
        )}
      </div>

      {!latest ? <p className="tide-msg">No reading yet.</p> : (
        <>
          <div className="tide-detail__stats">
            <div className="tide-stat"><div className="tide-stat__num">{latest.volume.toLocaleString()}</div><div className="tide-stat__lbl">attention volume</div></div>
            <div className="tide-stat"><div className="tide-stat__num"><Momentum m={latest.momentum} /></div><div className="tide-stat__lbl">vs previous</div></div>
            <div className="tide-stat"><div className="tide-stat__num tide-stat__spark"><Sparkline values={volumes} /></div><div className="tide-stat__lbl">last {volumes.length} readings</div></div>
            <div className="tide-stat"><div className="tide-stat__num">{latest.panelN}</div><div className="tide-stat__lbl">panelists · <Confidence c={latest.confidence} /></div></div>
          </div>

          <div className="tide-why">
            <div className="tide-why__tag">WHY</div>
            <p>{latest.why}</p>
          </div>

          <div className="tide-detail__grid">
            <div className="tide-panelcard">
              <div className="tide-panelcard__hd">Sentiment</div>
              <SentimentBar s={latest.sentiment} />
              <div className="tide-panelcard__legend">
                <span><i className="tide-dot tide-dot--pos" /> {pct(latest.sentiment.pos)} positive</span>
                <span><i className="tide-dot tide-dot--neg" /> {pct(latest.sentiment.neg)} negative</span>
              </div>
            </div>
            <div className="tide-panelcard">
              <div className="tide-panelcard__hd">Top drivers</div>
              <ul className="tide-drivers">
                {(latest.drivers || []).map((d, i) => (
                  <li key={i}><span className="tide-drivers__name">{d.name}</span><span className="tide-drivers__kind">{d.kind}</span><span className="tide-drivers__pull">{pct(d.pull)}</span></li>
                ))}
              </ul>
            </div>
          </div>

          <div className="tide-breakdown">
            <div className="tide-breakdown__hd">Who is paying attention <span className="tide-breakdown__sub">— consented ground truth</span></div>
            <div className="tide-breakdown__cols">
              <CutBars title="Age" cut={latest.demographics?.cuts?.age} />
              <CutBars title="Gender" cut={latest.demographics?.cuts?.gender} />
              <CutBars title="Region" cut={latest.demographics?.cuts?.region} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Waves tab ──
function WavesTab({ topics, canEdit, onChanged, selected, setSelected }) {
  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.tideCreateTopic({ name: name.trim(), keywords: keywords.split(',').map((s) => s.trim()).filter(Boolean) });
      setName(''); setKeywords('');
      await onChanged();
      if (r.id) setSelected(r.id);
    } catch (e2) {
      setErr(e2.status === 402 ? 'Topic limit reached on your plan — upgrade to track more.' : (e2.message || 'Could not create topic.'));
    } finally { setBusy(false); }
  };

  return (
    <div className="tide-waves">
      <div className="tide-waves__list">
        {canEdit && (
          <form className="tide-newtopic" onSubmit={create}>
            <input className="tide-input" placeholder="Track a topic (e.g. Housing affordability)" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="tide-input" placeholder="keywords, comma, separated" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
            <button className="tide-btn" disabled={busy || !name.trim()}>{busy ? 'Adding…' : 'Track'}</button>
            {err && <div className="tide-err">{err}</div>}
          </form>
        )}
        {topics.map((t) => {
          const l = t.latest;
          return (
            <button key={t.id} className={`tide-wave ${selected === t.id ? 'is-sel' : ''} ${t.spiking ? 'is-spiking' : ''}`} onClick={() => setSelected(t.id)}>
              <div className="tide-wave__top">
                <span className="tide-wave__name">{t.spiking && <span className="tide-spike" title="momentum spike">⚡</span>}{t.name}</span>
                {l && <Momentum m={l.momentum} />}
              </div>
              {l ? (
                <>
                  <div className="tide-wave__meta">
                    <span className="tide-wave__vol">{l.volume.toLocaleString()}</span>
                    <span className="tide-wave__who">{fmtAge(l.demographics?.top?.age)} · {l.demographics?.top?.region || '—'}</span>
                  </div>
                  <SentimentBar s={l.sentiment} />
                </>
              ) : <div className="tide-wave__meta">no reading yet</div>}
            </button>
          );
        })}
      </div>
      <div className="tide-waves__detail">
        {selected ? <TopicDetail topicId={selected} canEdit={canEdit} onChanged={(deleted) => { onChanged(); if (deleted) setSelected(null); }} />
          : <div className="tide-empty-detail">Select a topic to read who's driving attention and why.</div>}
      </div>
    </div>
  );
}

// Distribution bars for a whole-panel dimension (counts already normalized).
function Dist({ title, obj }) {
  return (
    <div className="tide-cut">
      <div className="tide-cut__title">{title}</div>
      {Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
        <div key={k} className="tide-cut__row">
          <span className="tide-cut__lbl">{fmtAge(k)}</span>
          <span className="tide-cut__bar"><span style={{ width: pct(v) }} /></span>
          <span className="tide-cut__val">{pct(v)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Panel tab ──
function PanelTab({ panel, canEdit, onChanged }) {
  const [form, setForm] = useState({ ageBand: '', gender: '', region: '', interests: '' });
  const [busy, setBusy] = useState(false);
  if (!panel) return <p className="tide-msg">Loading panel…</p>;

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.tideAddPanelist({
        ageBand: form.ageBand || undefined, gender: form.gender || undefined, region: form.region || undefined,
        interests: form.interests.split(',').map((s) => s.trim()).filter(Boolean),
      });
      setForm({ ageBand: '', gender: '', region: '', interests: '' });
      await onChanged();
    } finally { setBusy(false); }
  };

  return (
    <div className="tide-paneltab">
      <div className="tide-paneltab__stats">
        <div className="tide-stat"><div className="tide-stat__num">{panel.size.toLocaleString()}</div><div className="tide-stat__lbl">consented panelists</div></div>
        <div className="tide-stat"><div className="tide-stat__num">{pct(panel.avgCompleteness)}</div><div className="tide-stat__lbl">avg profile completeness</div></div>
      </div>
      <p className="tide-note">Demographics are self-reported ground truth — not inferred from public signals. Confidence on every cut is disclosed; readings are directional, not census-grade.</p>
      {panel.representativeness && (
        <div className="tide-rep">
          <div className="tide-rep__stat"><b>{panel.representativeness.effectiveN.toLocaleString()}</b><span>effective sample (of {panel.size.toLocaleString()})</span></div>
          <div className="tide-rep__stat"><b>{panel.representativeness.designEffect}×</b><span>design effect</span></div>
          <div className="tide-rep__stat"><b>{panel.representativeness.drift}</b><span>raw skew vs targets</span></div>
          <div className="tide-rep__note">Cuts are post-stratified (raked) toward population targets, so a surge "among 25–34 women" reflects the population, not who happened to join. Heavier correction lowers the effective sample — and the confidence with it.</div>
        </div>
      )}
      <div className="tide-breakdown__cols">
        <Dist title="Age" obj={panel.age} />
        <Dist title="Gender" obj={panel.gender} />
        <Dist title="Region" obj={panel.region} />
      </div>
      {canEdit && (
        <form className="tide-addpanelist" onSubmit={add}>
          <div className="tide-addpanelist__hd">Add a consented panelist (progressive profiling)</div>
          <div className="tide-addpanelist__row">
            <select className="tide-input" value={form.ageBand} onChange={(e) => setForm({ ...form, ageBand: e.target.value })}>
              <option value="">Age band…</option>{['18-24', '25-34', '35-44', '45-54', '55-64', '65+'].map((a) => <option key={a}>{a}</option>)}
            </select>
            <select className="tide-input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">Gender…</option>{['female', 'male', 'nonbinary'].map((g) => <option key={g}>{g}</option>)}
            </select>
            <select className="tide-input" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>
              <option value="">Region…</option>{['urban', 'suburban', 'rural'].map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <input className="tide-input" placeholder="interests, comma, separated" value={form.interests} onChange={(e) => setForm({ ...form, interests: e.target.value })} />
          <button className="tide-btn" disabled={busy}>{busy ? 'Adding…' : 'Add panelist'}</button>
        </form>
      )}
      <PanelJourney canEdit={canEdit} onChanged={onChanged} />
    </div>
  );
}

// ── Sources tab ──
const LAYER_NOTE = {
  panel: 'The asset — consented, owned, the only source of demographic ground truth.',
  licensed: 'Licensed & official feeds. Boring, legal, reliable.',
  public: 'Public web, within terms of service. Useful, commodity, never the foundation.',
  modelled: 'Derived estimates. Directional, clearly labelled.',
};
function SourcesTab({ sources }) {
  const order = ['panel', 'licensed', 'public', 'modelled'];
  return (
    <div className="tide-sources">
      {order.map((layer) => {
        const items = sources.filter((s) => s.layer === layer);
        if (!items.length) return null;
        return (
          <div key={layer} className="tide-srclayer">
            <div className="tide-srclayer__hd"><span className={`tide-layerbadge tide-layerbadge--${layer}`}>{layer}</span><span className="tide-srclayer__note">{LAYER_NOTE[layer]}</span></div>
            {items.map((s) => (
              <div key={s.id} className="tide-src">
                <span className="tide-src__name">{s.label}</span>
                <span className={`tide-src__state ${s.live ? 'is-live' : ''}`}>{s.live ? 'live' : 'seeded'}</span>
                {s.note && <span className="tide-src__note">{s.note}</span>}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Page ──
function Tide() {
  const { has } = useAuth();
  const canEdit = has ? has('editor') : true;
  const { topics, panel, sources, status, loading, error, refresh } = useTide();
  const [tab, setTab] = useState('waves');
  const [picked, setPicked] = useState(null);
  const [seeding, setSeeding] = useState(false);

  // Effective selection: the user's pick if it still exists, else the first topic.
  const exists = picked && topics.some((t) => t.id === picked);
  const selected = exists ? picked : (topics[0]?.id || null);
  const setSelected = setPicked;

  const ribbon = (() => {
    const withReading = topics.filter((t) => t.latest);
    const avgConf = withReading.length ? withReading.reduce((s, t) => s + (t.latest.confidence || 0), 0) / withReading.length : 0;
    const avgNet = withReading.length ? withReading.reduce((s, t) => s + net(t.latest.sentiment), 0) / withReading.length : 0;
    return { topics: topics.length, panel: panel?.size || 0, conf: avgConf, mood: avgNet };
  })();

  const loadSample = async () => {
    setSeeding(true);
    try { await api.tideSeed(); await refresh(); } finally { setSeeding(false); }
  };

  return (
    <main className="tide" data-screen-label="Tide">
      <header className="tide__masthead">
        <div>
          <div className="tide__plate">ATTENTION CHART</div>
          <h1 className="tide__title">Tide</h1>
          <p className="tide__dek">What the world is paying attention to, who's driving it, how they feel, and why — read off a consented panel.</p>
        </div>
        <div className="tide__masthead-r">
          {status?.worker && <div className="tide__worker" title="Refresh worker">{status.worker.running ? '● live' : '○ idle'} · 4h refresh</div>}
          {topics.length > 0 && <a className="tide-export" href={api.tideExportUrl()} download>Export CSV</a>}
        </div>
      </header>

      <div className="tide__ribbon">
        <div className="tide-metric"><div className="tide-metric__num">{ribbon.topics}</div><div className="tide-metric__lbl">topics tracked</div></div>
        <div className="tide-metric"><div className="tide-metric__num">{ribbon.panel.toLocaleString()}</div><div className="tide-metric__lbl">panel size</div></div>
        <div className="tide-metric"><div className="tide-metric__num">{pct(ribbon.conf)}</div><div className="tide-metric__lbl">avg confidence</div></div>
        <div className="tide-metric"><div className="tide-metric__num" data-mood={ribbon.mood > 0.15 ? 'positive' : ribbon.mood < -0.15 ? 'negative' : 'mixed'}>{ribbon.mood > 0 ? '+' : ''}{Math.round(ribbon.mood * 100)}</div><div className="tide-metric__lbl">net sentiment</div></div>
      </div>

      <nav className="tide__tabs">
        {['waves', 'panel', 'sources'].map((t) => (
          <button key={t} className={`tide__tab ${tab === t ? 'is-on' : ''}`} onClick={() => setTab(t)}>
            {t === 'waves' ? 'Waves' : t === 'panel' ? 'Panel' : 'Sources'}
          </button>
        ))}
      </nav>

      {error && <div className="tide-err tide-err--page">{error}</div>}

      {loading ? <p className="tide-msg">Loading attention data…</p>
        : (topics.length === 0 && tab === 'waves') ? (
          <div className="tide-empty">
            <p>No topics tracked yet.</p>
            <p className="tide-empty__hint">Track a topic above, or load a sample attention dataset — a few hundred consented panelists and a starter topic set — to see Tide working end to end.</p>
            {canEdit && <button className="tide-btn tide-btn--big" onClick={loadSample} disabled={seeding}>{seeding ? 'Loading sample data…' : 'Load sample attention data'}</button>}
          </div>
        ) : (
          <>
            {tab === 'waves' && <WavesTab topics={topics} canEdit={canEdit} onChanged={refresh} selected={selected} setSelected={setSelected} />}
            {tab === 'panel' && <PanelTab panel={panel} canEdit={canEdit} onChanged={refresh} />}
            {tab === 'sources' && <SourcesTab sources={sources} />}
          </>
        )}
    </main>
  );
}

export { Tide };
