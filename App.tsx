import 'react-native-url-polyfill/auto';
import 'react-native-gesture-handler';
import './global.css';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import * as Sentry from '@sentry/react-native';
import * as SplashScreen from 'expo-splash-screen';
import Toast from 'react-native-toast-message';
import Navigation from './src/navigation';
import { handleAuthDeepLink } from './src/lib/authDeepLinks';
import { ErrorBoundary } from './src/components/ErrorBoundary';

// Keep the native splash up until we've mounted at least once.
// Under the new architecture the auto-hide behavior is unreliable,
// so we dismiss it explicitly in App's first effect. Wrapped in
// .catch() because hideAsync rejects if the splash is already gone.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Initialize Sentry if a DSN is configured. Set EXPO_PUBLIC_SENTRY_DSN
// in your .env (or via EAS secrets) when you're ready to track crashes.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    debug: false,
    tracesSampleRate: 0.2,
    // Skip in dev so noisy hot-reload errors don't fill the Sentry inbox.
    enabled: !__DEV__,
  });
}

function App() {
  // The navigation gates (navigation/index) now hide the splash once the first
  // REAL screen is ready, so cold start is splash → app instead of
  // splash → auth-spinner → profile-spinner → app. This is only a safety net:
  // if a gate never settles (e.g. a hung fetch), drop the splash so the launch
  // screen can never stick on top of the UI forever. Must stay LONGER than the
  // slowest legitimate gate it backstops — MapHomeScreen's GPS-timeout fallback
  // (src/screens/map/MapHomeScreen.tsx) is 6s; a shorter net here fires first
  // on every cold-GPS launch and defeats the whole "wait for the real screen"
  // fix by exposing that screen's own loading spinner once the splash drops.
  useEffect(() => {
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 10000);
    return () => clearTimeout(t);
  }, []);

  // Listen for Supabase auth deep links (email confirmation + password reset).
  // useAuth + Navigation react to the resulting session / PASSWORD_RECOVERY
  // event automatically, so all this needs to do is hand the URL to Supabase.
  useEffect(() => {
    // Cold-start: app was opened from a link
    Linking.getInitialURL().then((url) => {
      if (url) handleAuthDeepLink(url);
    });
    // Warm: app was already running
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleAuthDeepLink(url);
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <Navigation />
        </ErrorBoundary>
        <StatusBar style="auto" />
        {/* Toast root — rendered above everything so it sits over modals too */}
        <Toast />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Wrap the root component so Sentry can attach its native crash
// handlers. Falls back to the plain App when SENTRY_DSN isn't set.
export default SENTRY_DSN ? Sentry.wrap(App) : App;
