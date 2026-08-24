-- Product analytics: a minimal self-hosted event log.
--
-- The ops dashboard can already count rows, but counts can't answer
-- activation/retention questions (do signups post? view? message? return?).
-- Rather than adopt a third-party analytics SDK, events are logged straight
-- into Postgres: the app fires fire-and-forget inserts (src/lib/analytics.ts)
-- and /api/ops-stats reads aggregates via the ops_event_stats() RPC below.
--
-- Privacy posture: INSERT-only for clients — there are deliberately no
-- SELECT policies, so only the service role (the ops API) can read events.
-- Guests log with a null user_id. Props are small JSON details (ids, flags),
-- never free text typed by users.

create table if not exists public.events (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 1 and 64),
  user_id    uuid references auth.users(id) on delete set null,
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;

-- Signed-in users may log events only as themselves (or anonymously);
-- guests may log only anonymous events.
drop policy if exists "Users can log their own events" on public.events;
create policy "Users can log their own events"
  on public.events for insert to authenticated
  with check (user_id = auth.uid() or user_id is null);

drop policy if exists "Guests can log anonymous events" on public.events;
create policy "Guests can log anonymous events"
  on public.events for insert to anon
  with check (user_id is null);

create index if not exists events_created_at_idx on public.events (created_at desc);
create index if not exists events_name_idx on public.events (name, created_at desc);

-- Aggregates for the ops dashboard. SECURITY DEFINER so it can read the
-- (client-unreadable) events table; EXECUTE is revoked from clients below,
-- so the only caller is the service role via /rest/v1/rpc/ops_event_stats.
create or replace function public.ops_event_stats()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'active48h', (select count(distinct user_id) from public.events
                  where created_at > now() - interval '48 hours' and user_id is not null),
    'active7d',  (select count(distinct user_id) from public.events
                  where created_at > now() - interval '7 days' and user_id is not null),
    'views48h',  (select count(*) from public.events
                  where created_at > now() - interval '48 hours'
                    and name in ('sale_viewed', 'listing_viewed')),
    'posts7d',   (select count(*) from public.events
                  where created_at > now() - interval '7 days'
                    and name in ('sale_posted', 'listing_posted')),
    'convos7d',  (select count(*) from public.events
                  where created_at > now() - interval '7 days'
                    and name = 'conversation_started')
  );
$$;

revoke execute on function public.ops_event_stats() from anon, authenticated, public;
