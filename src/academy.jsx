import { useState, useMemo } from 'react';
import './academy.css';
import { ACAD_COURSES as ACAD_COURSES_FB, ACAD_ARTICLES as ACAD_ARTICLES_FB, ACAD_FACULTY as ACAD_FACULTY_FB, ACAD_TRANSCRIPT } from './academy-data';
import { useLiveRecords } from './auth/useLiveRecords';
import EmptyModule from './EmptyModule';
import { AcLibrary, AcCourse } from './academy-tabs';
import { AcReading, AcPath, AcFaculty } from './academy-tabs2';

const ACAD_TABS = [
  { k: 'library', label: 'Library',      hint: 'courses & reading' },
  { k: 'path',    label: 'Learning Path', hint: 'curriculum' },
  { k: 'faculty', label: 'Faculty',       hint: 'instructors' },
];

function Academy() {
  const { records: ACAD_COURSES, isEmpty: noCourses } = useLiveRecords('academy', 'course', ACAD_COURSES_FB);
  const { records: ACAD_ARTICLES, isEmpty: noArticles } = useLiveRecords('academy', 'article', ACAD_ARTICLES_FB);
  const { records: ACAD_FACULTY } = useLiveRecords('academy', 'faculty', ACAD_FACULTY_FB);
  const [tab, setTab] = useState('library');
  const [courseId, setCourseId] = useState(null);
  const [articleId, setArticleId] = useState(null);

  const stats = useMemo(() => {
    const enrolled = ACAD_COURSES.filter(c => c.progress > 0).length;
    const completed = ACAD_COURSES.filter(c => c.completed).length;
    const inProgress = ACAD_COURSES.filter(c => c.progress > 0 && !c.completed).length;
    const certs = ACAD_TRANSCRIPT?.length || completed;
    return { enrolled, completed, inProgress, certs };
  }, [ACAD_COURSES]);

  if (noCourses && noArticles) return <EmptyModule module="ACADEMY" label="Academy" accent="var(--m-academy, var(--ink))" />;

  const pickCourse = (id) => { setCourseId(id); setArticleId(null); };
  const pickArticle = (id) => { setArticleId(id); setCourseId(null); };
  const back = () => { setCourseId(null); setArticleId(null); };

  const inDetail = courseId || articleId;

  return (
    <div className="lyc">
      {!inDetail && (
        <header className="lyc__head">
          <div className="lyc__masthead-row">
            <div className="lyc__plate">Mandate · Academy</div>
            <div className="lyc__plate" style={{ flex: 'none' }}>{new Date().toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}</div>
          </div>
          <h1 className="lyc__title">The <em>Lyceum</em></h1>
          <p className="lyc__sub">
            A masterclass for the political vocation — the doorstep, the
            chamber, the camera. Taught by the practitioners.
          </p>
          <div className="lyc__head-meta">
            <div className="lyc__head-stat"><span className="v">{ACAD_COURSES.length}</span><span className="k">Courses</span></div>
            <div className="lyc__head-stat"><span className="v">{ACAD_FACULTY.length}</span><span className="k">Faculty</span></div>
            <div className="lyc__head-stat"><span className="v">{stats.enrolled}</span><span className="k">Enrolled</span></div>
            <div className="lyc__head-stat"><span className="v">{stats.inProgress}</span><span className="k">In progress</span></div>
            <div className="lyc__head-stat"><span className="v">{stats.completed}</span><span className="k">Completed</span></div>
            <div className="lyc__head-stat"><span className="v">{ACAD_ARTICLES.length}</span><span className="k">Reading</span></div>
          </div>
        </header>
      )}

      {!inDetail && (
        <nav className="lyc__tabs">
          {ACAD_TABS.map(t => (
            <button key={t.k}
                    className={`lyc__tab ${tab === t.k ? 'is-on' : ''}`}
                    onClick={() => setTab(t.k)}>
              {t.label} <small>{t.hint}</small>
            </button>
          ))}
        </nav>
      )}

      <div className="lyc__body">
        {courseId  && <AcCourse  courseId={courseId}   onBack={back} />}
        {articleId && <AcReading articleId={articleId} onBack={back} />}
        {!inDetail && tab === 'library' && <AcLibrary onPickCourse={pickCourse} onPickArticle={pickArticle} />}
        {!inDetail && tab === 'path'    && <AcPath    onPickCourse={pickCourse} />}
        {!inDetail && tab === 'faculty' && <AcFaculty />}
      </div>
    </div>
  );
}

export { Academy };
