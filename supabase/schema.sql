-- Enable PostGIS for geo queries (available on Supabase by default)
-- Run this entire file in the Supabase SQL editor

-- Profiles table (extends auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Sales table
create table public.sales (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  start_date date not null,
  end_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'active' check (status in ('active', 'winding_down', 'ended')),
  categories text[] default '{}',
  pricing_notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.sales enable row level security;

create policy "Sales are viewable by everyone"
  on public.sales for select using (true);

create policy "Users can insert their own sales"
  on public.sales for insert with check (auth.uid() = user_id);

create policy "Users can update their own sales"
  on public.sales for update using (auth.uid() = user_id);

create policy "Users can delete their own sales"
  on public.sales for delete using (auth.uid() = user_id);

-- Index for geo bounding box queries
create index sales_geo_idx on public.sales (latitude, longitude);
create index sales_status_idx on public.sales (status);

-- Auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_sale_updated
  before update on public.sales
  for each row execute procedure public.handle_updated_at();

-- Sale media table
create table public.sale_media (
  id uuid default gen_random_uuid() primary key,
  sale_id uuid references public.sales(id) on delete cascade not null,
  url text not null,
  type text not null check (type in ('image', 'video')),
  "order" integer default 0,
  created_at timestamptz default now() not null
);

alter table public.sale_media enable row level security;

create policy "Sale media is viewable by everyone"
  on public.sale_media for select using (true);

create policy "Users can manage media for their own sales"
  on public.sale_media for all using (
    auth.uid() = (select user_id from public.sales where id = sale_id)
  );

-- Storage bucket for sale media
insert into storage.buckets (id, name, public) values ('sale-media', 'sale-media', true);

create policy "Anyone can view sale media"
  on storage.objects for select using (bucket_id = 'sale-media');

create policy "Authenticated users can upload sale media"
  on storage.objects for insert with check (
    bucket_id = 'sale-media' and auth.role() = 'authenticated'
  );

create policy "Users can delete their own sale media"
  on storage.objects for delete using (
    bucket_id = 'sale-media' and auth.uid()::text = (storage.foldername(name))[1]
  );
