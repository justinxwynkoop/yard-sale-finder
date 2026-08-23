import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

/**
 * Run `callback` each time the app returns to the foreground (background /
 * inactive -> active). Used by the live-data hooks to refetch and rebuild
 * their Realtime channels: iOS tears the websocket down while the app is
 * backgrounded, and a channel that died that way never rejoins on its own,
 * so anything that relies on Realtime alone goes silently stale after the
 * phone locks.
 *
 * The latest callback is read through a ref so callers can pass an inline
 * closure without re-subscribing the AppState listener every render.
 */
export function useAppForeground(callback: () => void) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    let previous: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && previous !== 'active') callbackRef.current();
      previous = next;
    });
    return () => sub.remove();
  }, []);
}
