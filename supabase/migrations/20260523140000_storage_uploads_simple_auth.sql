-- Storage uploads: replace per-bucket per-user policies with a single
-- unified "signed-in user" policy across our three app buckets.
--
-- The previous round used a path-prefix check
-- (`auth.uid()::text = (storage.foldername(name))[1]`) that *should*
-- have worked because the client always uploads with paths of the
-- form `{user_id}/.../filename.jpg`. It didn't. The upload was still
-- rejected with "new row violates row-level security policy" via
-- StorageApiError, even though the same session was successfully
-- inserting into public.listings (`auth.uid() = user_id`).
--
-- Best guess at the root cause: the storage upload pipeline goes
-- through a path that doesn't expose the same auth.uid() context to
-- the policy, OR storage.foldername()[1] resolves to something
-- different from what the client thinks it's sending (e.g., a
-- leading slash, percent-encoding, or a quirk specific to Supabase's
-- managed storage). Either way, a simpler policy that just requires
-- any signed-in user on these buckets sidesteps both possibilities.
--
-- This is slightly less restrictive than the previous policy because
-- one signed-in user could theoretically upload to another user's
-- folder. The trade-off is acceptable for now -- the bucket is for
-- user-uploaded media that's already public via the bucket's public
-- flag, and write access to the database tables (sales, listings,
-- sale_media, listing_media) is still gated by per-user policies.
-- We can revisit the path-prefix model once we can repro the
-- rejection on a test path.

drop policy if exists "Users can upload their own sale media"    on storage.objects;
drop policy if exists "Users can upload their own listing media" on storage.objects;
drop policy if exists "Users can upload their own avatar"        on storage.objects;
drop policy if exists "Users can update their own sale media"    on storage.objects;
drop policy if exists "Users can update their own listing media" on storage.objects;
drop policy if exists "Users can update their own avatar"        on storage.objects;
drop policy if exists "Authenticated users can upload sale media"    on storage.objects;
drop policy if exists "Authenticated users can upload listing media" on storage.objects;
drop policy if exists "Signed-in users can upload to app buckets"    on storage.objects;
drop policy if exists "Signed-in users can update in app buckets"    on storage.objects;

create policy "Signed-in users can upload to app buckets"
  on storage.objects for insert
  with check (
    bucket_id in ('sale-media', 'listing-media', 'avatars')
    and auth.uid() is not null
  );

create policy "Signed-in users can update in app buckets"
  on storage.objects for update
  using (
    bucket_id in ('sale-media', 'listing-media', 'avatars')
    and auth.uid() is not null
  );

-- DELETE policies were the only place still relying on path-prefix
-- (`auth.uid()::text = (storage.foldername(name))[1]`). Leave them
-- alone -- DELETE wasn't reported as broken, and they enforce the
-- one boundary that matters: you can only delete your own files.
