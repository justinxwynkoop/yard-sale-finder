-- Webhook: on a new abuse report, call notify-new-report (pushes an alert to
-- the operator's devices — backs the "reviewed within 24 hours" promise in
-- the report sheet). Same do-block pattern as 20260618200000: the service
-- token is read from the existing dashboard-created notify-new-message
-- trigger at apply time so the secret never appears in this file.

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

  execute 'drop trigger if exists notify_new_report_webhook on public.reports';
  execute format(
    'create trigger notify_new_report_webhook after insert on public.reports '
    || 'for each row execute function supabase_functions.http_request(%L,%L,%L,%L,%L)',
    base || 'notify-new-report', 'POST', hdr, '{}', '5000');
end $$;
