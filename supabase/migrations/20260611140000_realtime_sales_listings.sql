-- Enroll sales + listings in the Realtime publication.
--
-- useSales / useListings subscribe to postgres_changes on these tables to
-- live-update the Discover map and the Listings grid. But the tables were
-- never added to the supabase_realtime publication (only profiles,
-- conversations, and messages were), so the channels connected and then
-- silently received NOTHING — a newly posted sale/listing never appeared
-- until the screen remounted. This makes the live subscriptions actually
-- fire.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'sales'
  ) then
    alter publication supabase_realtime add table public.sales;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'listings'
  ) then
    alter publication supabase_realtime add table public.listings;
  end if;
end $$;
