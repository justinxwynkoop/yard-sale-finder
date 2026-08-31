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
        const sortedMedia = (s.media ?? [])
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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
        const sortedMedia = (l.media ?? [])
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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

  // The ContextCard's SOLD / ON HOLD pill reads target.status, which fetchAll
  // hydrates exactly once. ConversationScreen calls refetch() after the local
  // user responds to an offer, but a change driven by the OTHER party (they
  // accept, or the seller marks it sold from My Listings) left the pill stale
  // until the thread was reopened. Re-pull just the listing row: `status` is
  // the only field that can change under an open thread, so a full refetch()
  // on every incoming message would be far more work for the same result.
  const targetKeyRef = useRef<{ type: string; id: string } | null>(null);
  useEffect(() => {
    targetKeyRef.current = conversation
      ? { type: conversation.target_type, id: conversation.target_id }
      : null;
  }, [conversation]);

  const refreshTarget = useCallback(async () => {
    const key = targetKeyRef.current;
    // Sale threads have no status pill, so there is nothing to refresh.
    if (!key || key.type !== 'listing') return;
    const { data } = await supabase
      .from('listings')
      .select('status')
      .eq('id', key.id)
      .maybeSingle();
    if (!data) return;
    const next = (data as Pick<Listing, 'status'>).status;
    setTarget((prev) =>
      prev && prev.kind === 'listing' && prev.status !== next
        ? { ...prev, status: next }
        : prev,
    );
  }, []);

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
          // Every listing status change writes an offer or system row, so
          // these are exactly the inserts after which the pill can be stale.
          if (m.kind === 'offer' || m.kind === 'system') void refreshTarget();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const m = payload.new as Message;
          if (m.conversation_id !== conversationId) return;
          // Offer status flips arrive as UPDATEs. The INSERT handler above
          // deliberately ignores rows it already has, so it cannot merge these.
          setMessages((prev) =>
            prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)),
          );
          // An accept flips the offer to 'accepted' AND the listing to
          // 'pending' in the same RPC; this is the other party's half.
          if (m.kind === 'offer') void refreshTarget();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        (payload) => {
          const c = payload.new as Conversation;
          if (c.id !== conversationId) return;
          // This is what keeps the read receipt live. mark_conversation_read
          // stamps {buyer,seller}_last_read_at when the other side opens the
          // thread, and that UPDATE is the only signal it happened -- no
          // message is written, so the handlers above never fire for it.
          setConversation((prev) => (prev ? { ...prev, ...c } : prev));
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
  }, [conversationId, user, channelEpoch, refreshTarget]);

  useAppForeground(() => {
    if (!conversationId || !user) return;
    syncMessages();
    // Status can have changed while the socket was suspended, so the
    // realtime hooks above would never have seen it.
    void refreshTarget();
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

  // Returns the raw Supabase error (or null on success) -- same contract as
  // send() above. Never throws; callers read err.message themselves (see
  // ConversationScreen's `sendErr.message ?? 'Please try again.'` idiom).
  const sendOffer = useCallback(
    async (amount: number) => {
      const { error: sendErr } = await supabase.rpc('send_offer', {
        p_conversation_id: conversationId,
        p_amount: amount,
      });
      // The row arrives via the realtime INSERT subscription, so there is no
      // optimistic insert here -- an offer is a server-authoritative object
      // (it can be rejected for a pending duplicate, a sold listing, etc.)
      // and showing it before the server agrees would be a lie.
      return { error: sendErr };
    },
    [conversationId],
  );

  // Same contract as send()/sendOffer above: raw Supabase error or null,
  // never throws.
  const respondToOffer = useCallback(
    async (offerId: string, action: 'accept' | 'decline') => {
      const { error: respondErr } = await supabase.rpc('respond_to_offer', {
        p_offer_id: offerId,
        p_action: action,
      });
      return { error: respondErr };
    },
    [],
  );

  return {
    conversation,
    // The pair authorized to act on this conversation's offers -- "the
    // participant who did NOT send the offer may respond", not "the
    // listing owner". Derived from `conversation` (already fetched above)
    // rather than adding a second copy of the same two ids under a new
    // field name.
    participants: conversation
      ? { buyer_id: conversation.buyer_id, seller_id: conversation.seller_id }
      : null,
    // When the OTHER participant last opened this thread -- the input to the
    // "Seen" marker. Which column that is depends on which side you are.
    otherLastReadAt: conversation
      ? conversation.buyer_id === user?.id
        ? conversation.seller_last_read_at
        : conversation.buyer_last_read_at
      : null,
    otherProfile,
    target,
    messages,
    loading,
    error,
    sending,
    send,
    sendOffer,
    respondToOffer,
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
