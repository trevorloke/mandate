// Shared loader for the Tide module — topics (with latest readings), panel
// composition, source catalogue, and worker status. Kept out of the component
// file so tide.jsx stays presentational.
import { useState, useEffect, useCallback } from 'react';
import { api } from './auth/api';

export function useTide() {
  const [topics, setTopics] = useState([]);
  const [panel, setPanel] = useState(null);
  const [sources, setSources] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [t, p, s, st] = await Promise.all([
        api.tideTopics(), api.tidePanel(), api.tideSources(), api.tideStatus(),
      ]);
      setTopics(t.topics || []);
      setPanel(p.panel || null);
      setSources(s.sources || []);
      setStatus(st || null);
      setError(null);
    } catch (e) {
      setError(e.message || 'Failed to load Tide.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { topics, panel, sources, status, loading, error, refresh };
}
