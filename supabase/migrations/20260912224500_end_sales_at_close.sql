-- Sales stayed live for hours after they closed.
--
-- end_past_sales() ended a sale once `end_date < today (UTC)` and ran once a
-- day at 00:05 UTC. It never looked at end_time, so a sale that closed at 2 PM
-- Eastern stayed on the map, in event rosters, in the sitemap and on its share
-- page until 8:05 PM -- six hours of sending shoppers to a closed driveway.
-- Observed 2026-09-12 at 6:34 PM Indiana time: all 18 non-ended sales were
-- past their close and still 'active'.
--
-- It could not look at end_time: sale dates and times are wall-clock values
-- with no zone, and the server has no device to ask. So:
--
--   1. sales.timezone -- IANA zone, recorded by the app from the posting
--      device. A trigger nulls anything Postgres cannot resolve, because a
--      single bad value would make the bulk UPDATE below raise and end
--      NOTHING, for everyone.
--   2. end_past_sales() ends a sale once end_date + end_time has passed in that
--      zone. A sale with no zone is judged in Pacific/Honolulu, the latest US
--      zone: it may end late, but it can never end early and vanish while
--      people are still shopping.
--   3. Runs every 5 minutes instead of nightly. The app already hides a closed
--      sale on its own clock the minute it closes; this is what the share page,
--      sitemap, event counts and every older app bundle read.
--
-- Same rule as saleLiveState (site/api/_lib/share.js) and hasSaleEnded
-- (src/utils/saleStatus.ts): past end_time on the FINAL day is over; the
-- evening between days of a multi-day sale is not; no end_time runs to the end
-- of the end date.

alter table public.sales add column if not exists timezone text;

comment on column public.sales.timezone is
  'IANA zone the sale''s dates/times are local to, from the posting device. Null = unknown; the server then ends it on Pacific/Honolulu time (late, never early).';

create or replace function public.normalize_sale_timezone()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if new.timezone is not null then
    begin
      perform now() at time zone new.timezone;
    exception when others then
      new.timezone := null;
    end;
  end if;
  return new;
end;
$fn$;

drop trigger if exists normalize_sale_timezone on public.sales;
create trigger normalize_sale_timezone
  before insert or update of timezone on public.sales
  for each row execute function public.normalize_sale_timezone();

-- Every sale live when this was written is in eastern Indiana (Muncie and
-- Indianapolis, longitude -84.7 to -86.6), which observes Eastern time. The box
-- deliberately stops short of Indiana's Central-time corners (Gary, Evansville)
-- so it cannot mislabel one. Ended sales stay null: their zone no longer
-- affects anything.
update public.sales
set timezone = 'America/Indiana/Indianapolis'
where timezone is null
  and status <> 'ended'
  and latitude between 37.7 and 41.8
  and longitude between -86.6 and -84.7;

create or replace function public.end_past_sales()
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  update public.sales
  set status = 'ended'
  where status <> 'ended'
    and (end_date::date + coalesce(end_time::time, time '23:59:59'))
          at time zone coalesce(timezone, 'Pacific/Honolulu')
        < now();
$fn$;

do $$
begin
  perform cron.unschedule('end-past-sales');
exception when others then
  null;
end $$;

select cron.schedule(
  'end-past-sales',
  '*/5 * * * *',
  $$ select public.end_past_sales(); $$
);

-- Catch up now instead of waiting for the first tick.
select public.end_past_sales();
