import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// AsyncStorage key. Keep the v1 suffix in case we ever need to bump
// the format. The "trove" prefix is the current app brand -- the old
// "localhauls" key naturally lapses; users on a fresh install land on
// the new key without migration.
const KEY = 'trove.lastMapRegion.v1';

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

/**
 * Persists the user's last-viewed map region to AsyncStorage and
 * exposes it for use as a Map's `initialRegion`. Means re-opening
 * the app drops you where you were instead of US center.
 *
 * Returns:
 *   - region: the loaded region, or null while still loading from disk
 *   - save:   debounced setter to call from onRegionChangeComplete
 *   - ready:  true once we've attempted to load from disk
 */
export function useLastMapRegion() {
  const [region, setRegion] = useState<Region | null>(null);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as Region;
          if (
            typeof parsed.latitude === 'number' &&
            typeof parsed.longitude === 'number'
          ) {
            setRegion(parsed);
          }
        }
      } catch {
        /* ignore corrupted entry */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const save = (next: Region) => {
    setRegion(next);
    // Debounce — onRegionChangeComplete fires per pan, no need to
    // hammer AsyncStorage. 1s after the last pan settles is plenty.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {
        /* best-effort */
      });
    }, 1000);
  };

  return { region, save, ready };
}
