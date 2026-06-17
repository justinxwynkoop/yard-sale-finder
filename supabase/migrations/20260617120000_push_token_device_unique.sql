-- A device's Expo push token must belong to exactly ONE profile.
--
-- usePushNotifications writes the device's token to profiles.expo_push_token
-- for the signed-in user, but never removes it from any OTHER profile that
-- previously used the same device. Expo tokens are per-DEVICE, not per-user,
-- so a device that has signed into multiple accounts ends up with its token on
-- every one of those profiles. Result: a message notification for account A is
-- delivered to the device even when it's currently signed in as account B;
-- tapping it tries to open A's conversation, which RLS hides from B, so the
-- recipient sees "Conversation not found."
--
-- The profiles UPDATE RLS policy is owner-only, so a client cannot strip the
-- token off other users' rows. These SECURITY DEFINER RPCs do it server-side:
--   set_push_token(token)  — claim a token for the caller, clearing it elsewhere
--   clear_push_token()     — drop the caller's token (on sign-out)

create or replace function public.set_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_token is null or length(p_token) = 0 then
    return;
  end if;

  -- A device token can only belong to one profile — strip it off everyone
  -- else before claiming it for the caller.
  update public.profiles
     set expo_push_token = null
   where expo_push_token = p_token
     and id <> auth.uid();

  -- Assign to the caller (no-op write avoided via the distinct check).
  update public.profiles
     set expo_push_token = p_token
   where id = auth.uid()
     and expo_push_token is distinct from p_token;
end;
$$;

create or replace function public.clear_push_token()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles
     set expo_push_token = null
   where id = auth.uid();
end;
$$;

revoke execute on function public.set_push_token(text) from anon, public;
revoke execute on function public.clear_push_token() from anon, public;
grant execute on function public.set_push_token(text) to authenticated;
grant execute on function public.clear_push_token() to authenticated;
