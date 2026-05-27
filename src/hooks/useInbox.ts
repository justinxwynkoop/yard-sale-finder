import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Conversation } from '../types';
import { useAuth } from './useAuth';

/**
 * Loads the current user's conversation inbox, sorted by most-recent
 * activity. For each row we resolve:
 *   - the OTHER participant's profile (display name + avatar)
 *   - a shallow preview of the target (sale / listing title + cover image)
 *   - the latest message body (for the inbox row preview)
 *   - whether the user has unread messages (drives the badge)
 *
 * We do the target preview lookup in JS rather than as a polymorphic
 * Postgres function -- two extra round trips per inbox load is cheap
 * at v1 scale, and avoids RPC sprawl.
 */
export function useInbox() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  // loading = true only on the very first fetch (no conversations yet).
  // refreshing = true only during an explicit pull-to-refresh.
  // Focus-triggered silent refetches change neither — no spinner shown.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // IDs deleted in this session. Applied as a post-filter on every fetch
  // result so a focus-triggered refetch can't resurrect a row that was
  // deleted but whose DB round-trip hasn't finished yet.
  const deletedIdsRef = useRef(new Set<string>());

  // useInbox is mounted in multiple places (Discover header, Profile,
  // InboxScreen) -- each needs its own Realtime channel because
  // Supabase Realtime rejects a second subscribe() with the same
  // topic. A random suffix per hook instance keeps them isolated.
  const channelIdRef = useRef(
    `inbox-${Math.random().toString(36).slice(2, 10)}`,
  );

  // opts.initial  — first load, shows the full-screen spinner
  // opts.pull     — pull-to-refresh, shows the FlatList spinner
  // (no opts)     — silent background refetch, no spinner
  const doFetch = useCallback(async (opts: { initial?: boolean; pull?: boolean } = {}) => {
    if (!user) {
      setConversations([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (opts.initial) setLoading(true);
    if (opts.pull) setRefreshing(true);

    // 1) Conversations the user participates in.
    const { data: convs } = await supabase
      .from('conversations')
      .select('*')
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .order('last_message_at', { ascending: false });
    const rows = (convs ?? []) as Conversation[];

    if (rows.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    // 2) Resolve other-party profiles in one batched query.
    const otherIds = Array.from(
      new Set(rows.map((c) => (c.buyer_id === user.id ? c.seller_id : c.buyer_id))),
    );
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', otherIds);
    const profileById = new Map(
      (profiles ?? []).map((p) => [p.id, p]),
    );

    // 3) Resolve target previews. Split by type so we hit each table once.
    const saleIds = rows
      .filter((c) => c.target_type === 'sale')
      .map((c) => c.target_id);
    const listingIds = rows
      .filter((c) => c.target_type === 'listing')
      .map((c) => c.target_id);

    const targetPreviewById = new Map<
      string,
      { title: string; image: string | null }
    >();

    if (saleIds.length > 0) {
      const { data: sales } = await supabase
        .from('sales')
        .select('id, title, media:sale_media(url, order)')
        .in('id', saleIds);
      for (const s of sales ?? []) {
        const sorted = ((s as any).media ?? []).sort(
          (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0),
        );
        targetPreviewById.set((s as any).id, {
          title: (s as any).title,
          image: sorted[0]?.url ?? null,
        });
      }
    }
    if (listingIds.length > 0) {
      const { data: listings } = await supabase
        .from('listings')
        .select('id, title, media:listing_media(url, order)')
        .in('id', listingIds);
      for (const l of listings ?? []) {
        const sorted = ((l as any).media ?? []).sort(
          (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0),
        );
        targetPreviewById.set((l as any).id, {
          title: (l as any).title,
          image: sorted[0]?.url ?? null,
        });
      }
    }

    // 4) Last-message preview + unread flag per conversation.
    // We do this with a single query that grabs the most recent message
    // for each conversation. PostgREST doesn't expose DISTINCT ON, so we
    // pull the last N messages for these conversations and let JS pick.
    const convIds = rows.map((c) => c.id);
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('conversation_id, body, created_at, sender_id')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })
      .limit(convIds.length * 4); // ~4 most-recent per conv is plenty

    const lastByConv = new Map<
      string,
      { body: string; created_at: string; sender_id: string }
    >();
    for (const m of recentMessages ?? []) {
      if (!lastByConv.has((m as any).conversation_id)) {
        lastByConv.set((m as any).conversation_id, m as any);
      }
    }

    // 5) Hydrate the rows.
    const hydrated: Conversation[] = rows.map((c) => {
      const otherId = c.buyer_id === user.id ? c.seller_id : c.buyer_id;
      const lastReadAt =
        c.buyer_id === user.id ? c.buyer_last_read_at : c.seller_last_read_at;
      const lastMsg = lastByConv.get(c.id);
      const targetPreview = targetPreviewById.get(c.target_id);
      const isUnread = lastMsg
        ? lastMsg.sender_id !== user.id &&
          (!lastReadAt || lastMsg.created_at > lastReadAt)
        : false;
      return {
        ...c,
        other_profile: profileById.get(otherId),
        target_title: targetPreview?.title,
        target_image_url: targetPreview?.image ?? undefined,
        last_message_preview: lastMsg?.body,
        has_unread: isUnread,
      };
    });

    // Filter out any IDs deleted in this session (guards against a
    // focus-triggered refetch racing the DB delete).
    const visible = hydrated.filter((c) => !deletedIdsRef.current.has(c.id));
    setConversations(visible);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    doFetch({ initial: true });
  }, [doFetch]);

  // Realtime: re-fetch on any message insert (new preview/ordering) or
  // any conversation update (e.g. last_read_at changing when the user
  // opens a thread and marks it read — clears the unread badge).
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(channelIdRef.current)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => doFetch(),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations' },
        () => doFetch(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        () => doFetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, doFetch]);

  const deleteConversation = useCallback(async (id: string) => {
    // 1. Track the ID immediately — every subsequent fetch result (including
    //    the focus-triggered refetch when the user returns to the tab) will
    //    filter this ID out, so the row can never flash back.
    deletedIdsRef.current.add(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    // 2. Delete from DB. The DELETE RLS policy allows participants to delete
    //    their own conversations. Messages cascade automatically via the FK
    //    ON DELETE CASCADE on messages.conversation_id.
    await supabase.from('conversations').delete().eq('id', id);
  }, []);

  const markAsUnread = useCallback(async (id: string) => {
    if (!user) return;
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    const field =
      conv.buyer_id === user.id ? 'buyer_last_read_at' : 'seller_last_read_at';
    await supabase.from('conversations').update({ [field]: null }).eq('id', id);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, has_unread: true } : c)),
    );
  }, [user, conversations]);

  return {
    conversations,
    loading,
    refreshing,
    // refetch — used by FlatList onRefresh (shows pull-to-refresh spinner)
    refetch: () => doFetch({ pull: true }),
    // silentRefetch — used by useFocusEffect (no spinner)
    silentRefetch: () => doFetch(),
    unreadCount: conversations.filter((c) => c.has_unread).length,
    deleteConversation,
    markAsUnread,
  };
}
