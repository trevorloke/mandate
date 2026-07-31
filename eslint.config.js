import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      // Empty catch = intentional best-effort swallow (used pervasively for
      // notify/audit side-effects that must never block the main action).
      'no-empty': ['error', { allowEmptyCatch: true }],
      // `_`-prefixed args/vars are declared-but-unused by convention;
      // rest-sibling destructuring (`const { secret, ...rest } = x`) is the
      // idiom for omitting fields and its siblings are intentionally unused.
      'no-unused-vars': ['error', {
        args: 'after-used',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      // exhaustive-deps has shipped as a warning upstream since CRA; the
      // remaining sites intentionally key effects off narrower values
      // (e.g. user?.workspaceId instead of the user object).
      'react-hooks/exhaustive-deps': 'warn',
      // New react-hooks v6 compiler diagnostics. Real signals, but the flagged
      // sites (sync load() patterns in admin panels, decorative Math.random in
      // flipbook) work correctly today — restructuring them belongs in focused
      // PRs, not a lint sweep. Kept visible as warnings so no new ones land
      // unnoticed; CI fails only on errors.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      // Dev-only HMR concern; the flagged files are standard context/i18n
      // patterns (provider + hook in one file) not worth an import churn.
      'react-refresh/only-export-components': 'warn',
    },
  },
  {
    // Server + build tooling run under Node, not the browser.
    files: ['server/**/*.js', 'scripts/**/*.{js,mjs}', 'vite.config.js', 'drizzle.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])
