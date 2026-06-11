-- Realtime demo: drop 2 sales right around Muncie, IN so you can watch
-- them pop onto the Discover map live. Run in the Supabase SQL editor
-- while the app is open on Discover (reload the app first so the
-- realtime channel reconnects after the publication change).
--
-- Attached to an existing profile (no fake users needed) and tagged
-- [demo] for easy cleanup.

with u as (select id from public.profiles order by created_at limit 1)
insert into public.sales
  (user_id, title, description, address, latitude, longitude,
   start_date, end_date, start_time, end_time, status, categories)
select
  u.id,
  'Realtime test sale ' || g,
  '[demo] watch me appear on the map',
  '123 Demo St, Muncie, IN',
  40.193 + (g - 1) * 0.005,
  -85.386 + (g - 1) * 0.005,
  current_date, current_date + 1, '08:00', '15:00', 'active',
  array['furniture']::text[]
from u, generate_series(1, 2) as g;

-- Cleanup when you're done:
-- delete from public.sales where description like '[demo]%';
