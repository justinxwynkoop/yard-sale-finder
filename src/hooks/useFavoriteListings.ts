import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Listing } from '../types';
import { useAuth } from './useAuth';
import { useBlockedUsers } from './useBlockedUsers';

/**
 * Loads the current user's favorited listings with full Listing rows
 * joined via the listing_favorites table. Mirrors useFavorites but for
 * the listings content type.
 */
export function useFavoriteListings() {
  const { user } = useAuth();
  const { blockedIds } = useBlockedUsers();
  const [favorites, setFavorites] = useState<Listing[]>([]);
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchFavorites = useCallback(async () => {
    if (!user) {
      setFavorites([]);
      setIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    // Guard against a hung request (the supabase client has no timeout;
    // auth-lock / token-refresh can stall) so loading always clears and the
    // next focus can retry — mirrors the useFavorites Saved-Sales spinner fix.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const { data, error } = await supabase
        .from('listing_favorites')
        .select('listing_id, listing:listings(*, media:listing_media(*))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .abortSignal(controller.signal);
      // Keep the current list on a transient error rather than blanking it;
      // the finally still clears loading so the UI isn't stuck.
      if (error) return;
      const listings: Listing[] = (data ?? [])
        .map((row: any) => row.listing)
        .filter(Boolean);
      setFavorites(listings);
      setIds(new Set(listings.map((l) => l.id)));
    } catch {
      // network failure / abort / hang — finally clears loading; next retry.
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const isFavorited = useCallback(
    (listingId: string) => ids.has(listingId),
    [ids],
  );

  const toggle = useCallback(
    async (listingId: string) => {
      if (!user) return;
      if (ids.has(listingId)) {
        // Optimistic remove
        setIds((prev) => {
          const next = new Set(prev);
          next.delete(listingId);
          return next;
        });
        setFavorites((prev) => prev.filter((l) => l.id !== listingId));
        const { error } = await supabase
          .from('listing_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('listing_id', listingId);
        if (error) fetchFavorites(); // delete failed → reconcile to DB truth
      } else {
        setIds((prev) => new Set(prev).add(listingId));
        const { error } = await supabase
          .from('listing_favorites')
          .insert({ user_id: user.id, listing_id: listingId });
        if (error) {
          // insert failed → undo the optimistic add
          setIds((prev) => {
            const next = new Set(prev);
            next.delete(listingId);
            return next;
          });
          return;
        }
        fetchFavorites();
      }
    },
    [user, ids, fetchFavorites],
  );

  // Hide favorites from blocked users
  const visibleFavorites = useMemo(
    () =>
      blockedIds.size === 0
        ? favorites
        : favorites.filter((l) => !blockedIds.has(l.user_id)),
    [favorites, blockedIds],
  );

  return {
    favorites: visibleFavorites,
    isFavorited,
    toggle,
    loading,
    refetch: fetchFavorites,
  };
}
