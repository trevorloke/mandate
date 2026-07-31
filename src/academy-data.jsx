// Academy 2.0 — data
//
// All entity seeds (faculty, courses, articles) and decorative blobs
// (transcript, learning-path schedule, certificate list) are empty.
// ACAD_CATEGORIES is preserved as a category vocabulary.

// ── Seed: faculty (kind 'faculty') ─────────────────────────────────────
// NOTE: every course's instructorId should match a faculty id below.
// (AcCourse now also guards a missing instructor.)
const ACAD_FACULTY = [
  {
    id: 'fac-cohn', name: 'Mike Cohn', title: 'Senior Organizer · Mount Pleasant',
    bio: 'Twenty years running field programs across three provinces. [SAMPLE DATA]',
    courses: 4, students: 4120,
  },
  {
    id: 'fac-okafor', name: 'Adaeze Okafor', title: 'Director of Communications',
    bio: 'Former press secretary; teaches message discipline under fire. [SAMPLE DATA]',
    courses: 3, students: 3380,
  },
  {
    id: 'fac-laporte', name: 'Jean-Marc Laporte', title: 'Policy & Briefings Lead',
    bio: 'Drafts platform and committee briefs; ex-legislative researcher. [SAMPLE DATA]',
    courses: 2, students: 2100,
  },
  {
    id: 'fac-singh', name: 'Harpreet Singh', title: 'Compliance & Ethics Counsel',
    bio: 'Elections-law specialist keeping campaigns inside the lines. [SAMPLE DATA]',
    courses: 2, students: 1640,
  },
  {
    id: 'fac-reyes', name: 'Camila Reyes', title: 'Digital Tools Instructor',
    bio: 'Builds the data and ad stacks that modern ridings run on. [SAMPLE DATA]',
    courses: 3, students: 1400,
  },
];

const ACAD_CATEGORIES = ['Field & Canvass','Policy & Briefings','Communications','Compliance & Ethics','Leadership','Digital Tools'];

// ── Seed: courses (kind 'course') ──────────────────────────────────────
// NOTE: exactly one course carries featured:true and a chapterList.
// (AcLibrary now also guards a missing featured course.)
const ACAD_COURSES = [
  {
    id: 'ac-course-doorstep', title: 'The Doorstep Conversation [SAMPLE]',
    sub: 'How two strangers and one threshold decide an election.',
    cat: 'Field & Canvass', instructor: 'Mike Cohn', instructorId: 'fac-cohn',
    duration: '2h 40m', chapters: 9, level: 'Core', students: 4120, rating: 4.9,
    progress: 0.42, completed: false, required: true, featured: true,
    gradient: 'linear-gradient(135deg,#3a2a1a,#6b3410)',
    chapterList: [
      { n: 1, t: 'A door is older than a poll', sub: 'The form', d: '12:00', done: true },
      { n: 2, t: 'The first six seconds',       sub: 'First contact', d: '14:00', done: true },
      { n: 3, t: 'Asking permission',           sub: 'Consent', d: '10:00', done: true },
      { n: 4, t: 'The hard door',               sub: 'Skeptics', d: '18:00', now: true },
      { n: 5, t: 'Listening for ninety seconds',sub: 'Discipline', d: '12:00' },
      { n: 6, t: 'Walking off well',            sub: 'The exit', d: '09:00' },
      { n: 7, t: 'Logging the contact',         sub: 'Data', d: '08:00' },
      { n: 8, t: 'Coaching new canvassers',     sub: 'Train the trainer', d: '15:00' },
      { n: 9, t: 'Seven rules, distilled',      sub: 'Recap', d: '07:00' },
    ],
  },
  {
    id: 'ac-course-phonebank', title: 'Phone Banking That Works [SAMPLE]',
    sub: 'Voter ID and persuasion at scale, without burning volunteers.',
    cat: 'Field & Canvass', instructor: 'Mike Cohn', instructorId: 'fac-cohn',
    duration: '1h 20m', chapters: 6, level: 'Intro', students: 2980, rating: 4.6,
    progress: 0, completed: false, required: true, featured: false,
    gradient: 'linear-gradient(135deg,#1e3a5f,#2a567f)',
    chapterList: [
      { n: 1, t: 'The script is a scaffold', sub: 'Basics', d: '10:00' },
      { n: 2, t: 'Voter ID vs. persuasion', sub: 'Goals', d: '14:00' },
      { n: 3, t: 'Handling the hang-up',    sub: 'Resilience', d: '11:00' },
      { n: 4, t: 'Data hygiene',            sub: 'Logging', d: '12:00' },
      { n: 5, t: 'Running a room',          sub: 'Captains', d: '18:00' },
      { n: 6, t: 'Wrap and report',         sub: 'Closeout', d: '08:00' },
    ],
  },
  {
    id: 'ac-course-message', title: 'Message Discipline Under Fire [SAMPLE]',
    sub: 'Staying on message when the question is a trap.',
    cat: 'Communications', instructor: 'Adaeze Okafor', instructorId: 'fac-okafor',
    duration: '1h 55m', chapters: 7, level: 'Intermediate', students: 3380, rating: 4.8,
    progress: 0.7, completed: false, required: false, featured: false,
    gradient: 'linear-gradient(135deg,#5a1f1f,#8a1414)',
    chapterList: [
      { n: 1, t: 'The bridge', sub: 'Pivoting', d: '12:00', done: true },
      { n: 2, t: 'Three points, one breath', sub: 'Structure', d: '14:00', done: true },
      { n: 3, t: 'The hostile interview', sub: 'Pressure', d: '16:00', done: true },
      { n: 4, t: 'Clips and soundbites', sub: 'TV', d: '13:00', done: true },
      { n: 5, t: 'Owning the mistake', sub: 'Repair', d: '15:00', now: true },
      { n: 6, t: 'Surrogates on message', sub: 'Scale', d: '11:00' },
      { n: 7, t: 'Recap', sub: 'Distilled', d: '07:00' },
    ],
  },
  {
    id: 'ac-course-briefing', title: 'Writing the Policy Brief [SAMPLE]',
    sub: 'From platform plank to one-page committee brief.',
    cat: 'Policy & Briefings', instructor: 'Jean-Marc Laporte', instructorId: 'fac-laporte',
    duration: '2h 05m', chapters: 8, level: 'Intermediate', students: 2100, rating: 4.5,
    progress: 0, completed: false, required: false, featured: false,
    gradient: 'linear-gradient(135deg,#2a4a3a,#3f6b52)',
    chapterList: [
      { n: 1, t: 'Audience first', sub: 'Who reads it', d: '10:00' },
      { n: 2, t: 'The one-pager', sub: 'Format', d: '14:00' },
      { n: 3, t: 'Costing a promise', sub: 'Numbers', d: '18:00' },
      { n: 4, t: 'Recap', sub: 'Distilled', d: '07:00' },
    ],
  },
  {
    id: 'ac-course-ethics', title: 'Elections Law Essentials [SAMPLE]',
    sub: 'Spending limits, disclosure, and staying out of trouble.',
    cat: 'Compliance & Ethics', instructor: 'Harpreet Singh', instructorId: 'fac-singh',
    duration: '1h 40m', chapters: 6, level: 'Core', students: 1640, rating: 4.7,
    progress: 1, completed: true, required: true, featured: false,
    gradient: 'linear-gradient(135deg,#3a3a3a,#5c5c5c)',
    chapterList: [
      { n: 1, t: 'The financing rules', sub: 'Limits', d: '14:00', done: true },
      { n: 2, t: 'Disclosure', sub: 'Filing', d: '12:00', done: true },
      { n: 3, t: 'Third parties', sub: 'Advertising', d: '13:00', done: true },
      { n: 4, t: 'Recap', sub: 'Distilled', d: '07:00', done: true },
    ],
  },
  {
    id: 'ac-course-digital', title: 'The Riding Data Stack [SAMPLE]',
    sub: 'CRM, ads, and analytics for a modern campaign.',
    cat: 'Digital Tools', instructor: 'Camila Reyes', instructorId: 'fac-reyes',
    duration: '2h 15m', chapters: 8, level: 'Intermediate', students: 1400, rating: 4.4,
    progress: 0.15, completed: false, required: false, featured: false,
    gradient: 'linear-gradient(135deg,#1f3e5a,#356088)',
    chapterList: [
      { n: 1, t: 'The voter file', sub: 'Foundations', d: '16:00', now: true },
      { n: 2, t: 'Segmentation', sub: 'Targeting', d: '14:00' },
      { n: 3, t: 'Digital ads', sub: 'Spend', d: '18:00' },
      { n: 4, t: 'Recap', sub: 'Distilled', d: '07:00' },
    ],
  },
];

