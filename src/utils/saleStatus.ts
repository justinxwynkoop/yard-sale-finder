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
