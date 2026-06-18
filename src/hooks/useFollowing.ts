import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { Profile } from '../types';

/**
 * The list of profiles a given user follows, most-recently-followed first.
 *
 * follows.followed_id references auth.users (not profiles), so PostgREST can't
 * embed the profile in one query — we fetch the ids, then their profiles, the
 * same two-step the notify-new-sale function uses. `unfollow` only affects the
 * SIGNED-IN user's own follows (RLS allows deleting only your own rows), so the
 * unfollow control is shown only when viewing your own list.
 */
export function useFollowing(userId: string | undefined) {
  const { user } = useAuth();
  const [following, setFollowing] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!userId) {
      setFollowing([]);
      return;
    }
    setLoading(true);
    try {
      const { data: rows } = await supabase
        .from('follows')
        .select('followed_id, created_at')
        .eq('follower_id', userId)
        .order('created_at', { ascending: false });
      const ids = (rows ?? []).map((r) => r.followed_id as string);
      if (ids.length === 0) {
        setFollowing([]);
        return;
      }
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', ids);
      // Re-order to match follow recency (the `.in` query order is undefined).
      const byId = new Map(
        (profiles ?? []).map((p) => [p.id, p as Profile]),
      );
      setFollowing(
        ids.map((id) => byId.get(id)).filter((p): p is Profile => !!p),
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const unfollow = useCallback(
    async (targetId: string) => {
      if (!user?.id) return;
      setFollowing((prev) => prev.filter((p) => p.id !== targetId)); // optimistic
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('followed_id', targetId);
      if (error) refetch(); // revert on failure
    },
    [user?.id, refetch],
  );

  return { following, count: following.length, loading, refetch, unfollow };
}
