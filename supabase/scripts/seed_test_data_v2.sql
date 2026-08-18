-- Test data seed v2. ONE-OFF, runs via the Supabase SQL editor.
-- ADDITIVE on top of seed_test_data.sql (safe to run even if v1 wasn't:
-- every insert is conflict-guarded). All rows tagged "[seed2]" so the
-- cleanup block at the bottom can scrub v2 without touching v1.
--
-- What it creates, clustered around MUNCIE, IN (the test device's area):
--   • 6 more fake sellers (auth.users → profiles via trigger), with
--     avatars, bios, and accepted_payments so profile pages look real
--   • ~14 sales: live RIGHT NOW, this weekend, next weekend, and ended
--     — with vibe tags so every Discover filter has matches
--   • ~16 listings (2 sold) — pickup coords are auto-coarsened by the
--     server trigger, which is exactly what we want to see in testing
--   • picsum photos for everything
--   • reviews + follows BETWEEN seed users → sellers show star ratings
--   • for YOUR account (jasonwynkoop1@yahoo.com), if it exists:
--     reviews about you, followers, saved sales/listings, two inbox
--     conversations (one unread), and two visited sales

-- =====================================================================
-- 1) Six more fake sellers (Muncie area)
-- =====================================================================

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_user_meta_data, created_at, updated_at
) values
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'seed-becca@localhauls.test',
   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', now(),
   '{"full_name": "Becca in Riverside"}'::jsonb, now(), now()),
  ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'seed-davekaren@localhauls.test',
   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', now(),
   '{"full_name": "Dave & Karen (Yorktown)"}'::jsonb, now(), now()),
  ('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'seed-miguel@localhauls.test',
   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', now(),
   '{"full_name": "Miguel on Tillotson"}'::jsonb, now(), now()),
  ('88888888-8888-8888-8888-888888888888', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'seed-pat@localhauls.test',
   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', now(),
   '{"full_name": "Granny Pat''s Finds"}'::jsonb, now(), now()),
  ('99999999-9999-9999-9999-999999999999', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'seed-josh@localhauls.test',
   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', now(),
   '{"full_name": "Josh near Ball State"}'::jsonb, now(), now()),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'seed-hendersons@localhauls.test',
   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', now(),
   '{"full_name": "The Hendersons (Halteman)"}'::jsonb, now(), now())
on conflict (id) do nothing;

-- Make every seed profile (v1's four + v2's six) look like a real
-- member: avatar, bio, city, accepted payments.
update public.profiles p
set
  avatar_url = 'https://i.pravatar.cc/300?u=' || p.id::text,
  city = v.city, state = 'IN', zip_code = v.zip,
  bio = v.bio,
  accepted_payments = v.pay
from (values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'Indianapolis', '46220',
   'Estate-sale regular. I price to move — come say hi.', array['cash','venmo']),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'Fishers', '46038',
   'Garage perpetually full. Sales most months, spring through fall.', array['cash','venmo','zelle']),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'Muncie', '47304',
   'Westside Muncie. Kids'' clothes, toys, and household stuff.', array['cash']),
  ('44444444-4444-4444-4444-444444444444'::uuid, 'Anderson', '46016',
   'Tools, fishing gear, and whatever the barn coughs up.', array['cash','paypal']),
  ('55555555-5555-5555-5555-555555555555'::uuid, 'Muncie', '47303',
   'Riverside/Normal City. Vintage clothes + records are my weakness.', array['cash','venmo']),
  ('66666666-6666-6666-6666-666666666666'::uuid, 'Yorktown', '47396',
   'Empty-nesters downsizing 30 years of very good taste.', array['cash','venmo','zelle']),
  ('77777777-7777-7777-7777-777777777777'::uuid, 'Muncie', '47304',
   'Woodworker clearing shop space a few times a year. Tools priced fair.', array['cash','zelle']),
  ('88888888-8888-8888-8888-888888888888'::uuid, 'Muncie', '47303',
   'Fifty years of collecting. Pyrex, quilts, and stories included free.', array['cash']),
  ('99999999-9999-9999-9999-999999999999'::uuid, 'Muncie', '47306',
   'BSU grad student. Furniture and electronics turnover every semester.', array['venmo','cashapp']),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Muncie', '47304',
   'Halteman family of five — outgrown bikes, games, and sports gear.', array['cash','venmo'])
) as v(id, city, zip, bio, pay)
where p.id = v.id;

