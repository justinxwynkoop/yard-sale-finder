-- Audit follow-ups (safe + additive): covering indexes for every unindexed
-- foreign key, and a pinned search_path on the four functions the security
-- advisor flagged as having a mutable one. No behavior change.

-- ── 1. Covering indexes for unindexed FKs (perf advisor: unindexed_foreign_keys)
-- Without these, a parent-side delete and any "children of this parent" query
-- seq-scans the child table. Names follow the existing <table>_<col>_idx style.
create index if not exists blocked_users_blocked_id_idx on public.blocked_users (blocked_id);
create index if not exists favorites_sale_id_idx on public.favorites (sale_id);
create index if not exists listing_favorites_listing_id_idx on public.listing_favorites (listing_id);
create index if not exists listing_media_listing_id_idx on public.listing_media (listing_id);
create index if not exists listings_user_id_idx on public.listings (user_id);
create index if not exists reports_reporter_id_idx on public.reports (reporter_id);
create index if not exists reviews_sale_id_idx on public.reviews (sale_id);
create index if not exists sale_media_sale_id_idx on public.sale_media (sale_id);
create index if not exists sale_visits_sale_id_idx on public.sale_visits (sale_id);
create index if not exists sales_user_id_idx on public.sales (user_id);

-- ── 2. Pin search_path on the flagged functions (security advisor:
-- function_search_path_mutable). All four are SECURITY INVOKER, so this is
-- defense-in-depth, but cheap and matches every other function in the schema.
alter function public.review_summary(uuid) set search_path = public, pg_temp;
alter function public.can_review(uuid) set search_path = public, pg_temp;
alter function public.set_sale_privacy_from_profile() set search_path = public, pg_temp;
alter function public.coarsen_listing_pickup() set search_path = public, pg_temp;
