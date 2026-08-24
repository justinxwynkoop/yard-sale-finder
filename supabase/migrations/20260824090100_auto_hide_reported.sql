-- Moderation safety net: auto-hide heavily-reported content.
--
-- Reports currently push a notification to the operator (notify-new-report)
-- and wait for a human. That's fine at current scale, but leaves a window
-- where something bad stays visible until the operator wakes up. This adds
-- a tripwire: when 3 or more DISTINCT users report the same sale or listing,
-- it is hidden from feeds automatically (hidden_at is stamped).
--
-- Hidden is soft and reversible: the row is untouched apart from hidden_at,
-- the owner still sees their own content in My Sales / My Listings, and the
-- operator can clear hidden_at from the dashboard to restore it. Feed hooks
-- (useSales / useListings) and the public share pages filter hidden_at.

alter table public.sales    add column if not exists hidden_at timestamptz;
alter table public.listings add column if not exists hidden_at timestamptz;

-- Distinct reporters, not raw report count — one angry user spamming the
-- report form shouldn't be able to take a sale down on their own.
create or replace function public.auto_hide_reported()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  distinct_reporters integer;
begin
  if new.target_type not in ('sale', 'listing') then
    return new;
  end if;

  select count(distinct reporter_id) into distinct_reporters
  from public.reports
  where target_type = new.target_type
    and target_id = new.target_id;

  if distinct_reporters >= 3 then
    if new.target_type = 'sale' then
      update public.sales
        set hidden_at = coalesce(hidden_at, now())
        where id = new.target_id;
    else
      update public.listings
        set hidden_at = coalesce(hidden_at, now())
        where id = new.target_id;
    end if;
  end if;

  return new;
end;
$$;

-- Triggers run as the function owner, so the owner-only UPDATE RLS policies
-- on sales/listings don't block the hide. Clients can't call this directly.
revoke execute on function public.auto_hide_reported() from anon, authenticated, public;

drop trigger if exists on_report_auto_hide on public.reports;
create trigger on_report_auto_hide
  after insert on public.reports
  for each row execute procedure public.auto_hide_reported();
