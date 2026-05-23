import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import { useAuth } from './useAuth';

type State = {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
};

/**
 * Loads the current user's profile row (one-to-one with auth.users).
 * Recomputes whenever the auth user changes (sign-in / sign-out / refresh).
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

  // Realtime: every useProfile() call gets its own state, so a save in
  // one screen wouldn't otherwise propagate to a sibling consumer
  // (notably the MainGate in src/navigation/index.tsx). Subscribing to
  // postgres_changes on the user's own profile row keeps every
  // instance in sync -- so after CompleteProfileScreen saves a
  // display_name, the navigator's useProfile re-fetches and the gate
  // swaps from CompleteProfile to MainTabs without a manual relaunch.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`profile-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        () => {
          fetchProfile();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchProfile]);

  return { ...state, refetch: fetchProfile };
}

export function isProfileComplete(profile: Profile | null): boolean {
  return !!profile && !!profile.display_name && profile.display_name.trim() !== '';
}
