-- One-time data wipe: drop every row from the sales / listings
-- tables and their dependents. Profiles and auth.users are
-- untouched.
--
-- Storage objects: Supabase explicitly blocks direct DELETE on
-- storage.objects with `Direct deletion from storage tables is not
-- allowed. Use the Storage API instead.` -- a guardrail to prevent
-- orphan S3 files. So the metadata rows for sale-media /
-- listing-media stay until they're cleared via the Storage UI or
-- the Storage API. Public-facing URLs to the now-orphaned files
-- will 404 once a real sale exists at the same URL again (highly
-- improbable -- the path includes a UUID).

truncate table
  public.sale_media,
  public.sales,
  public.listing_media,
  public.listings,
  public.favorites
  restart identity cascade;
