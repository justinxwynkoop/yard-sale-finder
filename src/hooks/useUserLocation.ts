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
