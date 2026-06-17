import { useEffect, useState } from 'react';

/**
 * Module-level store for the Map's active "search area" — the place the
 * user searched (e.g. "Muncie, Indiana"). When set, the Map recenters on
 * it; the resulting viewport then scopes the list (Zillow-style). It does
 * NOT change distance/sort math. Cleared by the locate button / the ✕.
 *
 * Same shared-store pattern as mapFilters: the Map's inline search box
 * sets it on submit; MapHomeScreen reacts to recenter + rescope.
 */
export interface SearchArea {
  latitude: number;
  longitude: number;
  /** Human label for the card, e.g. "Muncie, IN". */
  label: string;
}

let _area: SearchArea | null = null;
const _listeners = new Set<(a: SearchArea | null) => void>();

export function getSearchArea(): SearchArea | null {
  return _area;
}

export function setSearchArea(area: SearchArea | null): void {
  _area = area;
  _listeners.forEach((fn) => fn(_area));
}

export function useSearchArea(): SearchArea | null {
  const [area, setArea] = useState(_area);
  useEffect(() => {
    _listeners.add(setArea);
    return () => {
      _listeners.delete(setArea);
    };
  }, []);
  return area;
}
