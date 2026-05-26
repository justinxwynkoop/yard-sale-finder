import { useState, useEffect } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // True while a password-recovery session is active — the navigator uses
  // this to force the user into the ResetPasswordScreen and not the app.
  const [inRecovery, setInRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      // A stale / missing refresh token means the stored session is no longer
      // valid on the server. Sign out silently so the user lands on the auth
      // screen instead of seeing a red "Refresh Token Not Found" error banner.
      if (error?.message?.includes('Refresh Token Not Found') ||
          error?.message?.includes('Invalid Refresh Token')) {
        supabase.auth.signOut();
        setLoading(false);
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // TOKEN_REFRESHED with no session means the refresh token was rejected
      // by the server (deleted user, rotated secret, etc.). Sign out cleanly.
      if (event === 'TOKEN_REFRESHED' && !session) {
        supabase.auth.signOut();
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') {
        setInRecovery(true);
      }
      if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Clear recovery once they've actually updated their password
        // (USER_UPDATED fires after supabase.auth.updateUser succeeds).
        setInRecovery(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { session, user, loading, signOut, inRecovery };
}
