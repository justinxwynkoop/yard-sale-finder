-- sale_visits: lets a user privately mark a yard sale as "visited".
-- This is the standalone primitive behind the route planner's "Visited"
-- action, surfaced on the Sale detail screen while route planning is
-- hidden. Visits are personal — each user only sees their own.

create table if not exists public.sale_visits (
  user_id    uuid not null references auth.users(id) on delete cascade,
  sale_id    uuid not null references public.sales(id) on delete cascade,
  visited_at timestamptz not null default now(),
  primary key (user_id, sale_id)
);

alter table public.sale_visits enable row level security;

create policy "Users can read their own visits"
  on public.sale_visits for select
  using (auth.uid() = user_id);

create policy "Users can insert their own visits"
  on public.sale_visits for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own visits"
  on public.sale_visits for delete
  using (auth.uid() = user_id);
