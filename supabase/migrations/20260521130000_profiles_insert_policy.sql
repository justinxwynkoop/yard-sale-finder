-- Allow users to insert their own profile row.
--
-- The handle_new_user() trigger normally creates the profile on signup
-- (as security definer, bypassing RLS). But CompleteProfileScreen calls
-- supabase.from('profiles').upsert(...) during onboarding, which always
-- emits an INSERT statement -- even when the row already exists and
-- ON CONFLICT will turn it into an UPDATE, Postgres still checks the
-- INSERT policy first. Without one, RLS rejects the request with
-- 'new row violates row-level security policy for table "profiles"'.
--
-- Restricting the insert to auth.uid() = id is the same constraint
-- we already enforce on update, so this doesn't widen the trust model.

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);
