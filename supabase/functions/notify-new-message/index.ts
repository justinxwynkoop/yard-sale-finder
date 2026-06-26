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

  // Recipient = the participant who did NOT send this message.
  const recipientId =
    conv.buyer_id === senderId ? conv.seller_id : conv.buyer_id;

  // ── 2. Check the recipient's Messages pref, then look up their token ───
  const { data: recipient } = await supabase
    .from('profiles')
    .select('notify_messages')
    .eq('id', recipientId)
    .single();

  // Respect the recipient's Messages notification preference (default on).
  if (recipient?.notify_messages === false) {
    return new Response('Recipient muted messages', { status: 200 });
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

  const senderName = sender?.display_name ?? 'Someone';

  // ── 4. Fire the Expo push notification ────────────────────────────────
  // Image-only messages have no text — show a "photo" placeholder body.
  const notifBody = messageBody
    ? (messageBody.length > 120 ? messageBody.slice(0, 117) + '…' : messageBody)
    : '📷 Photo';
  const pushMessage = {
    to: tokenRow.token,
    sound: 'default',
    title: senderName,
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
