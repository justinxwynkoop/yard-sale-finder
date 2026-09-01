import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as Sentry from '@sentry/react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

// Registration-flow breadcrumbs. console.error is deliberate (not warn/log):
// it survives to logcat/Console in release builds, so a device that never
// registers can be diagnosed in the field. Failures also go to Sentry.
const mark = (step: string, detail?: unknown) =>
  console.error(`[push] ${step}`, detail ?? '');

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
      // iOS simulators can't receive real pushes, but Android emulators
      // with Google Play services can (FCM registers normally), so only
      // iOS requires physical hardware.
      if (!Device.isDevice && Platform.OS === 'ios') {
        return;
      }
      mark('start', { platform: Platform.OS, isDevice: Device.isDevice });

      // ── 2. Permission ─────────────────────────────────────────────
      const { status: existing } = await Notifications.getPermissionsAsync();
      let granted = existing === 'granted';

      if (!granted) {
        const { status } = await Notifications.requestPermissionsAsync();
        granted = status === 'granted';
      }

      if (!granted) {
        mark('permission declined', existing);
        return; // User declined — respect it.
      }
      mark('permission granted');

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
        // New sales posted within your radius (notify-new-sale → nearby).
        await Notifications.setNotificationChannelAsync('nearby', {
          name: 'New sales near you',
          importance: Notifications.AndroidImportance.DEFAULT,
          lightColor: '#1F4D3A',
          sound: 'default',
        });
      }

      // ── 4. Fetch Expo Push Token ───────────────────────────────────
      // getExpoPushTokenAsync can throw if the device has no internet
      // or FCM/APNs credentials aren't configured. We swallow and log
      // rather than crashing -- the app works fine without push.
      mark('channels ready, fetching token');
      let token: string | null = null;
      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: EAS_PROJECT_ID,
        });
        token = tokenData.data;
      } catch (err) {
        mark('token fetch FAILED', err);
        Sentry.captureException(err, {
          tags: { flow: 'push-registration', step: 'getExpoPushToken' },
        });
        return;
      }
      mark('token fetched', token?.slice(0, 30));

      if (cancelled || !token) return;

      // ── 5. Persist to the signed-in user's profile via RPC ────────
      // Expo push tokens are per-DEVICE, not per-user. set_push_token
      // (SECURITY DEFINER) first strips this token off any OTHER profile,
      // then assigns it to the current user — so a device that has signed
      // into multiple accounts only ever notifies the account currently
      // signed in. A plain client UPDATE can't clear the token from other
      // users' rows (profiles UPDATE RLS is owner-only), which is what let
      // a stale token deliver another account's message notifications here.
      // p_platform records which OS this token belongs to -- Expo tokens don't
      // encode it, and without it there is no way to tell iOS and Android
      // users apart for crash rates, rollouts, or counting.
      const { error } = await supabase.rpc('set_push_token', {
        p_token: token,
        p_platform: Platform.OS,
      });
      if (error) {
        mark('set_push_token RPC FAILED', error.message);
        Sentry.captureMessage(`set_push_token failed: ${error.message}`, {
          tags: { flow: 'push-registration', step: 'persist' },
        } as any);
        return;
      }
      mark('token persisted');
    })().catch((err) => {
      // Nothing above this line may fail invisibly — an await outside the
      // token try/catch (permissions, channel setup) used to kill the whole
      // chain with no trace.
      mark('registration flow FAILED', err);
      Sentry.captureException(err, {
        tags: { flow: 'push-registration', step: 'outer' },
      });
    });

    return () => { cancelled = true; };
  }, [user]);
}
