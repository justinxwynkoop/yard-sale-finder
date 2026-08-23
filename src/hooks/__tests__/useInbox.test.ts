import { tombstoneHides } from '../useInbox';

// Mock the supabase client so importing useInbox (which transitively imports
// the client) doesn't open a real connection in the test env. We only
// exercise the pure helper here.
jest.mock('../../lib/supabase', () => ({ supabase: {} }));

describe('tombstoneHides (session-delete race guard vs thread resurrection)', () => {
  const deletedAtMs = Date.parse('2026-08-22T12:00:00Z');

  it('does not hide rows that were never session-deleted', () => {
    expect(tombstoneHides(undefined, '2026-08-22T11:00:00Z')).toBe(false);
  });

  it('hides a row whose last message predates the in-session delete (the refetch race)', () => {
    expect(tombstoneHides(deletedAtMs, '2026-08-22T11:59:59Z')).toBe(true);
    expect(tombstoneHides(deletedAtMs, '2026-08-22T12:00:00Z')).toBe(true);
  });

  it('yields when a NEWER message resurrects the thread — no app restart required', () => {
    expect(tombstoneHides(deletedAtMs, '2026-08-22T12:00:01Z')).toBe(false);
  });
});
