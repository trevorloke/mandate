// Tiny i18n core. JSON dictionaries per locale, dotted lookup,
// {var} interpolation, fallback chain (locale → en → key).
//
// Persistence:
//   - in localStorage('mdt_locale') for instant restore on reload
//   - synced to users.locale on the backend when the user is authed
//
// To add a translation:
//   1. add the key to en.json (always the source of truth)
//   2. add the same key to fr.json / es.json
//   3. use it: const t = useT(); <span>{t('auth.signin.title')}</span>
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import en from './locales/en.json';
import fr from './locales/fr.json';
import es from './locales/es.json';

export const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
];

const DICTS = { en, fr, es };
const STORAGE_KEY = 'mdt_locale';

function dottedLookup(obj, key) {
  if (!obj) return undefined;
  return key.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), obj);
}

function interpolate(s, vars) {
  if (!vars || typeof s !== 'string') return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

export function translate(locale, key, vars) {
  const lookup = (loc) => dottedLookup(DICTS[loc], key);
  let value = lookup(locale);
  if (value === undefined) value = lookup('en');
  if (value === undefined) value = key;  // last-resort: render the key itself
  return interpolate(value, vars);
}

const LocaleCtx = createContext({
  locale: 'en',
  setLocale: () => {},
  t: (key, vars) => translate('en', key, vars),
});

export function LocaleProvider({ children, initialLocale }) {
  const [locale, setLocaleState] = useState(() => {
    if (initialLocale && DICTS[initialLocale]) return initialLocale;
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && DICTS[stored]) return stored;
      // Browser hint: 'fr-CA' → 'fr'
      const nav = window.navigator?.language?.split('-')?.[0];
      if (nav && DICTS[nav]) return nav;
    }
    return 'en';
  });

  const setLocale = useCallback((next) => {
    if (!DICTS[next]) return;
    setLocaleState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.setAttribute('lang', next);
    }
  }, []);

  // Sync <html lang> on mount + when locale changes
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.setAttribute('lang', locale);
  }, [locale]);

  const t = useCallback((key, vars) => translate(locale, key, vars), [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleCtx.Provider value={value}>{children}</LocaleCtx.Provider>;
}

export function useT() { return useContext(LocaleCtx).t; }
export function useLocale() {
  const ctx = useContext(LocaleCtx);
  return [ctx.locale, ctx.setLocale];
}
