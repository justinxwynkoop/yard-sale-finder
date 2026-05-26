-- Enroll public.profiles in the Supabase realtime publication so the
-- useProfile() hook can subscribe to postgres_changes on it.
--
-- Without this, the realtime channel errors out with
--   "cannot add postgres_changes callbacks for realtime profile"
-- because the table isn't in supabase_realtime and the subscription
-- can't bind.
--
-- The hook needs realtime so that an UPDATE from CompleteProfileScreen
-- propagates to the navigator's independent useProfile instance --
-- which is what unblocks the user from CompleteProfile -> MainTabs
-- without a manual app relaunch.

alter publication supabase_realtime add table public.profiles;
