-- Enroll conversations in the Realtime publication.
--
-- The original messaging migration only enrolled public.messages.
-- Without conversations in the publication, UPDATE events (fired by
-- mark_conversation_read when it bumps buyer_last_read_at /
-- seller_last_read_at) are never delivered to connected clients.
--
-- Effect: when a user opens a conversation, mark_conversation_read is
-- called, which UPDATEs the conversations row.  The useInbox hook
-- subscribes to UPDATE on conversations and re-fetches on receipt,
-- clearing both the red dot on the inbox row and the Messages tab
-- badge in real time -- even on devices that never navigate back to
-- the InboxScreen.

alter publication supabase_realtime add table public.conversations;
