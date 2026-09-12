import { Sale } from '../types';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nowHM() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function trim5(s: string | null | undefined) {
  return (s ?? '').slice(0, 5);
}

/**
 * True if the sale's status is non-ended AND the current date/time
 * falls inside the sale's [start_date, end_date] / [start_time, end_time]
 * window.
 */
export function isOpenNow(sale: Pick<Sale,
  'status' | 'start_date' | 'end_date' | 'start_time' | 'end_time'
>): boolean {
  if (sale.status === 'ended') return false;
  const today = todayString();
  if (today < sale.start_date || today > sale.end_date) return false;
  const now = nowHM();
  const start = trim5(sale.start_time);
  const end = trim5(sale.end_time);
  return now >= start && now <= end;
}

/**
 * True once a sale is OVER: the DB says ended, the end date has passed, or it
 * is the final day and past end_time.
 *
 * The server only flips `status` on a cron, and the cold-start cache can be
 * hours old, so "not ended in the DB" is not "still happening". Discovery
 * surfaces use this to drop a sale the minute it closes -- it used to stay on
 * the map until 8 PM, badged "SOON". Same rule as saleLiveState
 * (site/api/_lib/share.js) and end_past_sales():
 *   - the evening between days of a multi-day sale is NOT ended; it resumes
 *   - a sale with no end_time runs to the end of its end date
 *
 * Device-local time, like isOpenNow -- shoppers browse sales near them. And
 * like isOpenNow it compares HH:MM: isOpenNow is open THROUGH end_time
 * (`now <= end`) and this is ended from the minute after (`now > end`), so a
 * sale is never open and ended at once.
 */
export function hasSaleEnded(
  sale: Pick<Sale, 'status' | 'end_date' | 'end_time'>,
): boolean {
  if (sale.status === 'ended') return true;
  const today = todayString();
  if (today > sale.end_date) return true;
  if (today < sale.end_date) return false;
  const end = trim5(sale.end_time);
  if (!end) return false;
  return nowHM() > end;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True if the sale/listing was posted within the last `withinDays` days.
 * Used to flag "new" content (map pin accent, list tile badge). Tolerates a
 * missing/malformed created_at by returning false.
 */
export function isRecentlyPosted(
  createdAt: string | null | undefined,
  withinDays = 3,
): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < withinDays * DAY_MS;
}

/**
 * Returns the number of MINUTES until the sale closes today (using
 * end_time), or null if the sale isn't open right now / today isn't
 * its last day. Drives "ends in 45 min" urgency banners.
 */
export function minutesUntilClose(sale: Pick<Sale,
  'status' | 'start_date' | 'end_date' | 'start_time' | 'end_time'
>): number | null {
  if (!isOpenNow(sale)) return null;
  // Only show the urgency banner on the FINAL day of a multi-day sale.
  if (todayString() !== sale.end_date) return null;
  const [eh, em] = trim5(sale.end_time).split(':').map(Number);
  const now = new Date();
  const close = new Date();
  close.setHours(eh ?? 0, em ?? 0, 0, 0);
  const diffMs = close.getTime() - now.getTime();
  return Math.max(0, Math.round(diffMs / 60000));
}
