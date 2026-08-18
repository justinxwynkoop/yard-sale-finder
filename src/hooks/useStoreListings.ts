import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Listing } from '../types';

export function useStoreListings(userId: string) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('listings')
        .select('*, media:listing_media(*)')
        .eq('user_id', userId)
        .eq('status', 'available')
        .order('created_at', { ascending: false });
      setListings(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { listings, loading, refetch: fetch };
}
