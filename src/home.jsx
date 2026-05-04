import React, { useEffect, useRef, useState } from 'react';
import './home.css';
import { Spark2, ModDot2, Pill, MOD2, modByKey, useNav2 } from './shell';
import { WORKSPACE, INDEX, PILLARS, TODAY, MOD_CARDS } from './data';
import { ObjRef } from './fabric';
import { Flipbook } from './flipbook';

// Mandate 2.0 — Home view

const Home2 = () => {
  const { go } = useNav2();

  return (
    <main className="home2" data-screen-label="01 Home">
      {/* ── Masthead */}
      <div className="home2__plate">
        <div className="home2__plate-left">
          <div className="eyebrow">{new Date().toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })} · {WORKSPACE.name}</div>
          <h1 className="home2__greeting">
            Good morning, <em>Marcus.</em>
          </h1>
          <p className="home2__dek">
            <ObjRef kind="claim" id="vance-housing">Vance housing quote</ObjRef> in the Sun.
            Counter ready, <span className="mark">34 words</span>. <ObjRef kind="org" id="bcfl">BCFL</ObjRef> endorsement releases <span className="mark">07:50</span>.
            Bill 14 second reading <span className="mark">14:30</span>. Runway is short.
          </p>
        </div>
        <div className="home2__index">
          <div className="home2__index-top">
            <span className="home2__index-label">Mandate Index</span>
            <span className="home2__index-band">{INDEX.band}</span>
          </div>
          <div className="home2__index-val tnum">
            {Math.round(INDEX.value * 1000)}
            <span className="delta">+{(INDEX.delta*100).toFixed(1)}</span>
          </div>
          <div className="home2__index-chart">
            <Spark2 data={INDEX.history} w={380} h={46} color="var(--ink)" />
          </div>
          <div>
            <div className="home2__index-targ">
              <span>4-pillar composite</span>
              <span>Target <b>{Math.round(INDEX.target*1000)}</b></span>
            </div>
            <div className="home2__index-scale">
              <div className="bar" style={{ width: (INDEX.value * 100) + '%' }} />
              <div className="tick" style={{ left: (INDEX.target * 100) + '%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Editorial break: Flipbook */}
      <Flipbook />

      {/* ── Pillar instruments */}
      <div className="home2__section-head">
        <h2>Pillars</h2>
        <span className="ey">Source → module</span>
      </div>
      <div className="home2__pillars">
        {PILLARS.map(p => (
          <div key={p.id} className={'pillar' + (p.alert ? ' pillar--alert' : '')} onClick={() => go(p.sourceModule)}>
            <div className="pillar__hd">
              <span className="pillar__name">{p.name}</span>
              <span className={'pillar__delta ' + (p.delta >= 0 ? 'up' : 'dn')}>
                {p.delta >= 0 ? '▲' : '▼'} {Math.abs(p.delta*100).toFixed(1)}
              </span>
            </div>
            <div className="pillar__formula">{p.formula}</div>
            <div className="pillar__val tnum">
              {(p.value*1000).toFixed(0)}
              <span className="pct">/{(p.target*1000).toFixed(0)}</span>
            </div>
            <div className="pillar__spark">
              <Spark2 data={p.spark} w={260} h={36} color="currentColor" />
            </div>
            <div className="pillar__brk">
              {p.breakdown.map((b,i) => (
                <div key={i} className="pillar__brk-row">
                  <span className="pillar__brk-k">{b.k}</span>
                  <span className="pillar__brk-v tnum">{b.v}</span>
                  <span className="pillar__brk-detail">{b.detail}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Today stream + Modules */}
      <div className="home2__body">
        <aside className="stream">
          <div className="stream__hd">
            Today <span className="ey">{TODAY.length} · live</span>
          </div>
          {TODAY.map((x, i) => {
            const m = modByKey(x.mod);
            return (
              <div key={i} className={'stream__item' + (x.urgent ? ' stream__item--urgent' : '')} onClick={() => go(x.mod)}>
                <div className="stream__t">{x.t}</div>
                <div>
                  <div className="stream__head">{x.head}</div>
                  <div className="stream__meta">
                    <span className="mod-dot" style={{ background: m.ac }} />
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:9.5, letterSpacing:'0.14em', color: m.ac, textTransform:'uppercase' }}>{m.n}</span>
                    <span style={{ color:'var(--text-4)' }}>·</span>
                    <span>{x.meta}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </aside>

        <div>
          <div className="home2__section-head" style={{ margin: '0 0 0' }}>
            <h2>Modules</h2>
            <span className="ey">10 · live</span>
          </div>
          <div className="mods">
            {MOD_CARDS.map((c, i) => {
              const m = modByKey(c.k);
              return (
                <div
                  key={c.k}
                  className={'mod-row' + (c.alert ? ' mod-row--alert' : '')}
                  style={{ '--mod-c': m.ac }}
                  onClick={() => go(c.k)}>
                  <div className="mod-row__tag">{m.tag}</div>
                  <div className="mod-row__name">
                    <span className="n">{m.n}</span>
                    <span className="s">{m.s}</span>
                    <span className="meta">{c.meta}</span>
                  </div>
                  <div className="mod-row__stat">
                    <span className="v tnum">{c.head}</span>
                    <span className="s">{c.sub}</span>
                  </div>
                  <svg className="mod-row__spark" viewBox="0 0 110 34">
                    {(() => {
                      const data = c.spark;
                      const max = Math.max(...data), min = Math.min(...data);
                      const range = max - min || 1;
                      const pts = data.map((v,j) => [(j/(data.length-1))*110, 34 - ((v-min)/range)*30 - 2]);
                      const d = pts.map((p,j)=>(j?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
                      return <><path d={d + ` L110,34 L0,34 Z`} fill="currentColor" opacity="0.1" /><path d={d} fill="none" stroke="currentColor" strokeWidth="1.3" /></>;
                    })()}
                  </svg>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Constellation — force graph (below the fold) */}
      <section className="home2__constellation">
        <div className="home2__constellation-hd">
          <div>
            <h2>Constellation</h2>
            <div className="lede">Every object — bills, voters, donors, canvassers, endorsements, opponents — and the lines between them.</div>
          </div>
          <span className="ey">2,847 nodes · 14,210 edges</span>
        </div>
        <div className="constellation2">
          <ForceGraph />
        </div>
      </section>

      {/* ── Flow strip */}
      <div className="home2__flow">
        <div>
          <div className="home2__flow-ey"><span className="live-dot" />Live · 8 minutes ago</div>
        </div>
        <div className="home2__flow-sum">
          <em>07:41</em> Sun prints Vance on housing. <em>07:45</em> Opposition clips it.
          <em>07:52</em> Beacon drafts counter. <em>07:56</em> Coalition pulls BCFL co-sign.
          <em>08:00</em> Queued for 09:00. Ledger tags spend. Civic files for Bill 14 remarks.
        </div>
      </div>

      <footer className="home2__foot">
        <span>Meridian West · T-{WORKSPACE.daysToVote}d · Build 2.0.14</span>
        <span className="colophon">Signed in as Marcus Reyes, Campaign Manager</span>
      </footer>
    </main>
  );
};

// ── Force graph constellation (minimal, from scratch, no libs)
const ForceGraph = () => {
  const canvasRef = useRef(null);
  const nodesRef = useRef(null);
  const edgesRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [drag, setDrag] = useState(null);

  // Build graph once
  if (!nodesRef.current) {
    const nodes = [];
    const edges = [];
    // Centre: the campaign
    nodes.push({ id:'campaign', label:'Meridian West', kind:'core', r:14, x:0, y:0, fx:0, fy:0 });
    // 10 modules around the campaign
    MOD2.forEach((m, i) => {
      const angle = (i / MOD2.length) * Math.PI * 2 - Math.PI/2;
      const R = 160;
      nodes.push({ id:'m-'+m.k, label:m.n, kind:'module', r:9, color:m.ac,
        x: Math.cos(angle)*R, y: Math.sin(angle)*R });
      edges.push({ from:'campaign', to:'m-'+m.k, weight:1 });
    });
    // Objects under each module (a handful)
    const perMod = {
      ground: ['Univ 31-B','Metrotown turf','Lit-drop route','Script v4'],
      beacon: ['Housing counter','BCFL release','OpEd draft'],
      raise:  ['Cheung $5k','Fall gala','Major Q pipeline'],
      ledger: ['Q2 filing','Venue $3.2k','OT variance'],
      coalition: ['BCFL','EHC','Sikh Council','Nurses'],
      opposition: ['Vance quote','Liu debate','Brenner hold'],
      site: ['Donate A/B','Events page','Volunteer form'],
      events: ['Metrotown rally','Coffee w/ seniors','Sign plant'],
      civic: ['Bill 14','Casework C-3109','Promise ledger'],
      academy: ['Doorstep course','Compliance review','Field briefing'],
    };
    MOD2.forEach((m, i) => {
      const parent = nodes.find(n => n.id === 'm-'+m.k);
      const children = perMod[m.k] || [];
      children.forEach((lbl, j) => {
        const a = Math.atan2(parent.y, parent.x) + (j - children.length/2) * 0.22;
        const R = 260 + (j%2)*20;
        nodes.push({ id:'o-'+m.k+'-'+j, label:lbl, kind:'object', r:4.5, color:m.ac,
          x: Math.cos(a)*R, y: Math.sin(a)*R });
        edges.push({ from:'m-'+m.k, to:'o-'+m.k+'-'+j, weight:0.6 });
      });
    });
    // Cross-links — the interesting bit
    const cross = [
      ['o-opposition-0','o-beacon-0'],  // Vance quote → Housing counter
      ['o-coalition-0','o-beacon-1'],   // BCFL → release
      ['o-civic-0','o-ledger-0'],       // Bill 14 → filing ref
      ['o-ground-0','o-coalition-1'],   // Univ 31-B → EHC
      ['o-raise-0','o-events-0'],       // Cheung → rally
      ['o-events-0','o-beacon-0'],
      ['o-academy-0','o-civic-0'],
    ];
    cross.forEach(([a,b]) => edges.push({ from:a, to:b, weight:0.3, cross:true }));

    nodes.forEach(n => { n.vx = 0; n.vy = 0; });
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }

  // Physics loop
  useEffect(() => {
    let raf;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * devicePixelRatio;
      canvas.height = r.height * devicePixelRatio;
      canvas.style.width = r.width + 'px';
      canvas.style.height = r.height + 'px';
    };
    resize();
    window.addEventListener('resize', resize);

    const step = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      // Repulsion between nodes
      for (let i=0; i<nodes.length; i++) {
        for (let j=i+1; j<nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = b.x-a.x, dy = b.y-a.y;
          const d2 = dx*dx + dy*dy + 0.01;
          const f = 1200 / d2;
          const d = Math.sqrt(d2);
          const fx = (dx/d)*f, fy = (dy/d)*f;
          if (a.fx === undefined) { a.vx -= fx; a.vy -= fy; }
          if (b.fx === undefined) { b.vx += fx; b.vy += fy; }
        }
      }
      // Spring edges
      edges.forEach(e => {
        const a = nodes.find(n=>n.id===e.from), b = nodes.find(n=>n.id===e.to);
        if (!a || !b) return;
        const dx = b.x-a.x, dy = b.y-a.y;
        const d = Math.sqrt(dx*dx+dy*dy) || 1;
        const rest = e.cross ? 180 : (a.kind==='core' ? 160 : 80);
        const f = (d - rest) * 0.008 * e.weight;
        const fx = (dx/d)*f, fy = (dy/d)*f;
        if (a.fx === undefined) { a.vx += fx; a.vy += fy; }
        if (b.fx === undefined) { b.vx -= fx; b.vy -= fy; }
      });
      // Integrate
      nodes.forEach(n => {
        if (n.fx !== undefined) { n.x = n.fx; n.y = n.fy; return; }
        n.vx *= 0.82; n.vy *= 0.82;
        n.x += n.vx; n.y += n.vy;
      });
      // Draw
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0,0,w,h);
      ctx.save();
      ctx.translate(w/2, h/2);
      ctx.scale(devicePixelRatio, devicePixelRatio);

      // Edges
      edges.forEach(e => {
        const a = nodes.find(n=>n.id===e.from), b = nodes.find(n=>n.id===e.to);
        if (!a || !b) return;
        ctx.strokeStyle = e.cross ? 'rgba(255,212,0,0.4)' : 'rgba(12,12,12,0.08)';
        ctx.lineWidth = e.cross ? 0.8 : 0.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });

      // Nodes
      nodes.forEach(n => {
        const isHover = hover === n.id;
        ctx.fillStyle = n.kind==='core' ? '#0c0c0c' :
                        n.kind==='module' ? (n.color || '#0c0c0c') :
                        '#3f3f3f';
        ctx.globalAlpha = n.kind==='object' ? 0.7 : 1;
        ctx.beginPath();
        ctx.arc(n.x, n.y, isHover ? n.r*1.4 : n.r, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Label
        if (n.kind !== 'object' || isHover) {
          ctx.fillStyle = n.kind==='core' ? '#0c0c0c' : (isHover ? '#0c0c0c' : 'rgba(12,12,12,0.7)');
          ctx.font = (n.kind==='core' ? '600 13px ' : '500 11px ') + 'ui-sans-serif,system-ui,sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(n.label, n.x, n.y + n.r + 14);
        }
      });
      ctx.restore();
      raf = requestAnimationFrame(step);
    };
    step();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [hover]);

  const onMove = (e) => {
    const canvas = canvasRef.current;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left - r.width/2;
    const y = e.clientY - r.top - r.height/2;
    if (drag) {
      const n = nodesRef.current.find(nn => nn.id === drag);
      if (n) { n.x = x; n.y = y; n.vx = 0; n.vy = 0; }
      return;
    }
    let found = null;
    for (const n of nodesRef.current) {
      const dx = n.x - x, dy = n.y - y;
      if (dx*dx + dy*dy < (n.r+3)**2) { found = n.id; break; }
    }
    if (found !== hover) setHover(found);
  };
  const onDown = (e) => {
    if (hover && hover !== 'campaign') setDrag(hover);
  };
  const onUp = () => setDrag(null);

  return (
    <canvas
      ref={canvasRef}
      style={{ width:'100%', height:'100%', cursor: drag ? 'grabbing' : (hover ? 'grab' : 'default') }}
      onMouseMove={onMove}
      onMouseDown={onDown}
      onMouseUp={onUp}
      onMouseLeave={onUp}
    />
  );
};

export { Home2, ForceGraph };