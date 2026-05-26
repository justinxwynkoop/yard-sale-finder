-- User block + content report tables.
--
-- Required to satisfy Apple App Store Guideline 1.2 (Safety - User
-- Generated Content) and the standard EULA template, which require:
--   1. A mechanism to filter objectionable content (we do this
--      client-side via a join against blocked_users in the read
--      queries; see useSales / useListings / useFavorites).
--   2. A mechanism for users to flag objectionable content (the
--      reports table + ReportSheet component).
--   3. A way to block abusive users from interacting (blocked_users
--      table + Profile -> Blocked Users management screen).
--   4. The developer must act on reports within 24 hours (handled
--      out-of-band via the operator monitoring the reports table or
--      receiving emails).
--
-- The design uses two separate tables because the semantics are
-- different: blocked_users is a per-user mute list (the blocker
-- shouldn't see the blockee's content), while reports is a content
-- moderation queue (every report is reviewed by the operator).

-- =====================================================================
-- blocked_users
-- =====================================================================

create table if not exists public.blocked_users (
  blocker_id uuid references public.profiles(id) on delete cascade not null,
  blocked_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now() not null,
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.blocked_users enable row level security;

-- A user can only see, insert, or delete their own block entries.
-- They cannot see who has blocked them (that would defeat the
-- "quietly mute" UX and could enable harassment).
drop policy if exists "Users can read their own blocks" on public.blocked_users;
create policy "Users can read their own blocks"
  on public.blocked_users for select using (auth.uid() = blocker_id);

drop policy if exists "Users can insert their own blocks" on public.blocked_users;
create policy "Users can insert their own blocks"
  on public.blocked_users for insert with check (auth.uid() = blocker_id);

drop policy if exists "Users can delete their own blocks" on public.blocked_users;
create policy "Users can delete their own blocks"
  on public.blocked_users for delete using (auth.uid() = blocker_id);

create index if not exists blocked_users_blocker_idx
  on public.blocked_users (blocker_id, created_at desc);

-- =====================================================================
-- reports
-- =====================================================================

create table if not exists public.reports (
  id uuid default gen_random_uuid() primary key,
  reporter_id uuid references public.profiles(id) on delete cascade not null,
  target_type text not null
    check (target_type in ('sale', 'listing', 'profile')),
  target_id uuid not null,
  reason text not null
    check (reason in (
      'inappropriate',
      'spam_misleading',
      'illegal',
      'safety',
      'off_topic',
      'other'
    )),
  notes text,
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz default now() not null
);

alter table public.reports enable row level security;

-- Users can submit reports.
drop policy if exists "Users can create reports" on public.reports;
create policy "Users can create reports"
  on public.reports for insert with check (auth.uid() = reporter_id);

-- Users can read their own reports (transparency / "did my report go
-- through?"). They cannot see other people's reports.
drop policy if exists "Users can read their own reports" on public.reports;
create policy "Users can read their own reports"
  on public.reports for select using (auth.uid() = reporter_id);

-- No UPDATE or DELETE policies: only the operator (postgres role)
-- triages reports. That's intentional -- letting reporters edit or
-- withdraw reports would erode the moderation trail.

create index if not exists reports_status_idx
  on public.reports (status, created_at desc);

create index if not exists reports_target_idx
  on public.reports (target_type, target_id);
