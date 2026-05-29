// Shared loader for connected social accounts + the provider catalogue.
// Kept in its own module so component files can stay component-only.
import { useState, useEffect, useCallback } from 'react';
import { api } from './auth/api';

export function useSocial() {
  const [accounts, setAccounts] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [a, p] = await Promise.all([api.socialAccounts(), api.socialProviders()]);
      setAccounts(a.accounts || []);
      setProviders(p.providers || []);
    } catch { /* callers surface their own errors */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  return { accounts, providers, loading, refresh };
}
