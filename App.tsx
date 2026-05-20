import 'react-native-url-polyfill/auto';
import 'react-native-gesture-handler';
import './global.css';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import Toast from 'react-native-toast-message';
import Navigation from './src/navigation';
import { handleAuthDeepLink } from './src/lib/authDeepLinks';
import { ErrorBoundary } from './src/components/ErrorBoundary';

export default function App() {
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
    <SafeAreaProvider>
      <ErrorBoundary>
        <Navigation />
      </ErrorBoundary>
      <StatusBar style="auto" />
      {/* Toast root — rendered above everything so it sits over modals too */}
      <Toast />
    </SafeAreaProvider>
  );
}