-- =====================================================================
-- 2) Sales around Muncie — live now / weekend / next weekend / ended
-- =====================================================================

insert into public.sales (
  id, user_id, title, description, address,
  latitude, longitude, start_date, end_date,
  start_time, end_time, status, categories, pricing_notes, vibe_tags
) values
  -- ── LIVE TODAY (open right now while testing) ─────────────────────
  (gen_random_uuid(), '88888888-8888-8888-8888-888888888888',
   'Granny Pat''s attic clear-out',
   '[seed2] Half a century of treasures: Pyrex, quilts, costume jewelry, depression glass, and a cedar chest.',
   '2105 N Wheeling Ave, Muncie, IN', 40.2168, -85.3942,
   current_date, current_date, '07:00', '19:00',
   'active', array['antiques','kitchen','clothing_womens','books'],
   'Most under $20. Cash only, exact change appreciated.', array['early_bird','cash_only','estate']),
  (gen_random_uuid(), '99999999-9999-9999-9999-999999999999',
   'Semester move-out — furniture & tech',
   '[seed2] Desk, futon, mini fridge, 24in monitor, mechanical keyboard, bike. Everything cheap, everything today.',
   '1812 W University Ave, Muncie, IN', 40.1986, -85.4081,
   current_date, current_date, '07:00', '19:00',
   'active', array['furniture','electronics','electronics_computers','sports'],
   'Name a fair price and it''s yours.', array['moving','cash_only']),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'Halteman block sale — 6 families!',
   '[seed2] Six houses on one street: kids clothes, bikes, strollers, video games, tools, and a kayak.',
   '3400 W Hialeah Dr, Muncie, IN', 40.2329, -85.4196,
   current_date, current_date + 1, '07:00', '19:00',
   'active', array['toys','clothing_toddler','sports','electronics_video_games','tools'],
   'Multi-family pricing — everything marked.', array['block_sale','early_bird']),

  -- ── Tomorrow ──────────────────────────────────────────────────────
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555',
   'Vintage closet purge — Riverside',
   '[seed2] Racks of 70s-90s denim, band tees, leather jackets, and 200+ records. Bring hangers.',
   '1604 W Riverside Ave, Muncie, IN', 40.1998, -85.4023,
   current_date + 1, current_date + 1, '09:00', '16:00',
   'active', array['clothing','clothing_womens','clothing_mens','electronics_audio'],
   'Tees $5, denim $10-25, records $2-15.', array['early_bird']),
  (gen_random_uuid(), '77777777-7777-7777-7777-777777777777',
   'Woodshop tool sale',
   '[seed2] Table saw, router table, clamps galore, hand planes, and scrap hardwood by the box.',
   '2900 S Tillotson Ave, Muncie, IN', 40.1672, -85.4153,
   current_date + 1, current_date + 1, '08:00', '14:00',
   'active', array['tools','furniture_outdoor'],
   'Power tools firm-ish. Hand tools negotiable.', array['cash_only']),

  -- ── This weekend ──────────────────────────────────────────────────
  (gen_random_uuid(), '66666666-6666-6666-6666-666666666666',
   'Downsizing sale — 30 years, 3 bedrooms',
   '[seed2] Dining set, two dressers, china cabinet, garden tools, holiday decor by the tote.',
   '9200 W Smith St, Yorktown, IN', 40.1738, -85.4942,
   current_date + (6 - extract(dow from current_date))::int,
   current_date + (7 - extract(dow from current_date))::int,
   '08:00', '15:00',
   'active', array['furniture','furniture_dining_room','antiques','furniture_outdoor','other'],
   'Furniture priced to leave. Saturday full price, Sunday half off.', array['estate','moving']),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333',
   'Kids grow too fast sale',
   '[seed2] Boys 2T-6, girls 4-8, toys, books, a balance bike, and a double stroller.',
   '3705 W Purdue Ave, Muncie, IN', 40.2031, -85.4337,
   current_date + (6 - extract(dow from current_date))::int,
   current_date + (6 - extract(dow from current_date))::int,
   '08:00', '13:00',
   'active', array['clothing_toddler','toys','books'],
   'Fill a bag for $10.', array['early_bird','cash_only']),
  (gen_random_uuid(), '99999999-9999-9999-9999-999999999999',
   'Gamer garage sale',
   '[seed2] Consoles back to the GameCube, controllers, 60+ games, gaming chair, and two monitors.',
   '2210 N Ball Ave, Muncie, IN', 40.2143, -85.4108,
   current_date + (6 - extract(dow from current_date))::int,
   current_date + (7 - extract(dow from current_date))::int,
   '10:00', '17:00',
   'active', array['electronics_video_games','electronics','electronics_tv'],
   'Games $3-30. Consoles tested, priced to sell.', array[]::text[]),

  -- ── Next weekend ──────────────────────────────────────────────────
  (gen_random_uuid(), '88888888-8888-8888-8888-888888888888',
   'Church rummage sale — Gilbert St',
   '[seed2] Whole fellowship hall full: clothes, kitchenware, books, linens, and a bake table.',
   '820 E Gilbert St, Muncie, IN', 40.1899, -85.3779,
   current_date + (13 - extract(dow from current_date))::int,
   current_date + (13 - extract(dow from current_date))::int,
   '08:00', '14:00',
   'active', array['clothing','kitchen','books','other'],
   'Bag sale after noon — $5 a bag.', array['block_sale','cash_only']),
  (gen_random_uuid(), '66666666-6666-6666-6666-666666666666',
   'Garage & garden clear-out',
   '[seed2] Mowers, trimmers, hoses, planters, patio set, and half a garage of hand tools.',
   '8804 W River Rd, Yorktown, IN', 40.1801, -85.4878,
   current_date + (13 - extract(dow from current_date))::int,
   current_date + (14 - extract(dow from current_date))::int,
   '09:00', '16:00',
   'active', array['furniture_outdoor','tools'],
   'Patio set $150 obo.', array['moving']),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555',
   'Art & craft supply destash',
   '[seed2] Yarn by the bin, fabric, frames, easels, beads, and a working sewing machine.',
   '510 N Martin St, Muncie, IN', 40.1972, -85.4046,
   current_date + (13 - extract(dow from current_date))::int,
   current_date + (13 - extract(dow from current_date))::int,
   '09:00', '15:00',
   'active', array['other','antiques'],
   'Everything must go — make offers on bulk.', array['early_bird']),

  -- ── Ended (history / "ENDED" chips / visited toggles) ─────────────
  (gen_random_uuid(), '77777777-7777-7777-7777-777777777777',
   'Spring shop cleanout (ended)',
   '[seed2] Lumber offcuts, sanders, bench grinder, shop vac.',
   '2812 S Hoyt Ave, Muncie, IN', 40.1701, -85.3692,
   current_date - 4, current_date - 3, '08:00', '14:00',
   'ended', array['tools'],
   'Done and dusted.', array['cash_only']),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'Sports gear sale (ended)',
   '[seed2] Cleats, pads, bats, golf clubs, and a basketball hoop.',
   '4001 N Janney Ave, Muncie, IN', 40.2398, -85.4221,
   current_date - 6, current_date - 5, '09:00', '15:00',
   'ended', array['sports','toys'],
   'Gone!', array[]::text[]),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333',
   'Holiday decor blowout (ended)',
   '[seed2] Trees, lights, wreaths, and enough ornaments for three houses.',
   '3505 W Jackson St, Muncie, IN', 40.1922, -85.4307,
   current_date - 10, current_date - 9, '08:00', '13:00',
   'ended', array['other'],
   'See you next year.', array['estate']);

