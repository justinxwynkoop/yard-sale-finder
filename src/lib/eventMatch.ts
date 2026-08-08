import { SaleEvent } from '../types';
import { haversineMeters } from '../utils/distance';

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
