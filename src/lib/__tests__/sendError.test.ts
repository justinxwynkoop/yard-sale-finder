import { friendlySendError } from '../sendError';

describe('friendlySendError', () => {
  it('masks a Postgres RLS refusal', () => {
    const raw =
      'new row violates row-level security policy for table "messages"';
    expect(friendlySendError(raw)).toBe(
      "You can't send messages in this conversation.",
    );
  });

  // The whole point: a blocked sender must not learn they were blocked. The
  // rest of the app is careful about this (ListingDetail uses generic copy on
  // start_conversation failure for exactly this reason), and that only holds
  // if the send path stays quiet too.
  it('never reveals that a block is the reason', () => {
    const raw =
      'new row violates row-level security policy for table "messages"';
    expect(friendlySendError(raw).toLowerCase()).not.toContain('block');
  });

  it('passes through messages we raise ourselves, which are already human', () => {
    expect(friendlySendError('This account is suspended.')).toBe(
      'This account is suspended.',
    );
  });

  it('passes through the rate-limit message the DB writes in plain English', () => {
    const raw = 'Too many messages. Please wait a moment.';
    expect(friendlySendError(raw)).toBe(raw);
  });

  it('falls back when there is no message at all', () => {
    expect(friendlySendError(null)).toBe('Please try again.');
    expect(friendlySendError(undefined)).toBe('Please try again.');
    expect(friendlySendError('')).toBe('Please try again.');
  });
});
