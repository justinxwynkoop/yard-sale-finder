import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

/**
 * Personal "visited" marks for yard sales. Mirrors the useFavorites
 * shared-store pattern so a toggle on one screen is instantly reflected
 * anywhere else the hook is mounted, without a refetch round-trip.
 *
 * We only track the set of visited sale ids (not full rows) — the one
 * consumer today is a toggle button on the Sale detail screen.
 */

let _ids = new Set<string>();
let _userId: string | null = null;
let _loaded = false;
const _listeners = new Set<() => void>();

function _broadcast() {
  _listeners.forEach((fn) => fn());
}

function _reset() {
  _ids = new Set();
  _userId = null;
  _loaded = false;
  _broadcast();
}

export function useVisited() {
  const { user } = useAuth();
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  const fetchVisits = useCallback(async () => {
    if (!user) {
      _reset();
      return;
    }
    const { data } = await supabase
      .from('sale_visits')
      .select('sale_id')
      .eq('user_id', user.id);
    _ids = new Set((data ?? []).map((r: any) => r.sale_id));
    _loaded = true;
    _broadcast();
  }, [user]);

  useEffect(() => {
    if (!user) {
      if (_userId !== null) _reset();
      return;
    }
    if (_userId === user.id && _loaded) return;
    _userId = user.id;
    fetchVisits();
  }, [user, fetchVisits]);

  // Subscribe to the shared store so cross-instance toggles re-render us.
  useEffect(() => {
    _listeners.add(rerender);
    return () => {
      _listeners.delete(rerender);
    };
  }, [rerender]);

  const isVisited = useCallback((saleId: string) => _ids.has(saleId), []);

  const toggle = useCallback(
    async (saleId: string) => {
      if (!user) return;
      if (_ids.has(saleId)) {
        // Optimistic remove.
        const next = new Set(_ids);
        next.delete(saleId);
        _ids = next;
        _broadcast();
        await supabase
          .from('sale_visits')
          .delete()
          .eq('user_id', user.id)
          .eq('sale_id', saleId);
      } else {
        const next = new Set(_ids);
        next.add(saleId);
        _ids = next;
        _broadcast();
        await supabase
          .from('sale_visits')
          .insert({ user_id: user.id, sale_id: saleId });
      }
    },
    [user],
  );

  return { isVisited, toggle, visitedCount: _ids.size, refetch: fetchVisits };
}
