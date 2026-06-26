-- SECURITY: move PII (email, phone, birthdate, zip_code) off the
-- world-readable profiles table into an owner-only sibling. profiles has
-- SELECT using(true), so these were readable by every signed-in user and
-- shipped via profile:profiles(*) embeds.
--
-- This migration creates the table, backfills it, and adds owner-only RLS.
-- It KEEPS the profiles columns for now so the app keeps working while the
-- client is updated to read/write the new table; a follow-up migration drops
-- them. The profile-completion gate depends on birthdate + zip_code, so the
-- client (useProfile) merges this table back into the profile object.

create table if not exists public.private_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  phone      text,
  birthdate  date,
  zip_code   text,
  updated_at timestamptz not null default now()
);

-- Backfill EVERY profile row (even all-null) so the client merge always finds
-- a row — no missing-row edge case that could blank the completion gate.
insert into public.private_profiles (user_id, email, phone, birthdate, zip_code)
select id, email, phone, birthdate, zip_code from public.profiles
on conflict (user_id) do update
  set email = excluded.email, phone = excluded.phone,
      birthdate = excluded.birthdate, zip_code = excluded.zip_code,
      updated_at = now();

alter table public.private_profiles enable row level security;

drop policy if exists "Read own private profile" on public.private_profiles;
create policy "Read own private profile" on public.private_profiles
  for select using ((select auth.uid()) = user_id);

drop policy if exists "Insert own private profile" on public.private_profiles;
create policy "Insert own private profile" on public.private_profiles
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Update own private profile" on public.private_profiles;
create policy "Update own private profile" on public.private_profiles
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Delete own private profile" on public.private_profiles;
create policy "Delete own private profile" on public.private_profiles
  for delete using ((select auth.uid()) = user_id);
