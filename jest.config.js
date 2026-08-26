// Jest config for Trove. Use jest-expo's preset as-is so its
// transformIgnorePatterns (which knows about every relevant
// node_modules ESM package) is in effect. Just add our test-file
// pattern + coverage scope on top.

module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.(ts|tsx|js)'],
  // Claude Code parks git worktrees under .claude/worktrees — each holds a
  // full copy of the repo, so without this the suite runs once per worktree
  // (and haste-map complains about duplicate mocks).
  // <rootDir>-anchored so the pattern doesn't ALSO match when jest runs from
  // inside a worktree (whose own absolute path contains .claude).
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
