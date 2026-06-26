-- SECURITY (part 2): drop the PII columns from the world-readable profiles
-- table now that they live in the owner-only private_profiles table and the
-- client reads/writes it (useProfile merge + split). handle_new_user wrote
-- email into profiles on signup, so repoint it first: create the profiles row
-- without email and seed the email into private_profiles. (sync_email_verified
-- only touches email_verified, which stays on profiles, so it's unaffected.)

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, display_name, avatar_url, email_verified)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    new.email_confirmed_at is not null
  )
  on conflict (id) do nothing;

  insert into public.private_profiles (user_id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (user_id) do update set email = excluded.email, updated_at = now();

  return new;
end;
$$;

alter table public.profiles
  drop column if exists email,
  drop column if exists phone,
  drop column if exists birthdate,
  drop column if exists zip_code;
