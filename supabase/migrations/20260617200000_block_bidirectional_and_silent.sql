-- Make blocking actually work: BIDIRECTIONAL and SILENT.
--
-- Today the block only stops NEW message sends (messages INSERT policy +
-- start_conversation, both already bidirectional). But it hides nothing:
-- existing threads/messages stay readable, and content visibility filtering is
-- client-side AND one-directional (only "people I blocked"). So a blocked user
-- still sees the blocker's threads, profile, sales and listings.
--
-- This migration:
--  1. my_blocked_user_ids() — a SECURITY DEFINER helper returning every uuid in
--     EITHER block relationship with the caller, so the client can build a
--     bidirectional block set WITHOUT exposing who-blocked-whom (the
--     blocked_users SELECT RLS stays blocker-only, so a blocked user can never
--     read the row that proves they were blocked).
--  2. Adds a bidirectional block predicate to the conversations + messages
--     SELECT policies, so an existing thread and its whole history simply
--     RETURN ZERO ROWS for both parties once a block exists — silent by
--     construction (a hidden row is indistinguishable from a deleted one).

create or replace function public.my_blocked_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.blocked_id from public.blocked_users b where b.blocker_id = auth.uid()
  union
  select b.blocker_id from public.blocked_users b where b.blocked_id = auth.uid()
$$;

revoke execute on function public.my_blocked_user_ids() from public, anon;
grant execute on function public.my_blocked_user_ids() to authenticated;

-- Hide existing threads on BOTH sides once a block exists either direction.
drop policy if exists "Participants can read their conversations" on public.conversations;
create policy "Participants can read their conversations"
  on public.conversations for select using (
    (auth.uid() = buyer_id or auth.uid() = seller_id)
    and not exists (
      select 1 from public.blocked_users b
      where (b.blocker_id = conversations.buyer_id and b.blocked_id = conversations.seller_id)
         or (b.blocker_id = conversations.seller_id and b.blocked_id = conversations.buyer_id)
    )
  );

-- Hide existing messages on BOTH sides too.
drop policy if exists "Participants can read their messages" on public.messages;
create policy "Participants can read their messages"
  on public.messages for select using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
        and not exists (
          select 1 from public.blocked_users b
          where (b.blocker_id = c.buyer_id and b.blocked_id = c.seller_id)
             or (b.blocker_id = c.seller_id and b.blocked_id = c.buyer_id)
        )
    )
  );
