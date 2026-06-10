// ESLint 9 flat config for Trove. Built on Expo's flat preset (which
// covers React, React Native, and TypeScript sanely) plus Prettier so
// format rules don't fight us. Replaces the legacy .eslintrc.js — ESLint
// 9 defaults to flat config and the old eslintrc + `--ext` combo no
// longer runs.
const expoConfig = require('eslint-config-expo/flat');
// eslint-config-prettier just turns OFF formatting rules that would fight
// Prettier — formatting itself is enforced by `npm run format`.
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  ...expoConfig,
  prettierConfig,
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '.expo/**',
      'android/**',
      'ios/**',
      'supabase/**',
      '*.config.js',
      'scripts/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // exhaustive-deps stays a warning — the hooks here are deliberately
      // tuned (module-level stores, intentional one-shot effects) and
      // erroring on it would block on false positives.
      'react-hooks/exhaustive-deps': 'warn',
      // Real signal: dead vars/imports are an error (so CI catches them).
      // `_`-prefixed args/vars are the intentional-throwaway escape hatch.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      'import/no-unresolved': 'off',
    },
  },
];
