import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Sale } from '../types';
import { useBlockedUsers } from './useBlockedUsers';

/**
 * Loads every non-ended sale once and re-fetches on `postgres_changes`
 * events.
 *
 * The hook used to accept a `bounds` rectangle and re-query whenever
 * the map's viewport changed, but with the current data volume
 * (<100 sales nationwide) that was strictly worse than fetching
 * everything once: every pan / pinch generated a new region-change
 * event, each event re-issued the SQL with a slightly different
 * rectangle, and any sale that sat just outside the bounds-in-flight
 * blinked off the map until the next request landed. The result was
 * pins flickering in and out during zoom gestures.
 *
 * If we ever hit thousands of sales the right fix is server-side
 * clustering or a bbox RPC, not a viewport-coupled fetch.
 */
export function useSales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { blockedIds } = useBlockedUsers();

  const fetchSales = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // No profile embed here — PostgREST's auto-INNER-JOIN on
      // NOT NULL FKs was dropping any sale whose owner had no
      // profile row (e.g. Apple Sign In users who skipped
      // onboarding). The detail screen fetches the host profile
      // separately when it needs to display the host name.
      const { data, error: fetchError } = await supabase
        .from('sales')
        .select('*, media:sale_media(*)')
        .neq('status', 'ended')
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setSales(data ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

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

  // Hide sales whose owner the current user has blocked. Computed
  // here (not at fetch time) so unblocking immediately surfaces the
  // hidden sales without needing a network round-trip.
  const visibleSales = useMemo(
    () =>
      blockedIds.size === 0
        ? sales
        : sales.filter((s) => !blockedIds.has(s.user_id)),
    [sales, blockedIds],
  );

  return { sales: visibleSales, loading, error, refetch: fetchSales };
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
