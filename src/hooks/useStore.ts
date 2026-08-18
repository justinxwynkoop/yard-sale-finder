import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { StoreConfig } from '../types';

export function useStore(userId: string) {
  const [config, setConfig] = useState<StoreConfig>({ featured: [], sections: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [featuredResult, sectionsResult] = await Promise.all([
        supabase
          .from('store_featured')
          .select('listing_id, position')
          .eq('user_id', userId)
          .order('position'),
        supabase
          .from('store_sections')
          .select('id, name, position, items:store_section_items(listing_id, position)')
          .eq('user_id', userId)
          .order('position'),
      ]);

      if (featuredResult.error) throw featuredResult.error;
      if (sectionsResult.error) throw sectionsResult.error;

      setConfig({
        featured: (featuredResult.data ?? []).map((r: any) => r.listing_id as string),
        sections: (sectionsResult.data ?? []).map((s: any) => ({
          id: s.id as string,
          name: s.name as string,
          listingIds: ((s.items ?? []) as { listing_id: string; position: number }[])
            .sort((a, b) => a.position - b.position)
            .map((item) => item.listing_id),
        })),
      });
    } catch (e: any) {
      setError(e.message as string);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { config, loading, error, refetch: fetch };
}
