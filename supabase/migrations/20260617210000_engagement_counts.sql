-- Real "views" and "saves" for items (and sales). Both were hardcoded to 0 in
-- the UI because no tracking existed. Counts are denormalized onto the row so
-- they're readable even though the favorites tables are private (owner can't
-- read other users' favorite rows, so we can't COUNT them directly).

alter table public.listings add column if not exists view_count integer not null default 0;
alter table public.listings add column if not exists save_count integer not null default 0;
alter table public.sales    add column if not exists view_count integer not null default 0;
alter table public.sales    add column if not exists save_count integer not null default 0;

-- View counter: one bump per detail open, never counting the owner's own views.
create or replace function public.increment_listing_view(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.listings
    set view_count = view_count + 1
    where id = p_id and user_id is distinct from auth.uid();
end; $$;
revoke execute on function public.increment_listing_view(uuid) from public, anon;
grant execute on function public.increment_listing_view(uuid) to authenticated;

create or replace function public.increment_sale_view(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.sales
    set view_count = view_count + 1
    where id = p_id and user_id is distinct from auth.uid();
end; $$;
revoke execute on function public.increment_sale_view(uuid) from public, anon;
grant execute on function public.increment_sale_view(uuid) to authenticated;

-- save_count maintained by triggers on the favorites tables (SECURITY DEFINER
-- so a favoriting user can bump the owner's listing/sale row).
create or replace function public.bump_listing_save_count()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    update public.listings set save_count = save_count + 1 where id = new.listing_id;
  elsif tg_op = 'DELETE' then
    update public.listings set save_count = greatest(0, save_count - 1) where id = old.listing_id;
  end if;
  return null;
end; $$;
revoke execute on function public.bump_listing_save_count() from public, anon, authenticated;

drop trigger if exists listing_favorites_save_count on public.listing_favorites;
create trigger listing_favorites_save_count
  after insert or delete on public.listing_favorites
  for each row execute function public.bump_listing_save_count();

create or replace function public.bump_sale_save_count()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    update public.sales set save_count = save_count + 1 where id = new.sale_id;
  elsif tg_op = 'DELETE' then
    update public.sales set save_count = greatest(0, save_count - 1) where id = old.sale_id;
  end if;
  return null;
end; $$;
revoke execute on function public.bump_sale_save_count() from public, anon, authenticated;

drop trigger if exists favorites_save_count on public.favorites;
create trigger favorites_save_count
  after insert or delete on public.favorites
  for each row execute function public.bump_sale_save_count();

-- Backfill from existing favorites.
update public.listings l
  set save_count = (select count(*) from public.listing_favorites lf where lf.listing_id = l.id);
update public.sales s
  set save_count = (select count(*) from public.favorites f where f.sale_id = s.id);
