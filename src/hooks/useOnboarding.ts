import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * One-time post-signup onboarding state. Shown once (after Complete
 * Profile + Terms) and never again. Persisted in AsyncStorage.
 *
 * Uses a module-level store + listener set (same pattern as searchArea /
 * mapFilters) so that calling complete() from OnboardingScreen
 * immediately re-renders MainGate's hook instance and swaps to the app —
 * two independent useState instances wouldn't share that update.
 */
const KEY = 'trove.onboarding.completed.v1';

// null = not loaded yet, true/false = known.
let _completed: boolean | null = null;
let _loadStarted = false;
const _listeners = new Set<() => void>();

function _broadcast() {
  _listeners.forEach((fn) => fn());
}

function _load() {
  if (_loadStarted) return;
  _loadStarted = true;
  AsyncStorage.getItem(KEY)
    .then((v) => {
      _completed = v === 'true';
      _broadcast();
    })
    .catch(() => {
      _completed = false;
      _broadcast();
    });
}

export function useOnboarding() {
  const [, force] = useState(0);

  useEffect(() => {
    const rerender = () => force((n) => n + 1);
    _listeners.add(rerender);
    _load();
    return () => {
      _listeners.delete(rerender);
    };
  }, []);

  const complete = useCallback(() => {
    _completed = true;
    _broadcast();
    AsyncStorage.setItem(KEY, 'true').catch(() => {});
  }, []);

  return { completed: _completed === true, loading: _completed === null, complete };
}
