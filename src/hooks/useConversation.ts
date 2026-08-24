import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { track } from '../lib/analytics';
import { Conversation, Listing, Message, Profile, Sale } from '../types';
import { useAuth } from './useAuth';
import { useAppForeground } from './useAppForeground';

/** Delay before rebuilding a Realtime channel that errored or timed out. */
const REALTIME_RETRY_MS = 3000;

/**
 * The polymorphic "thing being discussed". Conversation.target_type
 * decides which shape lives in here. Only the fields we actually
 * render in the header are loaded.
 */
export type ConversationTarget =
  | {
      kind: 'sale';
      title: string;
      start_date: string;
      end_date: string;
      start_time: string;
      end_time: string;
      address: string;
      image_url?: string;
    }
  | {
      kind: 'listing';
      title: string;
      price: number;
      status: 'available' | 'sold' | 'pending';
      pickup_display?: string;
      image_url?: string;
    };

/**
 * Loads a single conversation + its message history, subscribes to
 * live inserts, exposes a send() that respects the server-side rate
 * limit and block checks (the messages INSERT RLS policy enforces
 * both -- this hook just surfaces the error).
 *
 * The screen using this hook calls mark_conversation_read on mount /
 * when new messages arrive so the inbox badge clears.
 */
export function useConversation(conversationId: string | undefined) {
  const { user } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [otherProfile, setOtherProfile] = useState<Profile | null>(null);
  const [target, setTarget] = useState<ConversationTarget | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Same channel-collision avoidance as useInbox -- Strict Mode's
  // double-mount in development would otherwise try to subscribe two
  // channels with identical topics and Realtime rejects the second.
  const channelIdRef = useRef(
    `conv-${Math.random().toString(36).slice(2, 10)}`,
  );

  const fetchAll = useCallback(async () => {
    if (!conversationId || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const firstTry = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle();
    if (firstTry.error) {
      setError(firstTry.error.message);
      setLoading(false);
      return;
    }
    let conv = firstTry.data;

    // Cold-start RLS race: a notification tap can mount this screen while the
    // supabase client has `user` in React state but hasn't finished attaching
    // the restored JWT to outgoing requests. That request goes out anon, the
    // conversations SELECT policy (auth.uid() = buyer/seller) hides the row,
    // and maybeSingle() returns null — which looks like "not found" even
    // though we ARE a participant. Confirm a live session (awaiting
    // getSession forces the client to finish hydrating) and retry once so a
    // real participant isn't permanently stranded on the error screen.
    if (!conv) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        const retry = await supabase
          .from('conversations')
          .select('*')
          .eq('id', conversationId)
          .maybeSingle();
        if (retry.error) {
          setError(retry.error.message);
          setLoading(false);
          return;
        }
        conv = retry.data;
      }
    }

    if (!conv) {
      setError('Conversation not found.');
      setLoading(false);
      return;
    }
    setConversation(conv as Conversation);

    const otherId =
      (conv as Conversation).buyer_id === user.id
        ? (conv as Conversation).seller_id
        : (conv as Conversation).buyer_id;
    const { data: other } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', otherId)
      .maybeSingle();
    setOtherProfile((other as Profile) ?? null);

    // Hydrate the target (sale or listing) so the conversation
    // header can show a rich context card: image, title, dates/price.
    const c = conv as Conversation;
    if (c.target_type === 'sale') {
      const { data } = await supabase
        .from('sales')
        .select(
          'title, start_date, end_date, start_time, end_time, address, media:sale_media(url, order)',
        )
        .eq('id', c.target_id)
        .maybeSingle();
      if (data) {
        const s = data as any as Sale;
        const sortedMedia = (s.media ?? []).slice().sort(
          (a, b) => (a.order ?? 0) - (b.order ?? 0),
        );
        setTarget({
          kind: 'sale',
          title: s.title,
          start_date: s.start_date,
          end_date: s.end_date,
          start_time: s.start_time,
          end_time: s.end_time,
          address: s.address,
          image_url: sortedMedia[0]?.url,
        });
      } else {
        setTarget(null);
      }
    } else if (c.target_type === 'listing') {
      const { data } = await supabase
        .from('listings')
        .select(
          'title, price, status, pickup_display, media:listing_media(url, order)',
        )
        .eq('id', c.target_id)
        .maybeSingle();
      if (data) {
        const l = data as any as Listing;
        const sortedMedia = (l.media ?? []).slice().sort(
          (a, b) => (a.order ?? 0) - (b.order ?? 0),
        );
        setTarget({
          kind: 'listing',
          title: l.title,
          price: l.price,
          status: l.status,
          pickup_display: l.pickup_display,
          image_url: sortedMedia[0]?.url,
        });
      } else {
        setTarget(null);
      }
    }

    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    setMessages((msgs ?? []) as Message[]);

    // Bump our last_read_at since we just opened the thread.
    await supabase.rpc('mark_conversation_read', {
      p_conversation_id: conversationId,
    });

    setLoading(false);
  }, [conversationId, user]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Silent catch-up: re-pull the message list without the full-screen
  // spinner. Keeps any in-flight optimistic bubble (not on the server yet)
  // and marks the thread read if the other party said something while the
  // socket was down.
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const syncMessages = useCallback(async () => {
    if (!conversationId || !user) return;
    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (!msgs) return;
    const server = msgs as Message[];
    const known = new Set(messagesRef.current.map((m) => m.id));
    const sawNewFromOther = server.some(
      (m) => !known.has(m.id) && m.sender_id !== user.id,
    );
    setMessages((prev) => {
      const serverIds = new Set(server.map((m) => m.id));
      // Keep optimistic bubbles whose real row hasn't landed yet.
      const pendingOptimistic = prev.filter(
        (m) => m.id.startsWith('optimistic-') && !serverIds.has(m.id),
      );
      return [...server, ...pendingOptimistic];
    });
    if (sawNewFromOther) {
      await supabase.rpc('mark_conversation_read', {
        p_conversation_id: conversationId,
      });
    }
  }, [conversationId, user]);

  // Live tail. We filter client-side by conversation_id because
  // Realtime's server-side filter needs the table to be enrolled
  // with row filters; the messages publication is enrolled without,
  // so every connected client sees every INSERT and drops the ones
  // that aren't theirs.
  //
  // Self-healing like useInbox: an errored / timed-out channel (expired JWT
  // after a long background, dropped socket) is rebuilt after a short
  // delay, and the app returning to the foreground rebuilds it outright —
  // a channel that died while iOS had the socket suspended never rejoins
  // on its own, which left an open thread silently missing replies.
  const [channelEpoch, setChannelEpoch] = useState(0);
  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(channelIdRef.current)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const m = payload.new as Message;
          if (m.conversation_id !== conversationId) return;
          setMessages((prev) =>
            prev.some((x) => x.id === m.id) ? prev : [...prev, m],
          );
          // Auto-mark-read if the screen is open and the message is
          // from the other party.
          if (m.sender_id !== user?.id) {
            supabase
              .rpc('mark_conversation_read', {
                p_conversation_id: conversationId,
              })
              .then(() => undefined);
          }
        },
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
  }, [conversationId, user, channelEpoch]);

  useAppForeground(() => {
    if (!conversationId || !user) return;
    syncMessages();
    setChannelEpoch((e) => e + 1);
  });

  const send = useCallback(
    async (body: string, imageUrl?: string | null) => {
      const trimmed = body.trim();
      // A message needs text OR an image.
      if ((!trimmed && !imageUrl) || !user || !conversationId)
        return { error: null };
      setSending(true);
      // Optimistic append so the bubble shows up immediately.
      const optimistic: Message = {
        id: `optimistic-${Date.now()}`,
        conversation_id: conversationId,
        sender_id: user.id,
        body: trimmed || null,
        image_url: imageUrl ?? null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      const { data, error: sendErr } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          body: trimmed || null,
          image_url: imageUrl ?? null,
        })
        .select()
        .single();
      setSending(false);
      if (sendErr) {
        // Roll back the optimistic bubble.
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        return { error: sendErr };
      }
      track('message_sent', { conversationId, hasImage: !!imageUrl });
      // Reconcile the optimistic bubble with the real row. The realtime
      // INSERT echo for this same message can land BEFORE this insert()
      // resolves — in which case the real row is already in the list and a
      // naive map() would leave the optimistic placeholder swapped to a
      // SECOND copy of the real row (duplicate React key). So drop the
      // placeholder and append the real row only if it isn't already there.
      const real = data as Message;
      setMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== optimistic.id);
        return withoutOptimistic.some((m) => m.id === real.id)
          ? withoutOptimistic
          : [...withoutOptimistic, real];
      });
      return { error: null };
    },
    [conversationId, user],
  );

  return {
    conversation,
    otherProfile,
    target,
    messages,
    loading,
    error,
    sending,
    send,
    refetch: fetchAll,
    // Silent message re-pull (no spinner) — for pull-to-refresh in the thread.
    syncMessages,
  };
}

/**
 * Create-or-fetch helper used by the "Message seller" entry button.
 * Wraps the start_conversation RPC. Returns the conversation ID so
 * the caller can navigate to it.
 */
export function useStartConversation() {
  const start = useCallback(
    async (targetType: 'sale' | 'listing', targetId: string) => {
      const { data, error } = await supabase.rpc('start_conversation', {
        p_target_type: targetType,
        p_target_id: targetId,
      });
      if (error) return { id: null, error };
      track('conversation_started', { targetType, targetId });
      return { id: data as string, error: null };
    },
    [],
  );
  return { start };
}
