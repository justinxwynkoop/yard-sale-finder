-- Bulk demo seed — run AFTER a content wipe. Attributes a large amount of
-- content to the EXISTING profiles (no new auth users). Region: Muncie, IN
-- (search "Muncie, IN" on the map). Run via the Management API /database/query.
--
-- NOTE on randomness: an uncorrelated `(select ... order by random() limit 1)`
-- subquery is evaluated ONCE by Postgres (every row gets the same value). So we
-- pick a random profile per row via array-indexing with a volatile random()
-- (evaluated per output row), and force the date lateral to run per-row by
-- correlating it on `gs`.

-- ── 250 sales ────────────────────────────────────────────────────────────
with prof as (select array_agg(id) as ids, count(*)::int as n from public.profiles)
insert into public.sales
  (user_id, title, description, address, latitude, longitude,
   start_date, end_date, start_time, end_time, status, categories,
   pricing_notes, allow_messages, view_count, save_count)
select
  (select ids from prof)[1 + floor(random() * (select n from prof))::int],
  (array['Garage Sale','Estate Sale','Moving Sale','Multi-Family Sale','Yard Sale','Barn Sale','Block Sale'])[1 + floor(random() * 7)::int]
    || ' — ' ||
  (array['Tools & Treasures','Everything Must Go','Vintage Finds','Kids & Baby Gear','Furniture & Decor','Books & Games','Downsizing'])[1 + floor(random() * 7)::int],
  'Lots of great items priced to sell. Early birds welcome — cash on hand helps!',
  (100 + floor(random() * 8900))::int::text || ' '
    || (array['Main St','Oak Ave','Elm St','Maple Dr','Walnut St','Jackson St','Riverside Ave','University Ave','Wheeling Ave'])[1 + floor(random() * 9)::int]
    || ', Muncie, IN',
  40.193 + (random() - 0.5) * 0.28,
  -85.386 + (random() - 0.5) * 0.28,
  d.start_d,
  d.start_d + d.dur,
  (array['07:00','08:00','09:00'])[1 + floor(random() * 3)::int]::time,
  (array['14:00','15:00','16:00','17:00'])[1 + floor(random() * 4)::int]::time,
  case when (d.start_d + d.dur) < current_date then 'ended' else 'active' end,
  array[(array['furniture','clothing','electronics','toys','tools','books','kitchen','sports','antiques','other'])[1 + floor(random() * 10)::int]],
  (array['Cash preferred','Most items under $20','Make an offer','Everything negotiable','Venmo & cash accepted'])[1 + floor(random() * 5)::int],
  random() > 0.1,
  floor(random() * 250)::int,
  floor(random() * 40)::int
from generate_series(1, 250) gs
cross join lateral (
  select (current_date + (floor(random() * 18) - 3)::int) as start_d,
         floor(random() * 2)::int as dur
  where gs is not null
) d;

-- ── 250 listings ─────────────────────────────────────────────────────────
with prof as (select array_agg(id) as ids, count(*)::int as n from public.profiles)
insert into public.listings
  (user_id, title, description, price, pickup_input, pickup_display,
   pickup_lat, pickup_lng, status, categories, view_count, save_count)
select
  (select ids from prof)[1 + floor(random() * (select n from prof))::int],
  (array['Vintage','Mid-century','Modern','Rustic','Antique','Like-new','Handmade'])[1 + floor(random() * 7)::int]
    || ' ' ||
  (array['Armchair','Coffee Table','Bookshelf','Lamp','Dresser','Bicycle','Desk','Dining Set','Sofa','Area Rug','Mirror','Toolbox','Guitar','Camera'])[1 + floor(random() * 14)::int],
  'Gently used, works great. Smoke-free home. Pickup only.',
  case when random() < 0.05 then 0 else (5 + floor(random() * 295))::numeric + 0.99 end,
  'Muncie, IN',
  (array['Near Ball State','Downtown Muncie','Northside','Southside','Yorktown area'])[1 + floor(random() * 5)::int],
  40.193 + (random() - 0.5) * 0.28,
  -85.386 + (random() - 0.5) * 0.28,
  (array['available','available','available','available','pending','sold'])[1 + floor(random() * 6)::int],
  array[(array['furniture','clothing','electronics','toys','tools','books','kitchen','sports','antiques','other'])[1 + floor(random() * 10)::int]],
  floor(random() * 300)::int,
  floor(random() * 40)::int
from generate_series(1, 250) gs;

-- ── Media: 1–3 images per sale / listing (picsum placeholders) ────────────
insert into public.sale_media (sale_id, url, type, "order")
select s.id, 'https://picsum.photos/seed/' || s.id || '-' || g || '/800/800', 'image', g - 1
from public.sales s
cross join generate_series(1, 3) g
where g <= 1 + (abs(hashtext(s.id::text)) % 3);

insert into public.listing_media (listing_id, url, type, "order")
select l.id, 'https://picsum.photos/seed/' || l.id || '-' || g || '/800/800', 'image', g - 1
from public.listings l
cross join generate_series(1, 3) g
where g <= 1 + (abs(hashtext(l.id::text)) % 3);

-- ── ~250 follows (random per row, deduped, no self) ──────────────────────
with prof as (select array_agg(id) as ids, count(*)::int as n from public.profiles)
insert into public.follows (follower_id, followed_id)
select follower_id, followed_id
from (
  select
    (select ids from prof)[1 + floor(random() * (select n from prof))::int] as follower_id,
    (select ids from prof)[1 + floor(random() * (select n from prof))::int] as followed_id
  from generate_series(1, 400) gs
) x
where follower_id <> followed_id
on conflict (follower_id, followed_id) do nothing;

-- ── ~150 standalone reviews (3–5 stars, deduped per author/subject) ──────
with prof as (select array_agg(id) as ids, count(*)::int as n from public.profiles)
insert into public.reviews (subject_user_id, author_user_id, sale_id, stars, body)
select subject_user_id, author_user_id, null,
       3 + floor(random() * 3)::int,
       (array['Great seller, smooth pickup!','Items just as described.','Friendly and easy to deal with.','Quick replies, fair prices.','Would buy again!', null])[1 + floor(random() * 6)::int]
from (
  select
    (select ids from prof)[1 + floor(random() * (select n from prof))::int] as subject_user_id,
    (select ids from prof)[1 + floor(random() * (select n from prof))::int] as author_user_id
  from generate_series(1, 250) gs
) x
where subject_user_id <> author_user_id
on conflict (subject_user_id, author_user_id) where sale_id is null do nothing;
