// Global AsyncStorage mock — the official in-memory implementation, so any
// test that transitively imports src/lib/drafts.ts gets real get/set
// behavior instead of an always-empty stub. Individual test files may still
// register their own jest.mock override, which takes precedence per-file.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
