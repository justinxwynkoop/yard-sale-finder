import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Conversation, MessageKind } from '../types';
import { useAuth } from './useAuth';
import { useAppForeground } from './useAppForeground';

/** Delay before rebuilding a Realtime channel that errored or timed out. */
const REALTIME_RETRY_MS = 3000;

/**
 * Session-delete tombstone check. A conversation deleted THIS session is
 * hidden from refetch results as a race guard (a refetch that started
 * before the delete RPC landed would otherwise resurrect the row). But a
 * message NEWER than the tombstone means the thread genuinely came back
 * (standard chat behavior, mirroring the DB's *_deleted_at filter) — the
 * tombstone must yield, otherwise the revived thread stays invisible until
 * the app restarts.
 */
export function tombstoneHides(
  deletedAtMs: number | undefined,
  lastMessageAt: string,
): boolean {
  if (deletedAtMs == null) return false;
  return new Date(lastMessageAt).getTime() <= deletedAtMs;
}

/**
 * Inbox row preview text for the most recent message in a conversation.
 * Offer and system rows carry real body text (e.g. "Offered $15 for
 * Vintage Indiana glass", "Offer accepted -- $15. This item is on hold."),
 * so today this is kind-agnostic -- any row with a body renders that body,
 * regardless of `kind`. `kind` is accepted (and threaded through by the
 * caller) so a future kind-specific prefix can be added here without
 * touching the caller. Falls back to a photo marker for image-only
 * messages, and to undefined (which InboxScreen renders as "Tap to view")
 * only when there is no last message at all.
 */
