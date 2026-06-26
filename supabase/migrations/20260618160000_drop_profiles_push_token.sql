-- SECURITY (part 2): drop the now-unused, world-readable push-token column.
-- The token moved to the owner-only user_push_tokens table in
-- 20260618150000, the RPCs were repointed, and the notify-* edge functions
-- were redeployed to read the new table. profiles.expo_push_token is now
-- stale and exposed via the public SELECT policy, so remove it.
alter table public.profiles drop column if exists expo_push_token;
