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
  const { user, loading: authLoading } = useAuth();
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
      // No user yet — e.g. a focus-refetch fired before useAuth's async
      // getSession() resolved, or during token-refresh churn. Do NOT pin the
      // shared loading flag on (that stranded SavedScreen on a permanent
      // spinner); genuine sign-out is handled by the mount effect's _reset().
      _setLoading(false);
      return;
    }
    _setLoading(true);
    // The supabase client has no request timeout, and auth-lock / token-refresh
    // stalls can make a query hang indefinitely. Abort after 12s so loading
    // always clears and the next screen focus can retry, instead of spinning
    // forever over an empty list.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const { data, error } = await supabase
        .from('favorites')
        // No profile embed: PostgREST's auto-INNER-JOIN on the NOT NULL
        // sales.user_id FK would drop sales whose owner has no profile.
        .select('sale_id, sale:sales(*, media:sale_media(*))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .abortSignal(controller.signal);
      // On a transient error/abort, keep the current list rather than blanking
      // it to empty — the finally below still clears loading so it isn't stuck.
      if (error) return;
      const rows = data ?? [];
      const sales: Sale[] = rows.map((row: any) => row.sale).filter(Boolean);
      _setFavorites(sales);

      // Reap orphaned favorites: rows whose sale was deleted resolve to a
      // null `sale` here. Left in place they inflate the saved count above
      // the visible list ("3 saved" → opens to nothing → count drops to 0).
      // Fire-and-forget delete so the table matches what we can actually show.
      const orphanIds = rows
        .filter((r: any) => !r.sale)
        .map((r: any) => r.sale_id);
      if (orphanIds.length > 0) {
        supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .in('sale_id', orphanIds);
      }
    } catch {
      // Network failure / abort / hang — swallow; the finally clears loading
      // and the next screen focus retries.
    } finally {
      clearTimeout(timer);
      _setLoading(false);
    }
    // Stable user id, not the churning user object (see useAuth).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Fetch once on mount (or when the signed-in user changes). Guard against
  // re-fetching when a second component mounts mid-session — _userId tracks
  // whether the current user's data is already loaded.
  useEffect(() => {
    // useAuth resolves its session asynchronously and is per-hook-instance, so
    // a freshly-mounted screen (e.g. SavedScreen) reports user=null for a beat
    // even when signed in. Do NOT treat that as sign-out: the old code called
    // _reset() here, wiping the shared favorites and pinning loading=true on
    // EVERY mount, which stranded SavedScreen on a spinner over an empty list
    // until a full reload finished. Wait for auth to actually settle first.
    if (authLoading) return;
    if (!user) {
      if (_userId !== null) _reset(); // genuine sign-out
      return;
    }
    if (_userId === user.id) return; // already loaded for this user
    _userId = user.id;
    fetchFavorites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading, fetchFavorites]);

  // Immediate optimistic toggle — updates the shared store synchronously so
  // every subscriber re-renders before the Supabase round-trip completes.
  const toggle = useCallback(
    async (saleId: string) => {
      if (!user) return;
      if (_ids.has(saleId)) {
        // Optimistic remove — broadcast instantly, then persist. Roll back if
        // the delete fails so the heart doesn't lie.
        const prevIds = _ids;
        const prevFavorites = _favorites;
        const nextIds = new Set(_ids);
        nextIds.delete(saleId);
        _ids = nextIds;
        _favorites = _favorites.filter((s) => s.id !== saleId);
        _broadcast();
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('sale_id', saleId);
        if (error) {
          _ids = prevIds;
          _favorites = prevFavorites;
          _broadcast();
        }
      } else {
        // Optimistic add — broadcast instantly, then persist + sync full row.
        const prevIds = _ids;
        _ids = new Set(_ids).add(saleId);
        _broadcast();
        const { error } = await supabase
          .from('favorites')
          .insert({ user_id: user.id, sale_id: saleId });
        if (error) {
          _ids = prevIds;
          _broadcast();
          return;
        }
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
