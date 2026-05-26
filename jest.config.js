// Jest config for Trove. Use jest-expo's preset as-is so its
// transformIgnorePatterns (which knows about every relevant
// node_modules ESM package) is in effect. Just add our test-file
// pattern + coverage scope on top.

module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.(ts|tsx|js)'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
};
