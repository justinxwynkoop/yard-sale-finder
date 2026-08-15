import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

/**
 * Follow/unfollow helper for a single target user. Returns the live follow
 * state, the target's follower count, the per-follow notification preference
 * (the "bell" — when on you get pushed when they post a sale or list an item),
 * and toggles for both.
 */
export function useFollow(targetUserId: string | undefined) {
  // `loading` matters here: useAuth is per-instance and starts with a null
  // user while it resolves the stored session. Fetching in that window asks
  // "does <undefined> follow this person?", which can only answer "no".
  const { user, loading: authLoading } = useAuth();
  const myId = user?.id;

  const [following, setFollowing] = useState(false);
  const [notify, setNotify] = useState(true);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Sequence number for in-flight fetches. Without it a slow earlier response
  // can land after a newer one and overwrite it — which is how the button ends
  // up offering "Follow" for someone you already follow.
  const fetchSeq = useRef(0);

  const refetch = useCallback(async () => {
    if (!targetUserId || authLoading) return;
    const seq = ++fetchSeq.current;
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
      if (seq !== fetchSeq.current) return; // a newer fetch already answered
      setFollowerCount(count ?? 0);
      setFollowing(!!mineCheck.data);
      setNotify(mineCheck.data?.notify ?? true);
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [targetUserId, myId, authLoading]);

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
      : // Idempotent: `follows` is keyed on (follower_id, followed_id), so a
        // plain insert throws 23505 when the row is already there. Following
        // someone you already follow should be a no-op, not an error.
        supabase
          .from('follows')
          .upsert(
            { follower_id: myId, followed_id: targetUserId },
            { onConflict: 'follower_id,followed_id', ignoreDuplicates: true },
          );
    const { error } = await op;
    // A duplicate row IS the desired end state — never revert on it. Reverting
    // here is what made an already-followed user appear to unfollow.
    if (error && error.code !== '23505') {
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
