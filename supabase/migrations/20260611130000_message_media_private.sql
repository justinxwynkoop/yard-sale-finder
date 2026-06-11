-- Lock message photos down to the two conversation participants.
--
-- The message-media bucket was public (URL-secret). DM photos can be
-- sensitive, so make the bucket PRIVATE and gate reads to participants:
-- only a buyer/seller of the conversation can SELECT an object (and thus
-- mint a signed URL for it). The client now stores the storage PATH in
-- messages.image_url and generates a short-lived signed URL at render.
--
-- Object paths are `${userId}/${conversationId}/${file}`, so
-- foldername(name)[2] is the conversation id.

update storage.buckets set public = false where id = 'message-media';

-- Replace the public read policy with a participant-only one.
drop policy if exists "Anyone can view message media" on storage.objects;
drop policy if exists "Participants can read message media" on storage.objects;
create policy "Participants can read message media"
  on storage.objects for select using (
    bucket_id = 'message-media'
    and exists (
      select 1
      from public.conversations c
      where c.id = ((storage.foldername(name))[2])::uuid
        and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  );

-- (insert/delete policies from the previous migration stay: they already
--  require auth.uid() = foldername(name)[1], i.e. you own your folder.)
