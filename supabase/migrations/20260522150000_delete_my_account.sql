-- Self-service account deletion endpoint.
--
-- Required by Apple App Store Guideline 5.1.1(v) for any app that
-- lets users create an account: there must be an in-app way to
-- delete that account. Email-only deletion is rejected.
--
-- This function is invoked by an authenticated client via
-- POST /rest/v1/rpc/delete_my_account. It looks up the caller via
-- auth.uid(), deletes their row from auth.users, and the existing
-- ON DELETE CASCADE references on profiles, sales, sale_media,
-- favorites, listings, and listing_media clean up the rest.
--
-- SECURITY DEFINER is required because deleting from auth.users
-- needs privileges the authenticated role doesn't have. The function
-- never trusts client-supplied input -- the user_id always comes
-- from auth.uid() inside the function body -- so a caller can only
-- ever delete their own account.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Cascade does the rest: profile, sales, sale_media, favorites,
  -- listings, listing_media. We delete from auth.users last because
  -- profiles.id references it and we want the cleanup ordering to
  -- match the cascade.
  delete from auth.users where id = uid;
end;
$$;

-- Lock down execution: only signed-in users can call this, never
-- anon. Public/anon should never be able to delete accounts.
revoke execute on function public.delete_my_account() from public, anon;
grant   execute on function public.delete_my_account() to authenticated;
