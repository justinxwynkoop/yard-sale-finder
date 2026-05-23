-- Final storage policies after the diagnostic round.
--
-- Root cause of the photo-upload failure: the `20260522130000_
-- security_hardening` migration dropped the "Anyone can view sale
-- media" and "Anyone can view listing media" SELECT policies on
-- storage.objects. It reasoned that public buckets serve files via
-- direct URL without RLS -- which is true -- but missed that the
-- storage service's `upsert: true` code path runs an internal SELECT
-- against storage.objects to detect existing rows. With no SELECT
-- policy applicable to the bucket for an authenticated user, that
-- pre-flight check fails RLS, the whole upload aborts with
-- "new row violates row-level security policy", and the actual
-- INSERT policy is never evaluated.
--
-- Public buckets already serve every uploaded file via direct URL
-- without RLS, so restoring these SELECT policies doesn't expose
-- anything that wasn't already exposed. It only re-enables the
-- list/exists semantics that the upload pipeline needs.

create policy "Anyone can view sale media"
  on storage.objects for select using (bucket_id = 'sale-media');

create policy "Anyone can view listing media"
  on storage.objects for select using (bucket_id = 'listing-media');

-- Restore proper write policies (tightening from the diagnostic
-- "anyone can upload" back down to authenticated users only). The
-- path-prefix check is the right long-term model, but pin it to
-- auth.uid() being non-null first; we can move to the prefix check
-- once we've verified uploads work end-to-end again.

drop policy if exists "Anyone can upload to app buckets" on storage.objects;
drop policy if exists "Signed-in users can upload to app buckets" on storage.objects;
create policy "Signed-in users can upload to app buckets"
  on storage.objects for insert with check (
    bucket_id in ('sale-media', 'listing-media', 'avatars')
    and auth.uid() is not null
  );

drop policy if exists "Anyone can update in app buckets" on storage.objects;
drop policy if exists "Signed-in users can update in app buckets" on storage.objects;
create policy "Signed-in users can update in app buckets"
  on storage.objects for update using (
    bucket_id in ('sale-media', 'listing-media', 'avatars')
    and auth.uid() is not null
  );
