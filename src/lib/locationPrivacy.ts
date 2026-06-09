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

/**
 * Resolve where a sale should be shown on a map + whether its exact
 * address may be revealed.
 *
 * PRODUCT DECISION (changed): yard sales ALWAYS show their exact address.
 * People need the real address to actually attend a sale, so the
 * approximate/blurred "reply" mode no longer applies to sales — this
 * function always returns the exact location. The location-hiding option
 * is reserved for one-off LISTINGS, which are already private by design:
 * a listing only ever exposes its seller-chosen `pickup_display` (a
 * general area), never the exact pickup address. The blurring math below
 * is intentionally retired; the function shape is preserved so every
 * sale surface keeps compiling and simply renders exact.
 */
export function saleDisplayLocation(
  sale: Sale,
  _ctx: PrivacyContext = {},
): SaleDisplayLocation {
  return {
    latitude: sale.latitude,
    longitude: sale.longitude,
    approximate: false,
    radiusMeters: 0,
    showExactAddress: true,
  };
}

/** Sales are always shown exactly now, so this is always false. */
export function isApproximate(_sale: Sale, _ctx: PrivacyContext = {}): boolean {
  return false;
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
