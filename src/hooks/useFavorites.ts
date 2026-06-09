import { useCallback, useEffect, useReducer } from 'react';
import { supabase } from '../lib/supabase';
import { Sale } from '../types';
import { useAuth } from './useAuth';
import { useBlockedUsers } from './useBlockedUsers';

// ─── Module-level shared store ────────────────────────────────────────────────
// All useFavorites() instances read from and write to the same in-memory state.
// A toggle in SaleDetailScreen is instantly visible in MapHomeScreen (and
// anywhere else) with no async refetch gap — eliminating the brief stale-state
// flicker when navigating back to the map after hearting a sale.

let _ids: Set<string> = new Set();
let _favorites: Sale[] = [];
let _loading = true;
let _userId: string | null = null;

// Components subscribe by registering a forceRender callback.
const _listeners = new Set<() => void>();

function _broadcast() {
  _listeners.forEach((fn) => fn());
}

function _setIds(next: Set<string>) {
  _ids = next;
  _broadcast();
}

function _setFavorites(next: Sale[]) {
  _favorites = next;
  _ids = new Set(next.map((s) => s.id));
  _broadcast();
}

function _setLoading(v: boolean) {
  _loading = v;
  _broadcast();
}

// Reset module state on sign-out / user change so stale data never leaks.
function _reset() {
  _ids = new Set();
  _favorites = [];
  _loading = true;
  _userId = null;
  _broadcast();
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shared yard-sale favorites store. Every call to useFavorites() shares the
 * same underlying data — a toggle from any screen is immediately reflected
 * everywhere without waiting for a refetch.
 */
export function useFavorites() {
  const { user } = useAuth();
  const { blockedIds } = useBlockedUsers();

  // forceRender lets this component instance re-render when the shared store
  // is updated by any other subscriber (e.g. SaleDetailScreen toggling).
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

  // Subscribe / unsubscribe on mount/unmount.
  useEffect(() => {
    _listeners.add(forceRender);
    return () => { _listeners.delete(forceRender); };
  }, []);

  // Fetch from Supabase once per user session (or when explicitly called).
  const fetchFavorites = useCallback(async () => {
    if (!user) {
      _reset();
      return;
    }
    _setLoading(true);
    const { data } = await supabase
      .from('favorites')
      // No profile embed: PostgREST's auto-INNER-JOIN on the NOT NULL
      // sales.user_id FK would drop sales whose owner has no profile.
      .select('sale_id, sale:sales(*, media:sale_media(*))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    const sales: Sale[] = (data ?? [])
      .map((row: any) => row.sale)
      .filter(Boolean);
    _setFavorites(sales);
    _setLoading(false);
    // Stable user id, not the churning user object (see useAuth).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Fetch once on mount (or when the signed-in user changes). Guard against
  // re-fetching when a second component mounts mid-session — _userId tracks
  // whether the current user's data is already loaded.
  useEffect(() => {
    if (!user) {
      if (_userId !== null) _reset();
      return;
    }
    if (_userId === user.id) return; // already loaded for this user
    _userId = user.id;
    fetchFavorites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, fetchFavorites]);

  // Immediate optimistic toggle — updates the shared store synchronously so
  // every subscriber re-renders before the Supabase round-trip completes.
  const toggle = useCallback(
    async (saleId: string) => {
      if (!user) return;
      if (_ids.has(saleId)) {
        // Optimistic remove — broadcast instantly, then persist.
        const nextIds = new Set(_ids);
        nextIds.delete(saleId);
        _ids = nextIds;
        _favorites = _favorites.filter((s) => s.id !== saleId);
        _broadcast();
        await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('sale_id', saleId);
      } else {
        // Optimistic add — broadcast instantly, then persist + sync full row.
        _ids = new Set(_ids).add(saleId);
        _broadcast();
        await supabase
          .from('favorites')
          .insert({ user_id: user.id, sale_id: saleId });
        // Background sync to pull the full Sale row (media, etc.) into
        // _favorites without blocking the UI.
        fetchFavorites();
      }
    },
    [user, fetchFavorites],
  );

  const isFavorited = useCallback((saleId: string) => _ids.has(saleId), []);

  // Hide favorites whose owner the current user has blocked.
  // Computed directly (not memoised) so every _broadcast()-triggered
  // forceRender picks up the latest _favorites without stale closure issues.
  const visibleFavorites =
    blockedIds.size === 0
      ? _favorites
      : _favorites.filter((s) => !blockedIds.has(s.user_id));

  return {
    favorites: visibleFavorites,
    isFavorited,
    toggle,
    loading: _loading,
    refetch: fetchFavorites,
  };
}
