-- listings: individual item listings (separate from yard sales)

create table if not exists public.listings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text,
  price numeric(10,2) not null,
  pickup_input text not null,
  pickup_display text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  status text not null default 'available' check (status in ('available', 'sold')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.listings enable row level security;

drop policy if exists "Listings are viewable by everyone" on public.listings;
create policy "Listings are viewable by everyone"
  on public.listings for select using (true);

drop policy if exists "Users can insert their own listings" on public.listings;
create policy "Users can insert their own listings"
  on public.listings for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own listings" on public.listings;
create policy "Users can update their own listings"
  on public.listings for update using (auth.uid() = user_id);

drop policy if exists "Users can delete their own listings" on public.listings;
create policy "Users can delete their own listings"
  on public.listings for delete using (auth.uid() = user_id);

drop trigger if exists on_listing_updated on public.listings;
create trigger on_listing_updated
  before update on public.listings
  for each row execute procedure public.handle_updated_at();

-- listing_media

create table if not exists public.listing_media (
  id uuid default gen_random_uuid() primary key,
  listing_id uuid references public.listings(id) on delete cascade not null,
  url text not null,
  type text not null check (type in ('image', 'video')),
  "order" integer default 0,
  created_at timestamptz default now() not null
);

alter table public.listing_media enable row level security;

drop policy if exists "Listing media is viewable by everyone" on public.listing_media;
create policy "Listing media is viewable by everyone"
  on public.listing_media for select using (true);

drop policy if exists "Users can manage media for their own listings" on public.listing_media;
create policy "Users can manage media for their own listings"
  on public.listing_media for all using (
    auth.uid() = (select user_id from public.listings where id = listing_id)
  );

-- storage bucket for listing photos

insert into storage.buckets (id, name, public)
values ('listing-media', 'listing-media', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can view listing media" on storage.objects;
create policy "Anyone can view listing media"
  on storage.objects for select using (bucket_id = 'listing-media');

drop policy if exists "Authenticated users can upload listing media" on storage.objects;
create policy "Authenticated users can upload listing media"
  on storage.objects for insert with check (
    bucket_id = 'listing-media' and auth.role() = 'authenticated'
  );

drop policy if exists "Users can delete their own listing media" on storage.objects;
create policy "Users can delete their own listing media"
  on storage.objects for delete using (
    bucket_id = 'listing-media' and auth.uid()::text = (storage.foldername(name))[1]
  );
