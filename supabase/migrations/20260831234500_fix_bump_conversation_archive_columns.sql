-- URGENT. Migration 20260831214500 dropped conversations.archived_by_buyer_at /
-- archived_by_seller_at after checking which functions referenced them -- but
-- that check's output was truncated when it was read, and two more functions
-- were missed. One of them is a trigger on EVERY message insert:
--
--   bump_conversation_last_message  AFTER INSERT ON public.messages
--
-- so since that migration, every send in the app failed with
-- 'column "archived_by_buyer_at" of relation "conversations" does not exist'.
-- Messaging was down, not just the moderation action that surfaced it.
--
-- The deeper problem is the same rename this all comes from: both functions
-- were already writing the ORPHANED half of the pair. So
--
--   * bump_conversation_last_message cleared archived_by_*_at on a new
--     message, meaning "a new message un-archives the thread" never actually
--     worked -- the live buyer_archived_at/seller_archived_at stayed set and
--     the thread stayed archived.
--   * archive_conversation() set archived_by_buyer_at = now(), so it never
--     archived anything either. Nothing calls it: useInbox goes through
--     set_conversation_archived(p_archived => true). It is the third orphan
--     from that rename, after unarchive_conversation.
--
-- Pointing the trigger at the live columns therefore restores intended
-- behaviour that has never run, rather than merely removing a broken
-- reference. A reply to a thread you archived now brings it back, which is
-- what the original code was trying to say.
create or replace function public.bump_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  update public.conversations
  set
    last_message_at    = new.created_at,
    buyer_archived_at  = null,
    seller_archived_at = null
  where id = new.conversation_id;
  return new;
end;
$fn$;

-- Third orphan from the rename. Dropped rather than repaired: repairing it
-- would leave two functions that archive a conversation, and the one the app
-- actually calls already handles both directions.
drop function if exists public.archive_conversation(uuid);
