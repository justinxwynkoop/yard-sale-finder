-- Photo messaging: let a message carry an image (with or without text).
--
-- Previously `body` was NOT NULL with a 1..2000 length check, so an
-- image-only message was impossible. We relax that: a message is valid
-- if it has a body (1..2000 chars) OR an image_url (or both).

alter table public.messages
  add column if not exists image_url text;

alter table public.messages
  alter column body drop not null;

-- Drop the old inline body check (auto-named messages_body_check) and
-- replace with one that also accepts image-only messages.
alter table public.messages
  drop constraint if exists messages_body_check;

alter table public.messages
  add constraint messages_body_or_image_check check (
    (body is null or length(trim(body)) between 1 and 2000)
    and (body is not null or image_url is not null)
  );

-- ─── Storage: message-media bucket ──────────────────────────────────
-- Public bucket with unguessable per-(user, conversation) paths, mirroring
-- sale-media / listing-media. NOTE: like the rest of the app's media, this
-- is URL-secret, not access-controlled — anyone with the (random) URL can
-- view it. A true-private bucket + signed URLs is a follow-up if DM photos
-- need hard access control.
insert into storage.buckets (id, name, public)
values ('message-media', 'message-media', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can view message media" on storage.objects;
create policy "Anyone can view message media"
  on storage.objects for select using (bucket_id = 'message-media');

drop policy if exists "Authenticated users can upload message media" on storage.objects;
create policy "Authenticated users can upload message media"
  on storage.objects for insert with check (
    bucket_id = 'message-media'
    and auth.role() = 'authenticated'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete their own message media" on storage.objects;
create policy "Users can delete their own message media"
  on storage.objects for delete using (
    bucket_id = 'message-media' and auth.uid()::text = (storage.foldername(name))[1]
  );
