import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

/**
 * Reverse-geocodes a lat/lng pair into a short "City, ST" label for
 * the Map screen's search card. Cached per-coordinate-bucket so we
 * don't burn through Apple/Google geocoding quota on every render.
 *
 * Falls back to `null` while loading or on failure — callers should
 * gate display on the result.
 */

type Coords = { latitude: number; longitude: number } | null;

// Round to ~1km accuracy so trivial location jitter doesn't bust cache.
const bucket = (n: number) => Math.round(n * 100) / 100;
const cache = new Map<string, string>();

export function useLocationLabel(coords: Coords): string | null {
  const [label, setLabel] = useState<string | null>(() => {
    if (!coords) return null;
    const key = `${bucket(coords.latitude)},${bucket(coords.longitude)}`;
    return cache.get(key) ?? null;
  });

  useEffect(() => {
    if (!coords) {
      setLabel(null);
      return;
    }
    const key = `${bucket(coords.latitude)},${bucket(coords.longitude)}`;
    const cached = cache.get(key);
    if (cached) {
      setLabel(cached);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const results = await Location.reverseGeocodeAsync({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        if (cancelled) return;
        const first = results[0];
        if (!first) return;
        const city = first.city ?? first.subregion ?? first.district ?? null;
        // expo-location returns the two-letter state code in `region` on
        // iOS; on Android it's often the full state name. Strip to first
        // 2 chars uppercase for consistency.
        const state = first.region ?? first.isoCountryCode ?? null;
        const stateLabel =
          state && state.length > 2 ? state.slice(0, 2).toUpperCase() : state;
        const out =
          city && stateLabel ? `${city}, ${stateLabel}` : city ?? stateLabel;
        if (!out) return;
        cache.set(key, out);
        setLabel(out);
      } catch {
        /* swallow — search card just stays on "Near you" */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coords?.latitude, coords?.longitude]);

  return label;
}
