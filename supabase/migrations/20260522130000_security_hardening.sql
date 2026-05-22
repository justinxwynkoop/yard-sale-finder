-- Address Supabase database-linter security warnings.
--
-- Findings:
--   * function_search_path_mutable on handle_new_user, handle_updated_at
--   * anon/authenticated can execute SECURITY DEFINER functions
--     handle_new_user and end_past_sales via /rest/v1/rpc/
--   * Public storage buckets sale-media and listing-media have a broad
--     SELECT policy on storage.objects that enables LIST (object reads
--     via public URL still work without it).

-- =====================================================================
-- 1) Lock down search_path on our trigger functions.
--
-- Without an explicit search_path a SECURITY DEFINER function inherits
-- the caller's setting, which an attacker can manipulate to resolve
-- "profiles" or "now()" to objects they control. Pinning it to
-- (public, pg_temp) closes that vector.
-- =====================================================================

alter function public.handle_new_user()    set search_path = public, pg_temp;
alter function public.handle_updated_at()  set search_path = public, pg_temp;

-- end_past_sales already has `set search_path = public` from its own
-- migration; re-set explicitly to be uniform and include pg_temp.
alter function public.end_past_sales()     set search_path = public, pg_temp;

-- =====================================================================
-- 2) Revoke RPC EXECUTE on functions that aren't meant to be called
-- from the client.
--
-- These are SECURITY DEFINER functions exposed at
-- POST /rest/v1/rpc/<name> by default. Triggers still fire as the
-- function owner regardless of these grants, and pg_cron runs as the
-- postgres role, so the actual callers are unaffected.
-- =====================================================================

revoke execute on function public.handle_new_user()   from anon, authenticated, public;
revoke execute on function public.handle_updated_at() from anon, authenticated, public;
revoke execute on function public.end_past_sales()    from anon, authenticated, public;

-- =====================================================================
-- 3) Stop public buckets from advertising a full file listing.
--
-- A public bucket already serves objects by direct URL without any
-- storage.objects SELECT policy. The "anyone can view" policies only
-- add LIST capability (GET /storage/v1/object/list/<bucket>), which
-- lets clients enumerate every uploaded photo across every user.
-- Dropping the policies keeps existing URLs working but stops listing.
-- =====================================================================

drop policy if exists "Anyone can view sale media"    on storage.objects;
drop policy if exists "Anyone can view listing media" on storage.objects;
