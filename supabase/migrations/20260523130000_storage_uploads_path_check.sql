-- Tighten + simplify storage upload policies for sale-media and
-- listing-media.
--
-- The previous policies required `auth.role() = 'authenticated'`,
-- which was failing the RLS check for at least one signed-in user
-- whose `auth.uid()` was valid -- presenting as a generic
-- "new row violates row-level security policy" on photo upload after
-- the sale/listing row itself had been created.
--
-- Replace with a path-prefix match: each user can only write to
-- objects whose first folder is their own user id. That's both the
-- pattern the DELETE policy already uses and the safer model
-- (prevents one signed-in user from uploading into another user's
-- folder), so this trades nothing for fixing the bug.

drop policy if exists "Authenticated users can upload sale media" on storage.objects;
drop policy if exists "Users can upload their own sale media" on storage.objects;
create policy "Users can upload their own sale media"
  on storage.objects for insert with check (
    bucket_id = 'sale-media'
    and auth.uid() is not null
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Authenticated users can upload listing media" on storage.objects;
drop policy if exists "Users can upload their own listing media" on storage.objects;
create policy "Users can upload their own listing media"
  on storage.objects for insert with check (
    bucket_id = 'listing-media'
    and auth.uid() is not null
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Mirror the same shape on the UPDATE side so upsert: true uploads
-- (which the create flows use) don't trip a separate policy when
-- replacing an existing object.
drop policy if exists "Users can update their own sale media" on storage.objects;
create policy "Users can update their own sale media"
  on storage.objects for update using (
    bucket_id = 'sale-media'
    and auth.uid() is not null
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update their own listing media" on storage.objects;
create policy "Users can update their own listing media"
  on storage.objects for update using (
    bucket_id = 'listing-media'
    and auth.uid() is not null
    and auth.uid()::text = (storage.foldername(name))[1]
  );
