import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Listing } from '../types';

export function useMyListings(userId: string | undefined) {
  const [listings, setListings] = useState<Listing[]>([]);
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
      setListings(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchMyListings();
  }, [fetchMyListings]);

  return { listings, loading, refetch: fetchMyListings };
}
