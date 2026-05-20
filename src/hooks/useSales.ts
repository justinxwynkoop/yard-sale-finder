import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Sale } from '../types';

export function useSales(bounds?: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Use !left so missing profile rows don't filter out sales.
      // (PostgREST treats user_id (NOT NULL) → profile as INNER JOIN by
      // default, which drops sales whose owner has no profile row —
      // e.g. an Apple-Sign-In user who hasn't completed onboarding.)
      let query = supabase
        .from('sales')
        .select('*, profile:profiles!left(*), media:sale_media(*)')
        .neq('status', 'ended')
        .order('created_at', { ascending: false });

      if (bounds) {
        query = query
          .gte('latitude', bounds.minLat)
          .lte('latitude', bounds.maxLat)
          .gte('longitude', bounds.minLng)
          .lte('longitude', bounds.maxLng);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      setSales(data ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [bounds?.minLat, bounds?.maxLat, bounds?.minLng, bounds?.maxLng]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('sales-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
        fetchSales();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchSales]);

  return { sales, loading, error, refetch: fetchSales };
}

export function useMySales(userId: string | undefined) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMySales = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('sales')
        .select('*, media:sale_media(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      setSales(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchMySales();
  }, [fetchMySales]);

  return { sales, loading, refetch: fetchMySales };
}
