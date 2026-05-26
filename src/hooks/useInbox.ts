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
  const [loading, setLoading] = useState(true);
  // useInbox is mounted in multiple places (Discover header, Profile,
  // InboxScreen) -- each needs its own Realtime channel because
  // Supabase Realtime rejects a second subscribe() with the same
  // topic. A random suffix per hook instance keeps them isolated.
  const channelIdRef = useRef(
    `inbox-${Math.random().toString(36).slice(2, 10)}`,
  );

  const fetch = useCallback(async () => {
    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }
    setLoading(true);

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

    setConversations(hydrated);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Realtime: any insert into messages we participate in bumps the
  // inbox so previews + ordering stay live.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(channelIdRef.current)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => fetch(),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations' },
        () => fetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetch]);

  return {
    conversations,
    loading,
    refetch: fetch,
    unreadCount: conversations.filter((c) => c.has_unread).length,
  };
}
