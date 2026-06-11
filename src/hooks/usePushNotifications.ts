import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

// ── EAS project id (must match app.json → extra.eas.projectId) ────────────
const EAS_PROJECT_ID = '21cc3271-4b50-4f32-a4e4-6823f78ec3e7';

// Show banners + play sound even when the app is foregrounded. Without
// this, arriving messages are silent while the user is already in-app.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // SDK 54 split the legacy `shouldShowAlert` into banner + list.
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Registers the device for Expo push notifications and persists the
 * Expo Push Token to the signed-in user's profile row. Call once from
 * a component that is always mounted while the user is logged in
 * (e.g. MainTabs).
 *
 * iOS simulators cannot receive real push notifications — the hook
 * bails silently on non-physical devices so dev builds don't crash.
 *
 * Returns the token string (or null) so the caller can use it if
 * needed (e.g. for testing), though most callers can ignore it.
 */
export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    (async () => {
      // ── 1. Physical device check ──────────────────────────────────
      if (!Device.isDevice) {
        // Simulator / emulator — push notifications are not supported.
        // Return silently; this is expected in dev.
        return;
      }

      // ── 2. Permission ─────────────────────────────────────────────
      const { status: existing } = await Notifications.getPermissionsAsync();
      let granted = existing === 'granted';

      if (!granted) {
        const { status } = await Notifications.requestPermissionsAsync();
        granted = status === 'granted';
      }

      if (!granted) return; // User declined — respect it.

      // ── 3. Android notification channel ───────────────────────────
      // Required on Android 8+ for notifications to appear. Harmless
      // on iOS (the call is a no-op there).
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('messages', {
          name: 'Messages',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#1F4D3A',
          sound: 'default',
        });
        // New sales from hosts you follow (notify-new-sale edge function).
        await Notifications.setNotificationChannelAsync('sales', {
          name: 'New sales from people you follow',
          importance: Notifications.AndroidImportance.DEFAULT,
          lightColor: '#1F4D3A',
          sound: 'default',
        });
      }

      // ── 4. Fetch Expo Push Token ───────────────────────────────────
      // getExpoPushTokenAsync can throw if the device has no internet
      // or FCM/APNs credentials aren't configured. We swallow and log
      // rather than crashing -- the app works fine without push.
      let token: string | null = null;
      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: EAS_PROJECT_ID,
        });
        token = tokenData.data;
      } catch (err) {
        if (__DEV__) console.warn('[usePushNotifications] token fetch failed:', err);
        return;
      }

      if (cancelled || !token) return;

      // ── 5. Persist to profile (skip write if unchanged) ───────────
      // Avoids hammering the DB every mount when the token is stable.
      const { data: profile } = await supabase
        .from('profiles')
        .select('expo_push_token')
        .eq('id', user.id)
        .single();

      if (cancelled) return;

      if (profile?.expo_push_token !== token) {
        await supabase
          .from('profiles')
          .update({ expo_push_token: token })
          .eq('id', user.id);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);
}
