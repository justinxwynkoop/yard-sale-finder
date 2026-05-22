import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Listing, ItemCategory } from '../types';

export interface ListingFilters {
  category: ItemCategory | null;
  priceMin: number | null;
  priceMax: number | null;
}

export const PRICE_RANGES: { label: string; min: number | null; max: number | null }[] = [
  { label: 'Free',      min: 0,    max: 0    },
  { label: 'Under $10', min: null, max: 10   },
  { label: '$10–$50',   min: 10,   max: 50   },
  { label: '$50–$100',  min: 50,   max: 100  },
  { label: '$100+',     min: 100,  max: null },
];

export function useListings(filters: ListingFilters) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('listings')
        .select('*, profile:profiles(*), media:listing_media(*)')
        .eq('status', 'available')
        .order('created_at', { ascending: false });

      if (filters.category) {
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
      setListings(data ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters.category, filters.priceMin, filters.priceMax]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  // Real-time: refresh when any listing changes
  useEffect(() => {
    const channel = supabase
      .channel('listings-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, () => {
        fetchListings();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchListings]);

  return { listings, loading, error, refetch: fetchListings };
}

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
