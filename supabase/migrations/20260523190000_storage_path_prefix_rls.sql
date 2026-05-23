-- Tighten storage write RLS from "any signed-in user" to
-- "any signed-in user, only under their own {user_id}/ prefix".
--
-- The prior migration (20260523170000_storage_policies_final) restored
-- write access with `auth.uid() is not null` as a conservative step
-- after the diagnostic round that finally cracked the upload bug. Now
-- that uploads are confirmed working end-to-end, we move to the right
-- long-term model: path-prefix scoping.
--
-- Object names in our app are always written as `{user_id}/{filename}`
-- (see CreateSaleScreen, CreateListingScreen, AvatarEditor's
-- avatarUpload). So `(storage.foldername(name))[1]` is the user's UUID
-- string, and matching it against auth.uid() means User A literally
-- cannot upload, update, or delete an object inside User B's folder.
--
-- The avatars-bucket-only path-prefix policies from
-- 20260522160000_avatars_bucket remain in place; they're identical in
-- effect to the avatars portion of the new policies below. RLS
-- combines policies with OR, so having two identical permits doesn't
-- widen access -- it just means there are two equivalent paths to the
-- same yes/no decision.

drop policy if exists "Signed-in users can upload to app buckets" on storage.objects;
create policy "Users can upload under their own prefix"
  on storage.objects for insert with check (
    bucket_id in ('sale-media', 'listing-media', 'avatars')
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Signed-in users can update in app buckets" on storage.objects;
create policy "Users can update objects under their own prefix"
  on storage.objects for update using (
    bucket_id in ('sale-media', 'listing-media', 'avatars')
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Symmetrical DELETE: lets a user clean up their own files (e.g. when
-- they remove a photo from a sale or replace an avatar). Listing
-- creators can do this for media they uploaded, but not for media in
-- other users' folders.
drop policy if exists "Users can delete objects under their own prefix" on storage.objects;
create policy "Users can delete objects under their own prefix"
  on storage.objects for delete using (
    bucket_id in ('sale-media', 'listing-media', 'avatars')
    and auth.uid()::text = (storage.foldername(name))[1]
  );
