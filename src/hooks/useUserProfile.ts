import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Profile, Sale, Listing } from '../types';

/**
 * Aggregate fetch for the PublicProfile screen — returns the target
 * user's profile, their active sales, and their active listings in
 * one shot. Refetches on userId change.
 */
export function useUserProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  // Cumulative totals used by the PublicProfile trust-stat strip.
  // Match the v6 design: "Sales hosted / Items sold / …"
  const [salesHostedTotal, setSalesHostedTotal] = useState(0);
  const [itemsSoldTotal, setItemsSoldTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [
        { data: prof },
        { data: salesRows },
        { data: listingRows },
        { count: hostedCount },
        { count: soldCount },
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase
          .from('sales')
          .select('*, media:sale_media(*)')
          .eq('user_id', userId)
          .neq('status', 'ended')
          .order('start_date', { ascending: true })
          .limit(10),
        supabase
          .from('listings')
          .select('*, media:listing_media(*)')
          .eq('user_id', userId)
          .eq('status', 'available')
          .order('created_at', { ascending: false })
          .limit(20),
        // Cumulative totals — head:true keeps them as cheap COUNT(*)
        // queries with no payload.
        supabase
          .from('sales')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        supabase
          .from('listings')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'sold'),
      ]);
      setProfile((prof as Profile) ?? null);
      setSales((salesRows as Sale[]) ?? []);
      setListings((listingRows as Listing[]) ?? []);
      setSalesHostedTotal(hostedCount ?? 0);
      setItemsSoldTotal(soldCount ?? 0);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return {
    profile,
    sales,
    listings,
    salesHostedTotal,
    itemsSoldTotal,
    loading,
    refetch,
  };
}
