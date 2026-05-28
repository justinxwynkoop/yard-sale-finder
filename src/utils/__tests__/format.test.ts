import { formatPostedDate } from '../format';

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
