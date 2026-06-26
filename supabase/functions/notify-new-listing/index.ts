/**
 * notify-new-listing
 *
 * Triggered by a DB webhook (trigger) on public.listings INSERT. Pushes
 * "{host} listed a new item" to the host's followers who have the per-follow
 * `notify` flag on. (Unlike notify-new-sale there is no "nearby" push — that
 * is sales-only.)
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

  const listingId = record.id as string;
  const sellerId = record.user_id as string;
  const title = (record.title as string) ?? 'a new item';
  const status = (record.status as string) ?? 'available';

  if (!listingId || !sellerId) {
    return new Response('Missing fields', { status: 400 });
  }
  // A freshly-listed item shouldn't already be sold; skip if so.
  if (status === 'sold') return new Response('Not announceable', { status: 200 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const body = title.length > 120 ? title.slice(0, 117) + '…' : title;

  const { data: seller } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', sellerId)
    .single();
  const sellerName = seller?.display_name ?? 'Someone you follow';

  // Followers with the bell on.
  const { data: followers, error: fErr } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('followed_id', sellerId)
    .eq('notify', true);
  if (fErr) console.error('follows lookup failed:', fErr.message);
  const followerIds = (followers ?? []).map((f) => f.follower_id as string);
  if (followerIds.length === 0) return new Response('No recipients', { status: 200 });

  const { data: recipients } = await supabase
    .from('user_push_tokens')
    .select('token')
    .in('user_id', followerIds);

  const messages: PushMessage[] = [];
  for (const r of recipients ?? []) {
    const to = r.token as string;
    if (to) {
      messages.push({
        to,
        sound: 'default',
        title: `${sellerName} listed a new item`,
        body,
        data: { listingId },
        channelId: 'sales',
      });
    }
  }

  if (messages.length === 0) return new Response('No push token', { status: 200 });

  await sendExpo(messages);
  return new Response('OK', { status: 200 });
});
