-- Test data seed script. ONE-OFF, runs via the Supabase SQL editor.
-- Lives outside supabase/migrations/ so the CLI never auto-applies it.
--
-- Creates 4 fake seller accounts and seeds ~17 sales + ~14 listings
-- spread across Indianapolis, Fishers, Muncie, Anderson, and Fort Wayne.
-- All rows are tagged "[seed]" in their description so the cleanup
-- block at the bottom can scrub everything in one shot.
--
-- The fake sellers exist as real auth.users rows (required for the FK
-- chain into profiles -> sales / listings) but have a placeholder bcrypt
-- password hash; nobody is meant to sign in as them. Profiles get
-- auto-created by the handle_new_user trigger.

-- =====================================================================
-- 1) Fake sellers
-- =====================================================================

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_user_meta_data, created_at, updated_at
) values
  (
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'seed-sarah@localhauls.test',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    now(),
    '{"full_name": "Sarah from Broad Ripple"}'::jsonb,
    now(), now()
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'seed-mike@localhauls.test',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    now(),
    '{"full_name": "Mike on 116th"}'::jsonb,
    now(), now()
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'seed-linda@localhauls.test',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    now(),
    '{"full_name": "Linda - Westside Muncie"}'::jsonb,
    now(), now()
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'seed-tom@localhauls.test',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    now(),
    '{"full_name": "Tom (Anderson)"}'::jsonb,
    now(), now()
  )
on conflict (id) do nothing;

-- The handle_new_user trigger auto-creates profiles for these. But the
-- trigger only runs on INSERT, so if profiles already existed from a
-- prior seed, sync the display name here.
update public.profiles set display_name = 'Sarah from Broad Ripple'
  where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set display_name = 'Mike on 116th'
  where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set display_name = 'Linda - Westside Muncie'
  where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set display_name = 'Tom (Anderson)'
  where id = '44444444-4444-4444-4444-444444444444';

-- =====================================================================
-- 2) Sales -- one INSERT, spread across all 5 cities + date ranges
-- =====================================================================
--
-- Date plan:
--   today          -- 1 (winding_down)
--   tomorrow       -- 3
--   this weekend   -- 5  (Sat/Sun)
--   next weekend   -- 5
--   2 weeks out    -- 3
--
-- Coordinate jitter: about ±0.015 deg from city center, ~1 mile.

