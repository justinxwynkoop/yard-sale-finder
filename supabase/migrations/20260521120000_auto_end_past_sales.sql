-- Auto-end any sale whose end_date has passed. Runs nightly at 5
-- minutes past midnight UTC so the discovery map and list don't keep
-- showing stale 'active' or 'winding_down' sales after they've
-- physically ended.
--
-- Uses pg_cron, which Supabase enables on a Postgres extension.
-- The first CREATE EXTENSION is idempotent and a no-op if it's
-- already enabled.

create extension if not exists pg_cron with schema extensions;

-- A SECURITY DEFINER function so the cron job (which runs as the
-- 'postgres' role) can update sales without falling foul of RLS.
create or replace function public.end_past_sales()
returns void
language sql
security definer
set search_path = public
as $$
  update public.sales
  set status = 'ended'
  where status <> 'ended'
    and end_date < (now() at time zone 'utc')::date;
$$;

-- Replace any existing schedule with the same name so re-running the
-- migration doesn't double-schedule. cron.unschedule throws if the
-- job doesn't exist, so wrap it in a do block.
do $$
begin
  perform cron.unschedule('end-past-sales');
exception when others then
  -- job didn't exist; ignore
  null;
end $$;

select cron.schedule(
  'end-past-sales',
  '5 0 * * *',           -- 00:05 UTC every day
  $$ select public.end_past_sales(); $$
);
