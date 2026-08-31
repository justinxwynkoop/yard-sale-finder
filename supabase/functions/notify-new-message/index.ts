/**
 * notify-new-message
 *
 * Supabase Edge Function triggered by a Database Webhook on
 * public.messages INSERT. Looks up the recipient's Expo Push Token
 * and fires a push notification via the Expo Push API.
 *
 * Setup (one-time, in Supabase dashboard):
 *   Database → Webhooks → Create a new hook
 *     Table:  public.messages
 *     Events: INSERT
 *     Type:   Edge Function
 *     Function: notify-new-message
 *
 * The webhook payload is the standard Supabase webhook body:
 *   { type: "INSERT", table: "messages", record: { ...new row } }
 *
 * Env vars (set in Supabase dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL          — your project URL (auto-injected)
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (auto-injected)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req: Request) => {
  // ── Auth: only accept calls from the Supabase webhook ─────────────────
  // Supabase sends a secret in the Authorization header when you configure
  // the webhook with a signing secret. For v1 we rely on the function only
  // being callable from the Supabase infra (not publicly routable).
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Only the DB webhook may invoke this — it sends the service-role key as a
  // Bearer token. Reject anything else (the function is deployed --no-verify-jwt
  // and is otherwise publicly routable).
  const webhookToken = Deno.env.get('NOTIFY_WEBHOOK_TOKEN');
  if (!webhookToken || req.headers.get('Authorization') !== `Bearer ${webhookToken}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: { record?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const record = payload.record;
  if (!record) return new Response('No record', { status: 400 });

  const conversationId = record.conversation_id as string;
  const senderId       = record.sender_id as string;
  const messageBody    = (record.body as string) ?? '';
  const imageUrl       = record.image_url as string | null;
  const kind: string = payload.record?.kind ?? 'text';
  const explicitRecipient: string | null = payload.record?.recipient_id ?? null;

  // A message is valid with text OR an image. Image-only messages used to
  // fail this check and silently send no notification.
  if (!conversationId || !senderId || (!messageBody && !imageUrl)) {
    return new Response('Missing fields', { status: 400 });
  }

  // ── Supabase admin client (bypasses RLS) ──────────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // ── 1. Look up the conversation to find the recipient ─────────────────
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('buyer_id, seller_id')
    .eq('id', conversationId)
    .single();

  if (convErr || !conv) {
    console.error('Could not load conversation:', convErr?.message);
    return new Response('Conversation not found', { status: 404 });
  }

  // Recipient = the participant who did NOT send this message. recipient_id
  // is stamped by the RPCs on system rows only, so prefer it when present;
  // otherwise derive it from conversation membership. The old ternary fell
  // through to buyer_id when the sender wasn't a participant, pushing a
  // stranger's message to the wrong person — replaced with explicit branches
  // plus a participant assertion below.
  let recipientId: string;
  if (explicitRecipient) {
    recipientId = explicitRecipient;
  } else if (senderId === conv.buyer_id) {
    recipientId = conv.seller_id;
  } else if (senderId === conv.seller_id) {
    recipientId = conv.buyer_id;
  } else {
    // Sender is not a participant. Previously this fell through to buyer_id and
    // pushed a stranger's message to the wrong person.
    return new Response('Sender not a participant', { status: 200 });
  }
  if (recipientId === senderId) {
    return new Response('Self-notification skipped', { status: 200 });
  }

  // ── Block gate ────────────────────────────────────────────────────────
  // Checked in BOTH directions and INDEPENDENTLY of RLS. The messages INSERT
  // policy also refuses a blocked participant, but that policy was the only
  // thing standing between a blocked sender and the recipient's phone -- and
  // on 2026-08-31 a message landed 84 seconds after a block, so it is
  // demonstrably not sufficient by itself. Same defence-in-depth gate that
  // release_hold and mark_listing_sold already apply before their notices.
  //
  // Two .in() filters rather than an .or() string: both ids come off the
  // webhook record, and interpolating them into a PostgREST filter would let
  // a stray comma or paren rewrite the predicate.
  const { data: blocks } = await supabase
    .from('blocked_users')
    .select('blocker_id')
    .in('blocker_id', [senderId, recipientId])
    .in('blocked_id', [senderId, recipientId])
    .limit(1);
  if (blocks && blocks.length > 0) {
    // Either direction: a blocker must not hear from whom they blocked, and
    // someone who has been blocked must not be told they still have reach.
    return new Response('Blocked', { status: 200 });
  }

  // ── 2. Check the recipient's notification pref, then look up their token ──
  const prefColumn = kind === 'offer' ? 'notify_offers' : 'notify_messages';
  const { data: recipient } = await supabase
    .from('profiles')
    .select('notify_messages, notify_offers')
    .eq('id', recipientId)
    .single();

  // Respect the recipient's notification preference for this message kind
  // (default on — offers/text/system all currently default true in the DB).
  if (recipient?.[prefColumn] === false) {
    return new Response('Recipient muted this category', { status: 200 });
  }

  // Token lives in the owner-only user_push_tokens table (read via service role).
  const { data: tokenRow } = await supabase
    .from('user_push_tokens')
    .select('token')
    .eq('user_id', recipientId)
    .single();

  if (!tokenRow?.token) {
    // No token — user hasn't granted permission or hasn't opened the app
    // on this device yet. Silently succeed.
    return new Response('No push token', { status: 200 });
  }

  // ── 3. Look up the sender's display name for the notification title ────
  const { data: sender } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', senderId)
    .single();

  // System notices (offer accepted/declined) are generated by the app, not a
  // person — title them as such rather than crediting whoever's RPC call
  // happened to emit the row.
  const title = kind === 'system' ? 'Trove' : (sender?.display_name ?? 'Someone');

  // ── 4. Fire the Expo push notification ────────────────────────────────
  // Image-only messages have no text — show a "photo" placeholder body.
  const notifBody = messageBody
    ? (messageBody.length > 120 ? messageBody.slice(0, 117) + '…' : messageBody)
    : '📷 Photo';
  const pushMessage = {
    to: tokenRow.token,
    sound: 'default',
    title,
    body: notifBody,
    // data is forwarded to the app and used to navigate to the conversation.
    data: { conversationId },
    channelId: 'messages', // Android channel (matches usePushNotifications)
  };

  const pushRes = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(pushMessage),
  });

  if (!pushRes.ok) {
    const text = await pushRes.text();
    console.error('Expo push API error:', pushRes.status, text);
    return new Response('Push failed', { status: 500 });
  }

  return new Response('OK', { status: 200 });
});