-- Photos: 2-3 picsum images per v2 sale.
insert into public.sale_media (sale_id, url, type, "order")
select
  s.id,
  'https://picsum.photos/seed/sale2-' || s.id::text || '-' || g.idx || '/800/600',
  'image',
  g.idx
from public.sales s
cross join lateral generate_series(1, 2 + (abs(hashtext(s.id::text)) % 2)) g(idx)
where s.description like '[seed2]%';

-- =====================================================================
-- 3) Listings around Muncie (pickup coords get coarsened by trigger)
-- =====================================================================

insert into public.listings (
  id, user_id, title, description, price,
  pickup_input, pickup_display, pickup_lat, pickup_lng,
  status, categories
) values
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555',
   'Vintage leather moto jacket (M)', '[seed2] 80s Schott-style, broken in perfectly. No rips.',
   85, 'Riverside, Muncie', 'Riverside, Muncie', 40.1995, -85.4030, 'available',
   array['clothing','clothing_womens']),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555',
   'Crate of 45s — Motown & soul', '[seed2] ~120 singles, sleeves rough, vinyl clean.',
   60, 'Riverside, Muncie', 'Riverside, Muncie', 40.2001, -85.4011, 'available',
   array['electronics_audio','antiques']),
  (gen_random_uuid(), '66666666-6666-6666-6666-666666666666',
   'Oak dining table + 6 chairs', '[seed2] Solid oak, two leaves, seats 10 extended.',
   275, 'Yorktown', 'Yorktown', 40.1742, -85.4920, 'available',
   array['furniture','furniture_dining_room']),
  (gen_random_uuid(), '66666666-6666-6666-6666-666666666666',
   'China cabinet — lighted', '[seed2] Glass shelves, mirror back, excellent shape.',
   180, 'Yorktown', 'Yorktown', 40.1755, -85.4901, 'available',
   array['furniture','antiques']),
  (gen_random_uuid(), '77777777-7777-7777-7777-777777777777',
   'DeWalt table saw (DWE7491RS)', '[seed2] Rolling stand, new blade, fence true.',
   320, 'South Muncie', 'South Muncie', 40.1680, -85.4140, 'available',
   array['tools']),
  (gen_random_uuid(), '77777777-7777-7777-7777-777777777777',
   'Box of hand planes', '[seed2] Five planes incl. a Stanley No. 4 — restorable.',
   75, 'South Muncie', 'South Muncie', 40.1668, -85.4122, 'available',
   array['tools','antiques']),
  (gen_random_uuid(), '88888888-8888-8888-8888-888888888888',
   'Pyrex primary bowls — full set', '[seed2] 401-404, no chips, colors strong.',
   95, 'McGalliard area, Muncie', 'McGalliard area, Muncie', 40.2173, -85.3950, 'available',
   array['kitchen','antiques']),
  (gen_random_uuid(), '88888888-8888-8888-8888-888888888888',
   'Hand-stitched quilt, queen', '[seed2] Wedding ring pattern, stored cedar-clean.',
   140, 'McGalliard area, Muncie', 'McGalliard area, Muncie', 40.2180, -85.3961, 'available',
   array['antiques','other']),
  (gen_random_uuid(), '99999999-9999-9999-9999-999999999999',
   'PS5 + 2 controllers + 4 games', '[seed2] Disc edition, adult-owned, smoke-free.',
   340, 'Ball State area, Muncie', 'Ball State area, Muncie', 40.2049, -85.4090, 'available',
   array['electronics_video_games','electronics']),
  (gen_random_uuid(), '99999999-9999-9999-9999-999999999999',
   '27" 144Hz gaming monitor', '[seed2] AOC, no dead pixels, box included.',
   120, 'Ball State area, Muncie', 'Ball State area, Muncie', 40.2055, -85.4102, 'available',
   array['electronics_computers','electronics_tv']),
  (gen_random_uuid(), '99999999-9999-9999-9999-999999999999',
   'IKEA desk + chair combo', '[seed2] White Micke desk, Markus chair. Campus pickup.',
   80, 'Ball State area, Muncie', 'Ball State area, Muncie', 40.2061, -85.4076, 'available',
   array['furniture_office','furniture']),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'Kids 20" mountain bike', '[seed2] Shifts clean, new tubes, outgrown.',
   55, 'Halteman, Muncie', 'Halteman, Muncie', 40.2335, -85.4180, 'available',
   array['sports','toys']),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'Double jogging stroller', '[seed2] BOB Revolution, folds flat, tires hold air.',
   160, 'Halteman, Muncie', 'Halteman, Muncie', 40.2341, -85.4165, 'available',
   array['toys']),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333',
   'Toddler clothes lot — boys 3T', '[seed2] 40+ pieces, play to church clothes.',
   35, 'Westside Muncie', 'Westside Muncie', 40.2028, -85.4350, 'available',
   array['clothing_toddler','toys']),
  -- Sold pair (tests the Sold state)
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555',
   'Mid-century record console', '[seed2] Works! Warm sound, gorgeous legs.',
   220, 'Riverside, Muncie', 'Riverside, Muncie', 40.1990, -85.4040, 'sold',
   array['furniture','antiques','electronics_audio']),
  (gen_random_uuid(), '77777777-7777-7777-7777-777777777777',
   'Workbench with vise', '[seed2] Heavy maple top, 4in vise. Bring a truck.',
   90, 'South Muncie', 'South Muncie', 40.1690, -85.4133, 'sold',
   array['tools']);

