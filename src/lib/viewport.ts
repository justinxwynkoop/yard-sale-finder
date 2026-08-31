import { useEffect, useState } from 'react';
import type { Region } from 'react-native-maps';
import { haversineMeters } from '../utils/distance';

/**
 * The map's current visible region. Zillow-style: the viewport IS the
 * filter — the list and count show only sales within these bounds, and it
 * updates live as the user pans/zooms. MapHomeScreen writes it on every
 * settle; FilterSheet reads it so its "Show N" count matches what's in
 * view. Module-level store (same pattern as mapFilters / searchArea).
 */
let _region: Region | null = null;
const _listeners = new Set<(r: Region | null) => void>();

export function setViewport(region: Region | null): void {
  _region = region;
  _listeners.forEach((fn) => fn(_region));
}

export function useViewport(): Region | null {
  const [r, setR] = useState(_region);
  useEffect(() => {
    _listeners.add(setR);
    return () => {
      _listeners.delete(setR);
    };
  }, []);
  return r;
}

/** Is a coordinate within the region's visible bounds? */
export function regionContains(r: Region, lat: number, lng: number): boolean {
  const latMin = r.latitude - r.latitudeDelta / 2;
  const latMax = r.latitude + r.latitudeDelta / 2;
  const lngMin = r.longitude - r.longitudeDelta / 2;
  const lngMax = r.longitude + r.longitudeDelta / 2;
  return lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax;
}

/**
 * The items inside `scope`, nearest-first from its center — what the
 * bottom-sheet list and its "N sales nearby" header render.
 *
 * A null scope returns EMPTY, never the input. That is the whole point of
 * this helper: the caller's scope is `viewport ?? sessionRegion ??
 * initialRegion`, and all three are null only before the map has mounted a
 * region. Falling back to the unscoped list there put every sale in the
 * country under a "nearby" header — a map centered on New York once counted
 * two sales in Kansas and Nebraska as nearby. Nothing on screen means
 * nothing nearby.
 */
export function scopedByRegion<
  T extends { latitude: number; longitude: number },
>(items: T[], scope: Region | null): T[] {
  if (!scope) return [];
  const d = (i: T) =>
    haversineMeters(scope.latitude, scope.longitude, i.latitude, i.longitude);
  return items
    .filter((i) => regionContains(scope, i.latitude, i.longitude))
    .sort((a, b) => d(a) - d(b));
}