// ── Seed: articles (kind 'article') ────────────────────────────────────
const ACAD_ARTICLES = [
  {
    id: 'ac-art-doorstep', kicker: 'Field notes · Issue №14',
    title: 'The Grammar of the Doorstep [SAMPLE]',
    deck: 'Why the oldest tool in politics still beats every clever thing we have invented since.',
    pull: 'A door is not a poll. It is a conversation, and the rules of conversation predate polling by ten thousand years.',
    author: 'Mike Cohn', date: '2026-06-15', lead: true,
  },
  {
    id: 'ac-art-message', kicker: 'Briefing',
    title: 'Bridging Without Lying [SAMPLE]',
    deck: 'How to pivot a hostile question back to your message and keep your credibility.',
    author: 'Adaeze Okafor', date: '2026-06-11', lead: false,
  },
  {
    id: 'ac-art-costing', kicker: 'Policy',
    title: 'What a Promise Actually Costs [SAMPLE]',
    deck: 'A short guide to costing a platform plank before you announce it.',
    author: 'Jean-Marc Laporte', date: '2026-06-07', lead: false,
  },
  {
    id: 'ac-art-compliance', kicker: 'Compliance',
    title: 'Five Filing Mistakes That Sink Campaigns [SAMPLE]',
    deck: 'The disclosure errors Elections BC sees most — and how to avoid them.',
    author: 'Harpreet Singh', date: '2026-06-02', lead: false,
  },
  {
    id: 'ac-art-data', kicker: 'Digital',
    title: 'Your Voter File Is Lying to You [SAMPLE]',
    deck: 'Stale data costs doors. A maintenance routine for the last fourteen days.',
    author: 'Camila Reyes', date: '2026-05-29', lead: false,
  },
];

const ACAD_TRANSCRIPT = [];
const ACAD_PATH_SCHED = [];
const ACAD_PATH_CERTS = [];

export { ACAD_FACULTY, ACAD_CATEGORIES, ACAD_COURSES, ACAD_ARTICLES, ACAD_TRANSCRIPT, ACAD_PATH_SCHED, ACAD_PATH_CERTS };
