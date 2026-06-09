import { Sale } from '../types';
import { isOpenNow } from '../utils/saleStatus';

/**
 * Address-privacy rendering rules for sales.
 *
 * A sale carries a snapshot of its host's preference (`location_privacy`,
 * `blur_radius_blocks`) taken at post time (see the
 * 20260609123000_sale_address_privacy migration + trigger).
 *
 * - 'live'  → exact pin while the sale is open; nothing special to do
 *             (ended sales are already filtered off the map).
 * - 'reply' → the exact address is hidden behind an approximate blurred
 *             circle until the host has messaged the viewer back. Until
 *             then we render a deterministically-offset point + a circle
 *             of `blur_radius_blocks` so the real address sits *somewhere*
 *             inside the circle but never at its center.
 *
 * The owner always sees their own exact location. `exactUnlocked` lets a
 * caller (e.g. SaleDetail, after checking the host has replied to this
 * viewer) reveal the exact address.
 */

const BLOCK_METERS = 80; // rough city block
const METERS_PER_DEG_LAT = 111_320;

export interface PrivacyContext {
  /** The viewer is the host. Always sees exact. */
  isOwner?: boolean;
  /** The host has replied to this viewer → reveal exact. */
  exactUnlocked?: boolean;
}

export interface SaleDisplayLocation {
  latitude: number;
  longitude: number;
  /** True when the point/address shown is deliberately approximate. */
  approximate: boolean;
  /** Circle radius in meters to draw around an approximate point (else 0). */
  radiusMeters: number;
  /** Whether the caller may show the exact street address text. */
  showExactAddress: boolean;
}

/** Small deterministic hash of a string → [0, 1). Stable per sale id. */
function hash01(str: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // → unsigned, normalized
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * Resolve where a sale should be shown on a map + whether its exact
 * address may be revealed, honoring the host's privacy snapshot.
 */
export function saleDisplayLocation(
  sale: Sale,
  ctx: PrivacyContext = {},
): SaleDisplayLocation {
  const exact: SaleDisplayLocation = {
    latitude: sale.latitude,
    longitude: sale.longitude,
    approximate: false,
    radiusMeters: 0,
    showExactAddress: true,
  };

  // Owner or an unlocked viewer always sees exact.
  if (ctx.isOwner || ctx.exactUnlocked) return exact;

  // Only 'reply' mode blurs. 'live' (and legacy null) show exact while
  // the sale is on the map.
  if (sale.location_privacy !== 'reply') return exact;

  const blocks = sale.blur_radius_blocks ?? 3;
  const radiusMeters = blocks * BLOCK_METERS;

  // Deterministic offset so the displayed center is near — but not on —
  // the real address. Magnitude ~60% of the radius keeps the true point
  // comfortably inside the drawn circle.
  const angle = hash01(sale.id, 1) * Math.PI * 2;
  const dist = radiusMeters * 0.6;
  const dLat = (Math.cos(angle) * dist) / METERS_PER_DEG_LAT;
  const dLng =
    (Math.sin(angle) * dist) /
    (METERS_PER_DEG_LAT * Math.cos((sale.latitude * Math.PI) / 180));

  return {
    latitude: sale.latitude + dLat,
    longitude: sale.longitude + dLng,
    approximate: true,
    radiusMeters,
    showExactAddress: false,
  };
}

/** True when this sale's address is currently being shown approximately. */
export function isApproximate(sale: Sale, ctx: PrivacyContext = {}): boolean {
  return saleDisplayLocation(sale, ctx).approximate;
}

/**
 * A friendly label for an approximate sale's location, e.g.
 * "Approximate area · Maplewood, NJ". Falls back to "Approximate area".
 */
export function approximateAreaLabel(sale: Sale): string {
  // Sale.address is the full street address; we only want the
  // town-ish tail. If the address has commas, drop the first segment
  // (street) and keep the rest.
  const parts = (sale.address ?? '').split(',').map((s) => s.trim());
  const area = parts.length > 1 ? parts.slice(1).join(', ') : '';
  return area ? `Approximate area · ${area}` : 'Approximate area';
}

/** Sale is open AND uses 'live' exact mode (used for "exact while live"). */
export function isLiveExact(sale: Sale): boolean {
  return sale.location_privacy === 'live' && isOpenNow(sale);
}
