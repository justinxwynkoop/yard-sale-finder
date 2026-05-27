-- Push notification support.
--
-- Adds an expo_push_token column to profiles so the Edge Function can
-- look up a recipient's device token when a new message arrives.
-- The column is nullable -- users who haven't granted notification
-- permission (or are on a simulator) simply won't have a token and
-- the Edge Function skips them silently.
--
-- Users can only update their own token (via the existing UPDATE policy).
-- No new policy needed -- "Users can update their own profile" covers it.

alter table public.profiles
  add column if not exists expo_push_token text;

-- Index so the Edge Function's single-row lookup by user id stays fast
-- even as the table grows. (profiles.id is already the primary key so
-- this is really just a reminder comment -- the PK index covers it.)
