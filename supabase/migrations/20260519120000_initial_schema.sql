-- Initial schema for Yard Sale Finder.
-- Written to be idempotent so it can safely re-run against a DB that
-- has partial state (some objects already exist, some don't).

-- =====================================================================
-- profiles (extends auth.users)
-- =====================================================================
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- Needed so client-side upsert() during onboarding (which always emits
-- an INSERT, even when ON CONFLICT will turn it into an UPDATE) passes
-- RLS. The trigger above handles most signups, but Apple private-relay
-- and legacy users still hit the upsert path.
drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================================
-- sales
-- =====================================================================
create table if not exists public.sales (
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

drop policy if exists "Sales are viewable by everyone" on public.sales;
create policy "Sales are viewable by everyone"
  on public.sales for select using (true);

drop policy if exists "Users can insert their own sales" on public.sales;
create policy "Users can insert their own sales"
  on public.sales for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own sales" on public.sales;
create policy "Users can update their own sales"
  on public.sales for update using (auth.uid() = user_id);

drop policy if exists "Users can delete their own sales" on public.sales;
create policy "Users can delete their own sales"
  on public.sales for delete using (auth.uid() = user_id);

create index if not exists sales_geo_idx on public.sales (latitude, longitude);
create index if not exists sales_status_idx on public.sales (status);

-- Auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_sale_updated on public.sales;
create trigger on_sale_updated
  before update on public.sales
  for each row execute procedure public.handle_updated_at();

-- =====================================================================
-- sale_media
-- =====================================================================
create table if not exists public.sale_media (
  id uuid default gen_random_uuid() primary key,
  sale_id uuid references public.sales(id) on delete cascade not null,
  url text not null,
  type text not null check (type in ('image', 'video')),
  "order" integer default 0,
  created_at timestamptz default now() not null
);

alter table public.sale_media enable row level security;

drop policy if exists "Sale media is viewable by everyone" on public.sale_media;
create policy "Sale media is viewable by everyone"
  on public.sale_media for select using (true);

drop policy if exists "Users can manage media for their own sales" on public.sale_media;
create policy "Users can manage media for their own sales"
  on public.sale_media for all using (
    auth.uid() = (select user_id from public.sales where id = sale_id)
  );

-- =====================================================================
-- storage bucket for sale media
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('sale-media', 'sale-media', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can view sale media" on storage.objects;
create policy "Anyone can view sale media"
  on storage.objects for select using (bucket_id = 'sale-media');

drop policy if exists "Authenticated users can upload sale media" on storage.objects;
create policy "Authenticated users can upload sale media"
  on storage.objects for insert with check (
    bucket_id = 'sale-media' and auth.role() = 'authenticated'
  );

drop policy if exists "Users can delete their own sale media" on storage.objects;
create policy "Users can delete their own sale media"
  on storage.objects for delete using (
    bucket_id = 'sale-media' and auth.uid()::text = (storage.foldername(name))[1]
  );
