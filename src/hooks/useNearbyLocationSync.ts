import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { useUserLocation } from './useUserLocation';

/**
 * Persists the signed-in user's COARSE location for "new sale near you"
 * notifications — but ONLY while the `notify_sales_nearby` toggle is on.
 *
 * Privacy:
 * - Coordinates are rounded to ~2 decimals (~1.1 km) so we never store an
 *   exact home address.
 * - They live in `user_locations` (owner-only RLS), never on the
 *   world-readable `profiles` row.
 * - Turning the toggle off deletes the stored row, so we stop holding any
 *   location for users who don't want nearby alerts.
 *
 * Mounted once in MainTabs alongside usePushNotifications.
 */
const round = (n: number) => Math.round(n * 100) / 100;

export function useNearbyLocationSync() {
  const { user } = useAuth();
  const { profile } = useProfile();
  // Only acquire location when the feature is on (don't prompt otherwise).
  const enabled = profile?.notify_sales_nearby === true;
  const location = useUserLocation(enabled);

  const lastWritten = useRef<string | null>(null);
  const clearedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !profile) return;

    // Toggle off → delete any stored location once per user.
    if (!enabled) {
      if (clearedFor.current !== user.id) {
        clearedFor.current = user.id;
        lastWritten.current = null;
        supabase
          .from('user_locations')
          .delete()
          .eq('user_id', user.id)
          .then(() => undefined);
      }
      return;
    }

    // Toggle on → store the rounded coords (skip if unchanged since last write).
    clearedFor.current = null;
    if (!location) return;
    const lat = round(location.latitude);
    const lng = round(location.longitude);
    const key = `${user.id}:${lat},${lng}`;
    if (lastWritten.current === key) return;
    lastWritten.current = key;
    supabase
      .from('user_locations')
      .upsert(
        { user_id: user.id, lat, lng, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
      .then(() => undefined);
  }, [user, profile, enabled, location]);
}
