import {
  formatPostedDate,
  formatHM,
  formatSaleTime,
  formatSaleDate,
} from '../format';

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

describe('formatPostedDate', () => {
  it('returns "Posted today" when created within the last 24 hours', () => {
    expect(formatPostedDate(isoHoursAgo(1))).toBe('Posted today');
    expect(formatPostedDate(isoHoursAgo(23))).toBe('Posted today');
  });

  it('returns "Posted yesterday" when created 24–48 hours ago', () => {
    expect(formatPostedDate(isoHoursAgo(25))).toBe('Posted yesterday');
    expect(formatPostedDate(isoHoursAgo(47))).toBe('Posted yesterday');
  });

  it('returns "Posted 2 days ago" when created 48–72 hours ago', () => {
    expect(formatPostedDate(isoHoursAgo(49))).toBe('Posted 2 days ago');
    expect(formatPostedDate(isoHoursAgo(71))).toBe('Posted 2 days ago');
  });

  it('returns "Posted Month Year" for listings 3+ days old', () => {
    // Use mid-month noon UTC to avoid timezone-boundary false failures
    expect(formatPostedDate('2026-01-15T12:00:00.000Z')).toBe('Posted January 2026');
    expect(formatPostedDate('2025-11-15T12:00:00.000Z')).toBe('Posted November 2025');
  });
});

// The en-dash used between range parts (U+2013), not a hyphen.
const EN_DASH = '–';

describe('formatHM', () => {
  it('drops the minutes and leading zero on the hour for a top-of-hour AM time', () => {
    expect(formatHM('09:00')).toBe('9 AM');
  });

  it('renders midnight as "12 AM"', () => {
    expect(formatHM('00:00')).toBe('12 AM');
  });

  it('renders noon as "12 PM"', () => {
    expect(formatHM('12:00')).toBe('12 PM');
  });

  it('keeps the minutes and converts to 12-hour PM for an afternoon time', () => {
    expect(formatHM('13:30')).toBe('1:30 PM');
  });

  it('zero-pads a single-digit minute', () => {
    expect(formatHM('09:05')).toBe('9:05 AM');
  });
});

describe('formatSaleTime', () => {
  it('joins start and end times with a spaced en-dash, trimming :00 minutes', () => {
    expect(formatSaleTime('09:00', '14:00')).toBe(`9 AM ${EN_DASH} 2 PM`);
  });

  it('keeps non-zero minutes on either end', () => {
    expect(formatSaleTime('09:30', '12:00')).toBe(`9:30 AM ${EN_DASH} 12 PM`);
  });
});

describe('formatSaleDate', () => {
  // Pin "today" to a known date so the relative wording is deterministic.
  // Wed Jun 24 2026, local noon (noon avoids any DST/boundary surprises).
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 24, 12, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders a same-day sale that is today as "Today"', () => {
    expect(formatSaleDate('2026-06-24', '2026-06-24')).toBe('Today');
  });

  it('renders tomorrow as "Tomorrow"', () => {
    expect(formatSaleDate('2026-06-25', '2026-06-25')).toBe('Tomorrow');
  });

  it('renders yesterday as "Yesterday"', () => {
    expect(formatSaleDate('2026-06-23', '2026-06-23')).toBe('Yesterday');
  });

  it('renders a day within the next 6 days as the short weekday form', () => {
    // Jun 27 2026 is a Saturday, 3 days out. toLocaleDateString puts a
    // comma after the short weekday: "Sat, Jun 27".
    expect(formatSaleDate('2026-06-27', '2026-06-27')).toBe('Sat, Jun 27');
  });

  it('renders a day further than 6 days out as just month + day', () => {
    // Jul 2 2026 is 8 days out — no weekday prefix.
    expect(formatSaleDate('2026-07-02', '2026-07-02')).toBe('Jul 2');
  });

  it('renders a multi-day same-month range compactly (month shown once)', () => {
    expect(formatSaleDate('2026-07-10', '2026-07-12')).toBe(`Jul 10 ${EN_DASH} 12`);
  });

  it('renders a multi-day cross-month range with both month + day', () => {
    expect(formatSaleDate('2026-07-30', '2026-08-02')).toBe(
      `Jul 30 ${EN_DASH} Aug 2`,
    );
  });

  it('does not shift the day-of-month for a YYYY-MM-DD date (parseLocalDate regression)', () => {
    // A bare 'YYYY-MM-DD' parsed via the native Date constructor is UTC
    // midnight, which lands on the previous day in west-of-UTC zones.
    // parseLocalDate must keep the rendered day equal to the input day
    // regardless of the runner's timezone. Use a far-out date so the
    // output is the plain "month day" form we can read the day from.
    const out = formatSaleDate('2026-09-21', '2026-09-21');
    expect(out).toBe('Sep 21');
    // Explicitly assert the day-of-month survived (no off-by-one).
    expect(out).toContain('21');
    expect(out).not.toContain('20');
  });
});