-- Photos: 2-3 picsum images per v2 listing.
insert into public.listing_media (listing_id, url, type, "order")
select
  l.id,
  'https://picsum.photos/seed/listing2-' || l.id::text || '-' || g.idx || '/800/800',
  'image',
  g.idx
from public.listings l
cross join lateral generate_series(1, 2 + (abs(hashtext(l.id::text)) % 2)) g(idx)
where l.description like '[seed2]%';

-- =====================================================================
-- 4) Reviews between seed users → sellers get star ratings
--    (standalone reviews: sale_id null, one per subject+author pair)
-- =====================================================================

insert into public.reviews (subject_user_id, author_user_id, stars, body) values
  -- Granny Pat: beloved (4.9ish)
  ('88888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111', 5, 'The Pyrex was exactly as described and Pat threw in a story about every piece. Delight.'),
  ('88888888-8888-8888-8888-888888888888', '22222222-2222-2222-2222-222222222222', 5, 'Fair prices, organized tables, free cookies. The yard sale gold standard.'),
  ('88888888-8888-8888-8888-888888888888', '33333333-3333-3333-3333-333333333333', 5, 'Quilt was even prettier in person.'),
  ('88888888-8888-8888-8888-888888888888', '55555555-5555-5555-5555-555555555555', 5, 'Came for depression glass, left with a cedar chest. No regrets.'),
  ('88888888-8888-8888-8888-888888888888', '99999999-9999-9999-9999-999999999999', 4, 'Great stuff, arrive early — the good pieces go fast.'),
  ('88888888-8888-8888-8888-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5, 'Bought half her costume jewelry table for my daughters.'),
  -- Becca: solid
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 5, 'Records graded honestly, priced fairly.'),
  ('55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666', 4, 'Cool vintage stock. Cash only caught me out — hit the ATM first.'),
  ('55555555-5555-5555-5555-555555555555', '88888888-8888-8888-8888-888888888888', 5, 'A young person who knows her vinyl. Wonderful.'),
  ('55555555-5555-5555-5555-555555555555', '99999999-9999-9999-9999-999999999999', 4, 'Got a great denim jacket. Sizes ran small FYI.'),
  -- Dave & Karen
  ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 5, 'Furniture in better shape than advertised. Helped me load it too.'),
  ('66666666-6666-6666-6666-666666666666', '44444444-4444-4444-4444-444444444444', 5, 'Honest folks, clean garage sale, would buy again.'),
  ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 4, 'Lovely couple. China cabinet was a steal.'),
  -- Miguel
  ('77777777-7777-7777-7777-777777777777', '44444444-4444-4444-4444-444444444444', 5, 'Tools were maintained, not garage-rusted. Rare.'),
  ('77777777-7777-7777-7777-777777777777', '99999999-9999-9999-9999-999999999999', 5, 'Sold me a table saw and taught me to square the fence. Legend.'),
  ('77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666', 4, 'Good prices on clamps. Communicative on pickup time.'),
  -- Josh
  ('99999999-9999-9999-9999-999999999999', '55555555-5555-5555-5555-555555555555', 4, 'Console tested in front of me. Smooth deal.'),
  ('99999999-9999-9999-9999-999999999999', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5, 'Kids cleaned out his game bins. Patient seller.'),
  -- Hendersons
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 5, 'Block sale was organized chaos in the best way.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '88888888-8888-8888-8888-888888888888', 5, 'Bought a bike for my grandson. Family was lovely.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '77777777-7777-7777-7777-777777777777', 4, 'Good stroller deal, easy meetup.'),
  -- v1 sellers get some love too
  ('11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888888', 5, 'Her estate sales are events. Arrive at open.'),
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', 4, 'Great mid-century pieces, slightly ambitious pricing.'),
  ('33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', 5, 'Kids clothes washed and folded. Bless.'),
  ('33333333-3333-3333-3333-333333333333', '66666666-6666-6666-6666-666666666666', 5, 'The fill-a-bag deal is unbeatable.'),
  ('44444444-4444-4444-4444-444444444444', '77777777-7777-7777-7777-777777777777', 4, 'Solid fishing gear, knows his tackle.'),
  ('22222222-2222-2222-2222-222222222222', '99999999-9999-9999-9999-999999999999', 4, 'Bought a TV stand, no surprises.')
