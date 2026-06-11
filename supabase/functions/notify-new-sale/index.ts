/**
 * notify-new-sale
 *
 * Supabase Edge Function triggered by a Database Webhook on
 * public.sales INSERT. Pushes "{host} posted a new sale" to everyone
 * who follows the host. Mirrors notify-new-message.
 *
 * Setup (one-time, in the Supabase dashboard):
 *   Database → Webhooks → Create a new hook
 *     Table:    public.sales
 *     Events:   INSERT
 *     Type:     Edge Function
 *     Function: notify-new-sale
 *
 * Webhook body: { type: "INSERT", table: "sales", record: { ...new row } }
 *
 * Env (auto-injected): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let payload: { record?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const record = payload.record;
  if (!record) return new Response('No record', { status: 400 });

  const saleId = record.id as string;
  const sellerId = record.user_id as string;
  const title = (record.title as string) ?? 'a new sale';
  const status = (record.status as string) ?? 'active';

  if (!saleId || !sellerId) return new Response('Missing fields', { status: 400 });
  // Only announce live sales (skip anything posted already-ended).
  if (status === 'ended') return new Response('Not active', { status: 200 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // 1. Who follows this host?
  const { data: followers, error: fErr } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('followed_id', sellerId);
  if (fErr) {
    console.error('follows lookup failed:', fErr.message);
    return new Response('Follows error', { status: 500 });
  }
  const followerIds = (followers ?? []).map((f) => f.follower_id as string);
  if (followerIds.length === 0) return new Response('No followers', { status: 200 });

  // 2. Their push tokens (skip anyone without one).
  const { data: recipients } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .in('id', followerIds)
    .not('expo_push_token', 'is', null);
  const tokens = (recipients ?? [])
    .map((r) => r.expo_push_token as string)
    .filter(Boolean);
  if (tokens.length === 0) return new Response('No tokens', { status: 200 });

  // 3. Host name for the title.
  const { data: seller } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', sellerId)
    .single();
  const sellerName = seller?.display_name ?? 'Someone you follow';

  // 4. Fan out (Expo accepts up to 100 messages per request).
  const messages = tokens.map((to) => ({
    to,
    sound: 'default',
    title: `${sellerName} posted a new sale`,
    body: title.length > 120 ? title.slice(0, 117) + '…' : title,
    data: { saleId },
    channelId: 'sales',
  }));

  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      console.error('Expo push error:', res.status, await res.text());
    }
  }

  return new Response('OK', { status: 200 });
});
