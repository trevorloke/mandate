import { useState as acUS, useMemo as acUM } from 'react';
import './academy.css';
import { ACAD_COURSES as ACAD_COURSES_FB, ACAD_CATEGORIES, ACAD_ARTICLES as ACAD_ARTICLES_FB, ACAD_FACULTY as ACAD_FACULTY_FB, ACAD_TRANSCRIPT } from './academy-data';
import { useLiveRecords } from './auth/useLiveRecords';

// Academy 2.0 — Library + Course tabs

/* ─── LIBRARY ─── */
function AcLibrary({ onPickCourse, onPickArticle }) {
  const { records: ACAD_COURSES } = useLiveRecords('academy', 'course', ACAD_COURSES_FB);
  const { records: ACAD_ARTICLES } = useLiveRecords('academy', 'article', ACAD_ARTICLES_FB);
  const featured = ACAD_COURSES.find(c => c.featured) || ACAD_COURSES[0];
  const byCat = acUM(() => {
    const m = {};
    ACAD_CATEGORIES.forEach(c => m[c] = []);
    ACAD_COURSES.forEach(c => { if (m[c.cat]) m[c.cat].push(c); });
    return m;
  }, []);

  return (
    <div>
      {/* FEATURED */}
      {featured && (
      <div className="lyc-feat" onClick={()=>onPickCourse(featured.id)}>
        <div className="lyc-feat__visual">
          <div className="lyc-feat__num">№<br/>14</div>
          <div className="lyc-feat__portrait"></div>
          <div className="lyc-feat__eyebrow">Masterclass · {featured.cat}</div>
          <h2 className="lyc-feat__h1">The <em>Doorstep</em><br/>Conversation</h2>
          <p className="lyc-feat__instr"><b>Taught by</b>{featured.instructor} · {featured.duration} · {featured.chapters} chapters</p>
        </div>
        <aside className="lyc-feat__side">
          <div className="lyc-feat__side-h">Continue · Chapter 4 of 9</div>
          <div className="lyc-feat__chapters">
            {(featured.chapterList || []).slice(0, 6).map(ch => (
              <div key={ch.n} className={`lyc-feat__chap ${ch.done?'done':''} ${ch.now?'now':''}`}>
                <span className="lyc-feat__chap-n">{ch.n.toString().padStart(2,'0')}</span>
                <span className="lyc-feat__chap-t">{ch.t}<small>{ch.sub}</small></span>
                <span className="lyc-feat__chap-d">{ch.d}</span>
              </div>
            ))}
          </div>
          <div className="lyc-feat__progress">
            <div className="lyc-feat__progress-bar"><span style={{width:'0%'}}></span></div>
            <div className="lyc-feat__progress-meta"><span>—</span><span></span></div>
          </div>
          <div className="lyc-feat__cta">
            <button className="lyc-feat__cta-btn">Start course</button>
            <button className="lyc-feat__cta-btn ghost">Save</button>
          </div>
        </aside>
      </div>
      )}

      {/* COURSE GRID */}
      <div className="lyc__sect">
        <div className="lyc__sect-h">Required for Phase III</div>
        <div className="lyc__sect-meta">{ACAD_COURSES.filter(c => c.required).length} {ACAD_COURSES.filter(c => c.required).length === 1 ? 'module' : 'modules'}</div>
      </div>
      <div className="lyc__grid">
        {ACAD_COURSES.filter(c => c.required).map(c => <CourseCard key={c.id} c={c} onPick={onPickCourse} />)}
      </div>

      <div className="lyc__sect">
        <div className="lyc__sect-h">Field & Canvass</div>
        <div className="lyc__sect-meta">{byCat['Field & Canvass'].length} courses</div>
      </div>
      <div className="lyc__grid">
        {byCat['Field & Canvass'].map(c => <CourseCard key={c.id} c={c} onPick={onPickCourse} />)}
      </div>

      <div className="lyc__sect">
        <div className="lyc__sect-h">Communications & Policy</div>
        <div className="lyc__sect-meta">{byCat['Communications'].length + byCat['Policy & Briefings'].length} courses</div>
      </div>
      <div className="lyc__grid">
        {[...byCat['Communications'], ...byCat['Policy & Briefings']].map(c => <CourseCard key={c.id} c={c} onPick={onPickCourse} />)}
      </div>

      {/* READING LIST */}
      <div className="lyc__sect" style={{marginTop:48}}>
        <div className="lyc__sect-h">The Reading Room</div>
        <div className="lyc__sect-meta">Editorial · Field notes · Briefings · 5 new this week</div>
      </div>
      <div className="lyc__reading">
        {ACAD_ARTICLES.filter(a=>a.lead).map(a => (
          <article key={a.id} className="lyc-art lyc-art--lead" onClick={()=>onPickArticle(a.id)}>
            <div className="lyc-art__art"></div>
            <div className="lyc-art__kicker">{a.kicker}</div>
            <h3 className="lyc-art__title">{a.title}</h3>
            <p className="lyc-art__deck">{a.deck}</p>
            {a.pull && <div className="lyc-art__pull">{a.pull}</div>}
            <div className="lyc-art__byline"><b>{a.author}</b><span>·</span><span>{a.date}</span></div>
          </article>
        ))}
        {ACAD_ARTICLES.filter(a=>!a.lead).map(a => (
          <article key={a.id} className="lyc-art" onClick={()=>onPickArticle(a.id)}>
            <div className="lyc-art__kicker">{a.kicker}</div>
            <h3 className="lyc-art__title">{a.title}</h3>
            <p className="lyc-art__deck">{a.deck}</p>
            <div className="lyc-art__byline"><b>{a.author}</b><span>·</span><span>{a.date}</span></div>
          </article>
        ))}
      </div>
    </div>
  );
}