on conflict (subject_user_id, author_user_id) where sale_id is null do nothing;

-- =====================================================================
-- 5) Follows between seed users
-- =====================================================================

insert into public.follows (follower_id, followed_id) values
  ('11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888888'),
  ('22222222-2222-2222-2222-222222222222', '88888888-8888-8888-8888-888888888888'),
  ('33333333-3333-3333-3333-333333333333', '88888888-8888-8888-8888-888888888888'),
  ('55555555-5555-5555-5555-555555555555', '88888888-8888-8888-8888-888888888888'),
  ('99999999-9999-9999-9999-999999999999', '88888888-8888-8888-8888-888888888888'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '88888888-8888-8888-8888-888888888888'),
  ('88888888-8888-8888-8888-888888888888', '55555555-5555-5555-5555-555555555555'),
  ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555'),
  ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555'),
  ('99999999-9999-9999-9999-999999999999', '77777777-7777-7777-7777-777777777777'),
  ('44444444-4444-4444-4444-444444444444', '77777777-7777-7777-7777-777777777777'),
  ('55555555-5555-5555-5555-555555555555', '99999999-9999-9999-9999-999999999999'),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('88888888-8888-8888-8888-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
on conflict (follower_id, followed_id) do nothing;

-- =====================================================================
-- 6) Personal data for the real test account (if it exists):
--    reviews about you, followers, saves, visits, and two conversations
-- =====================================================================

