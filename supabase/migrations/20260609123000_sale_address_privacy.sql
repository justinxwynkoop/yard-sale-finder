-- Denormalize the host's address-privacy preference onto each sale at
-- creation time. Rationale:
--  * useSales() intentionally does NOT embed the host profile (the
--    PostgREST auto-inner-join drops sales whose owner has no profile
--    row yet), so the map has no other way to know a sale's privacy.
--  * A sale's privacy is conceptually fixed when it's posted — later
--    changing your account default shouldn't silently re-expose a sale
--    that's already live.
--
-- A BEFORE INSERT trigger copies the values from the host's profile, so
-- the CreateSale flow needs no change. Columns are nullable; the
-- rendering util treats null as 'live'/exact (legacy behavior).

alter table public.sales
  add column if not exists location_privacy   text
    check (location_privacy in ('reply', 'live')),
  add column if not exists blur_radius_blocks int;

create or replace function public.set_sale_privacy_from_profile()
returns trigger as $$
begin
  if new.location_privacy is null then
    select p.location_privacy, p.blur_radius_blocks
      into new.location_privacy, new.blur_radius_blocks
      from public.profiles p
     where p.id = new.user_id;
    -- Profile may predate these columns; fall back to safe defaults.
    new.location_privacy := coalesce(new.location_privacy, 'live');
    new.blur_radius_blocks := coalesce(new.blur_radius_blocks, 3);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_sale_privacy on public.sales;
create trigger trg_set_sale_privacy
  before insert on public.sales
  for each row execute function public.set_sale_privacy_from_profile();

-- Backfill existing sales from their host's current profile preference
-- (best-effort; null host prefs fall back to 'live'/exact).
update public.sales s
   set location_privacy = coalesce(p.location_privacy, 'live'),
       blur_radius_blocks = coalesce(p.blur_radius_blocks, 3)
  from public.profiles p
 where s.user_id = p.id
   and s.location_privacy is null;
