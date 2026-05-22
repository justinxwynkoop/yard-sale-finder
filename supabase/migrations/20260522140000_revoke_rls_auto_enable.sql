-- Revoke RPC EXECUTE on rls_auto_enable from API roles.
--
-- This function was created outside our local migration history (most
-- likely by a Supabase Dashboard helper that bulk-enables RLS on new
-- tables). The Supabase database linter flags it under both
-- anon_security_definer_function_executable and
-- authenticated_security_definer_function_executable -- i.e. the
-- function is callable via /rest/v1/rpc/rls_auto_enable by anybody.
--
-- We don't want client code calling this. Revoking EXECUTE from the
-- API roles closes that exposure. Any internal Supabase tooling that
-- created the function runs as the `postgres` superuser and is not
-- affected by these grants.
--
-- IF EXISTS is used because the function may not be present on all
-- environments (e.g. if it was created on a per-project basis in the
-- Dashboard rather than via a migration that runs everywhere).

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from anon, authenticated, public';
  end if;
end $$;
