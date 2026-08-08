import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Sale, SaleEvent } from '../types';
import { useBlockedUsers } from './useBlockedUsers';
import { localTodayIso } from '../lib/eventMatch';

/**
 * Upcoming + in-progress neighborhood sale events (end_date >= today) with a
 * member-sale count. Plain fetch — tiny table, no realtime channel (spec).
 */
export function useSaleEvents() {
  const [events, setEvents] = useState<SaleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { blockedIds } = useBlockedUsers();

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from('sale_events')
      .select('*, sales(count)')
      .gte('end_date', localTodayIso());
    setEvents(
      ((data as any[]) ?? []).map((e) => ({
        ...e,
        sale_count: e.sales?.[0]?.count ?? 0,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  // Hide events organized by someone the current user has blocked (either
  // direction — see useBlockedUsers). Computed here, same client-side
  // convention as useSales' visibleSales, so unblocking surfaces events
  // immediately without a network round-trip.
  const visibleEvents = useMemo(
    () =>
      blockedIds.size === 0
        ? events
        : events.filter((e) => !blockedIds.has(e.organizer_id)),
    [events, blockedIds],
  );

  return { events: visibleEvents, loading, refetch };
}

/**
 * One event by id or share slug, with organizer profile (separate query —
 * same no-embed pattern as useSales) and the member-sale roster with media.
 */
export function useSaleEvent({ eventId, slug }: { eventId?: string; slug?: string }) {
  const [event, setEvent] = useState<SaleEvent | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const { blockedIds } = useBlockedUsers();

  const refetch = useCallback(async () => {
    if (!eventId && !slug) { setLoading(false); return; }
    let q = supabase.from('sale_events').select('*, sales(count)');
    q = eventId ? q.eq('id', eventId) : q.eq('share_slug', slug!);
    const { data: ev } = await q.maybeSingle();
    if (!ev) { setEvent(null); setSales([]); setLoading(false); return; }

    const [{ data: organizer }, { data: memberSales }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', ev.organizer_id).maybeSingle(),
      supabase
        .from('sales')
        .select('*, media:sale_media(*)')
        .eq('event_id', ev.id)
        .order('created_at', { ascending: true }),
    ]);
    setEvent({
      ...(ev as any),
      sale_count: (ev as any).sales?.[0]?.count ?? 0,
      organizer: organizer ?? undefined,
    });
    setSales((memberSales as Sale[]) ?? []);
    setLoading(false);
  }, [eventId, slug]);

  useEffect(() => { refetch(); }, [refetch]);

  // A blocked organizer's event is treated as "gone" rather than revealing
  // the block relationship (matches the app's "unavailable" stance elsewhere).
  const visibleEvent = useMemo(() => {
    if (!event) return null;
    if (blockedIds.has(event.organizer_id)) return null;
    return event;
  }, [event, blockedIds]);

  // Roster sales from blocked users are hidden the same way useSales hides
  // blocked sales from the map/list.
  const visibleSales = useMemo(
    () =>
      blockedIds.size === 0
        ? sales
        : sales.filter((s) => !blockedIds.has(s.user_id)),
    [sales, blockedIds],
  );

  return { event: visibleEvent, sales: visibleSales, loading, refetch };
}
