-- Add a "pending" status to listings (sale in progress / on hold), alongside
-- 'available' and 'sold'. The owner can set it from the item.

alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings
  add constraint listings_status_check
  check (status in ('available', 'sold', 'pending'));