export function computeLastMessagePreview(
  lastMsg:
    | { body: string | null; image_url: string | null; kind?: MessageKind | null }
    | undefined,
): string | undefined {
  return lastMsg
    ? (lastMsg.body ?? (lastMsg.image_url ? '📷 Photo' : undefined))
    : undefined;
}

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
  // Archived threads (per-user) live in their own list / view.
  const [archived, setArchived] = useState<Conversation[]>([]);
  // loading = true only on the very first fetch (no conversations yet).
  // refreshing = true only during an explicit pull-to-refresh.
  // Focus-triggered silent refetches change neither — no spinner shown.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Conversations deleted in this session, mapped to WHEN (device ms).
  // Applied as a post-filter on every fetch result so a focus-triggered
  // refetch can't resurrect a row whose delete round-trip hasn't finished
  // yet. Timestamped so a message that arrives AFTER the delete clears the
  // tombstone and the thread reappears live (see tombstoneHides).
  const deletedIdsRef = useRef(new Map<string, number>());

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
    const allRows = (convs ?? []) as Conversation[];
    // Per-user deletion: hide threads THIS user has deleted, unless a newer
    // message has arrived since (last_message_at > their *_deleted_at), which
    // brings the thread back — standard chat behavior.
    const rows = allRows.filter((c) => {
      const myDeletedAt =
        c.buyer_id === user.id ? c.buyer_deleted_at : c.seller_deleted_at;
      return !myDeletedAt || new Date(c.last_message_at) > new Date(myDeletedAt);
    });

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
      .select('conversation_id, body, image_url, created_at, sender_id, kind')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })
      .limit(convIds.length * 4); // ~4 most-recent per conv is plenty

    const lastByConv = new Map<
      string,
      {
        body: string | null;
        image_url: string | null;
        created_at: string;
        sender_id: string;
        kind?: MessageKind | null;
      }
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
        last_message_preview: computeLastMessagePreview(lastMsg),
        has_unread: isUnread,
      };
    });

    // Filter out rows deleted in this session (guards against a
    // focus-triggered refetch racing the DB delete). A newer message
    // resurrects the thread — drop its tombstone so it stays live.
    const visible = hydrated.filter((c) => {
      const deletedAtMs = deletedIdsRef.current.get(c.id);
      if (tombstoneHides(deletedAtMs, c.last_message_at)) return false;
      if (deletedAtMs != null) deletedIdsRef.current.delete(c.id);
      return true;
    });
    // Split inbox vs archived. A thread is archived-for-me only while no newer
    // message has arrived since I archived it (then it returns to the inbox).
    const isArchived = (c: Conversation) => {
      const a =
        c.buyer_id === user.id ? c.buyer_archived_at : c.seller_archived_at;
      return !!a && new Date(c.last_message_at) <= new Date(a);
    };
    setConversations(visible.filter((c) => !isArchived(c)));
    setArchived(visible.filter(isArchived));
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    doFetch({ initial: true });
  }, [doFetch]);

  // Realtime: any insert into messages we participate in bumps the
  // inbox so previews + ordering stay live.
  //
  // The channel is self-healing. Bumping `channelEpoch` tears it down and
  // builds a fresh one — done when the server reports an error / timeout
  // (expired JWT after a long background, dropped socket) and whenever the
  // app returns to the foreground, because a channel that died while iOS
  // had the socket suspended never rejoins by itself. Before this, the
  // inbox only caught up when the user navigated away and back.
  const [channelEpoch, setChannelEpoch] = useState(0);
  useEffect(() => {
    if (!user) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
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
      .subscribe((status) => {
        if (!active) return;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (retry) clearTimeout(retry);
          retry = setTimeout(() => {
            if (active) setChannelEpoch((e) => e + 1);
          }, REALTIME_RETRY_MS);
        }
      });
    return () => {
      active = false;
      if (retry) clearTimeout(retry);
      supabase.removeChannel(channel);
    };
  }, [user, doFetch, channelEpoch]);

  // Foreground: catch up on anything that arrived while the socket was
  // suspended, and rebuild the channel so it's live again.
  useAppForeground(() => {
    if (!user) return;
    doFetch();
    setChannelEpoch((e) => e + 1);
  });

  // Per-user delete (bulk). hide_conversation stamps only the caller's
  // *_deleted_at, so the other participant keeps their copy; the thread
  // reappears for me on a newer message (see the doFetch filter).
  const deleteConversations = useCallback(async (ids: string[]) => {
    const now = Date.now();
    ids.forEach((id) => deletedIdsRef.current.set(id, now));
    setConversations((prev) => prev.filter((c) => !ids.includes(c.id)));
    setArchived((prev) => prev.filter((c) => !ids.includes(c.id)));
    await Promise.all(
      ids.map((id) =>
        supabase.rpc('hide_conversation', { p_conversation_id: id }),
      ),
    );
  }, []);
  const deleteConversation = useCallback(
    (id: string) => deleteConversations([id]),
    [deleteConversations],
  );

  // Move threads to / from the Archived view (per-user, bulk).
  const archiveConversations = useCallback(
    async (ids: string[]) => {
      setConversations((prev) => prev.filter((c) => !ids.includes(c.id)));
      await Promise.all(
        ids.map((id) =>
          supabase.rpc('set_conversation_archived', {
            p_conversation_id: id,
            p_archived: true,
          }),
        ),
      );
      doFetch();
    },
    [doFetch],
  );
  const unarchiveConversations = useCallback(
    async (ids: string[]) => {
      setArchived((prev) => prev.filter((c) => !ids.includes(c.id)));
      await Promise.all(
        ids.map((id) =>
          supabase.rpc('set_conversation_archived', {
            p_conversation_id: id,
            p_archived: false,
          }),
        ),
      );
      doFetch();
    },
    [doFetch],
  );

  const markAsUnread = useCallback(async (id: string) => {
    if (!user) return;
    // Optimistic update — flip the dot on immediately so the user sees
    // instant feedback. The RPC then sets *_last_read_at = null in the
    // DB, and the Realtime UPDATE event triggers a silent re-fetch that
    // confirms the state.
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, has_unread: true } : c)),
    );
    // Direct table UPDATE silently fails because conversations has no
    // UPDATE RLS policy for end users. The security-definer RPC
    // bypasses RLS and sets the caller's *_last_read_at column to null.
    await supabase.rpc('unmark_conversation_read', { p_conversation_id: id });
  }, [user]);

  // Stable identities. InboxScreen keys a useFocusEffect on silentRefetch;
  // when these were inline arrows, every fetch produced a new identity, the
  // focus effect re-ran, and the inbox refetched in a tight loop for as
  // long as the screen was open.
  const refetch = useCallback(() => doFetch({ pull: true }), [doFetch]);
  const silentRefetch = useCallback(() => doFetch(), [doFetch]);

  return {
    conversations,
    loading,
    refreshing,
    // refetch — used by FlatList onRefresh (shows pull-to-refresh spinner)
    refetch,
    // silentRefetch — used by useFocusEffect + the focused poll (no spinner)
    silentRefetch,
    unreadCount: conversations.filter((c) => c.has_unread).length,
    archived,
    deleteConversation,
    deleteConversations,
    archiveConversations,
    unarchiveConversations,
    markAsUnread,
  };
}
