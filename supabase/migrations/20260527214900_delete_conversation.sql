-- Allow conversation participants to delete their own conversations.
--
-- The original messaging migration deliberately omitted a DELETE policy
-- ("No direct INSERT/UPDATE/DELETE policies for end users") to keep the
-- seller_id field tamper-proof.  That restriction made sense for INSERT
-- and UPDATE, but there is no security concern with letting a participant
-- remove their own thread -- they're only deleting data they already have
-- full SELECT access to.
--
-- Messages cascade automatically: messages.conversation_id has
-- ON DELETE CASCADE, so deleting the conversation row removes all of
-- its messages in a single DB round trip with no extra client work.

drop policy if exists "Participants can delete their conversations"
  on public.conversations;

create policy "Participants can delete their conversations"
  on public.conversations for delete using (
    auth.uid() = buyer_id or auth.uid() = seller_id
  );
