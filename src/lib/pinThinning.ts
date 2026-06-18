import type { Region } from 'react-native-maps';
import { Sale } from '../types';
import { isOpenNow, isRecentlyPosted } from '../utils/saleStatus';

/**
 * Zillow-style level-of-detail thinning for map pins.
 *
 * When you zoom out, hundreds of pins blanket the whole area and the map is
 * useless. Instead of clustering (count bubbles), we keep showing real pins
 * but only a representative subset: divide the world into a grid whose cell
 * size is derived from the current zoom, and show the single highest-priority
 * sale per cell. Zoom out → big cells → a sparse, spread-out set; zoom in →
 * cells shrink → more (eventually all) pins appear.
 *
 * Two properties make this behave well on a react-native-maps map:
 *
 *  1. The grid is anchored to ABSOLUTE coordinates and its size snaps to a
 *     power-of-two ladder, so the chosen cell only depends on the zoom
 *     bucket — NOT on where you've panned. The kept set is therefore stable
 *     while panning and only re-thins when zoom crosses a threshold. That's
 *     essential here: re-deriving markers on every pan churns AIRMap subviews
 *     and crashes the new architecture. (See MapHomeScreen marker notes.)
 *
 *  2. The representative per cell is chosen by a pure priority function, so
 *     the choice is deterministic — no flicker between equally-ranked pins.
 */

// Target on-screen spacing between kept pins, in px. Larger ⇒ sparser map.
// ~64px leaves comfortable air around each 22px dot.
const PIN_SPACING_PX = 64;

function clampInt(v: number, lo: number, hi: number): number {
  // Extreme zoom-in makes the log blow up to Infinity → finest grid (show
  // everything), which is exactly what we want at street level.
  if (!Number.isFinite(v)) return hi;
  return Math.min(hi, Math.max(lo, Math.round(v)));
}

/**
 * The discrete zoom "bucket": how many times the world's 360°/180° span is
 * halved so a grid cell lands ~PIN_SPACING_PX on screen at this zoom. Returned
 * as integer exponents (kx for longitude, ky for latitude). Because they're
 * snapped integers, two slightly different pan/zoom regions at the same zoom
 * level yield the SAME bucket — the caller can memoize the thinned set on
 * (kx, ky) and it stays referentially stable across pans.
 */
export function zoomBucket(
  region: Region,
  screenW: number,
  screenH: number,
): { kx: number; ky: number } {
  const cellsAcross = Math.max(1, screenW / PIN_SPACING_PX);
  const cellsDown = Math.max(1, screenH / PIN_SPACING_PX);
  // desired cell (deg) = visibleSpan / cellsOnScreen; k = log2(worldSpan/cell).
  const kx = clampInt(
    Math.log2((360 * cellsAcross) / region.longitudeDelta),
    0,
    22,
  );
  const ky = clampInt(Math.log2((180 * cellsDown) / region.latitudeDelta), 0, 23);
  return { kx, ky };
}

/**
 * Which sale represents a crowded cell when zoomed out. Higher wins. Saved
 * sales almost always survive; then live (open right now) beats merely active;
 * popularity (saves, then views) breaks the rest. Pure — no randomness, no
 * dependence on pan — so the winner is stable frame to frame.
 */
export function pinPriority(sale: Sale, favorited: boolean): number {
  let score = 0;
  if (favorited) score += 100_000;
  if (sale.status === 'active' && isOpenNow(sale)) score += 10_000;
  else if (sale.status === 'active') score += 5_000;
  // Keep freshly-posted sales visible when zoomed out, even if not yet popular.
  if (isRecentlyPosted(sale.created_at)) score += 7_500;
  score += Math.min(sale.save_count ?? 0, 500) * 20;
  score += Math.min(sale.view_count ?? 0, 5_000);
  return score;
}

/**
 * Keep the highest-priority sale per grid cell at the given zoom bucket.
 *
 * `sales` is expected to be pre-sorted by ascending distance from the user
 * (as MapHomeScreen's `mapSales` is): on a priority tie the first-seen — i.e.
 * the CLOSEST — sale is kept, and the returned array preserves that input
 * order so downstream distance-based logic is unaffected.
 */
export function thinPins(
  sales: Sale[],
  kx: number,
  ky: number,
  favorited: (id: string) => boolean,
): Sale[] {
  // At the finest buckets every sale is effectively alone — skip the work.
  if (sales.length < 2) return sales;
  const lngSize = 360 / 2 ** kx;
  const latSize = 180 / 2 ** ky;
  const winners = new Map<string, { sale: Sale; score: number }>();
  for (const s of sales) {
    const cx = Math.floor((s.longitude + 180) / lngSize);
    const cy = Math.floor((s.latitude + 90) / latSize);
    const key = `${cx}:${cy}`;
    const score = pinPriority(s, favorited(s.id));
    const cur = winners.get(key);
    // Strict >, so an equal-priority later (farther) sale never displaces the
    // first-seen (closer) one.
    if (!cur || score > cur.score) winners.set(key, { sale: s, score });
  }
  if (winners.size === sales.length) return sales; // nothing thinned
  const kept = new Set<Sale>();
  winners.forEach(({ sale }) => kept.add(sale));
  return sales.filter((s) => kept.has(s));
}
