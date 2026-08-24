-- Category alerts: "tell me when someone lists <category> items".
--
-- The follows table already gives per-seller alerts (the notify bell).
-- This is the demand-side counterpart for the off-season problem: a user
-- picks categories they hunt for, and notify-new-listing pushes to them
-- when any new listing overlaps those categories. Empty array = alerts off.
--
-- Lives on profiles next to the other notification prefs
-- (notify_sales_nearby, notify_messages, nearby_radius_miles) — it's a
-- preference, not PII, same as those.

alter table public.profiles
  add column if not exists alert_categories text[] not null default '{}';

-- The edge function looks up subscribers by overlap (&&) on every new
-- listing; a GIN index keeps that from being a sequential scan as profiles
-- grow.
create index if not exists profiles_alert_categories_idx
  on public.profiles using gin (alert_categories);
