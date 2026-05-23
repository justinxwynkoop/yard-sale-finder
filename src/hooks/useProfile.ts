import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import { useAuth } from './useAuth';

type State = {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
};

// Module-level listener set so every active useProfile() instance can
// refetch when any caller invalidates. Replaces the Supabase realtime
// subscription, which kept failing with "cannot add postgres_changes
// callbacks for realtime profile" even after enrolling the table in
// the publication. A plain JS pub/sub is simpler and more reliable for
// what we actually need: cross-instance refetch after a save.
const listeners = new Set<() => void>();

/**
 * Tell every mounted useProfile() that something just changed and the
 * row should be refetched. Call this from any screen that mutates the
 * current user's profile (CompleteProfileScreen, EditProfileScreen),
 * immediately after a successful upsert/update.
 */
export function invalidateProfile() {
  listeners.forEach((fn) => fn());
}

/**
 * Loads the current user's profile row (one-to-one with auth.users).
 * Recomputes whenever the auth user changes (sign-in / sign-out /
 * refresh) and whenever invalidateProfile() is called from anywhere
 * in the app.
 */
export function useProfile() {
  const { user } = useAuth();
  const [state, setState] = useState<State>({
    profile: null,
    loading: true,
    error: null,
  });

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setState({ profile: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      // Use maybeSingle so a missing row isn't treated as an error —
      // it just means the profile hasn't been created yet (Apple sign-in
      // with private relay can race the auto-create trigger).
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      setState({ profile: data ?? null, loading: false, error: null });
    } catch (e: any) {
      setState({
        profile: null,
        loading: false,
        error: e.message ?? 'Could not load profile.',
      });
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Register this instance so invalidateProfile() calls from any
  // screen reach the navigator's useProfile too -- that's what
  // unblocks CompleteProfile -> MainTabs after a save.
  useEffect(() => {
    listeners.add(fetchProfile);
    return () => {
      listeners.delete(fetchProfile);
    };
  }, [fetchProfile]);

  return { ...state, refetch: fetchProfile };
}

export function isProfileComplete(profile: Profile | null): boolean {
  return !!profile && !!profile.display_name && profile.display_name.trim() !== '';
}
