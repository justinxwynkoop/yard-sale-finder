-- Stop clients from spoofing the "Phone verified" trust badge.
--
-- usePhoneVerification confirms the number via Supabase Auth phone OTP
-- (verifyOtp type 'phone_change'), which sets auth.users.phone_confirmed_at —
-- then writes profiles.phone_verified = true client-side. But the profiles
-- UPDATE RLS policy has no column lock, so any authenticated user could
--   supabase.from('profiles').update({ phone_verified: true })
-- and light the badge without ever verifying a phone.
--
-- Fix (mirrors enforce_email_verified from 20260612130000): a BEFORE UPDATE
-- trigger that always overwrites phone_verified with the real auth state, so
-- the client value is ignored. The legit flow still works — verifyOtp sets
-- phone_confirmed_at first, so the subsequent profile write resolves to true.

create or replace function public.enforce_phone_verified()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.phone_verified := coalesce(
    (select u.phone_confirmed_at is not null from auth.users u where u.id = new.id),
    false
  );
  return new;
end;
$$;

revoke execute on function public.enforce_phone_verified() from anon, authenticated, public;

drop trigger if exists enforce_phone_verified on public.profiles;
create trigger enforce_phone_verified
  before update on public.profiles
  for each row
  execute function public.enforce_phone_verified();

-- Correct any rows that are already out of sync (spoofed or stale).
update public.profiles p
set phone_verified = (u.phone_confirmed_at is not null)
from auth.users u
where u.id = p.id
  and p.phone_verified is distinct from (u.phone_confirmed_at is not null);
