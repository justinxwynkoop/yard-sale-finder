import 'react-native-url-polyfill/auto';
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