do $$
declare
  me uuid;
  conv uuid;
  l_listing uuid;
  l_sale uuid;
begin
  select id into me from auth.users where email = 'jasonwynkoop1@yahoo.com' limit 1;
  if me is null then
    raise notice 'Test account not found — skipping personal seed block.';
    return;
  end if;

  -- Reviews about you → your own profile shows a star rating.
  insert into public.reviews (subject_user_id, author_user_id, stars, body) values
    (me, '88888888-8888-8888-8888-888888888888', 5, 'Prompt, polite, and paid exact change. Star buyer.'),
    (me, '55555555-5555-5555-5555-555555555555', 5, 'Easy meetup, showed up on time.'),
    (me, '77777777-7777-7777-7777-777777777777', 4, 'Good communication, smooth pickup.'),
    (me, '99999999-9999-9999-9999-999999999999', 5, 'Bought my monitor, zero hassle.'),
    (me, '66666666-6666-6666-6666-666666666666', 5, 'Lovely to deal with — welcome back anytime.')
  on conflict (subject_user_id, author_user_id) where sale_id is null do nothing;

  -- Followers + a few follows of your own.
  insert into public.follows (follower_id, followed_id) values
    ('88888888-8888-8888-8888-888888888888', me),
    ('55555555-5555-5555-5555-555555555555', me),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', me),
    (me, '88888888-8888-8888-8888-888888888888'),
    (me, '55555555-5555-5555-5555-555555555555'),
    (me, '77777777-7777-7777-7777-777777777777')
  on conflict (follower_id, followed_id) do nothing;

  -- Saved sales (hearts) — first four upcoming v2 sales.
  insert into public.favorites (user_id, sale_id)
  select me, s.id from public.sales s
  where s.description like '[seed2]%' and s.status = 'active'
  order by s.start_date asc limit 4
  on conflict (user_id, sale_id) do nothing;

  -- Saved listings.
  insert into public.listing_favorites (user_id, listing_id)
  select me, l.id from public.listings l
  where l.description like '[seed2]%' and l.status = 'available'
  order by l.price desc limit 3
  on conflict (user_id, listing_id) do nothing;

  -- Visited marks on the two most recent ended v2 sales.
  insert into public.sale_visits (user_id, sale_id)
  select me, s.id from public.sales s
  where s.description like '[seed2]%' and s.status = 'ended'
  order by s.end_date desc limit 2
  on conflict (user_id, sale_id) do nothing;

  -- Conversation 1: you ↔ Becca about a listing (READ — no badge).
  select id into l_listing from public.listings
  where description like '[seed2]%' and user_id = '55555555-5555-5555-5555-555555555555'
    and status = 'available' limit 1;
  if l_listing is not null then
    insert into public.conversations
      (target_type, target_id, seller_id, buyer_id,
       created_at, last_message_at, buyer_last_read_at, seller_last_read_at)
    values ('listing', l_listing, '55555555-5555-5555-5555-555555555555', me,
            now() - interval '2 days', now() - interval '1 day',
            now(), now() - interval '1 day')
    on conflict (target_type, target_id, buyer_id) do nothing
    returning id into conv;
    if conv is not null then
      insert into public.messages (conversation_id, sender_id, body, created_at) values
        (conv, me, 'Hi! Is the moto jacket still available?', now() - interval '2 days'),
        (conv, '55555555-5555-5555-5555-555555555555', 'It is! It runs a little big if that helps.', now() - interval '2 days' + interval '20 minutes'),
        (conv, me, 'Perfect. Could I come by Saturday morning?', now() - interval '1 day' - interval '1 hour'),
        (conv, '55555555-5555-5555-5555-555555555555', 'Saturday works — anytime after 9. I''ll hold it for you.', now() - interval '1 day');
    end if;
  end if;

  -- Conversation 2: you ↔ Granny Pat about her live sale (UNREAD badge).
  conv := null;
  select id into l_sale from public.sales
  where description like '[seed2]%' and user_id = '88888888-8888-8888-8888-888888888888'
    and status = 'active' limit 1;
  if l_sale is not null then
    insert into public.conversations
      (target_type, target_id, seller_id, buyer_id,
       created_at, last_message_at, buyer_last_read_at, seller_last_read_at)
    values ('sale', l_sale, '88888888-8888-8888-8888-888888888888', me,
            now() - interval '3 hours', now() - interval '10 minutes',
            now() - interval '2 hours', now() - interval '10 minutes')
    on conflict (target_type, target_id, buyer_id) do nothing
    returning id into conv;
    if conv is not null then
      insert into public.messages (conversation_id, sender_id, body, created_at) values
        (conv, me, 'Do you still have the cedar chest from the photos?', now() - interval '3 hours'),
        (conv, '88888888-8888-8888-8888-888888888888', 'I do, dear — and I''ll knock $10 off if you come before noon.', now() - interval '10 minutes');
    end if;
  end if;
