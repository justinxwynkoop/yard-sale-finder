-- Remove the losing half of an old rename on public.conversations.
--
-- The table carries two pairs of archive columns:
--
--   buyer_archived_at    / seller_archived_at     <- live
--   archived_by_buyer_at / archived_by_seller_at  <- orphaned
--
-- set_conversation_archived(p_conversation_id, p_archived) is what the app
-- calls (useInbox, for archive AND unarchive) and it writes the live pair.
-- The orphaned pair has zero references in the app, zero in any policy or
-- view, and zero non-null values across every row in production.
--
-- One function still referenced them: unarchive_conversation(), which sets
-- archived_by_*_at = null. Nothing calls it -- useInbox goes through
-- set_conversation_archived with p_archived => false -- and it is not in the
-- documented RPC list. Had anything called it, it would have silently done
-- nothing: clearing a column no reader ever consults, while the real
-- *_archived_at stayed set and the conversation stayed archived.
--
-- Dropping the function first, since it depends on the columns.
drop function if exists public.unarchive_conversation(uuid);

alter table public.conversations drop column if exists archived_by_buyer_at;
alter table public.conversations drop column if exists archived_by_seller_at;
