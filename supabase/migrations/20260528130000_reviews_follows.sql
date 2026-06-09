-- Reviews + follows + notification prefs
-- Foundation for the PublicProfile screen: ratings, trust signals,
-- and a follow graph. Notification prefs are kept as discrete columns
-- on `profiles` rather than a side table so the toggle screen can
-- update them with a single row mutation.

-- ──────────────────────────────────────────────────────────────────
-- reviews
-- One row per (subject, author, sale) tuple. `sale_id` is optional;
-- you can review someone outside the context of a specific sale (e.g.
-- after a one-off item transaction) by leaving it null.
-- ──────────────────────────────────────────────────────────────────

create table if not exists public.reviews (
  id              uuid primary key default gen_random_uuid(),
  subject_user_id uuid not null references public.profiles(id) on delete cascade,
  author_user_id  uuid not null references public.profiles(id) on delete cascade,
  sale_id         uuid          references public.sales(id)    on delete set null,
  stars           int  not null check (stars between 1 and 5),
  body            text,
  created_at      timestamptz not null default now(),
  -- A reviewer can leave at most one review per (subject, sale) pair.
  -- Distinct sales by the same host are reviewable separately; standalone
  -- reviews (sale_id null) collapse via the partial unique index below.
  constraint reviews_no_self check (author_user_id <> subject_user_id),
  constraint reviews_unique_per_sale unique (subject_user_id, author_user_id, sale_id)
);

-- Standalone reviews (sale_id null) need their own uniqueness rule
-- because UNIQUE in Postgres treats NULL as distinct.
create unique index if not exists reviews_unique_standalone
  on public.reviews (subject_user_id, author_user_id)
  where sale_id is null;

create index if not exists reviews_subject_idx on public.reviews (subject_user_id, created_at desc);
create index if not exists reviews_author_idx  on public.reviews (author_user_id);

alter table public.reviews enable row level security;

drop policy if exists "Reviews are readable by everyone" on public.reviews;
create policy "Reviews are readable by everyone"
  on public.reviews for select using (true);

drop policy if exists "Users can write their own reviews" on public.reviews;
create policy "Users can write their own reviews"
  on public.reviews for insert with check (auth.uid() = author_user_id);

drop policy if exists "Users can update their own reviews" on public.reviews;
create policy "Users can update their own reviews"
  on public.reviews for update using (auth.uid() = author_user_id);

drop policy if exists "Users can delete their own reviews" on public.reviews;
create policy "Users can delete their own reviews"
  on public.reviews for delete using (auth.uid() = author_user_id);

-- Aggregate helper for PublicProfile. Returns avg_stars (0-5, 1dp) and
-- review_count for a given subject. Defined as STABLE so PostgREST can
-- expose it as an RPC.
create or replace function public.review_summary(p_user_id uuid)
returns table (avg_stars numeric, review_count int)
language sql stable as $$
  select coalesce(round(avg(stars)::numeric, 1), 0) as avg_stars,
         count(*)::int as review_count
  from public.reviews
  where subject_user_id = p_user_id;
$$;

-- ──────────────────────────────────────────────────────────────────
-- follows
-- ──────────────────────────────────────────────────────────────────

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint follows_no_self check (follower_id <> followed_id)
);

create index if not exists follows_followed_idx on public.follows (followed_id);

alter table public.follows enable row level security;

drop policy if exists "Follows are readable by everyone" on public.follows;
create policy "Follows are readable by everyone"
  on public.follows for select using (true);

drop policy if exists "Users can follow others" on public.follows;
create policy "Users can follow others"
  on public.follows for insert with check (auth.uid() = follower_id);

drop policy if exists "Users can unfollow" on public.follows;
create policy "Users can unfollow"
  on public.follows for delete using (auth.uid() = follower_id);

-- ──────────────────────────────────────────────────────────────────
-- notification prefs
-- Six discrete booleans on `profiles`. Sensible defaults so existing
-- users get the experience without an explicit opt-in step. The
-- Notifications screen mutates these directly via `update profiles`.
-- ──────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists notify_sales_nearby     boolean not null default true,
  add column if not exists notify_saved_reminders  boolean not null default true,
  add column if not exists notify_messages         boolean not null default true,
  add column if not exists notify_offers           boolean not null default true,
  add column if not exists notify_weekly_digest    boolean not null default false,
  add column if not exists notify_tips             boolean not null default false;

-- Optional bio + phone fields for the Account screen. Keep them
-- nullable so existing users don't need to backfill.
alter table public.profiles
  add column if not exists bio   text,
  add column if not exists phone text;
