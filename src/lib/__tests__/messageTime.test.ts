import { Message } from '../../types';
import {
  formatDaySeparator,
  formatMessageTime,
  isSameLocalDay,
  isSeenBy,
  lastSeenOwnMessageId,
} from '../messageTime';

// Local-time constructor: `new Date(2026, 7, 31, 15, 42)` is 3:42 PM local
// regardless of the runner's zone, so these assertions can't drift with TZ.
const at = (y: number, mo: number, d: number, h = 12, mi = 0): string =>
  new Date(y, mo, d, h, mi).toISOString();

const msg = (o: Partial<Message>): Message => ({
  id: 'm1',
  conversation_id: 'c1',
  sender_id: 'me',
  body: 'hi',
  created_at: at(2026, 7, 31, 12, 0),
  kind: 'text',
  ...o,
});

describe('formatMessageTime', () => {
  it('renders a 12-hour clock with AM/PM', () => {
    expect(formatMessageTime(at(2026, 7, 31, 15, 42))).toBe('3:42 PM');
    expect(formatMessageTime(at(2026, 7, 31, 9, 5))).toBe('9:05 AM');
  });

  it('keeps :00 rather than trimming it like formatHM does', () => {
    // A column reading "3:42", "3:44", "4" would look broken.
    expect(formatMessageTime(at(2026, 7, 31, 16, 0))).toBe('4:00 PM');
  });

  it('renders both noon and midnight as 12, not 0', () => {
    expect(formatMessageTime(at(2026, 7, 31, 12, 0))).toBe('12:00 PM');
    expect(formatMessageTime(at(2026, 7, 31, 0, 30))).toBe('12:30 AM');
  });
});

describe('isSameLocalDay', () => {
  it('groups two times on the same calendar day', () => {
    expect(isSameLocalDay(at(2026, 7, 31, 0, 1), at(2026, 7, 31, 23, 59))).toBe(
      true,
    );
  });

  it('splits across midnight even when only minutes apart', () => {
    expect(isSameLocalDay(at(2026, 7, 31, 23, 59), at(2026, 8, 1, 0, 1))).toBe(
      false,
    );
  });
});

describe('formatDaySeparator', () => {
  const now = new Date(2026, 7, 31, 13, 0); // Mon Aug 31 2026

  it('says Today and Yesterday', () => {
    expect(formatDaySeparator(at(2026, 7, 31, 9, 0), now)).toBe('Today');
    expect(formatDaySeparator(at(2026, 7, 30, 9, 0), now)).toBe('Yesterday');
  });

  it('uses a dated weekday inside the same year, never a bare weekday', () => {
    // A bare "Wednesday" is ambiguous once the thread is over a week old.
    const label = formatDaySeparator(at(2026, 7, 26, 9, 0), now);
    expect(label).toBe('Wed, Aug 26');
  });

  it('adds the year once it differs', () => {
    expect(formatDaySeparator(at(2025, 7, 27, 9, 0), now)).toBe('Aug 27, 2025');
  });

  it('does not call two days ago Yesterday at a month boundary', () => {
    const sept1 = new Date(2026, 8, 1, 0, 30);
    expect(formatDaySeparator(at(2026, 7, 31, 23, 30), sept1)).toBe(
      'Yesterday',
    );
    expect(formatDaySeparator(at(2026, 7, 30, 23, 30), sept1)).toBe(
      'Sun, Aug 30',
    );
  });
});

describe('isSeenBy', () => {
  const m = msg({ created_at: at(2026, 7, 31, 12, 0) });

  it('is seen when they opened the thread after it arrived', () => {
    expect(isSeenBy(m, at(2026, 7, 31, 12, 1))).toBe(true);
  });

  it('is not seen when they last opened it before it arrived', () => {
    expect(isSeenBy(m, at(2026, 7, 31, 11, 59))).toBe(false);
  });

  it('counts an exactly-equal read time as seen', () => {
    expect(isSeenBy(m, at(2026, 7, 31, 12, 0))).toBe(true);
  });

  it('treats a never-opened thread as unseen, not unknown', () => {
    expect(isSeenBy(m, null)).toBe(false);
    expect(isSeenBy(m, undefined)).toBe(false);
  });
});

describe('lastSeenOwnMessageId', () => {
  const read = at(2026, 7, 31, 12, 30);

  it('marks only the NEWEST seen message of mine', () => {
    const messages = [
      msg({ id: 'a', created_at: at(2026, 7, 31, 12, 0) }),
      msg({ id: 'b', created_at: at(2026, 7, 31, 12, 10) }),
    ];
    expect(lastSeenOwnMessageId(messages, 'me', read)).toBe('b');
  });

  it('ignores the other party’s messages', () => {
    const messages = [
      msg({ id: 'mine', created_at: at(2026, 7, 31, 12, 0) }),
      msg({
        id: 'theirs',
        sender_id: 'them',
        created_at: at(2026, 7, 31, 12, 10),
      }),
    ];
    expect(lastSeenOwnMessageId(messages, 'me', read)).toBe('mine');
  });

  it('skips a message newer than their last read', () => {
    const messages = [
      msg({ id: 'seen', created_at: at(2026, 7, 31, 12, 0) }),
      msg({ id: 'unseen', created_at: at(2026, 7, 31, 23, 0) }),
    ];
    expect(lastSeenOwnMessageId(messages, 'me', read)).toBe('seen');
  });

  it('never marks an optimistic bubble, which is not on the server yet', () => {
    const messages = [
      msg({ id: 'optimistic-123', created_at: at(2026, 7, 31, 12, 0) }),
    ];
    expect(lastSeenOwnMessageId(messages, 'me', read)).toBeNull();
  });

  it('never marks a system row, which the user did not write', () => {
    // release_hold / mark_listing_sold stamp these with the seller's own id.
    const messages = [
      msg({ id: 'sys', kind: 'system', created_at: at(2026, 7, 31, 12, 0) }),
    ];
    expect(lastSeenOwnMessageId(messages, 'me', read)).toBeNull();
  });

  it('returns null when they have never opened the thread', () => {
    expect(lastSeenOwnMessageId([msg({ id: 'a' })], 'me', null)).toBeNull();
  });
});
