import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'onboarding_completed_v1';

/**
 * Tracks whether the user has finished the first-launch onboarding
 * carousel. Stored locally per device — they only see it once.
 *
 * `loading` is true until we've read the flag (~10ms). Render
 * nothing during that window so we don't flash onboarding for a
 * returning user.
 */
export function useOnboarding() {
  const [completed, setCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => setCompleted(v === '1'));
  }, []);

  const complete = useCallback(async () => {
    await AsyncStorage.setItem(KEY, '1');
    setCompleted(true);
  }, []);

  const reset = useCallback(async () => {
    await AsyncStorage.removeItem(KEY);
    setCompleted(false);
  }, []);

  return { loading: completed === null, completed: !!completed, complete, reset };
}
