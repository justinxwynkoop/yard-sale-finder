-- Backfill profile rows for any auth.users that don't have one.
--
-- This is needed for users who signed up before the
-- handle_new_user() trigger was installed (the initial migration was
-- applied after they signed up). Going forward, the trigger handles
-- this automatically on every new signup.

insert into public.profiles (id, email, display_name, avatar_url)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name'
  ),
  u.raw_user_meta_data->>'avatar_url'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
