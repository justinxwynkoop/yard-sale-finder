-- DIAGNOSTIC migration: allow anyone (anon included) to upload to the
-- app buckets. We do NOT want to ship this long-term -- it's
-- temporarily loosened so we can confirm whether the storage RLS
-- system is what's rejecting the upload, or whether something else
-- in the storage pipeline (JWT verification, bucket-level config,
-- etc.) is at fault.
--
-- If uploads succeed with this policy in place, the issue was that
-- auth.uid() wasn't resolving the way it does for table inserts on
-- the same session -- a Supabase storage quirk we'll need to work
-- around (e.g., per-user-folder check using request.jwt.claim.sub
-- directly, or moving uploads through a server-side function with
-- the service role).
--
-- If uploads still fail with this policy, the rejection isn't coming
-- from storage.objects RLS at all -- it's the storage service itself
-- declining the request (bucket config, file size limit, mime type,
-- etc.) -- and we need to look there instead.

drop policy if exists "Signed-in users can upload to app buckets" on storage.objects;
drop policy if exists "Anyone can upload to app buckets" on storage.objects;
create policy "Anyone can upload to app buckets"
  on storage.objects for insert
  with check (
    bucket_id in ('sale-media', 'listing-media', 'avatars')
  );

drop policy if exists "Signed-in users can update in app buckets" on storage.objects;
drop policy if exists "Anyone can update in app buckets" on storage.objects;
create policy "Anyone can update in app buckets"
  on storage.objects for update
  using (
    bucket_id in ('sale-media', 'listing-media', 'avatars')
  );
