-- Neighborhood Sales v1 (spec: docs/superpowers/specs/2026-08-07-neighborhood-sales-design.md)
-- Events group independent sales. Open join (owner sets their own
-- sales.event_id); organizer removal crosses ownership so it's a definer RPC.

create table public.sale_events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  cover_url text,
  start_date date not null,
  end_date date not null,
  latitude double precision not null,
  longitude double precision not null,
  radius_m integer not null default 800,
  share_slug text not null unique
    default lower(substring(md5(gen_random_uuid()::text) from 1 for 8)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sale_events_dates_ck check (end_date >= start_date),
  constraint sale_events_radius_ck check (radius_m between 100 and 5000)
);

create index sale_events_end_date_idx on public.sale_events (end_date);

create trigger on_sale_event_updated
  before update on public.sale_events
  for each row execute function public.handle_updated_at();

alter table public.sales
  add column event_id uuid references public.sale_events(id) on delete set null;

create index sales_event_id_idx on public.sales (event_id);

create table public.event_saves (
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.sale_events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

-- RLS
alter table public.sale_events enable row level security;
alter table public.event_saves enable row level security;

create policy "Events are viewable by everyone"
  on public.sale_events for select using (true);
create policy "Organizers can insert their own events"
  on public.sale_events for insert
  with check (organizer_id = (select auth.uid()));
create policy "Organizers can update their own events"
  on public.sale_events for update
  using (organizer_id = (select auth.uid()));
create policy "Organizers can delete their own events"
  on public.sale_events for delete
  using (organizer_id = (select auth.uid()));

create policy "Users manage their own event saves"
  on public.event_saves for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Organizer removes a member sale (crosses sale ownership → definer RPC).
create or replace function public.remove_sale_from_event(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.sales s
    join public.sale_events e on e.id = s.event_id
    where s.id = p_sale_id
      and e.organizer_id = auth.uid()
  ) then
    raise exception 'not the organizer of this sale''s event';
  end if;

  update public.sales set event_id = null where id = p_sale_id;
end;
$$;

revoke execute on function public.remove_sale_from_event(uuid) from public, anon;
grant execute on function public.remove_sale_from_event(uuid) to authenticated;
