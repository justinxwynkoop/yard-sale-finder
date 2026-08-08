-- Guest views must count too. Guest browsing is the app's default entry
-- (App Review 5.1.1(v) forbids a login wall), but the increment RPCs were
-- only granted to `authenticated` — so views from signed-out users failed
-- silently (fire-and-forget rpc) and view counts barely moved. The
-- owner-skip predicate (user_id is distinct from auth.uid()) is unaffected:
-- for anon, auth.uid() is null, which is always distinct from the owner.
grant execute on function public.increment_sale_view(uuid) to anon;
grant execute on function public.increment_listing_view(uuid) to anon;
