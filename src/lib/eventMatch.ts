import { SaleEvent } from '../types';
import { haversineMeters } from '../utils/distance';

/**
 * Today's date as a LOCAL 'YYYY-MM-DD' string — NOT `toISOString().slice(0, 10)`,
 * which reads UTC and rolls over to tomorrow's date for anyone west of UTC in
 * the evening. Matches the convention in utils/saleStatus.ts and
 * lib/filterSales.ts. Single source of truth so event-date comparisons agree
 * everywhere (useSaleEvents, CreateSaleScreen's proximity-prompt check).
 */
export function localTodayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Inclusive YYYY-MM-DD range overlap (string compare is safe for ISO dates). */
export function datesOverlap(
  aStart: string, aEnd: string, bStart: string, bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * The proximity-prompt matcher. Location-only by design (spec): a date
 * mismatch must NOT suppress the prompt — it becomes a date-alignment
 * nudge in the UI instead. Soonest upcoming event wins; ties go nearest.
 */
export function eventMatchForSale(
  sale: { latitude: number; longitude: number },
  events: SaleEvent[],
  todayIso: string,
): SaleEvent | null {
  const dist = (e: SaleEvent) =>
    haversineMeters(sale.latitude, sale.longitude, e.latitude, e.longitude);
  const candidates = events.filter(
    (e) => e.end_date >= todayIso && dist(e) <= e.radius_m,
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) =>
    a.start_date < b.start_date ? -1 :
    a.start_date > b.start_date ? 1 :
    dist(a) - dist(b),
  );
  return candidates[0];
}
