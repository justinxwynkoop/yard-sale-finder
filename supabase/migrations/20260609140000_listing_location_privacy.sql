-- Listing location privacy — server-enforced.
--
-- One-off listings are "meet me around here", not a public event: the
-- seller only ever advertises a GENERAL pickup area, never their exact
-- spot. Previously the exact geocoded coordinates (pickup_lat/pickup_lng)
-- were stored verbatim and, because the SELECT policy is `using (true)`,
-- shipped to every viewer — so the UI hid them but the raw data didn't.
--
-- This makes the privacy a real guarantee rather than a UI convention:
-- a BEFORE INSERT/UPDATE trigger rounds the pickup coordinates to ~0.01°
-- (~1.1 km) before they are ever written. The table therefore CANNOT
-- hold a precise pickup point no matter what a client sends, so no
-- non-owner can recover the exact location from the API.
--
-- Coordinates are only used for distance ("~2 mi away") and sorting — no
-- listing is drawn as a precise map pin, and directions geocode the
-- seller-entered text — so a coarsened point serves every viewer use.
-- (Yard SALES are the opposite: a public event that must show its exact
-- address; see lib/locationPrivacy.ts. This trigger is listings-only.)
--
-- Tradeoff: the owner's own Edit-listing map also shows the coarsened
-- point (the row only stores the coarse value). That's consistent with
-- the "general area" model; if exact owner-side recall is ever wanted,
-- store it in an owner-only-RLS sibling table.

create or replace function public.coarsen_listing_pickup()
returns trigger
language plpgsql
as $$
begin
  -- round() needs numeric; cast back to the column's double precision.
  if new.pickup_lat is not null then
    new.pickup_lat := round(new.pickup_lat::numeric, 2)::double precision;
  end if;
  if new.pickup_lng is not null then
    new.pickup_lng := round(new.pickup_lng::numeric, 2)::double precision;
  end if;
  return new;
end;
$$;

drop trigger if exists coarsen_listing_pickup_trg on public.listings;
create trigger coarsen_listing_pickup_trg
  before insert or update on public.listings
  for each row
  execute function public.coarsen_listing_pickup();

-- Backfill: collapse every existing row onto the coarse grid so the
-- exact coordinates already stored are erased from the table.
update public.listings
set pickup_lat = round(pickup_lat::numeric, 2)::double precision,
    pickup_lng = round(pickup_lng::numeric, 2)::double precision
where pickup_lat is not null
   or pickup_lng is not null;
