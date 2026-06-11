import { useEffect, useState } from 'react';
import { ItemCategory } from '../types';

/**
 * Module-level filter store for the Listings tab's One-off items
 * segment. Same pattern as mapFilters.ts — the filter modal lives in
 * a sibling navigator and can't pass state back through Context.
 */

export type PriceBucket = 'free' | 'under10' | '10-50' | '50-100' | '100plus';

export interface ListingsFilters {
  categories: ItemCategory[];
  priceBucket: PriceBucket | null;
  /** Distance in miles for proximity filter. null = any distance. */
  radiusMiles: number | null;
}

const DEFAULT_FILTERS: ListingsFilters = {
  categories: [],
  priceBucket: null,
  radiusMiles: null,
};

let _state: ListingsFilters = { ...DEFAULT_FILTERS };
const _listeners = new Set<(s: ListingsFilters) => void>();

export function getListingsFilters(): ListingsFilters {
  return _state;
}

export function setListingsFilters(next: Partial<ListingsFilters>) {
  _state = { ..._state, ...next };
  _listeners.forEach((fn) => fn(_state));
}

export function resetListingsFilters() {
  _state = { ...DEFAULT_FILTERS };
  _listeners.forEach((fn) => fn(_state));
}

export function countActiveListingsFilters(state: ListingsFilters): number {
  let n = 0;
  if (state.categories.length > 0) n++;
  if (state.priceBucket) n++;
  if (state.radiusMiles != null) n++;
  return n;
}

export function priceBucketToRange(
  bucket: PriceBucket | null,
): { min: number | null; max: number | null } {
  switch (bucket) {
    case 'free':
      return { min: 0, max: 0 };
    case 'under10':
      return { min: null, max: 10 };
    case '10-50':
      return { min: 10, max: 50 };
    case '50-100':
      return { min: 50, max: 100 };
    case '100plus':
      return { min: 100, max: null };
    default:
      return { min: null, max: null };
  }
}

export function useListingsFilters(): ListingsFilters {
  const [state, setState] = useState(_state);
  useEffect(() => {
    _listeners.add(setState);
    return () => {
      _listeners.delete(setState);
    };
  }, []);
  return state;
}
