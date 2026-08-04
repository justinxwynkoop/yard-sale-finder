import { useCallback, useEffect, useRef, useState } from 'react';
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
  // Only the FIRST load should flip `loading` true. Background refetches
  // (invalidateProfile after a save, avatar change, notification toggle)
  // must NOT show a loading state — MainGate gates on this flag, and a
  // transient `loading:true` would unmount/remount MainTabs and bounce
  // the user from Profile back to the Discover tab.
  const hasLoadedRef = useRef(false);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      hasLoadedRef.current = false; // re-arm the spinner for the next sign-in
      setState({ profile: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: !hasLoadedRef.current, error: null }));
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
      // PII (email/phone/birthdate/zip_code) lives in the owner-only
      // private_profiles table — merge it back so the rest of the app, and the
      // profile-completion gate (which needs birthdate + zip_code), see a
      // complete profile object.
      let profile = data as Profile | null;
      if (data) {
        const { data: priv } = await supabase
          .from('private_profiles')
          .select('email, phone, birthdate, zip_code')
          .eq('user_id', user.id)
          .maybeSingle();
        if (priv) profile = { ...data, ...priv } as Profile;
      }
      hasLoadedRef.current = true;
      setState({ profile, loading: false, error: null });
    } catch (e: any) {
      hasLoadedRef.current = true;
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

/**
 * Update arbitrary columns on the current user's profile row, then
 * broadcast so every mounted useProfile() refetches. Returns the
 * Supabase error (or null). Used by the Account screen's FieldEditor
 * commits and the Notifications toggles.
 */
/** Columns that live on the owner-only private_profiles table, not profiles. */
export const PRIVATE_PROFILE_COLUMNS = [
  'email',
  'phone',
  'birthdate',
  'zip_code',
] as const;

/**
 * Split a profile patch into the part that belongs on `profiles` and the part
 * that belongs on the owner-only `private_profiles` table.
 */
export function splitProfilePatch(patch: Partial<Profile>): {
  profilesPatch: Record<string, unknown>;
  privatePatch: Record<string, unknown>;
} {
  const priv = PRIVATE_PROFILE_COLUMNS as readonly string[];
  const profilesPatch: Record<string, unknown> = {};
  const privatePatch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (priv.includes(k)) privatePatch[k] = v;
    else profilesPatch[k] = v;
  }
  return { profilesPatch, privatePatch };
}

export function useUpdateProfile() {
  const { user } = useAuth();
  return useCallback(
    async (patch: Partial<Profile>) => {
      if (!user) return { error: new Error('Not signed in') };
      const { profilesPatch, privatePatch } = splitProfilePatch(patch);
      let error: { message: string } | null = null;
      if (Object.keys(profilesPatch).length > 0) {
        error = (
          await supabase.from('profiles').update(profilesPatch).eq('id', user.id)
        ).error;
      }
      if (!error && Object.keys(privatePatch).length > 0) {
        error = (
          await supabase
            .from('private_profiles')
            .upsert({ user_id: user.id, ...privatePatch }, { onConflict: 'user_id' })
        ).error;
      }
      if (!error) invalidateProfile();
      return { error };
    },
    [user],
  );
}

export function isProfileComplete(profile: Profile | null): boolean {
  if (!profile) return false;
  // ZIP is deliberately NOT required — App Review (5.1.1(v), Aug 2026) rejected
  // requiring personal info that isn't essential to core functionality. City +
  // state cover the local-marketplace need; ZIP remains an optional convenience.
  return (
    !!profile.first_name?.trim() &&
    !!profile.last_name?.trim() &&
    !!profile.city?.trim() &&
    !!profile.state?.trim() &&
    !!profile.birthdate
  );
}

/** Returns true once the user has ticked "I agree" on the T&C screen. */
export function hasAcceptedTerms(profile: Profile | null): boolean {
  return !!profile?.terms_accepted_at;
}
