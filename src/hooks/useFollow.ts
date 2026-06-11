import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

/**
 * Follow/unfollow helper for a single target user. Returns the live
 * follow state, the target's follower count, and a toggle.
 */
export function useFollow(targetUserId: string | undefined) {
  const { user } = useAuth();
  const myId = user?.id;

  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!targetUserId) return;
    setLoading(true);
    try {
      const [{ count }, mineCheck] = await Promise.all([
        supabase
          .from('follows')
          .select('follower_id', { count: 'exact', head: true })
          .eq('followed_id', targetUserId),
        myId
          ? supabase
              .from('follows')
              .select('follower_id')
              .eq('follower_id', myId)
              .eq('followed_id', targetUserId)
              .maybeSingle()
          : Promise.resolve({ data: null as any }),
      ]);
      setFollowerCount(count ?? 0);
      setFollowing(!!mineCheck.data);
    } finally {
      setLoading(false);
    }
  }, [targetUserId, myId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const toggle = useCallback(async () => {
    if (!targetUserId || !myId || targetUserId === myId) return;
    // Optimistic flip — revert on error.
    setFollowing((prev) => !prev);
    setFollowerCount((c) => c + (following ? -1 : 1));
    const op = following
      ? supabase
          .from('follows')
          .delete()
          .eq('follower_id', myId)
          .eq('followed_id', targetUserId)
      : supabase
          .from('follows')
          .insert({ follower_id: myId, followed_id: targetUserId });
    const { error } = await op;
    if (error) {
      setFollowing(following);
      setFollowerCount((c) => c + (following ? 1 : -1));
    }
  }, [targetUserId, myId, following]);

  return { following, followerCount, loading, toggle, isSelf: targetUserId === myId };
}
