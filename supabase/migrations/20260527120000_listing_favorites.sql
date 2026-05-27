-- listing_favorites: lets users heart individual listings (separate from
-- the sale-level favorites table so each content type has its own history).
create table if not exists listing_favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references listings(id)   on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

alter table listing_favorites enable row level security;

create policy "Users can read their own listing favorites"
  on listing_favorites for select
  using (auth.uid() = user_id);

create policy "Users can insert their own listing favorites"
  on listing_favorites for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own listing favorites"
  on listing_favorites for delete
  using (auth.uid() = user_id);