insert into public.sales (
  id, user_id, title, description, address,
  latitude, longitude, start_date, end_date,
  start_time, end_time, status, categories, pricing_notes
) values
  -- ── Indianapolis (39.7684, -86.1581) ──────────────────────────────
  (
    gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
    'Estate sale — antiques & mid-century',
    '[seed] Decades of treasures. Lots of vinyl, vintage Pyrex, and an oak dining set.',
    '5400 N College Ave, Indianapolis, IN',
    39.8400, -86.1530,
    current_date + 1, current_date + 2,
    '08:00', '15:00',
    'active', array['antiques','furniture','kitchen','books'],
    'Most items $5-$50. Big furniture negotiable.'
  ),
  (
    gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
    'Moving sale — everything must go',
    '[seed] Couch, kitchen table, two TVs, kids toys, board games.',
    '1234 E 38th St, Indianapolis, IN',
    39.8210, -86.1340,
    current_date + (6 - extract(dow from current_date))::int,
    current_date + (6 - extract(dow from current_date))::int,
    '09:00', '14:00',
    'active', array['furniture','electronics','toys','kitchen'],
    'Make me an offer.'
  ),
  (
    gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
    'Garage cleanout — tools galore',
    '[seed] Power tools, hand tools, Craftsman wrench sets, old fishing gear.',
    '4500 Madison Ave, Indianapolis, IN',
    39.7180, -86.1430,
    current_date + (7 - extract(dow from current_date))::int,
    current_date + (7 - extract(dow from current_date))::int,
    '08:00', '13:00',
    'active', array['tools','sports','other'],
    '$1-$100. Cash only.'
  ),
  (
    gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
    'Multi-family kids stuff',
    '[seed] Strollers, baby clothes 0-2T, toys, books, two cribs.',
    '6200 Allisonville Rd, Indianapolis, IN',
    39.8540, -86.0820,
    current_date + 14, current_date + 14,
    '08:00', '12:00',
    'active', array['toys','clothing','books'],
    'Bag sale after 11 AM — $5 a bag.'
  ),
  (
    gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
    'Today only — front yard sale',
    '[seed] Clearing the garage before tomorrow. Tools, sporting goods, books.',
    '2200 Cold Spring Rd, Indianapolis, IN',
    39.8000, -86.2100,
    current_date, current_date,
    '07:00', '17:00',
    'winding_down', array['tools','sports','books','other'],
    'Most stuff under $20.'
  ),

  -- ── Fishers (39.9568, -86.0134) ───────────────────────────────────
  (
    gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
    'HUGE multi-family sale — Fishers',
    '[seed] Four families. Furniture, electronics, kitchen, kids gear, holiday decor.',
    '11875 Lantern Rd, Fishers, IN',
    39.9620, -86.0080,
    current_date + (6 - extract(dow from current_date))::int,
    current_date + (7 - extract(dow from current_date))::int,
    '08:00', '16:00',
    'active', array['furniture','electronics','kitchen','toys','other'],
    'Priced to move. Deals after 2 PM Sunday.'
  ),
  (
    gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
    'Designer clothing & shoes',
    '[seed] Womens 6-10, mens M-XL. Brands include Banana Republic, J.Crew, Free People.',
    '9700 Cumberland Rd, Fishers, IN',
    39.9430, -85.9870,
    current_date + 1, current_date + 2,
    '09:00', '15:00',
    'active', array['clothing'],
    '$2-$25 per item. 5 items for $20.'
  ),
  (
    gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
    'Workshop tools — retiring',
    '[seed] 30 years of accumulated tools, all going. Table saw, band saw, drill press, lathe.',
    '10500 E 116th St, Fishers, IN',
    39.9580, -86.0240,
    current_date + 7, current_date + 7,
    '08:00', '14:00',
    'active', array['tools','antiques','other'],
    'Big items priced firmly. Hand tools negotiable.'
  ),

  -- ── Anderson (40.1053, -85.6803) ──────────────────────────────────
  (
    gen_random_uuid(), '44444444-4444-4444-4444-444444444444',
    'Weekend yard sale — Anderson',
    '[seed] Furniture, household goods, holiday decorations, kids bikes.',
    '2200 W 16th St, Anderson, IN',
    40.1110, -85.6920,
    current_date + (6 - extract(dow from current_date))::int,
    current_date + (7 - extract(dow from current_date))::int,
    '08:00', '15:00',
    'active', array['furniture','kitchen','toys','sports'],
    'All offers considered.'
  ),
  (
    gen_random_uuid(), '44444444-4444-4444-4444-444444444444',
    'Antiques & collectibles',
    '[seed] Depression glass, antique tools, old records, vintage signs.',
    '1500 Jackson St, Anderson, IN',
    40.0980, -85.6710,
    current_date + 14, current_date + 14,
    '09:00', '14:00',
    'active', array['antiques','books','other'],
    'Serious collectors only. Prices firm.'
  ),
  (
    gen_random_uuid(), '33333333-3333-3333-3333-333333333333',
    'Tomorrow only — garage clean',
    '[seed] Tools, lawn equipment, sporting goods, fishing rods.',
    '3300 E 38th St, Anderson, IN',
    40.0890, -85.6580,
    current_date + 1, current_date + 1,
    '07:00', '13:00',
    'active', array['tools','sports'],
    'Cash and Venmo. Most under $30.'
  ),

  -- ── Muncie (40.1934, -85.3863) ────────────────────────────────────
  (
    gen_random_uuid(), '33333333-3333-3333-3333-333333333333',
    'Westside Muncie multi-family',
    '[seed] Furniture, electronics, kitchen, kids stuff. Four houses on the same block.',
    '4500 W Bethel Ave, Muncie, IN',
    40.2050, -85.4120,
    current_date + (6 - extract(dow from current_date))::int,
    current_date + (7 - extract(dow from current_date))::int,
    '08:00', '15:00',
    'active', array['furniture','electronics','kitchen','toys'],
    'Block sale. Maps at the corner house.'
  ),
  (
    gen_random_uuid(), '33333333-3333-3333-3333-333333333333',
    'Estate sale — full house',
    '[seed] Decades of accumulation. Mid-century furniture, vintage glassware, hand tools.',
    '1900 N Wheeling Ave, Muncie, IN',
    40.2010, -85.3760,
    current_date + 8, current_date + 9,
    '08:00', '16:00',
    'active', array['antiques','furniture','kitchen','tools','books'],
    'Sat full price, Sun 25% off, last hour 50% off.'
  ),
  (
    gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
    'Books & records sale',
    '[seed] 500+ paperbacks, 200 vinyl LPs, classical CDs, comic books.',
    '2300 W Riverside Ave, Muncie, IN',
    40.1980, -85.4040,
    current_date + 1, current_date + 1,
    '09:00', '14:00',
    'active', array['books'],
    'Paperbacks 50 cents. LPs $1-$5. Comics priced individually.'
  ),

  -- ── Fort Wayne (41.0793, -85.1394) ────────────────────────────────
  (
    gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
    'Northside Fort Wayne — moving sale',
    '[seed] Whole house worth of stuff. Couches, beds, kitchen, electronics, kids.',
    '6800 St Joe Rd, Fort Wayne, IN',
    41.1120, -85.1280,
    current_date + (6 - extract(dow from current_date))::int,
    current_date + (7 - extract(dow from current_date))::int,
    '08:00', '15:00',
    'active', array['furniture','electronics','kitchen','toys','clothing'],
    'Will haggle. Help us empty the house.'
  ),
  (
    gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
    'Garage sale — tools & sporting goods',
    '[seed] Power tools, fishing gear, hunting equipment, bikes.',
    '4400 Bluffton Rd, Fort Wayne, IN',
    41.0560, -85.1620,
    current_date + 8, current_date + 8,
    '07:00', '13:00',
    'active', array['tools','sports'],
    'All offers considered, cash only.'
  ),
  (
    gen_random_uuid(), '44444444-4444-4444-4444-444444444444',
    'Multi-family kids & baby',
    '[seed] Cribs, strollers, car seats, clothes 0-5T, toys, board games.',
    '3900 E Coliseum Blvd, Fort Wayne, IN',
    41.0930, -85.1130,
    current_date + 15, current_date + 15,
    '08:00', '12:00',
    'active', array['toys','clothing','books'],
    'Bag sale 11-noon: $5 a bag.'
  );

