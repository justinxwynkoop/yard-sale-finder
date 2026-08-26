/**
 * notify-new-event
 *
 * Triggered by a DB webhook (trigger) on public.sale_events INSERT. Finds
 * hosts whose existing, still-upcoming, un-joined sales fall inside the new
 * event's circle and pushes "A neighborhood sale started around your sale" —
 * the create-time proximity prompt (CreateSaleScreen) can't cover the
 * sale-first-event-second ordering, so this closes that gap. The My Sales
 * screen shows the matching join chip when they arrive.
 *
 * One push per host (not per sale), organizer excluded. Tap routes to the
 * event via data.eventId.
 *
 * Webhook body: { type, table, record: { ...new sale_events row } }
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

function haversineMeters(
  lat1: number, lon1: number, lat2: number, lon2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
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
  // Bearer token. Reject anything else (the function is deployed
  // --no-verify-jwt and is otherwise publicly routable).
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

  const eventId = record.id as string;
  const organizerId = record.organizer_id as string;
  const title = (record.title as string) ?? 'A neighborhood sale';
  const lat = record.latitude as number;
  const lon = record.longitude as number;
  const radiusM = (record.radius_m as number) ?? 800;

  if (!eventId || !organizerId || typeof lat !== 'number' || typeof lon !== 'number') {
    return new Response('Missing fields', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Candidate sales: not ended, not already on an event, not yet over by the
  // time the event ends (a sale that finished last weekend doesn't care).
  // Same full-fetch-then-filter approach as useSales — the table is small at
  // current scale, and haversine in JS keeps this PostGIS-free.
  const { data: sales, error: sErr } = await supabase
    .from('sales')
    .select('id, user_id, latitude, longitude, end_date')
    .neq('status', 'ended')
    .is('event_id', null)
    .gte('end_date', new Date().toISOString().slice(0, 10));
  if (sErr) {
    console.error('sales lookup failed:', sErr.message);
    return new Response('Lookup failed', { status: 500 });
  }

  // Distance is the ONLY gate — date overlap is deliberately not required,
  // mirroring eventMatchForSale's location-only design: the in-app join
  // prompt offers to move the sale's dates onto the event weekend.
  const hostIds = new Set<string>();
  for (const s of sales ?? []) {
    const uid = s.user_id as string;
    if (uid === organizerId || hostIds.has(uid)) continue;
    const d = haversineMeters(
      lat, lon, s.latitude as number, s.longitude as number,
    );
    if (d <= radiusM) hostIds.add(uid);
  }

  if (hostIds.size === 0) return new Response('No recipients', { status: 200 });

  const { data: recipients } = await supabase
    .from('user_push_tokens')
    .select('user_id, token')
    .in('user_id', [...hostIds]);

  const messages: PushMessage[] = [];
  for (const r of recipients ?? []) {
    const to = r.token as string;
    if (to) {
      messages.push({
        to,
        sound: 'default',
        title: 'A neighborhood sale started around you',
        body: `${title} covers your sale's area — join it from My Sales to appear with the group.`,
        data: { eventId },
        channelId: 'sales',
      });
    }
  }

  if (messages.length === 0) return new Response('No push token', { status: 200 });

  await sendExpo(messages);
  return new Response('OK', { status: 200 });
});
