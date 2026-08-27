import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './useAuth';

/**
 * Per-user "seen" set for sales. Opening a sale's detail marks it seen, which
 * drops its NEW tag on the map for that user — "if you've looked at it, it's
 * not new to you anymore." This is distinct from `useVisited` (an explicit "I
 * went there" toggle that also mutes the pin); seen only hides the NEW badge.
 *
 * Stored locally in AsyncStorage (keyed per user), not the DB: it only hides a
 * cosmetic badge, so it isn't worth a DB row + write on every detail open.
 * Module-shared like useVisited so reads are synchronous after hydration and a
 * mark on the detail screen shows up on the map (which remounts on return)
 * without a refetch.
 */

let _ids = new Set<string>();
let _userId: string | null = null;
let _loaded = false;
const _listeners = new Set<() => void>();

// Monotonic change counter — the honest memo dependency for derived state,
// since `isSeen` is identity-stable and a set SIZE can collide across a
// batched remove+add render. Bumped at the single broadcast choke point.
let _version = 0;

const keyFor = (userId: string) => `seenSales:${userId}`;
const broadcast = () => {
  _version++;
  _listeners.forEach((fn) => fn());
};

async function hydrate(userId: string) {
  _userId = userId;
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    _ids = new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    _ids = new Set();
  }
  _loaded = true;
  broadcast();
}

/** Mark a sale seen for the given user (idempotent). */
export function markSaleSeen(userId: string | undefined, saleId: string): void {
  if (!userId || !saleId || _ids.has(saleId)) return;
  _ids = new Set(_ids).add(saleId);
  broadcast();
  AsyncStorage.setItem(keyFor(userId), JSON.stringify([..._ids])).catch(() => {});
}

export function useSeenSales() {
  const { user } = useAuth();
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  useEffect(() => {
    _listeners.add(rerender);
    return () => {
      _listeners.delete(rerender);
    };
  }, [rerender]);

  useEffect(() => {
    if (!user) {
      _ids = new Set();
      _userId = null;
      _loaded = false;
      return;
    }
    if (_userId === user.id && _loaded) return;
    hydrate(user.id);
  }, [user]);

  const isSeen = useCallback((saleId: string) => _ids.has(saleId), []);
  const markSeen = useCallback(
    (saleId: string) => markSaleSeen(user?.id, saleId),
    [user?.id],
  );

  return { isSeen, markSeen, seenCount: _ids.size, seenVersion: _version };
}