function CourseCard({ c, onPick }) {
  return (
    <div className={`lyc-card ${c.completed?'completed':''} ${c.required?'required':''}`} onClick={()=>onPick(c.id)}>
      <div className="lyc-card__poster">
        <div className="lyc-card__poster-grad" style={{background: c.gradient}}></div>
        <div className="lyc-card__poster-cat">{c.required && '★ '}{c.cat}</div>
        <div className="lyc-card__poster-num">{(c.id || '').slice(-2).toUpperCase()}</div>
        <div className="lyc-card__poster-instr">— {c.instructor}</div>
      </div>
      <div className="lyc-card__body">
        <div className="lyc-card__title">{c.title}</div>
        <div className="lyc-card__meta">
          <span>{c.duration}</span>
          <span>·</span>
          <span>{c.chapters} ch.</span>
          <span>·</span>
          <span>{c.level}</span>
        </div>
        {c.progress > 0 && c.progress < 1 && (
          <div className="lyc-card__progress"><span style={{width: `${c.progress*100}%`}}></span></div>
        )}
      </div>
    </div>
  );
}

/* ─── COURSE PLAYER ─── */
function AcCourse({ courseId, onBack }) {
  const { records: ACAD_COURSES } = useLiveRecords('academy', 'course', ACAD_COURSES_FB);
  const { records: ACAD_FACULTY } = useLiveRecords('academy', 'faculty', ACAD_FACULTY_FB);
  const c = ACAD_COURSES.find(x => x.id === courseId) || ACAD_COURSES.find(x=>x.featured) || ACAD_COURSES[0];
  if (!c) {
    return (
      <div className="lyc-course" style={{ padding: 32 }}>
        <div className="lyc-course__breadcrumb" style={{cursor:'pointer'}} onClick={onBack}>← Library</div>
        <p style={{fontFamily:'var(--font-serif)', fontStyle:'italic', color:'var(--lyc-mute)'}}>No course to show yet.</p>
      </div>
    );
  }
  const instructor = ACAD_FACULTY.find(f => f.id === c?.instructorId)
    || { name: c.instructor || '—', title: '' };
  const chapters = c.chapterList || [
    { n:1, t:'Introduction', d:'08:00', done:true, sub:'Overview' },
    { n:2, t:'Foundations', d:'14:00', done:true, sub:'Core ideas' },
    { n:3, t:'Application', d:'18:00', now:true, sub:'In practice' },
    { n:4, t:'Going further', d:'12:00', sub:'Advanced' },
  ];
  const nowChap = chapters.find(ch => ch.now) || chapters[0];

  const [tab, setTab] = acUS('transcript');

  return (
    <div className="lyc-course">
      <div className="lyc-course__main">
        <div className="lyc-course__player">
          <div className="lyc-course__player-portrait"></div>
          <div className="lyc-course__player-frame-line"></div>
          <div className="lyc-course__player-controls">
            <span className="lyc-course__player-play">▶</span>
            <span className="lyc-course__player-time">0:00</span>
            <div className="lyc-course__player-scrub"><span></span></div>
            <span className="lyc-course__player-time">0:00</span>
            <div className="lyc-course__player-icons">
              <span>⊟</span><span>CC</span><span>⤓</span><span>1×</span><span>⛶</span>
            </div>
          </div>
        </div>
        <div className="lyc-course__below">
          <div className="lyc-course__breadcrumb" style={{cursor:'pointer'}} onClick={onBack}>← Library  ·  {c.cat}  ·  Chapter {nowChap.n} of {chapters.length}</div>
          <h1 className="lyc-course__h1">{(c.title || '').split(' ').slice(0,-1).join(' ')} <em>{(c.title || '').split(' ').slice(-1)}</em></h1>
          <p style={{fontFamily:'var(--font-serif)', fontStyle:'italic', fontSize:16, color:'rgba(240,230,208,0.75)', maxWidth:'56ch', margin:'8px 0 0', lineHeight:1.45}}>{c.sub}</p>

          <div className="lyc-course__instr-row">
            <div className="lyc-course__instr-pip">{(instructor.name || '').split(' ').map(p=>p[0]).slice(0,2).join('')}</div>
            <div className="lyc-course__instr-meta">
              <div className="lyc-course__instr-name">{instructor.name}</div>
              <div className="lyc-course__instr-title">{instructor.title}</div>
            </div>
            <div style={{marginLeft:'auto', display:'flex', gap:14, fontFamily:'var(--font-mono)', fontSize:10, color:'var(--lyc-mute-2)', letterSpacing:'0.1em', textTransform:'uppercase'}}>
              <span>{(c.students || 0).toLocaleString()} students</span>
              <span>·</span>
              <span>★ {c.rating}</span>
              <span>·</span>
              <span>{c.duration}</span>
            </div>
          </div>

          <div className="lyc-course__tabs">
            {['transcript','materials','discussion','notes'].map(t => (
              <button key={t} className={`lyc-course__tab ${tab===t?'is-on':''}`} onClick={()=>setTab(t)}>{t}</button>
            ))}
          </div>

          {tab==='transcript' && (
            <div className="lyc-course__transcript">
              {ACAD_TRANSCRIPT.map((line, i) => {
                if (line.pull) return <div key={i} className="pull"><span className="ts">{line.ts}</span>{line.text}</div>;
                return (
                  <p key={i} className={line.now?'now':''}>
                    <span className="ts">{line.ts}</span>{line.text}
                  </p>
                );
              })}
            </div>
          )}
          {tab==='materials' && (
            <div className="lyc-course__transcript">
              <p style={{fontStyle:'italic', color:'var(--lyc-mute-2)'}}>Course materials appear here when uploaded.</p>
            </div>
          )}
          {tab==='discussion' && (
            <div className="lyc-course__transcript">
              <p style={{fontStyle:'italic', color:'var(--lyc-mute-2)'}}>No discussion yet — be the first to post.</p>
            </div>
          )}
          {tab==='notes' && (
            <div className="lyc-course__transcript">
              <p style={{fontStyle:'italic', color:'var(--lyc-mute-2)'}}>Your notes for this chapter (visible only to you).</p>
            </div>
          )}
        </div>
      </div>

      <aside className="lyc-course__rail">
        <div className="lyc-course__rail-h">
          <span>Chapters</span>
          <span style={{color:'var(--lyc-mute-2)'}}>{chapters.filter(ch=>ch.done).length}/{chapters.length}</span>
        </div>
        {chapters.map(ch => (
          <div key={ch.n} className={`lyc-course__chap ${ch.done?'done':''} ${ch.now?'now':''}`}>
            <span className="lyc-course__chap-n">{ch.n.toString().padStart(2,'0')}</span>
            <span className="lyc-course__chap-t">{ch.t}<small>{ch.sub}</small></span>
            <span className="lyc-course__chap-d">{ch.d}</span>
          </div>
        ))}
      </aside>
    </div>
  );
}

export { AcLibrary, AcCourse, CourseCard };
