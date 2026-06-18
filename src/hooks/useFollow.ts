import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

/**
 * Follow/unfollow helper for a single target user. Returns the live follow
 * state, the target's follower count, the per-follow notification preference
 * (the "bell" — when on you get pushed when they post a sale or list an item),
 * and toggles for both.
 */
export function useFollow(targetUserId: string | undefined) {
  const { user } = useAuth();
  const myId = user?.id;

  const [following, setFollowing] = useState(false);
  const [notify, setNotify] = useState(true);
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
              .select('notify')
              .eq('follower_id', myId)
              .eq('followed_id', targetUserId)
              .maybeSingle()
          : Promise.resolve({ data: null as any }),
      ]);
      setFollowerCount(count ?? 0);
      setFollowing(!!mineCheck.data);
      setNotify(mineCheck.data?.notify ?? true);
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
    if (!following) setNotify(true); // a fresh follow starts notified (DB default)
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

  const toggleNotify = useCallback(async () => {
    if (!targetUserId || !myId || !following) return;
    const next = !notify;
    setNotify(next); // optimistic
    const { error } = await supabase
      .from('follows')
      .update({ notify: next })
      .eq('follower_id', myId)
      .eq('followed_id', targetUserId);
    if (error) setNotify(!next);
  }, [targetUserId, myId, following, notify]);

  return {
    following,
    notify,
    followerCount,
    loading,
    toggle,
    toggleNotify,
    isSelf: targetUserId === myId,
  };
}
