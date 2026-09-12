import {
  hasSaleEnded,
  isOpenNow,
  isRecentlyPosted,
  minutesUntilClose,
} from '../saleStatus';
import { Sale } from '../../types';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function todayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function tomorrowDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

describe('isOpenNow', () => {
  it('returns false for ended sales regardless of times', () => {
    expect(
      isOpenNow({
        status: 'ended',
        start_date: todayDate(),
        end_date: todayDate(),
        start_time: '00:00',
        end_time: '23:59',
      }),
    ).toBe(false);
  });

  it('returns false when today is outside the date range', () => {
    expect(
      isOpenNow({
        status: 'active',
        start_date: tomorrowDate(),
        end_date: tomorrowDate(),
        start_time: '00:00',
        end_time: '23:59',
      }),
    ).toBe(false);
  });

  it('returns true when in window today', () => {
    expect(
      isOpenNow({
        status: 'active',
        start_date: todayDate(),
        end_date: todayDate(),
        start_time: '00:00',
        end_time: '23:59',
      }),
    ).toBe(true);
  });

  it('tolerates HH:MM:SS time formats from Supabase', () => {
    expect(
      isOpenNow({
        status: 'active',
        start_date: todayDate(),
        end_date: todayDate(),
        start_time: '00:00:00',
        end_time: '23:59:59',
      }),
    ).toBe(true);
  });
});

describe('isRecentlyPosted', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  // Fixed reference instant: 2026-06-26T12:00:00Z.
  const NOW = new Date('2026-06-26T12:00:00.000Z').getTime();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns false for null', () => {
    expect(isRecentlyPosted(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRecentlyPosted(undefined)).toBe(false);
  });

  it('returns false for a malformed date string', () => {
    expect(isRecentlyPosted('not-a-date')).toBe(false);
  });

  it('returns true for a timestamp just under withinDays in the past', () => {
    // 3 days minus one minute ago — still inside the default 3-day window.
    const t = new Date(NOW - (3 * DAY_MS - 60_000)).toISOString();
    expect(isRecentlyPosted(t)).toBe(true);
  });

  it('returns false exactly at the boundary (strict <)', () => {
    // Exactly 3 days ago — comparison is strict <, so this is NOT recent.
    const t = new Date(NOW - 3 * DAY_MS).toISOString();
    expect(isRecentlyPosted(t)).toBe(false);
  });

  it('honors a custom withinDays argument', () => {
    // 5 days ago: outside the default 3-day window, inside a 7-day window.
    const t = new Date(NOW - 5 * DAY_MS).toISOString();
    expect(isRecentlyPosted(t)).toBe(false);
    expect(isRecentlyPosted(t, 7)).toBe(true);
  });
});

describe('minutesUntilClose', () => {
  // Fixed local system time: 2026-06-26 12:00 local.
  // Using non-UTC constructor so todayString()/nowHM() (which read local
  // getHours/getDate) line up with the fixtures below.
  const NOW = new Date(2026, 5, 26, 12, 0, 0, 0);

  function fixedDateString() {
    return `${NOW.getFullYear()}-${pad(NOW.getMonth() + 1)}-${pad(NOW.getDate())}`;
  }

  function fixedTomorrowString() {
    const d = new Date(NOW);
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns null when the sale is not open now', () => {
    const sale = {
      status: 'ended',
      start_date: fixedDateString(),
      end_date: fixedDateString(),
      start_time: '00:00',
      end_time: '23:59',
    } as Sale;
    expect(minutesUntilClose(sale)).toBeNull();
  });

  it('returns null when today is not the end_date (multi-day sale ending tomorrow)', () => {
    const sale = {
      status: 'active',
      start_date: fixedDateString(),
      end_date: fixedTomorrowString(),
      start_time: '00:00',
      end_time: '23:59',
    } as Sale;
    // Open now, but not the final day → no urgency banner.
    expect(minutesUntilClose(sale)).toBeNull();
  });

  it('returns rounded minutes to end_time on the final day', () => {
    const sale = {
      status: 'active',
      start_date: fixedDateString(),
      end_date: fixedDateString(),
      start_time: '00:00',
      end_time: '12:45',
    } as Sale;
    // 12:00 now, closes 12:45 → 45 minutes.
    expect(minutesUntilClose(sale)).toBe(45);
  });

  it('clamps to 0 and never returns negative', () => {
    const sale = {
      status: 'active',
      start_date: fixedDateString(),
      end_date: fixedDateString(),
      start_time: '00:00',
      end_time: '12:00',
    } as Sale;
    // Now == close (12:00) → 0, and still considered open (now <= end).
    expect(minutesUntilClose(sale)).toBe(0);
  });

  it('tolerates HH:MM:SS end_time format from Supabase', () => {
    const sale = {
      status: 'active',
      start_date: fixedDateString(),
      end_date: fixedDateString(),
      start_time: '00:00:00',
      end_time: '12:45:00',
    } as Sale;
    expect(minutesUntilClose(sale)).toBe(45);
  });
});

describe('hasSaleEnded', () => {
  // Fixed local time: 2026-06-14 15:00. Non-UTC constructor so the helper's
  // local getDate()/getHours() line up with these fixtures.
  const NOW = new Date(2026, 5, 14, 15, 0, 0, 0);
  const day = (offset: number) => {
    const d = new Date(NOW);
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const sale = (o: Partial<Sale>) =>
    ({
      status: 'active',
      start_date: day(0),
      end_date: day(0),
      start_time: '08:00:00',
      end_time: '14:00:00',
      ...o,
    }) as Sale;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is ended once past end_time on the final day, though the DB says active', () => {
    // The reported bug: closed at 2 PM, it is 3 PM, status is still active.
    expect(hasSaleEnded(sale({}))).toBe(true);
  });

  it('is not ended earlier on the final day', () => {
    expect(hasSaleEnded(sale({ end_time: '16:00:00' }))).toBe(false);
  });

  it('is not ended in the evening between days of a multi-day sale', () => {
    // Past today's hours, but it resumes tomorrow.
    expect(hasSaleEnded(sale({ end_date: day(1) }))).toBe(false);
  });

  it('is ended after the end date regardless of time', () => {
    expect(
      hasSaleEnded(sale({ start_date: day(-2), end_date: day(-1), end_time: '23:59:00' })),
    ).toBe(true);
  });

  it('trusts the DB status over the clock', () => {
    expect(hasSaleEnded(sale({ status: 'ended', end_time: '23:59:00' }))).toBe(true);
  });

  it('runs to the end of the final day when there is no end_time', () => {
    expect(hasSaleEnded(sale({ end_time: null as unknown as string }))).toBe(false);
  });

  it('tolerates HH:MM as well as HH:MM:SS', () => {
    expect(hasSaleEnded(sale({ end_time: '14:00' }))).toBe(true);
  });

  it('is never open and ended in the same minute around close', () => {
    for (const [h, m] of [[13, 59], [14, 0], [14, 1]] as const) {
      jest.setSystemTime(new Date(2026, 5, 14, h, m, 30, 0));
      const s = sale({});
      expect(isOpenNow(s) && hasSaleEnded(s)).toBe(false);
      // ...and never neither, on the final day inside the window edges.
      expect(isOpenNow(s) || hasSaleEnded(s)).toBe(true);
    }
  });
});
