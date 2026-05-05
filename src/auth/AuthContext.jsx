import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setupComplete, setSetupComplete] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [{ user }, { setupComplete }] = await Promise.all([api.me(), api.setupState()]);
      setUser(user);
      setSetupComplete(setupComplete);
      if (user) {
        try { const ws = await api.workspace(); setWorkspace(ws.workspace); } catch {}
      } else {
        setWorkspace(null);
      }
    } catch (e) {
      console.error('auth refresh failed', e);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password, totpCode) => {
    const r = await api.login({ email, password, totpCode });
    setUser(r.user);
    try { const ws = await api.workspace(); setWorkspace(ws.workspace); } catch {}
    return r.user;
  };

  const signup = async (body) => {
    const r = await api.signup(body);
    setUser(r.user);
    setSetupComplete(true);
    try { const ws = await api.workspace(); setWorkspace(ws.workspace); } catch {}
    // Fresh workspace: the OnboardingWizard (mounted in App) will gate the UI
    // until the user picks campaign details + starter data option.
    return r.user;
  };

  const logout = async () => {
    try { await api.logout(); } catch {}
    setUser(null);
    setWorkspace(null);
  };

  const role = user?.role;
  const has = (min) => {
    const ranks = { viewer: 1, editor: 2, admin: 3, super_admin: 4 };
    return (ranks[role] || 0) >= (ranks[min] || 0);
  };

  return (
    <AuthCtx.Provider value={{
      user, workspace, loading, setupComplete,
      login, signup, logout, refresh, has,
      setUser, setWorkspace,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
