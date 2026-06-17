/**
 * notify-new-sale
 *
 * Triggered by a DB webhook (trigger) on public.sales INSERT. Sends TWO
 * distinct pushes for each new (non-ended) sale:
 *   1. Followers of the host        → "{host} posted a new sale"   (channel 'sales')
 *   2. Nearby opted-in users        → "New sale near you"          (channel 'nearby')
 * A user who both follows the host AND is nearby only gets the follower push
 * (the nearby_sale_recipients RPC excludes followers), so no double-buzz.
 *
 * Webhook body: { type, table, record: { ...new row } }
 * Env (auto-injected): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushMessage {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data: Record<string, unknown>;
  channelId: string;
}

// Expo accepts up to 100 messages per request — chunk and fan out.
async function sendExpo(messages: PushMessage[]): Promise<void> {
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
}

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

  const body = title.length > 120 ? title.slice(0, 117) + '…' : title;

  // Host name (for the follower title).
  const { data: seller } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', sellerId)
    .single();
  const sellerName = seller?.display_name ?? 'Someone you follow';

  // ── 1. Followers ──────────────────────────────────────────────────────
  const followerMessages: PushMessage[] = [];
  const { data: followers, error: fErr } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('followed_id', sellerId);
  if (fErr) console.error('follows lookup failed:', fErr.message);
  const followerIds = (followers ?? []).map((f) => f.follower_id as string);
  if (followerIds.length > 0) {
    const { data: recipients } = await supabase
      .from('profiles')
      .select('expo_push_token')
      .in('id', followerIds)
      .not('expo_push_token', 'is', null);
    for (const r of recipients ?? []) {
      const to = r.expo_push_token as string;
      if (to) {
        followerMessages.push({
          to,
          sound: 'default',
          title: `${sellerName} posted a new sale`,
          body,
          data: { saleId },
          channelId: 'sales',
        });
      }
    }
  }

  // ── 2. Nearby (opted-in, within radius, excludes poster + followers) ──
  const nearbyMessages: PushMessage[] = [];
  const { data: nearby, error: nErr } = await supabase.rpc(
    'nearby_sale_recipients',
    { p_sale_id: saleId },
  );
  if (nErr) {
    console.error('nearby_sale_recipients failed:', nErr.message);
  } else {
    for (const r of (nearby ?? []) as { expo_push_token: string }[]) {
      if (r.expo_push_token) {
        nearbyMessages.push({
          to: r.expo_push_token,
          sound: 'default',
          title: 'New sale near you',
          body,
          data: { saleId },
          channelId: 'nearby',
        });
      }
    }
  }

  if (followerMessages.length === 0 && nearbyMessages.length === 0) {
    return new Response('No recipients', { status: 200 });
  }

  await sendExpo([...followerMessages, ...nearbyMessages]);
  return new Response('OK', { status: 200 });
});
