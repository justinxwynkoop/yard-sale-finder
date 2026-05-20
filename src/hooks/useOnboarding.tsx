import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'onboarding_completed_v1';

type OnboardingState = {
  loading: boolean;
  completed: boolean;
  complete: () => Promise<void>;
  reset: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingState | null>(null);

/**
 * Provider that owns the onboarding-completion flag and shares it
 * across the whole app. WHY: previously each useOnboarding() call had
 * its own useState — so when OnboardingScreen marked itself complete,
 * MainGate's separate copy of the state never flipped and the user
 * was stuck staring at the carousel.
 */
export function OnboardingProvider({ children }: { children: React.ReactNode }) {
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

  const value: OnboardingState = {
    loading: completed === null,
    completed: !!completed,
    complete,
    reset,
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingState {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used inside <OnboardingProvider>');
  }
  return ctx;
}
