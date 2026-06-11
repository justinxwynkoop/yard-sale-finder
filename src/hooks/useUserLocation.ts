import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

export type UserLocation = {
  latitude: number;
  longitude: number;
};

/**
 * Returns the user's current location once (best-effort).
 * - Returns `null` until we have coords or have given up.
 * - Does not prompt for permission if it's already denied; that lets
 *   callers decide whether to prompt explicitly elsewhere.
 */
export function useUserLocation(autoRequest = true): UserLocation | null {
  const [coords, setCoords] = useState<UserLocation | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let status = (await Location.getForegroundPermissionsAsync()).status;
        if (status !== 'granted') {
          if (!autoRequest) return;
          status = (await Location.requestForegroundPermissionsAsync()).status;
          if (status !== 'granted') return;
        }
        // Fast path: a cached last-known fix returns almost instantly, so
        // the map can center on the user immediately instead of waiting
        // seconds for a fresh GPS lock (during which it would otherwise
        // fall back to the US-center default).
        try {
          const last = await Location.getLastKnownPositionAsync();
          if (!cancelled && last) {
            setCoords({
              latitude: last.coords.latitude,
              longitude: last.coords.longitude,
            });
          }
        } catch {
          /* no cached fix */
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setCoords({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      } catch {
        /* swallow */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [autoRequest]);

  return coords;
}
