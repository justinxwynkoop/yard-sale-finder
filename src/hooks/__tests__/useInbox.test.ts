import { tombstoneHides, computeLastMessagePreview } from '../useInbox';

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

describe('computeLastMessagePreview (inbox row preview for the last message)', () => {
  it('previews an offer row with its body text, not the InboxScreen "Tap to view" fallback', () => {
    const preview = computeLastMessagePreview({
      body: 'Offered $15 for Vintage Indiana glass',
      image_url: null,
      kind: 'offer',
    });
    expect(preview).toBe('Offered $15 for Vintage Indiana glass');
    expect(preview).not.toBeUndefined();
    expect(preview).not.toBe('Tap to view');
  });

  it('previews a system row with its body text the same way', () => {
    const preview = computeLastMessagePreview({
      body: 'Offer accepted -- $15. This item is on hold.',
      image_url: null,
      kind: 'system',
    });
    expect(preview).toBe('Offer accepted -- $15. This item is on hold.');
  });

  it('falls back to the photo marker for an image-only message', () => {
    expect(
      computeLastMessagePreview({ body: null, image_url: 'https://x/y.jpg' }),
    ).toBe('📷 Photo');
  });

  it('returns undefined (InboxScreen fallback territory) only when there is no last message', () => {
    expect(computeLastMessagePreview(undefined)).toBeUndefined();
  });
});
