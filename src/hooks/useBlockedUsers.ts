import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BlockedUser } from '../types';
import { useAuth } from './useAuth';

/**
 * Loads the current user's block list with the blocked user's joined
 * profile (display_name + avatar) so the BlockedUsersScreen can show
 * who is blocked, not just a list of UUIDs.
 *
 * Also exposes a Set<string> of blocked user IDs so callers can do
 * cheap "is this user blocked?" checks from the various read hooks
 * (useSales, useListings, useFavorites) and filter their results.
 */
export function useBlockedUsers() {
  const { user } = useAuth();
  const [blocks, setBlocks] = useState<BlockedUser[]>([]);
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchBlocks = useCallback(async () => {
    if (!user) {
      setBlocks([]);
      setIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('blocked_users')
      .select('*, blocked:profiles!blocked_users_blocked_id_fkey(*)')
      .eq('blocker_id', user.id)
      .order('created_at', { ascending: false });
    const rows = (data ?? []) as BlockedUser[];
    setBlocks(rows);
    setIds(new Set(rows.map((r) => r.blocked_id)));
    setLoading(false);
    // Depend on the stable user id, not the user object — otherwise this
    // refetches (and makes a new Set) on every auth-token tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    fetchBlocks();
  }, [fetchBlocks]);

  /**
   * Block a user. Idempotent — re-blocking is a no-op on the server
   * (primary key conflict) and we just refetch.
   */
  const block = useCallback(
    async (blockedId: string) => {
      if (!user) return { error: new Error('not signed in') };
      if (blockedId === user.id) {
        return { error: new Error('cannot block yourself') };
      }
      // Optimistic update so the UI flips immediately.
      setIds((prev) => new Set(prev).add(blockedId));
      const { error } = await supabase
        .from('blocked_users')
        .insert({ blocker_id: user.id, blocked_id: blockedId });
      // 23505 = unique violation, meaning we'd already blocked. Treat as success.
      if (error && (error as any).code !== '23505') {
        // Roll back optimistic state on real failure.
        setIds((prev) => {
          const next = new Set(prev);
          next.delete(blockedId);
          return next;
        });
        return { error };
      }
      await fetchBlocks();
      return { error: null };
    },
    [user, fetchBlocks],
  );

  /** Unblock a user. */
  const unblock = useCallback(
    async (blockedId: string) => {
      if (!user) return { error: new Error('not signed in') };
      // Optimistic remove.
      setIds((prev) => {
        const next = new Set(prev);
        next.delete(blockedId);
        return next;
      });
      setBlocks((prev) => prev.filter((b) => b.blocked_id !== blockedId));
      const { error } = await supabase
        .from('blocked_users')
        .delete()
        .eq('blocker_id', user.id)
        .eq('blocked_id', blockedId);
      if (error) return { error };
      return { error: null };
    },
    [user],
  );

  const isBlocked = useCallback((id: string) => ids.has(id), [ids]);

  return {
    blocks,
    blockedIds: ids,
    isBlocked,
    block,
    unblock,
    loading,
    refetch: fetchBlocks,
  };
}
