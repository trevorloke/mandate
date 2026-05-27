import React, { useState, useEffect } from 'react';
import { Shell, Nav2Ctx } from './shell';
import { WORKSPACE as DEFAULT_WORKSPACE } from './data';
import { useLiveRecords } from './auth/useLiveRecords';
import { Home2 } from './home';
import { Conductor } from './conductor';
import { DossierDrawer } from './fabric';
import { Ground } from './ground';
import { Beacon } from './beacon';
import { Raise2 } from './raise';
import { Ledger2 } from './ledger';
import { Coalition2 } from './coalition';
import { Civic2 } from './civic';
import { Opposition2 } from './opp';
import { Site2 } from './site';
import { Events2 } from './events';
import { Command } from './command';
import { Academy } from './academy';
import Admin from './admin/Admin';
import OnboardingWizard from './admin/OnboardingWizard';
import { useAuth } from './auth/AuthContext';
import { useLocale } from './i18n';
import { api } from './auth/api';
import Login from './auth/Login';
import Signup from './auth/Signup';
import AcceptInvite from './auth/AcceptInvite';
import ResetPassword from './auth/ResetPassword';
import UserMenu from './shell/UserMenu';
import NotificationBell from './shell/NotificationBell';

const PAGE_MAP2 = {
  ground:     () => <Ground />,
  field:      () => <Ground />,
  beacon:     () => <Beacon />,
  raise:      () => <Raise2 />,
  ledger:     () => <Ledger2 />,
  coalition:  () => <Coalition2 />,
  civic:      () => <Civic2 />,
  opposition: () => <Opposition2 />,
  site:       () => <Site2 />,
  events:     () => <Events2 />,
  academy:    () => <Academy />,
  command:    () => <Command />,
  admin:      () => <Admin />,
};

export default function App2() {
  const { user, workspace, loading, setupComplete } = useAuth();
  const [authView, setAuthView] = useState(setupComplete ? 'login' : 'signup');
  const [locale, setLocale] = useLocale();

  useEffect(() => {
    setAuthView(setupComplete ? 'login' : 'signup');
  }, [setupComplete]);

  // Locale sync: when authed and the active (browser) locale differs from
  // user.locale, push the active locale up to the backend. Pull happens only
  // on a fresh device — handled in LocaleProvider via localStorage absence.
  const lastSyncedLocale = React.useRef(null);
  const localeRestoredRef = React.useRef(false);
  useEffect(() => {
    if (!user?.id) {
      lastSyncedLocale.current = null;
      localeRestoredRef.current = false;
      return;
    }
    // First time we see this user: if no local choice was ever made AND user has a server preference, adopt it.
    if (!localeRestoredRef.current) {
      localeRestoredRef.current = true;
      const hadLocal = typeof window !== 'undefined' && window.localStorage.getItem('mdt_locale');
      if (!hadLocal && user.locale && user.locale !== locale) {
        setLocale(user.locale);
        return;  // wait for the locale state to settle, next effect tick will sync if needed
      }
    }
    if (lastSyncedLocale.current === locale) return;
    if (user.locale === locale) { lastSyncedLocale.current = locale; return; }
    lastSyncedLocale.current = locale;
    api.updateMe({ locale }).catch(() => {});
  }, [user?.id, user?.locale, locale, setLocale]);

  const initial = (() => { try { return localStorage.getItem('mandate2:route') || 'home'; } catch { return 'home'; } })();
  const [route, setRoute] = useState(initial);
  const [conductorOpen, setConductorOpen] = useState(false);
  const { records: conductorAsks } = useLiveRecords('conductor', 'ask', []);
  const conductorNowCount = conductorAsks.filter(c => c.window === 'NOW').length;

  const go = (k) => {
    setRoute(k);
    try { localStorage.setItem('mandate2:route', k); } catch {}
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { setConductorOpen(false); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault(); setConductorOpen(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Auth gate
  if (loading) {
    return <div className="auth-screen__loading">Loading…</div>;
  }

  // Detect invite link in URL
  const inviteMatch = typeof window !== 'undefined' && window.location.pathname.match(/^\/invite\/([a-f0-9]+)/);
  if (inviteMatch && !user) {
    return <AcceptInvite token={inviteMatch[1]} onCancel={() => { window.history.replaceState({}, '', '/'); setAuthView('login'); }} />;
  }
  // Detect reset-password link
  const resetMatch = typeof window !== 'undefined' && window.location.pathname.match(/^\/reset-password\/([a-f0-9]+)/);
  if (resetMatch && !user) {
    return <ResetPassword token={resetMatch[1]} onCancel={() => { window.history.replaceState({}, '', '/'); setAuthView('login'); }} />;
  }

  if (!user) {
    return authView === 'signup'
      ? <Signup onSwitchToLogin={() => setAuthView('login')} />
      : <Login  onSwitchToSignup={() => setAuthView('signup')} />;
  }

  // Onboarding gate — show the wizard until settings.onboarded === true.
  // Only super_admins can complete it (since they own the workspace settings).
  const isOnboarded = workspace?.settings?.onboarded === true;
  if (workspace && !isOnboarded && user.role === 'super_admin') {
    return <OnboardingWizard onComplete={() => { /* state already refreshed by setWorkspace */ }} />;
  }

  // Compose workspace from API (with prototype defaults as fallback)
  const ws = workspace
    ? {
        kind: workspace.kind || DEFAULT_WORKSPACE.kind,
        name: workspace.name || DEFAULT_WORKSPACE.name,
        candidate: workspace.candidate || DEFAULT_WORKSPACE.candidate,
        party: workspace.party || DEFAULT_WORKSPACE.party,
        phase: workspace.phase || DEFAULT_WORKSPACE.phase,
        daysToVote: workspace.daysToVote ?? DEFAULT_WORKSPACE.daysToVote,
        livePulse: DEFAULT_WORKSPACE.livePulse,
        tz: workspace.tz || DEFAULT_WORKSPACE.tz,
      }
    : DEFAULT_WORKSPACE;

  const enabledModules = workspace?.settings?.modules || {};
  const isModuleEnabled = (k) => enabledModules[k] !== false;
  // If user navigated to a disabled module, fall back to home
  const effectiveRoute = (route !== 'home' && route !== 'admin' && !isModuleEnabled(route)) ? 'home' : route;
  const Page = PAGE_MAP2[effectiveRoute];
  return (
    <Nav2Ctx.Provider value={{ route: effectiveRoute, go }}>
      <Shell
        route={effectiveRoute}
        onGo={go}
        workspace={ws}
        user={user.initials || (user.name || '').split(/\s+/).filter(Boolean).map(s => s[0]?.toUpperCase()).slice(0,2).join('') || '—'}
        onCmd={() => {}}
        onConductor={() => setConductorOpen(true)}
        conductorCount={conductorNowCount}
        userMenu={<UserMenu onAdmin={() => go('admin')} />}
        notifications={<NotificationBell onNav={(link) => { if (link?.startsWith('/admin')) go('admin'); }} />}
        enabledModules={enabledModules}
      >
        {effectiveRoute === 'home' ? <Home2 /> : (Page ? <Page /> : <Home2 />)}
      </Shell>
      <Conductor open={conductorOpen} onClose={() => setConductorOpen(false)} />
      <DossierDrawer />
    </Nav2Ctx.Provider>
  );
}
