-- SECURITY: require the service-role Authorization header on the notify
-- webhooks so the edge functions can't be invoked by anyone but the DB
-- webhook. The dashboard-created notify-new-message trigger already sends
-- `Authorization: Bearer <service_role_key>`; the sale/listing triggers (from
-- earlier migrations) only sent Content-Type. Recreate them WITH the same
-- header, extracting the token from the existing message trigger at apply time
-- so the secret never appears in this committed file. The matching
-- enforcement lives in each function (checks Authorization == the injected
-- SUPABASE_SERVICE_ROLE_KEY).

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

  execute 'drop trigger if exists notify_new_sale_webhook on public.sales';
  execute format(
    'create trigger notify_new_sale_webhook after insert on public.sales '
    || 'for each row execute function supabase_functions.http_request(%L,%L,%L,%L,%L)',
    base || 'notify-new-sale', 'POST', hdr, '{}', '5000');

  execute 'drop trigger if exists notify_new_listing_webhook on public.listings';
  execute format(
    'create trigger notify_new_listing_webhook after insert on public.listings '
    || 'for each row execute function supabase_functions.http_request(%L,%L,%L,%L,%L)',
    base || 'notify-new-listing', 'POST', hdr, '{}', '5000');
end $$;
