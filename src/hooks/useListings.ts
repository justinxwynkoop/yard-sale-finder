import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Listing, ItemCategory } from '../types';
import { useBlockedUsers } from './useBlockedUsers';

/**
 * `useMyListings`-only shape: a listing plus who a 'pending' one is held
 * for. Kept local rather than folded into the shared `Listing` interface —
 * every other reader of `Listing` (map/listings feeds, detail screens) has
 * no way to populate it, since `listing_holds` RLS only lets the owner or
 * the held buyer read a hold row (see migration 20260830100100).
 */
export type ListingWithHold = Listing & {
  /** Set only when `status === 'pending'` and a matching hold row exists. */
  held_for_name?: string;
};

/**
 * Pure hydration step, split out of `useMyListings` so it's testable without
 * a Supabase client: given the owner's listings, the hold rows the RLS
 * policy let them read, and the buyer profiles those holds point at,
 * attach `held_for_name` to each held listing. A listing with no matching
 * hold row (never held, or a desynced 'pending' — see release_hold's
 * header comment in 20260830100100_listing_holds.sql) passes through
 * unchanged.
 */
export function hydrateHeldForNames(
  listings: Listing[],
  holds: { listing_id: string; buyer_id: string }[],
  buyers: { id: string; display_name: string | null }[],
): ListingWithHold[] {
  if (holds.length === 0) return listings;
  const nameByBuyerId = new Map(buyers.map((b) => [b.id, b.display_name]));
  const buyerIdByListingId = new Map(holds.map((h) => [h.listing_id, h.buyer_id]));
  return listings.map((l) => {
    const buyerId = buyerIdByListingId.get(l.id);
    if (!buyerId) return l;
    // A hold always references a real profile row (buyer_id is NOT NULL,
    // FK'd to profiles) — the fallback covers a buyer with no display_name
    // set, same as every other display_name ?? fallback in this codebase.
    return { ...l, held_for_name: nameByBuyerId.get(buyerId) ?? 'a buyer' };
  });
}

export interface ListingFilters {
  category: ItemCategory | null;
  categories?: ItemCategory[];
  priceMin: number | null;
  priceMax: number | null;
}

export function useListings(filters: ListingFilters) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { blockedIds } = useBlockedUsers();

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('listings')
        // No profile embed — PostgREST's auto-INNER-JOIN on the NOT NULL
        // user_id FK drops listings whose owner has no profile row yet
        // (same bug class as useSales; see that hook's comment). The detail
        // screen fetches the seller profile itself.
        .select('*, media:listing_media(*)')
        .eq('status', 'available')
        // Auto-hidden content (3+ distinct reporters) stays out of public
        // feeds; useMyListings deliberately doesn't filter.
        .is('hidden_at', null)
        .order('created_at', { ascending: false });

      if (filters.categories && filters.categories.length > 0) {
        // Filter client-side for multi-category (OR) matching after fetch;
        // Supabase @> only supports AND (contains all), so we fetch broadly
        // using the first category as a hint and filter the rest client-side.
        query = query.contains('categories', [filters.categories[0]]);
      } else if (filters.category) {
        query = query.contains('categories', [filters.category]);
      }
      if (filters.priceMin !== null) {
        query = query.gte('price', filters.priceMin);
      }
      if (filters.priceMax !== null) {
        query = query.lte('price', filters.priceMax);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      let results = data ?? [];
      // Client-side OR filter when multiple categories are selected
      if (filters.categories && filters.categories.length > 1) {
        const cats = filters.categories;
        results = results.filter((l: Listing) =>
          cats.some((c) => l.categories.includes(c)),
        );
      }
      setListings(results);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.category, filters.categories?.join(','), filters.priceMin, filters.priceMax]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  // Real-time: refresh when any listing changes.
  // Channel name must be unique per hook instance — same channel-collision
  // pattern as useInbox / useSales (CLAUDE.md).
  useEffect(() => {
    const channel = supabase
      .channel(`listings-changes-${Math.random().toString(36).slice(2, 9)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, () => {
        fetchListings();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchListings]);

  // Hide listings from blocked users client-side. Cheaper than
  // pushing the block list into the query, and immediately reflects
  // a fresh block/unblock without re-fetching.
  const visibleListings = useMemo(
    () =>
      blockedIds.size === 0
        ? listings
        : listings.filter((l) => !blockedIds.has(l.user_id)),
    [listings, blockedIds],
  );

  return {
    listings: visibleListings,
    loading,
    error,
    refetch: fetchListings,
  };
}

export function useMyListings(userId: string | undefined) {
  const [listings, setListings] = useState<ListingWithHold[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMyListings = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('listings')
        .select('*, media:listing_media(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      const rows: Listing[] = data ?? [];

      // Hold visibility is the seller's only failsafe against an abandoned
      // hold (no expiry by design — see 20260830100100_listing_holds.sql),
      // so a pending listing must show who it's held for. Skip the round
      // trips entirely when nothing is pending.
      const pendingIds = rows.filter((l) => l.status === 'pending').map((l) => l.id);
      if (pendingIds.length === 0) {
        setListings(rows);
        return;
      }

      // RLS on listing_holds permits SELECT only to the listing's owner or
      // the held buyer, so this only ever returns holds on rows we already
      // own (`in ('listing_id', pendingIds)` where pendingIds are all ours).
      const { data: holds } = await supabase
        .from('listing_holds')
        .select('listing_id, buyer_id')
        .in('listing_id', pendingIds);

      if (!holds || holds.length === 0) {
        setListings(rows);
        return;
      }

      // Separate query, not a PostgREST embed — the repo's no-embed
      // convention (see the comment on the listings select above): an
      // embed's inner join on buyer_id would drop any hold whose buyer has
      // no profile row.
      const buyerIds = Array.from(new Set(holds.map((h) => h.buyer_id)));
      const { data: buyers } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', buyerIds);

      setListings(hydrateHeldForNames(rows, holds, buyers ?? []));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchMyListings();
  }, [fetchMyListings]);

  return { listings, loading, refetch: fetchMyListings };
}
