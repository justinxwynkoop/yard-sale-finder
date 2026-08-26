-- Webhook: on a new neighborhood sale event, call notify-new-event (pushes
-- "a neighborhood sale started around your sale" to hosts of un-joined sales
-- inside the new event's circle — the create-time proximity prompt can't
-- cover the sale-first-event-second ordering).
--
-- Same convention as 20260618200000_webhook_auth_header.sql: the trigger
-- sends the service-role key as a Bearer token, extracted at apply time from
-- the existing notify-new-message trigger so the secret never appears in
-- this committed file. The function enforces the matching check.

do $$
declare
  tok text;
  hdr text;
  base text := 'https://dxahcamntwtuzftxbxgx.supabase.co/functions/v1/';
begin
  select (regexp_match(pg_get_triggerdef(oid), 'Bearer ([A-Za-z0-9._-]+)'))[1]
    into tok
    from pg_trigger
    where tgname = 'notify-new-message'
      and tgrelid = 'public.messages'::regclass;
  if tok is null then
    raise exception 'Could not read the service-role token from the notify-new-message trigger';
  end if;

  hdr := json_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || tok
  )::text;

  execute 'drop trigger if exists notify_new_event_webhook on public.sale_events';
  execute format(
    'create trigger notify_new_event_webhook after insert on public.sale_events '
    || 'for each row execute function supabase_functions.http_request(%L,%L,%L,%L,%L)',
    base || 'notify-new-event', 'POST', hdr, '{}', '5000');
end $$;
