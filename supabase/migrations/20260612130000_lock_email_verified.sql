-- Stop clients from spoofing the "Email verified" trust badge.
--
-- profiles.email_verified is meant to mirror auth.users.email_confirmed_at
-- (migration 20260612120000), but the profiles UPDATE RLS policy has no
-- column lock, so any authenticated user could
--   supabase.from('profiles').update({ email_verified: true })
-- and light the badge without ever confirming their email.
--
-- Fix: a BEFORE UPDATE trigger that ALWAYS overwrites email_verified with
-- the real auth state on every profiles update — regardless of what the
-- client passed. This needs no column-level grant juggling (column REVOKE
-- is a no-op while the table-level UPDATE grant exists) and stays
-- consistent with the auth->profile sync trigger (which writes the same
-- value). SECURITY DEFINER so it can read auth.users.
--
-- NOTE: phone_verified has the same client-writable hole, but it's written
-- by usePhoneVerification after the SMS OTP; locking it the same way
-- depends on phone-change confirmations setting auth.users.phone_confirmed_at
-- — verify that before extending this trigger to phone_verified. Tracked
-- as a follow-up.

create or replace function public.enforce_email_verified()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- coalesce so a profile with no matching auth.users row (shouldn't
  -- happen) can't violate the NOT NULL column with a NULL subquery result.
  new.email_verified := coalesce(
    (select u.email_confirmed_at is not null from auth.users u where u.id = new.id),
    false
  );
  return new;
end;
$$;

revoke execute on function public.enforce_email_verified() from anon, authenticated, public;

drop trigger if exists enforce_email_verified on public.profiles;
create trigger enforce_email_verified
  before update on public.profiles
  for each row
  execute function public.enforce_email_verified();
