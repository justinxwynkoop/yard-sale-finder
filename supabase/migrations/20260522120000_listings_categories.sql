-- Add categories array to listings table

alter table public.listings
  add column if not exists categories text[] not null default '{}';
