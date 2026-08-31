-- The column-level REVOKE in 20260831204711 does not do what it looks like.
--
--   revoke update (is_operator, suspended_at) on public.profiles from authenticated;
--
-- Postgres column privileges only subtract from column-level GRANTS. anon and
-- authenticated hold a TABLE-level UPDATE grant on profiles, which covers every
-- column, and a column revoke leaves that untouched. Verified against the live
-- database as a normal user: `update profiles set is_operator = true where
-- id = <self>` succeeded. Anyone could have made themselves a moderator.
--
-- Two ways to close it. Revoking the table grant and re-granting UPDATE on the
-- 24 permitted columns works, but silently makes any column added later
-- read-only for clients -- a trap that would surface as an unrelated bug months
-- from now. A trigger names exactly the two protected columns and stays correct
-- as the table grows, so that is what this uses.
create or replace function public.guard_moderation_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if new.is_operator is distinct from old.is_operator
     or new.suspended_at is distinct from old.suspended_at then
    -- auth.uid() is null for service-role and direct SQL, both already fully
    -- privileged -- that is the bootstrap path for the first operator.
    --
    -- Otherwise only an existing operator may move these. mod_set_suspended is
    -- SECURITY DEFINER but does NOT change auth.uid(), so the caller is still
    -- the operator and passes; every other caller fails.
    if (select auth.uid()) is not null and not public.is_operator() then
      raise exception 'cannot modify moderation columns'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists guard_moderation_columns on public.profiles;
create trigger guard_moderation_columns
  before update on public.profiles
  for each row execute function public.guard_moderation_columns();
