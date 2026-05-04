import React, { useState as acUS2 } from 'react';
import './academy.css';
import { ACAD_ARTICLES, ACAD_COURSES, ACAD_FACULTY, ACAD_PATH_SCHED, ACAD_PATH_CERTS } from './academy-data';

// Academy 2.0 — Reading + Path + Faculty tabs

/* ─── READING (long-form article) ─── */
function AcReading({ articleId, onBack }) {
  const a = ACAD_ARTICLES.find(x => x.id === articleId) || ACAD_ARTICLES[0];

  const sections = [
    'A door is older than a poll',
    'The first six seconds',
    'The hard door',
    'Walking off well',
    'Seven rules, distilled',
  ];

  return (
    <div className="lyc-read__wrap">
      <div className="lyc-read">
        <div style={{fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.2em', color:'var(--lyc-mute)', cursor:'pointer', marginBottom:18}} onClick={onBack}>← The Reading Room</div>
        <div className="lyc-read__kicker">{a.kicker}</div>
        <h1 className="lyc-read__h1">The Grammar of the <em>Doorstep</em></h1>
        <p className="lyc-read__deck">{a.deck}</p>
        <div className="lyc-read__byline">By <b>{a.author}</b> · {a.date} · Issue №14</div>

        <div className="lyc-read__body">
          <p>The first thing you need to understand about the doorstep is that it is older than the poll. Older than the survey, older than the focus group, older than the call list and the pamphlet and the lawn sign and every clever piece of campaign technology we have invented in the last hundred and twenty years. The doorstep is just two strangers, one threshold, and the question of whether the next thirty seconds will be worth either of their lives.</p>

          <p>That is the form. The form has not changed. The content — the names of the parties, the shape of the issues, the dialect of the moment — those change. The form does not. And every campaign that has ever lasted longer than a single news cycle has, somewhere in it, learned to operate the form well.</p>

          <h2 className="lyc-read__h2">The first <em>six seconds</em></h2>

          <p>What happens in the first six seconds determines what happens in the next six minutes. This is not metaphor. There is fairly good behavioural research on the question, and there is much better tape — twenty years of canvass-recording in three provinces — to back it up. Six seconds is the window in which the person on the other side of the door decides whether you are a salesman, a missionary, a neighbour, or an opponent. Once they decide, they will spend the rest of the conversation looking for evidence to confirm that decision.</p>

          <div className="lyc-read__pull">A door is not a poll. It is a conversation, and the rules of conversation predate the rules of polling by ten thousand years.</div>

          <p>So your first six seconds have one job: to deny them all four of the bad readings. You are not selling. You are not preaching. You are not opposing. You are, in fact, a neighbour, and you have a small and reasonable thing to ask. The trick is that you have to demonstrate this without saying it, because saying it triggers the sales-pitch detector, which is the very detector you are trying to bypass.</p>

          <h2 className="lyc-read__h2">The <em>hard</em> door</h2>

          <p>The hard door deserves its own essay, and it will get one in the next issue. But the short version is this: the hard door is not about you. It is, almost without exception, the cumulative bill of every promise made to a person on a porch in the last twenty years that did not come true. You did not make those promises. You are paying interest on them anyway.</p>

          <div className="lyc-read__sidenote">
            <h4>Field card · keep on the clipboard</h4>
            The four moves, in order: <strong>Name yourself plainly. Ask permission. Ask a question first. Listen for ninety seconds before you speak about the candidate.</strong> If any of these feels uncomfortable on a particular doorstep, do them anyway — the discomfort is the work.
          </div>

          <p>This is why the hard door teaches you more than any other kind. The polite door is a politeness machine: nothing important is being transacted, and you both know it. The hostile door is a refusal: nothing can be transacted, and you both know that too. But the hard door — the open, sceptical, weary, slightly aggrieved door — is the only one where what you do in the next minute actually matters.</p>

          <h2 className="lyc-read__h2">Walking <em>off</em> well</h2>

          <p>The last move is the move nobody teaches and everyone gets wrong. How you leave a door matters as much as how you arrive at one. The thirty seconds after you say "thanks for your time" — the way you turn, the way you look back at the porch, the way you handle the next house in the row, all of it — is being watched by the very people you just spoke to, and by the people in the houses on either side of them.</p>

          <p>Most canvassers, especially new ones, deflate at the moment of departure. They've held it together for ninety seconds and now they want to exhale. Don't. Walk off the porch the same way you walked on. The conversation isn't over until you are out of sight of the porch.</p>

          <p>If we get even half of this right — half of the volunteers, on half of the doors, in the last fourteen days — we will turn out a margin that no piece of advertising in the province can buy. That is the proposition. It has been the proposition for a hundred and twenty years. It is the proposition that built the labour movement, that built the suffrage movement, that built every successful provincial party in this country. It is the form. The form has not changed.</p>

          <p style={{fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--lyc-mute)', textAlign:'center', marginTop:36, paddingTop:20, borderTop:'1px solid var(--lyc-rule)'}}>
            ◆  ◆  ◆
          </p>
          <p style={{fontFamily:'var(--font-serif)', fontStyle:'italic', color:'var(--lyc-mute)', fontSize:14, textAlign:'center'}}>
            Mike Cohn is Senior Organizer at Mount Pleasant. His Masterclass <em>The Doorstep Conversation</em> is in the Mandate Library.
          </p>
        </div>
      </div>

      <aside className="lyc-read__toc">
        <h5>In this issue</h5>
        <ol>
          {sections.map((s, i) => <li key={s} className={i===1?'is-on':''}>{s}</li>)}
        </ol>
        <h5 style={{marginTop:24}}>Also reading</h5>
        <ol>
          {ACAD_ARTICLES.filter(x=>x.id!==a.id).slice(0,3).map(x => (
            <li key={x.id} style={{paddingLeft:0}}>{x.title}<br/><span style={{fontFamily:'var(--font-mono)', fontSize:9, color:'var(--lyc-mute-2)'}}>{x.author}</span></li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

/* ─── PATH (personal dashboard) ─── */
function AcPath({ onPickCourse }) {
  const inProgress = ACAD_COURSES.filter(c => c.progress > 0 && c.progress < 1);
  const featured = ACAD_COURSES.find(c => c.featured);

  return (
    <div className="lyc-path">
      <div className="lyc-path__col">
        <h3>Continue<small>{inProgress.length} in progress</small></h3>
        {inProgress.map(c => {
          const cls = c.cat.toLowerCase().includes('field') ? 'canvass' : c.cat.toLowerCase().includes('comms') ? 'media' : 'policy';
          const nextChap = (c.chapterList || [{n: Math.ceil(c.chapters * c.progress) + 1, t:'Continue where you left off'}])
            .find(ch => ch.now) || (c.chapterList && c.chapterList[Math.floor(c.progress * c.chapters)]) || {n: Math.ceil(c.chapters * c.progress) + 1, t:'Resume'};
          return (
            <div key={c.id} className="lyc-path__cur" onClick={()=>onPickCourse(c.id)}>
              <div className={`lyc-path__cur-poster ${cls}`}>
                <div className="lyc-path__cur-poster-num">{c.id.slice(-2).toUpperCase()}</div>
              </div>
              <div className="lyc-path__cur-body">
                <div className="lyc-path__cur-cat">{c.cat}</div>
                <div className="lyc-path__cur-title">{c.title}</div>
                <div className="lyc-path__cur-instr">— {c.instructor}</div>
                <div className="lyc-path__cur-prog">
                  <div className="lyc-path__cur-bar"><span style={{width:`${c.progress*100}%`}}></span></div>
                  <span className="lyc-path__cur-pct">{Math.round(c.progress*100)}%</span>
                </div>
                <div className="lyc-path__cur-next">NEXT · CH {nextChap.n}<b>{nextChap.t}</b></div>
              </div>
            </div>
          );
        })}

        <h3 style={{marginTop:36}}>This week<small>4 sessions on calendar</small></h3>
        <div className="lyc-path__schedule">
          {ACAD_PATH_SCHED.map((s, i) => (
            <div key={i} className="lyc-path__sched-row">
              <span className="lyc-path__sched-d">{s.d}<small>{s.mo}</small></span>
              <span className="lyc-path__sched-w">{s.w}<small>{s.s}</small></span>
              <span className="lyc-path__sched-t" style={{
                color: s.tag==='live' ? 'var(--lyc-accent)' : s.tag==='due' ? 'var(--lyc-spot)' : 'var(--lyc-mute)'
              }}>{s.tag.toUpperCase()}<b>{s.t}</b></span>
            </div>
          ))}
        </div>
      </div>

      <div className="lyc-path__col">
        <div className="lyc-path__stats">
          <div className="lyc-path__stat">
            <span className="lyc-path__stat-v">14</span>
            <span className="lyc-path__stat-k">courses started</span>
          </div>
          <div className="lyc-path__stat">
            <span className="lyc-path__stat-v">9</span>
            <span className="lyc-path__stat-k">completed</span>
          </div>
          <div className="lyc-path__stat">
            <span className="lyc-path__stat-v">38<small style={{fontSize:14}}>h</small></span>
            <span className="lyc-path__stat-k">study time</span>
          </div>
        </div>

        <h3>Certifications<small>{ACAD_PATH_CERTS.filter(c=>c.earned).length}/6 earned</small></h3>
        <div className="lyc-path__certs">
          {ACAD_PATH_CERTS.map(cert => (
            <div key={cert.id} className={`lyc-cert ${cert.earned?'':'locked'}`}>
              <div className="lyc-cert__seal">{cert.earned?'✓':'⊘'}</div>
              <div className="lyc-cert__name">{cert.name}</div>
              <div className="lyc-cert__date">{cert.date}</div>
            </div>
          ))}
        </div>

        <h3 style={{marginTop:32}}>Recommended next<small>For your role</small></h3>
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {ACAD_COURSES.filter(c => !c.completed && c.progress===0).slice(0,3).map(c => (
            <div key={c.id} onClick={()=>onPickCourse(c.id)} style={{
              padding:'14px 18px', background:'#fff', border:'1px solid var(--lyc-rule)',
              borderRadius:3, cursor:'pointer', display:'grid',
              gridTemplateColumns:'1fr auto', gap:14, alignItems:'center'
            }}>
              <div>
                <div style={{fontFamily:'var(--font-mono)', fontSize:9.5, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--lyc-accent)'}}>{c.cat}</div>
                <div style={{fontFamily:'var(--font-display)', fontSize:16, marginTop:2}}>{c.title}</div>
                <div style={{fontFamily:'var(--font-serif)', fontStyle:'italic', fontSize:12, color:'var(--lyc-mute)', marginTop:2}}>— {c.instructor}</div>
              </div>
              <div style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--lyc-mute)', letterSpacing:'0.1em'}}>{c.duration}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── FACULTY ─── */
function AcFaculty() {
  return (
    <div>
      <div className="lyc__sect" style={{marginTop:0}}>
        <div className="lyc__sect-h">The Faculty</div>
        <div className="lyc__sect-meta">{ACAD_FACULTY.length} instructors · 28 courses · 12,640 students</div>
      </div>
      <div className="lyc-fac">
        {ACAD_FACULTY.map(f => (
          <article key={f.id} className="lyc-fac-card">
            <div className="lyc-fac-pip"></div>
            <div className="lyc-fac-name">{f.name}</div>
            <div className="lyc-fac-title">{f.title}</div>
            <div className="lyc-fac-bio">{f.bio}</div>
            <div className="lyc-fac-stats">
              <span><b>{f.courses}</b>courses</span>
              <span><b>{f.students.toLocaleString()}</b>students</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export { AcReading, AcPath, AcFaculty };
