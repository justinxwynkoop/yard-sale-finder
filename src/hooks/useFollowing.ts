import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { Profile } from '../types';

export type FollowedUser = { profile: Profile; notify: boolean };

/**
 * The list of users a given user follows, most-recently-followed first, each
 * with its per-follow `notify` flag (the bell). follows.followed_id references
 * profiles, but we still fetch ids then profiles (simple + matches the edge
 * function). `unfollow` / `setNotify` mutate the SIGNED-IN user's own follow
 * rows (RLS allows only your own), so they apply when viewing your own list.
 */
export function useFollowing(userId: string | undefined) {
  const { user } = useAuth();
  const [following, setFollowing] = useState<FollowedUser[]>([]);
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
        .select('followed_id, notify, created_at')
        .eq('follower_id', userId)
        .order('created_at', { ascending: false });
      const ids = (rows ?? []).map((r) => r.followed_id as string);
      if (ids.length === 0) {
        setFollowing([]);
        return;
      }
      const notifyById = new Map(
        (rows ?? []).map((r) => [r.followed_id as string, !!r.notify]),
      );
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', ids);
      const byId = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));
      setFollowing(
        ids
          .map((id) => {
            const profile = byId.get(id);
            return profile
              ? { profile, notify: notifyById.get(id) ?? true }
              : null;
          })
          .filter((x): x is FollowedUser => !!x),
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
      setFollowing((prev) => prev.filter((f) => f.profile.id !== targetId)); // optimistic
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('followed_id', targetId);
      if (error) refetch();
    },
    [user?.id, refetch],
  );

  const setNotify = useCallback(
    async (targetId: string, value: boolean) => {
      if (!user?.id) return;
      setFollowing((prev) =>
        prev.map((f) =>
          f.profile.id === targetId ? { ...f, notify: value } : f,
        ),
      ); // optimistic
      const { error } = await supabase
        .from('follows')
        .update({ notify: value })
        .eq('follower_id', user.id)
        .eq('followed_id', targetId);
      if (error) refetch();
    },
    [user?.id, refetch],
  );

  return { following, count: following.length, loading, refetch, unfollow, setNotify };
}
