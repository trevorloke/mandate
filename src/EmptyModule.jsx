// Empty-state overlay for module pages. Shown when the user's workspace has
// no records for this module's primary bucket — directs them to admin to add
// some, or load sample data, or import a backup.
import React from 'react';
import './EmptyModule.css';

export default function EmptyModule({ module, label, accent }) {
  const goToAdmin = () => {
    try { localStorage.setItem('mandate2:route', 'admin'); } catch {}
    // Use full reload so the admin component mounts cleanly with the right tab.
    window.location.reload();
  };

  return (
    <div className="empty-mod" style={accent ? { '--em-accent': accent } : null}>
      <div className="empty-mod__inner">
        <div className="empty-mod__plate">{module}</div>
        <h1 className="empty-mod__title">{label} is empty.</h1>
        <p className="empty-mod__lede">
          You haven't added any records to this module yet. Once you do — donors, voters, posts,
          gifts, whatever fits — they'll show up here as lists, charts, and pipelines.
        </p>

        <div className="empty-mod__actions">
          <button className="empty-mod__btn" onClick={goToAdmin}>
            Add records → Admin · Module data
          </button>
          <p className="empty-mod__hint">
            Or load sample data: <b>Admin → Workspace → Wipe</b> first if needed, then run the
            on-screen wizard via signup, or hit "Load prototype data" inside the bucket detail page.
          </p>
        </div>
      </div>
    </div>
  );
}
