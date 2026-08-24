# Scaling trigger points

Several data paths are deliberately simple — full fetches and client-side
filtering are the right call at current scale, and every one of them has a
known cliff. This file records **what breaks, when, and what the fix is**, so
the cliff is a planned migration instead of a surprise outage.

Check the ops dashboard (`trove.sale/ops`) vitals against the thresholds
below every so often; each row is independent — fix them as they trip, not
all at once.

| Path | Today | Trips at (approx.) | Fix when it trips |
| --- | --- | --- | --- |
| `useSales` | Fetches **every** non-ended sale, no viewport bound, no limit | ~1–2k live sales (payload > ~1 MB, slow map load on LTE) | PostGIS RPC: `sales_in_bounds(min_lat, min_lng, max_lat, max_lng)` + refetch on region change (debounced). The map already thins pins client-side, so only the query changes. `sales_geo_idx` exists but a real geo query wants PostGIS `geography` + GiST. |
| `useListings` | Full fetch of available listings; multi-category OR filter partly client-side | ~5k available listings | Move to keyset pagination (`created_at` cursor, `range()`), push category OR into a Postgres `&&` (overlaps) filter — the client-side OR was only needed because `@>` is contains-ALL. |
| `useInbox` hydration | N queries per refetch: conversations, then profiles/messages/targets hydrated in JS | ~100+ conversations for one user (refetch > ~1s) | A Postgres view (or RPC) joining conversation + last message + other-party profile + target preview server-side; the polymorphic `target_type` join is a `case` in SQL. |
| Blocked-users filter | Client-side filter in `useSales`/`useListings` | Only if block lists get big (hundreds) — unlikely before the fetch cliffs above | Fold into the same RPCs when they happen (`where user_id not in (select blocked_id ...)`). |
| `events` table | Insert-only log, aggregates computed on demand by `ops_event_stats()` | ~1M rows (RPC > ~1s) | Nightly rollup table (pg_cron) + prune raw events older than 90 days. |
| Push fan-out (edge functions) | Sequential Expo pushes in 100-message chunks | ~5k recipients for one event (function timeout) | Queue the sends (pg_cron batches or Expo's push receipts API) instead of doing them inline in the webhook. |
| `sitemap.xml` | Single function render, 5k-URL cap | ~5k live sales+listings | Sitemap index + paged sitemaps (one function param'd by page). |

## How to re-check the numbers

- Live sales / listings / conversations: ops dashboard vitals.
- Event volume: `select count(*) from events` (SQL editor).
- Inbox worst case: `select conversation counts per user` — `select user_a, count(*) from conversations group by 1 order by 2 desc limit 5` (and same for `user_b`).

## Non-triggers (deliberate, don't "fix")

- **No state library** — hooks + module-level invalidation are doing fine.
- **No staging DB** — one Supabase project, guarded by `confirm-prod.sh`.
- **Realtime = refetch** — `postgres_changes` handlers refetch instead of
  merging payloads. Simpler, and it's what makes fetch-time filters
  (blocked users, `hidden_at`) airtight. Revisit only if refetch volume
  becomes a cost problem.