end $$;

-- =====================================================================
-- CLEANUP (uncomment to scrub v2 only; v1 has its own block)
-- =====================================================================
-- delete from public.messages where conversation_id in (
--   select id from public.conversations where seller_id in (
--     '55555555-5555-5555-5555-555555555555','66666666-6666-6666-6666-666666666666',
--     '77777777-7777-7777-7777-777777777777','88888888-8888-8888-8888-888888888888',
--     '99999999-9999-9999-9999-999999999999','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
-- delete from public.conversations where seller_id in (
--   '55555555-5555-5555-5555-555555555555','66666666-6666-6666-6666-666666666666',
--   '77777777-7777-7777-7777-777777777777','88888888-8888-8888-8888-888888888888',
--   '99999999-9999-9999-9999-999999999999','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
-- delete from public.sale_media    where sale_id    in (select id from public.sales    where description like '[seed2]%');
-- delete from public.listing_media where listing_id in (select id from public.listings where description like '[seed2]%');
-- delete from public.sales    where description like '[seed2]%';
-- delete from public.listings where description like '[seed2]%';
-- delete from auth.users where email in (
--   'seed-becca@localhauls.test','seed-davekaren@localhauls.test',
--   'seed-miguel@localhauls.test','seed-pat@localhauls.test',
--   'seed-josh@localhauls.test','seed-hendersons@localhauls.test');
-- -- reviews/follows/favorites/visits referencing the seed users cascade
-- -- away with the auth.users deletes above.
