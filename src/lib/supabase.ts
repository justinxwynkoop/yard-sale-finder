import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Fail loudly with a recognizable error instead of letting createClient
// throw a cryptic "Invalid URL" deep in the supabase-js internals, which
// fires synchronously at module-load and gets caught by expo-updates'
// error-recovery queue. On a fresh install that recovery handler has
// nothing to roll back to, so it re-throws and abort()s the app.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Set EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY (eas env / .env). ' +
      `Got URL=${supabaseUrl ? 'set' : 'undefined'}, ` +
      `KEY=${supabaseAnonKey ? 'set' : 'undefined'}.`,
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Supabase's React Native guidance: the session auto-refresh timer should
// only run while the app is in the foreground. Without this, the timer
// stalls in the background, the access token expires, and on return the
// Realtime server rejects the stale JWT on every channel — which is one of
// the ways the inbox and conversation screens went silently dead until the
// user navigated away and back. Refreshing on foreground also triggers
// supabase-js's TOKEN_REFRESHED handler, which pushes the fresh token to
// Realtime.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
