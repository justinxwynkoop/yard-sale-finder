// ESLint config for Local Hauls. Built on top of Expo's preset which
// already covers React, React Native, and TypeScript rules sanely.
// Adds Prettier integration so format-related rules don't fight us.

module.exports = {
  root: true,
  extends: ['expo', 'prettier'],
  ignorePatterns: [
    '/node_modules',
    '/dist',
    '/build',
    '/.expo',
    '/android',
    '/ios',
    '/supabase/migrations',
    '*.config.js',
  ],
  rules: {
    // Keep things pragmatic — warnings, not errors, so iteration isn't blocked.
    'react-hooks/exhaustive-deps': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'off',
    'import/no-unresolved': 'off',
  },
};