-- Attach 2-3 photos per sale. Picsum gives stable, free placeholder
-- images — we vary the seed so we get a different photo for each
-- record. Real production photos look way better; these are just so
-- the UI has something to render.

insert into public.sale_media (sale_id, url, type, "order")
select
  s.id,
  'https://picsum.photos/seed/sale-' || s.id::text || '-' || g.idx || '/800/600',
  'image',
  g.idx
from public.sales s
cross join lateral generate_series(1, 2 + (abs(hashtext(s.id::text)) % 2)) g(idx)
where s.description like '[seed]%';

-- =====================================================================
-- 3) Listings -- single-item posts with a price
-- =====================================================================

insert into public.listings (
  id, user_id, title, description, price,
  pickup_input, pickup_display, pickup_lat, pickup_lng,
  status, categories
) values
  -- Indy
  (
    gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
    'West Elm leather sofa',
    '[seed] 3-cushion, butterscotch leather, light wear. Originally $2400.',
    495.00,
    '5400 N College Ave, Indianapolis, IN', 'Broad Ripple, Indianapolis',
    39.8400, -86.1530,
    'available', array['furniture']
  ),
  (
    gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
    'Vintage Pyrex bowl set (4 pcs)',
    '[seed] Cinderella set, 1960s. Excellent condition, no chips.',
    65.00,
    '1234 E 38th St, Indianapolis, IN', '38th & College, Indianapolis',
    39.8210, -86.1340,
    'available', array['kitchen','antiques']
  ),
  (
    gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
    'IKEA Hemnes bookcase',
    '[seed] White stain, 6 ft tall. Some wear on bottom shelf. Pickup only.',
    35.00,
    '4500 Madison Ave, Indianapolis, IN', 'South Indy',
    39.7180, -86.1430,
    'available', array['furniture','books']
  ),
  (
    gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
    'Peloton Bike+ (2022)',
    '[seed] Original owner, great shape. Mat and shoes included (size 10).',
    1200.00,
    '6200 Allisonville Rd, Indianapolis, IN', 'Castleton, Indianapolis',
    39.8540, -86.0820,
    'available', array['sports','electronics']
  ),

  -- Fishers
  (
    gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
    'DeWalt cordless drill set',
    '[seed] 20V Max, drill + impact + 2 batteries + charger. Lightly used.',
    140.00,
    '11875 Lantern Rd, Fishers, IN', 'Lantern Rd, Fishers',
    39.9620, -86.0080,
    'available', array['tools']
  ),
  (
    gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
    'Kids bunk bed (twin over twin)',
    '[seed] Solid wood, white. Mattresses included. Disassembled for pickup.',
    180.00,
    '9700 Cumberland Rd, Fishers, IN', 'Cumberland Rd, Fishers',
    39.9430, -85.9870,
    'available', array['furniture','toys']
  ),
  (
    gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
    'Le Creuset 5.5 qt Dutch oven',
    '[seed] Marseille blue. Used a few times, basically new. Original box.',
    175.00,
    '10500 E 116th St, Fishers, IN', '116th St, Fishers',
    39.9580, -86.0240,
    'available', array['kitchen']
  ),

  -- Anderson
  (
    gen_random_uuid(), '44444444-4444-4444-4444-444444444444',
    'Honda push mower',
    '[seed] 21 inch, runs great, just serviced. Self-propelled.',
    180.00,
    '2200 W 16th St, Anderson, IN', 'Anderson',
    40.1110, -85.6920,
    'available', array['tools','other']
  ),
  (
    gen_random_uuid(), '44444444-4444-4444-4444-444444444444',
    'Antique secretary desk',
    '[seed] Walnut, drop-front with cubbies. Some age wear, very pretty.',
    225.00,
    '1500 Jackson St, Anderson, IN', 'Jackson St, Anderson',
    40.0980, -85.6710,
    'available', array['furniture','antiques']
  ),

  -- Muncie
  (
    gen_random_uuid(), '33333333-3333-3333-3333-333333333333',
    'Treadmill — NordicTrack',
    '[seed] Folds up. Works perfectly, just don''t use it. Pickup.',
    250.00,
    '4500 W Bethel Ave, Muncie, IN', 'Westside Muncie',
    40.2050, -85.4120,
    'available', array['sports']
  ),
  (
    gen_random_uuid(), '33333333-3333-3333-3333-333333333333',
    'Vintage record collection (~200)',
    '[seed] Mostly 60s/70s rock and jazz. Inspect before buying. All or nothing.',
    400.00,
    '1900 N Wheeling Ave, Muncie, IN', 'North Muncie',
    40.2010, -85.3760,
    'available', array['books','antiques']
  ),
  (
    gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
    'Bose SoundLink speaker',
    '[seed] Excellent sound, charges fine. Includes charger.',
    45.00,
    '2300 W Riverside Ave, Muncie, IN', 'Riverside, Muncie',
    40.1980, -85.4040,
    'available', array['electronics']
  ),

  -- Fort Wayne
  (
    gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
    'Pottery Barn farmhouse table',
    '[seed] Seats 6-8. Reclaimed wood, gorgeous. Some surface marks (character).',
    650.00,
    '6800 St Joe Rd, Fort Wayne, IN', 'Northside, Fort Wayne',
    41.1120, -85.1280,
    'available', array['furniture']
  ),
  (
    gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
    'Trek hybrid bike (medium)',
    '[seed] FX 3 Disc, 2021. ~200 miles. Helmet & lock included.',
    525.00,
    '4400 Bluffton Rd, Fort Wayne, IN', 'Southwest Fort Wayne',
    41.0560, -85.1620,
    'available', array['sports']
  ),
  (
    gen_random_uuid(), '44444444-4444-4444-4444-444444444444',
    'Carter''s baby clothes lot (0-12mo)',
    '[seed] ~60 pieces, gently used. Onesies, sleepers, outfits.',
    40.00,
    '3900 E Coliseum Blvd, Fort Wayne, IN', 'East Fort Wayne',
    41.0930, -85.1130,
    'available', array['clothing','toys']
  );

insert into public.listing_media (listing_id, url, type, "order")
select
  l.id,
  'https://picsum.photos/seed/listing-' || l.id::text || '-' || g.idx || '/800/600',
  'image',
  g.idx
from public.listings l
cross join lateral generate_series(1, 1 + (abs(hashtext(l.id::text)) % 3)) g(idx)
where l.description like '[seed]%';

-- =====================================================================
-- 4) Cleanup (commented out -- uncomment + run to remove all seed data)
-- =====================================================================

-- delete from public.sale_media
--   where sale_id in (select id from public.sales where description like '[seed]%');
-- delete from public.listing_media
--   where listing_id in (select id from public.listings where description like '[seed]%');
-- delete from public.sales    where description like '[seed]%';
-- delete from public.listings where description like '[seed]%';
-- delete from auth.users where email in (
--   'seed-sarah@localhauls.test',
--   'seed-mike@localhauls.test',
--   'seed-linda@localhauls.test',
--   'seed-tom@localhauls.test'
-- );
