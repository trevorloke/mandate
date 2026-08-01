// Empty-state overlay for module pages. Shown when the user's workspace has
// no records for this module's primary bucket — offers one-click sample data
// (editors+), or the admin data screens for adding real records.
import { useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { invalidateLive } from './auth/useLiveRecords';
import './EmptyModule.css';

export default function EmptyModule({ module, label, accent }) {
  const { user } = useAuth();
  const canEdit = user && user.role !== 'viewer';
  const [seeding, setSeeding] = useState(false);
  const [progress, setProgress] = useState(null);
  const [err, setErr] = useState('');

  const goToAdmin = () => {
    try { localStorage.setItem('mandate2:route', 'admin'); } catch { /* ignore */ }
    // Use full reload so the admin component mounts cleanly with the right tab.
    window.location.reload();
  };

  const loadSample = async () => {
    setSeeding(true);
    setErr('');
    try {
      const { seedDemoData } = await import('./admin/seed');
      await seedDemoData((p) => setProgress(p));
      // Refetch every live bucket — the module re-renders populated, no reload.
      invalidateLive();
    } catch (e) {
      setErr(e.message || 'Sample data failed to load.');
    } finally {
      setSeeding(false);
      setProgress(null);
    }
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
          {canEdit && (
            <button className="empty-mod__btn" onClick={loadSample} disabled={seeding}>
              {seeding
                ? (progress ? `Loading sample data… ${progress.module}.${progress.kind} (${progress.i + 1}/${progress.of})` : 'Loading sample data…')
                : 'Load sample data — populate every module'}
            </button>
          )}
          <button className={'empty-mod__btn' + (canEdit ? ' empty-mod__btn--ghost' : '')} onClick={goToAdmin} disabled={seeding}>
            Add records → Admin · Module data
          </button>
          {err && <p className="empty-mod__hint" role="alert">{err}</p>}
          {canEdit && !err && (
            <p className="empty-mod__hint">
              Sample data is clearly marked, editable, and can be wiped any time from the danger zone
              in <b>Admin → Workspace</b>. Or import your own CSVs per bucket in <b>Admin → Module data</b>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
