-- Blocking stopped the BLOCKER, not the blocked. Backwards, and load-bearing.
--
-- "Participants can send messages" gates on:
--     not exists (select 1 from public.blocked_users b where ...)
--
-- That subquery runs under the INSERTING user's RLS context, and
-- blocked_users' select policy is `auth.uid() = blocker_id` -- you can only
-- read blocks YOU created. So the blocked party queries blocked_users, sees
-- zero rows, `not exists` returns true, and the check passes for exactly the
-- person it exists to stop. Meanwhile the blocker DOES see their own row and
-- is the one who gets refused.
--
-- Observed in production 2026-08-31: a user blocked someone at 20:01:34 and
-- received another message from them at 20:02:58.
--
-- Fix: do the lookup in a SECURITY DEFINER function so it sees both rows,
-- the way send_offer / start_conversation / release_hold already do (all
-- SECURITY DEFINER, all correct -- which is why offers were blocked properly
-- while plain messages were not).
--
-- The function answers ONLY about the caller and one other party. It never
-- takes an arbitrary pair, so it cannot be used to probe whether two other
-- people have blocked each other.

create or replace function public.is_blocked_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1
    from public.blocked_users b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = p_other)
       or (b.blocker_id = p_other and b.blocked_id = (select auth.uid()))
  );
$function$;

revoke all on function public.is_blocked_with(uuid) from public;
grant execute on function public.is_blocked_with(uuid) to authenticated;

-- Recreate the INSERT policy using it. Everything else about the policy is
-- preserved verbatim -- the column pins (kind/offer_amount/offer_status/
-- recipient_id) are what keep a participant from forging an offer or a
-- system notice, so they must survive this edit.
drop policy if exists "Participants can send messages" on public.messages;

create policy "Participants can send messages"
  on public.messages
  for insert
  with check (
    (select auth.uid()) = sender_id
    and exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id
        and (
          c.buyer_id = (select auth.uid())
          or c.seller_id = (select auth.uid())
        )
        -- The other participant, whichever side the sender is on.
        and not public.is_blocked_with(
          case
            when c.buyer_id = (select auth.uid()) then c.seller_id
            else c.buyer_id
          end
        )
    )
    and kind = 'text'
    and offer_amount is null
    and offer_status is null
    and recipient_id is null
  );
