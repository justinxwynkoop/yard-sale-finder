-- store_featured: pinned items per seller
create table if not exists public.store_featured (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  position   integer not null default 0,
  primary key (user_id, listing_id)
);

create index if not exists store_featured_user_idx on public.store_featured (user_id, position);

alter table public.store_featured enable row level security;

create policy "store_featured readable by all"
  on public.store_featured for select using (true);

create policy "store_featured writable by owner"
  on public.store_featured for insert with check (auth.uid() = user_id);

create policy "store_featured deletable by owner"
  on public.store_featured for delete using (auth.uid() = user_id);

-- store_sections: seller-named sections
create table if not exists public.store_sections (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references public.profiles(id) on delete cascade,
  name     text not null,
  position integer not null default 0
);

create index if not exists store_sections_user_idx on public.store_sections (user_id, position);

alter table public.store_sections enable row level security;

create policy "store_sections readable by all"
  on public.store_sections for select using (true);

create policy "store_sections writable by owner"
  on public.store_sections for insert with check (auth.uid() = user_id);

create policy "store_sections updatable by owner"
  on public.store_sections for update using (auth.uid() = user_id);

create policy "store_sections deletable by owner"
  on public.store_sections for delete using (auth.uid() = user_id);

-- store_section_items: listings assigned to a section
create table if not exists public.store_section_items (
  section_id uuid    not null references public.store_sections(id) on delete cascade,
  listing_id uuid    not null references public.listings(id)       on delete cascade,
  position   integer not null default 0,
  primary key (section_id, listing_id)
);

create index if not exists store_section_items_section_idx on public.store_section_items (section_id, position);

alter table public.store_section_items enable row level security;

create policy "store_section_items readable by all"
  on public.store_section_items for select using (true);

create policy "store_section_items writable by section owner"
  on public.store_section_items for insert
  with check (
    exists (
      select 1 from public.store_sections s
      where s.id = section_id and s.user_id = auth.uid()
    )
  );

create policy "store_section_items deletable by section owner"
  on public.store_section_items for delete
  using (
    exists (
      select 1 from public.store_sections s
      where s.id = section_id and s.user_id = auth.uid()
    )
  );
