import { useEffect, useState } from 'react';
import { ItemCategory } from '../types';

/**
 * Module-level filter store for the Map / Discover screen.
 *
 * The FilterSheet is presented as a modal route, so it can't pass state
 * back via React Context (the route is rendered in a sibling navigator
 * tree). Instead, both screens subscribe to this store. Updates are
 * synchronous and broadcast to all listeners on the next tick.
 */

export type WhenFilter = 'today' | 'weekend' | 'next_weekend' | null;
export type VibeTag =
  | 'early_bird'
  | 'cash_only'
  | 'block_sale'
  | 'estate'
  | 'moving';

export interface MapFilters {
  /** Radius in miles, or null for no radius filter. */
  radiusMiles: number | null;
  openNow: boolean;
  when: WhenFilter;
  categories: ItemCategory[];
  vibeTags: VibeTag[];
  savedOnly: boolean;
}

const DEFAULT_FILTERS: MapFilters = {
  radiusMiles: null,
  openNow: false,
  when: null,
  categories: [],
  vibeTags: [],
  savedOnly: false,
};

let _state: MapFilters = { ...DEFAULT_FILTERS };
const _listeners = new Set<(state: MapFilters) => void>();

export function getMapFilters(): MapFilters {
  return _state;
}

export function setMapFilters(next: Partial<MapFilters>) {
  _state = { ..._state, ...next };
  _listeners.forEach((fn) => fn(_state));
}

export function resetMapFilters() {
  _state = { ...DEFAULT_FILTERS };
  _listeners.forEach((fn) => fn(_state));
}

export function countActiveFilters(state: MapFilters): number {
  let n = 0;
  if (state.radiusMiles != null) n++;
  if (state.openNow) n++;
  if (state.when) n++;
  if (state.categories.length > 0) n++;
  if (state.vibeTags.length > 0) n++;
  if (state.savedOnly) n++;
  return n;
}

export function useMapFilters(): MapFilters {
  const [state, setState] = useState(_state);
  useEffect(() => {
    _listeners.add(setState);
    return () => {
      _listeners.delete(setState);
    };
  }, []);
  return state;
}
