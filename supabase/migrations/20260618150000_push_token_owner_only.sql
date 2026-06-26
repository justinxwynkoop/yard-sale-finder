-- SECURITY: move the device push token off the world-readable profiles table.
--
-- profiles has `SELECT using (true)`, so expo_push_token — a device-targeting
-- capability (anyone with it can push-spam/track that device) — was readable
-- by every signed-in user, and the profile:profiles(*) embeds shipped it to
-- clients. Move it into an owner-only table. Tokens are written via the
-- SECURITY DEFINER RPCs below and read by the edge functions via the service
-- role, so this table needs NO client-facing policies.
--
-- This migration keeps profiles.expo_push_token in place (now stale) so the
-- currently-deployed edge functions keep working; a follow-up migration drops
-- the column AFTER those functions are redeployed to read the new table.

create table if not exists public.user_push_tokens (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  token      text not null,
  updated_at timestamptz not null default now()
);
alter table public.user_push_tokens enable row level security;
-- Intentionally no policies: only service_role + the SECURITY DEFINER RPCs
-- touch this table. Clients get their token from Expo, never from the DB.

-- Backfill from the existing column.
insert into public.user_push_tokens (user_id, token)
select id, expo_push_token from public.profiles where expo_push_token is not null
on conflict (user_id) do update set token = excluded.token, updated_at = now();

-- A device token belongs to exactly one user: strip it off anyone else, then
-- upsert for the caller.
create or replace function public.set_push_token(p_token text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_token is null or length(p_token) = 0 then return; end if;
  delete from public.user_push_tokens where token = p_token and user_id <> auth.uid();
  insert into public.user_push_tokens (user_id, token, updated_at)
  values (auth.uid(), p_token, now())
  on conflict (user_id) do update set token = excluded.token, updated_at = now();
end; $$;

create or replace function public.clear_push_token()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.user_push_tokens where user_id = auth.uid();
end; $$;

revoke execute on function public.set_push_token(text) from anon, public;
revoke execute on function public.clear_push_token() from anon, public;
grant execute on function public.set_push_token(text) to authenticated;
grant execute on function public.clear_push_token() to authenticated;

-- nearby_sale_recipients: read tokens from the new table (return column name
-- kept as expo_push_token so the edge function is unchanged on that point).
create or replace function public.nearby_sale_recipients(p_sale_id uuid)
returns table (expo_push_token text)
language sql security definer set search_path = public, pg_temp as $$
  with s as (
    select user_id, latitude, longitude from public.sales where id = p_sale_id
  )
  select t.token
  from s
  cross join public.user_locations ul
  join public.profiles p on p.id = ul.user_id
  join public.user_push_tokens t on t.user_id = ul.user_id
  where p.notify_sales_nearby is true
    and ul.user_id <> s.user_id
    and not exists (
      select 1 from public.follows f
      where f.follower_id = ul.user_id and f.followed_id = s.user_id
    )
    and (
      3958.7613 * acos(greatest(-1.0, least(1.0,
        cos(radians(s.latitude)) * cos(radians(ul.lat)) *
        cos(radians(ul.lng) - radians(s.longitude)) +
        sin(radians(s.latitude)) * sin(radians(ul.lat))
      )))
    ) <= coalesce(p.nearby_radius_miles, 5);
$$;
revoke execute on function public.nearby_sale_recipients(uuid) from anon, authenticated, public;
grant execute on function public.nearby_sale_recipients(uuid) to service_role;
