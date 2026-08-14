/**
 * notify-new-report
 *
 * Triggered by a DB webhook on public.reports INSERT. Pushes an alert to the
 * operator's devices so the "reviewed within 24 hours" promise in the report
 * sheet is backed by an actual signal, not by someone remembering to check.
 *
 * Webhook body: { type, table, record: { ...new row } }
 * Env: NOTIFY_WEBHOOK_TOKEN (shared webhook secret), OPERATOR_USER_ID
 *      (auth.users id of the operator account), plus the auto-injected
 *      SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const REASON_LABELS: Record<string, string> = {
  inappropriate: 'Inappropriate content',
  spam_misleading: 'Spam or misleading',
  illegal: 'Illegal items',
  safety: 'Safety concern',
  off_topic: "Doesn't belong here",
  other: 'Something else',
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

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

  const operatorId = Deno.env.get('OPERATOR_USER_ID');
  if (!operatorId) {
    console.error('OPERATOR_USER_ID is not set');
    return new Response('Not configured', { status: 500 });
  }

  const targetType = (record.target_type as string) ?? 'content';
  const targetId = record.target_id as string;
  const reason = (record.reason as string) ?? 'other';
  const notes = (record.notes as string) ?? '';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: tokens } = await supabase
    .from('user_push_tokens')
    .select('token')
    .eq('user_id', operatorId);
  const toList = (tokens ?? []).map((t) => t.token as string).filter(Boolean);
  if (toList.length === 0) return new Response('No operator tokens', { status: 200 });

  const label = REASON_LABELS[reason] ?? reason;
  const body = notes
    ? notes.length > 120
      ? notes.slice(0, 117) + '…'
      : notes
    : `A ${targetType} was reported`;
  // Deep-link the tap to the reported content where a route exists.
  const data: Record<string, unknown> =
    targetType === 'sale'
      ? { saleId: targetId }
      : targetType === 'listing'
        ? { listingId: targetId }
        : {};

  const messages = toList.map((to) => ({
    to,
    sound: 'default' as const,
    title: `New report — ${label}`,
    body,
    data,
    channelId: 'sales',
  }));

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    console.error('Expo push error:', res.status, await res.text());
  }
  return new Response('OK', { status: 200 });
});
