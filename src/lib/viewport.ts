import { useEffect, useState } from 'react';
import type { Region } from 'react-native-maps';

/**
 * The map's current visible region. Zillow-style: the viewport IS the
 * filter — the list and count show only sales within these bounds, and it
 * updates live as the user pans/zooms. MapHomeScreen writes it on every
 * settle; FilterSheet reads it so its "Show N" count matches what's in
 * view. Module-level store (same pattern as mapFilters / searchArea).
 */
let _region: Region | null = null;
const _listeners = new Set<(r: Region | null) => void>();

export function getViewport(): Region | null {
  return _region;
}

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
