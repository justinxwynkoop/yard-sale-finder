import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Sale, SaleEvent } from '../types';

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Upcoming + in-progress neighborhood sale events (end_date >= today) with a
 * member-sale count. Plain fetch — tiny table, no realtime channel (spec).
 */
export function useSaleEvents() {
  const [events, setEvents] = useState<SaleEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from('sale_events')
      .select('*, sales(count)')
      .gte('end_date', todayIso());
    setEvents(
      ((data as any[]) ?? []).map((e) => ({
        ...e,
        sale_count: e.sales?.[0]?.count ?? 0,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  return { events, loading, refetch };
}

/**
 * One event by id or share slug, with organizer profile (separate query —
 * same no-embed pattern as useSales) and the member-sale roster with media.
 */
export function useSaleEvent({ eventId, slug }: { eventId?: string; slug?: string }) {
  const [event, setEvent] = useState<SaleEvent | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

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
  return { event, sales, loading, refetch };
}
