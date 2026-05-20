-- Favorites: simple join table letting users save sales for later.
-- (user_id, sale_id) is the primary key so a user can only favorite a
-- given sale once.

create table if not exists public.favorites (
  user_id uuid references public.profiles(id) on delete cascade not null,
  sale_id uuid references public.sales(id) on delete cascade not null,
  created_at timestamptz default now() not null,
  primary key (user_id, sale_id)
);

alter table public.favorites enable row level security;

-- Users can only see + manage their own favorites.
drop policy if exists "Users can read own favorites" on public.favorites;
create policy "Users can read own favorites"
  on public.favorites for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own favorites" on public.favorites;
create policy "Users can insert own favorites"
  on public.favorites for insert with check (auth.uid() = user_id);

drop policy if exists "Users can delete own favorites" on public.favorites;
create policy "Users can delete own favorites"
  on public.favorites for delete using (auth.uid() = user_id);

-- Index so 'list my favorites' is fast even for power users.
create index if not exists favorites_user_id_idx
  on public.favorites (user_id, created_at desc);
