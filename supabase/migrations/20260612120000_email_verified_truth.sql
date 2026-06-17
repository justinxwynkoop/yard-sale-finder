-- Make profiles.email_verified honest.
--
-- The column was created `default true` (migration 20260609120000) on the
-- assumption that Supabase Auth always requires a confirmed email. That was
-- never enforced (the project ran with autoconfirm ON), so the "Email
-- verified" badge on the Account and Public Profile screens was lit for
-- EVERY user regardless of whether they'd actually confirmed anything.
--
-- This migration makes the flag mirror the real source of truth,
-- auth.users.email_confirmed_at:
--   1. new rows default to FALSE (confirmation flips it true),
--   2. handle_new_user() stamps the real state at signup — covers
--      OAuth / provider-verified sign-ups, which arrive already-confirmed
--      and would otherwise sit at FALSE until some later update,
--   3. a trigger keeps the flag in sync whenever email_confirmed_at
--      changes (email confirmation, or an email change that re-arms it),
--   4. every existing row is backfilled from auth truth.

-- 1. New rows are unverified until confirmation proves otherwise.
alter table public.profiles
  alter column email_verified set default false;

-- 2. Fold the real confirmation state into the signup trigger. We
--    re-declare the whole function (create or replace drops the SET
--    search_path hardening from 20260522130000, so re-apply it here).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url, email_verified)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    new.email_confirmed_at is not null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Re-apply the privilege hardening (create or replace preserves grants,
-- but keep this explicit so the function can't be invoked over the REST
-- RPC endpoint regardless of replacement order).
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- 3. Mirror later confirmations / email changes into the profile flag.
create or replace function public.sync_email_verified()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles
    set email_verified = (new.email_confirmed_at is not null)
    where id = new.id;
  return new;
end;
$$;

revoke execute on function public.sync_email_verified() from anon, authenticated, public;

drop trigger if exists on_auth_email_confirmed on auth.users;
create trigger on_auth_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is distinct from new.email_confirmed_at)
  execute function public.sync_email_verified();

-- 4. Backfill existing rows from auth truth.
update public.profiles p
  set email_verified = (u.email_confirmed_at is not null)
  from auth.users u
  where u.id = p.id
    and p.email_verified is distinct from (u.email_confirmed_at is not null);
