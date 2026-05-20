import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Sale } from '../types';
import { useAuth } from './useAuth';

/**
 * Loads the current user's favorited sales with the full Sale rows
 * (joined via the favorites table). Exposes the set of favorited sale
 * IDs for cheap "is this sale favorited?" checks, plus toggle / refetch.
 */
export function useFavorites() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<Sale[]>([]);
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
    const { data } = await supabase
      .from('favorites')
      .select('sale_id, sale:sales(*, media:sale_media(*), profile:profiles(*))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    const sales: Sale[] = (data ?? [])
      .map((row: any) => row.sale)
      .filter(Boolean);
    setFavorites(sales);
    setIds(new Set(sales.map((s) => s.id)));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const isFavorited = useCallback((saleId: string) => ids.has(saleId), [ids]);

  const toggle = useCallback(
    async (saleId: string) => {
      if (!user) return;
      if (ids.has(saleId)) {
        // Optimistic remove
        setIds((prev) => {
          const next = new Set(prev);
          next.delete(saleId);
          return next;
        });
        setFavorites((prev) => prev.filter((s) => s.id !== saleId));
        await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('sale_id', saleId);
      } else {
        setIds((prev) => new Set(prev).add(saleId));
        await supabase
          .from('favorites')
          .insert({ user_id: user.id, sale_id: saleId });
        // Refetch to pull the sale row into local list
        fetchFavorites();
      }
    },
    [user, ids, fetchFavorites],
  );

  return { favorites, isFavorited, toggle, loading, refetch: fetchFavorites };
}
