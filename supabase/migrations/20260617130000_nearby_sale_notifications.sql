-- "New sale near you" notifications: push when a sale is posted within a
-- user's chosen radius, independent of who they follow.
--
-- Privacy is the crux: profiles is world-readable, so user coordinates CANNOT
-- live there. They go in a dedicated user_locations table with owner-only RLS,
-- and the notify-new-sale edge function reads them with the service role to
-- compute proximity. The client only stores location while the user has the
-- "nearby" toggle on, and deletes it when they turn it off.

-- 1. Per-user coarse location (rounded ~1km client-side). Owner-only.
create table if not exists public.user_locations (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  lat        double precision not null,
  lng        double precision not null,
  updated_at timestamptz not null default now()
);

alter table public.user_locations enable row level security;

drop policy if exists "Users read own location" on public.user_locations;
create policy "Users read own location" on public.user_locations
  for select using (auth.uid() = user_id);

drop policy if exists "Users insert own location" on public.user_locations;
create policy "Users insert own location" on public.user_locations
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users update own location" on public.user_locations;
create policy "Users update own location" on public.user_locations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users delete own location" on public.user_locations;
create policy "Users delete own location" on public.user_locations
  for delete using (auth.uid() = user_id);

-- 2. Per-user radius preference (miles). Not sensitive — lives on profiles
--    next to the notify_sales_nearby toggle.
alter table public.profiles
  add column if not exists nearby_radius_miles integer not null default 5;

-- 3. Recipients for a new sale's "nearby" push: opted-in users whose stored
--    location is within their radius of the sale, EXCLUDING the poster and
--    anyone who already follows them (those get the follower push instead, so
--    no double-buzz). Haversine in plain SQL — no PostGIS/earthdistance needed.
--    SECURITY DEFINER so it can read user_locations regardless of caller;
--    locked to service_role (the edge function), never exposed to clients.
create or replace function public.nearby_sale_recipients(p_sale_id uuid)
returns table (expo_push_token text)
language sql
security definer
set search_path = public, pg_temp
as $$
  with s as (
    select user_id, latitude, longitude
    from public.sales
    where id = p_sale_id
  )
  select p.expo_push_token
  from s
  cross join public.user_locations ul
  join public.profiles p on p.id = ul.user_id
  where p.expo_push_token is not null
    and p.notify_sales_nearby is true
    and ul.user_id <> s.user_id
    and not exists (
      select 1 from public.follows f
      where f.follower_id = ul.user_id and f.followed_id = s.user_id
    )
    and (
      3958.7613 * acos(
        greatest(-1.0, least(1.0,
          cos(radians(s.latitude)) * cos(radians(ul.lat)) *
          cos(radians(ul.lng) - radians(s.longitude)) +
          sin(radians(s.latitude)) * sin(radians(ul.lat))
        ))
      )
    ) <= coalesce(p.nearby_radius_miles, 5);
$$;

revoke execute on function public.nearby_sale_recipients(uuid) from anon, authenticated, public;
grant execute on function public.nearby_sale_recipients(uuid) to service_role;
