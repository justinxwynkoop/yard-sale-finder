#!/usr/bin/env node
// Yorktown Town-Wide Rummage Sale — Aug 28–29, 2026 (community flyer import).
//
// Run on a machine with internet:   node seed_yorktown_rummage.mjs
// It geocodes every stop via Nominatim (~1 req/sec, ≈1 minute) and writes
// seed_yorktown_rummage.sql next to this file. Paste that into the Supabase
// SQL editor. The SQL is idempotent and dedup-guarded:
//   • everything is owned by YOUR account (looked up by OWNER_EMAIL at run
//     time), so you can edit or delete any stop — and manage the event —
//     right in the app like any of your own sales
//   • the sale_events row is find-or-created by (title, start_date)
//   • each stop is skipped if a sale already exists at that address
//     overlapping the weekend (so residents' own posts are never duplicated)
//   • messaging is OFF on every stop (you're not the seller) and each
//     description credits the community flyer
//
// `node seed_yorktown_rummage.mjs --mock` skips the network and emits fake
// coordinates — for testing the SQL generation only, never for production.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOCK = process.argv.includes('--mock');

// ─── Flyer data (transcribed from the Yorktown Community post) ────────────
// day: 'fri' (Aug 28 only) | 'sat' (Aug 29 only) | 'both'
// city defaults to Yorktown; the flyer marks a few stops as Muncie.
const STOPS = [
  { day: 'fri', address: '8908 W. Mill Rd.', items: 'Stationary bike, elliptical', cats: ['sports'] },
  { day: 'fri', address: '2310 S. Broadway St.', items: 'Quality name-brand items, home decor', cats: ['clothing', 'other'] },
  { day: 'fri', address: '8800 Greenville Dr.', items: 'Adult clothing, household items', cats: ['clothing', 'other'] },

  { day: 'sat', address: '1103 S. Cummings Dr.', items: 'Variety of items, indoor/outdoor household items', cats: ['other'] },
  { day: 'sat', address: '2409 S. Walnut St.', items: 'Antique glassware, pottery, vintage items', cats: ['antiques'] },
  { day: 'sat', address: '6210 W. Gray St.', city: 'Muncie', items: 'Kids clothes, ladies clothing, fall and home decor', cats: ['clothing'] },
  { day: 'sat', address: '6213 W. Gray St.', city: 'Muncie', items: "Boy's clothes size 12-14, signs, antiques, misc.", cats: ['clothing', 'antiques'] },
  { day: 'sat', address: '2813 S. Broadway St.', items: 'Household items, toddler & plus-size clothing', cats: ['clothing', 'other'] },
  { day: 'sat', address: '2000 S. York Rd.', items: 'Household items, vintage stuff, antiques', cats: ['antiques', 'other'] },
  { day: 'sat', address: '1805 N. Magnolia Dr.', city: 'Muncie', items: 'Household items, PartyLite, decor, kitchen', cats: ['kitchen', 'other'] },
  { day: 'sat', address: '1280 S. Hoffer Dr.', city: 'Muncie', items: "Baby clothes/toys, tools, men's/women's clothing", cats: ['toys', 'tools', 'clothing'] },
  { day: 'sat', address: '8305 W. Weatherstone Ln.', items: 'Adult/kids clothes, shoes, toys, household items', cats: ['clothing', 'toys'] },
  { day: 'sat', address: '2210 S. Marsh Rd.', items: "Women's clothes, household, Christmas, misc.", cats: ['clothing', 'other'] },
  { day: 'sat', address: '10000 W. Jackson St.', items: 'Clothes, shoes, Christmas, bedding & linens', cats: ['clothing', 'other'] },
  { day: 'sat', address: '509 S. Buckingham Rd.', items: 'Lemonade/baked goods, desk, hutch, clothes', cats: ['furniture', 'clothing'] },
  { day: 'sat', address: '205 N. Eucalyptus Ct.', items: 'Household and Christmas items', cats: ['other'] },
  { day: 'sat', address: '2320 S. Daugherty Ln.', items: "Loveseat, dresser, kid's/adults' clothes, decor", cats: ['furniture', 'clothing'] },

  { day: 'both', address: '1609 S. Oakdale Dr.', items: 'Home decor, clothes, shoes', cats: ['clothing', 'other'] },
  { day: 'both', address: '8004 W. Lindberg Dr.', items: "Stockpile, laundry detergent, kid's clothes, household", cats: ['clothing', 'other'] },
  { day: 'both', address: '9313 W. Smith St.', items: 'Kids clothing/toys, teen boy/girl clothes', cats: ['clothing', 'toys'] },
  { day: 'both', address: '312 S. Buckingham Rd.', items: 'New/antique furniture, clothes, electronics, tools', cats: ['furniture', 'electronics', 'tools'] },
  { day: 'both', address: '2905 S. Broadway St.', items: 'Little bit of everything', cats: ['other'] },
  { day: 'both', address: '8405 W. Red Bud Ln.', items: 'Toys, mugs, kitchen', pricing: 'Everything is $1 or under', cats: ['toys', 'kitchen'] },
  { day: 'both', address: '8806 W. Lone Beech Dr.', items: "TV stand, women's clothes, bike, blankets, decor", cats: ['furniture', 'clothing', 'sports'] },
  { day: 'both', address: '1217 S. Sarasota Dr.', items: "Men's bike, sports cards, tools, magazines", cats: ['sports', 'tools'] },
  { day: 'both', address: '9501 W. High St.', items: 'Collectible vintage, vintage glassware, art/craft', cats: ['antiques'] },
  { day: 'both', address: '408 S. Prestwick Ln.', items: 'Tools, jewelry, electronics, toys, furniture, misc.', cats: ['tools', 'electronics', 'toys', 'furniture'] },
  { day: 'both', address: '1209 N. Snowmass Ln.', items: 'Name-brand clothes, home decor, furniture, misc.', cats: ['clothing', 'furniture'] },
  { day: 'both', address: '2208 N. Old Towne Ln.', items: 'Vintage hats/clothes and shoes, electronics, misc.', cats: ['clothing', 'electronics', 'antiques'] },
  { day: 'both', address: '1805 S. York Rd.', items: "Housewares, toys, men's/women's clothes, misc.", cats: ['kitchen', 'toys', 'clothing'] },
  { day: 'both', address: '500 S. Riviera Ln.', items: 'New bedding, home decor, housewares', cats: ['other'] },
  { day: 'both', address: '9101 W. Arch St.', items: 'Vintage/non-vintage household collectibles', cats: ['antiques'] },
  { day: 'both', address: '10137 W. Lexington Blvd.', items: 'Clothing multi-size, toys, Squishmallows, decor', cats: ['clothing', 'toys'] },
  { day: 'both', address: '8201 W. Weller St.', items: 'Vintage Apple monitor, video games, toys', cats: ['electronics', 'toys'] },
  { day: 'both', address: '1214 S. Sarasota Dr.', items: 'Mowers, jewelry, furniture, VS tote bags, knives', cats: ['tools', 'furniture'] },
  { day: 'both', address: '8209 Fairview Dr.', items: "Baby girl items, women's clothes, misc. items", cats: ['clothing', 'toys'] },
  { day: 'both', address: '1432 S. Colony Dr.', items: 'Rare antiques, plus-size Torrid, Lane Bryant', cats: ['antiques', 'clothing'] },
  { day: 'both', address: '8204 W. Pleasant Rd.', items: 'Designer clothes, coats, shirts, purses and more', cats: ['clothing'] },
  { day: 'both', address: '309 N. Bliss Ave.', items: "Antique items, men's 3X, women's 2X clothes", cats: ['antiques', 'clothing'] },
  { day: 'both', address: '401 N. Aspen Ln.', items: 'Furniture, tools, ladder', pricing: 'No prices — make an offer', cats: ['furniture', 'tools'] },
  { day: 'both', address: '9900 W. Gallagher Way', items: 'Various size clothes, household items, misc.', cats: ['clothing', 'other'] },
  { day: 'both', address: '6061 W. Cornbread Rd.', city: 'Muncie', items: '3-family sale: household, maternity, tools, kitchen', cats: ['tools', 'kitchen', 'clothing'] },
  { day: 'both', address: '7829 W. Frankie Ln.', items: "Furniture, kid's/adult clothes, home decor, walker", cats: ['furniture', 'clothing'] },
  { day: 'both', address: '1101 S. Sunset Dr.', items: 'Cookbooks, purses, crochet magazines', cats: ['books'] },
  { day: 'both', address: '8420 W. Adeline St.', items: 'Vintage Indiana glass', cats: ['antiques'] },
];

// Hand overrides for addresses Nominatim can't resolve: fill in after a
// failed run, e.g. '8209 Fairview Dr.': { lat: 40.17, lon: -85.49 }.
// These 9 came from the US Census geocoder / ArcGIS (rooftop matches) —
// the flyer's spellings differ from the official street names where noted.
const OVERRIDES = {
  '8800 Greenville Dr.': { lat: 40.192403, lon: -85.489125 },
  '1103 S. Cummings Dr.': { lat: 40.183729, lon: -85.460598 }, // S Cummins Dr, Muncie
  '1805 N. Magnolia Dr.': { lat: 40.208208, lon: -85.487917 }, // N Magnolia Ln, Muncie
  '2210 S. Marsh Rd.': { lat: 40.171742, lon: -85.499683 }, // S Marsh Ave
  '2320 S. Daugherty Ln.': { lat: 40.172351, lon: -85.502879 },
  '8004 W. Lindberg Dr.': { lat: 40.179436, lon: -85.47947 }, // W Lindbergh Dr
  '10137 W. Lexington Blvd.': { lat: 40.172821, lon: -85.504909 },
  '7829 W. Frankie Ln.': { lat: 40.165981, lon: -85.477068 },
  '8420 W. Adeline St.': { lat: 40.174715, lon: -85.48442 }, // W Adaline St
};

const EVENT = {
  title: 'Yorktown Town-Wide Rummage Sale',
  startDate: '2026-08-28',
  endDate: '2026-08-29',
  description:
    'The whole town is selling at once! 45+ homes across Yorktown, Friday & ' +
    'Saturday 8am–4pm. Mapped by Trove from the community flyer — tap ' +
    'each stop for what they’re selling, and save your favorites to plan ' +
    'your rounds. Happy hunting!',
};
// The account that will OWN the event and all 45 stops — resolved to a user
// id by the SQL at run time, so you can edit/delete everything in-app.
const OWNER_EMAIL = 'jasonwynkoop1@yahoo.com';
const YORKTOWN_CENTER = { lat: 40.1737, lon: -85.4942 };

// ─── Geocoding ────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode(stop) {
  if (OVERRIDES[stop.address]) return { ...OVERRIDES[stop.address], source: 'override' };
  if (MOCK) {
    // Deterministic fake coords near Yorktown — SQL-generation testing only.
    const i = STOPS.indexOf(stop);
    return {
      lat: YORKTOWN_CENTER.lat + ((i % 10) - 5) * 0.004,
      lon: YORKTOWN_CENTER.lon + (Math.floor(i / 10) - 2) * 0.005,
      source: 'mock',
    };
  }
  const city = stop.city ?? 'Yorktown';
  // Yorktown-edge streets sometimes only resolve under the other locality.
  const attempts = [
    `${stop.address}, ${city}, IN`,
    `${stop.address}, ${city === 'Yorktown' ? 'Muncie' : 'Yorktown'}, IN`,
    `${stop.address}, Delaware County, IN`,
  ];
  for (const q of attempts) {
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' +
      encodeURIComponent(q);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'trove-yorktown-rummage-import (trove.sale)' },
    });
    await sleep(1100); // Nominatim usage policy: max 1 req/sec
    if (!res.ok) continue;
    const rows = await res.json();
    if (rows[0]?.lat && rows[0]?.lon) {
      return { lat: Number(rows[0].lat), lon: Number(rows[0].lon), source: q };
    }
  }
  return null;
}

// ─── SQL generation ───────────────────────────────────────────────────────
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

function stopRow(stop, coords) {
  const startDate = stop.day === 'sat' ? '2026-08-29' : '2026-08-28';
  const endDate = stop.day === 'fri' ? '2026-08-28' : '2026-08-29';
  const dayLabel =
    stop.day === 'fri' ? 'Friday only' : stop.day === 'sat' ? 'Saturday only' : 'Friday & Saturday';
  const fullAddress = `${stop.address}, ${stop.city ?? 'Yorktown'}, IN`;
  const description =
    `${stop.items}. ${dayLabel}, 8am–4pm.\n\n` +
    'Part of the Yorktown Town-Wide Rummage Sale (Aug 28–29). Posted by ' +
    'Trove from the community flyer — we’re not the seller, so messaging ' +
    'is off. Just come by during sale hours!';
  const cats = `array[${stop.cats.map(q).join(', ')}]::text[]`;
  return (
    `    (${q(stop.items)}, ${q(description)}, ${q(fullAddress)}, ` +
    `${coords.lat}, ${coords.lon}, date ${q(startDate)}, date ${q(endDate)}, ` +
    `${cats}, ${stop.pricing ? q(stop.pricing) : 'null'})`
  );
}

function buildSql(rows, centroid, radiusM) {
  return `-- Yorktown Town-Wide Rummage Sale import (Aug 28–29, 2026).
-- GENERATED by seed_yorktown_rummage.mjs — run in the Supabase SQL editor.
-- Idempotent: re-running skips everything that already exists.
-- Everything is owned by ${OWNER_EMAIL}, so you can edit or delete any
-- stop — and manage the event — in the app like your own sales.

do $$
declare
  v_owner uuid;
  v_event uuid;
begin
  -- 1) Resolve the owning account.
  select id into v_owner from auth.users where email = ${q(OWNER_EMAIL)};
  if v_owner is null then
    raise exception 'No auth user with email % — check OWNER_EMAIL in the generator', ${q(OWNER_EMAIL)};
  end if;

  -- 2) Find-or-create the event.
  select id into v_event
  from public.sale_events
  where title = ${q(EVENT.title)} and start_date = date ${q(EVENT.startDate)}
  limit 1;

  if v_event is null then
    insert into public.sale_events
      (organizer_id, title, description, start_date, end_date,
       latitude, longitude, radius_m)
    values
      (v_owner, ${q(EVENT.title)}, ${q(EVENT.description)},
       date ${q(EVENT.startDate)}, date ${q(EVENT.endDate)},
       ${centroid.lat}, ${centroid.lon}, ${radiusM})
    returning id into v_event;
  end if;

  -- 3) Stops. Dedup: skip when ANY sale already overlaps the weekend at the
  --    same normalized address (residents' own posts are never duplicated).
  create temp table _stops (
    title text, description text, address text,
    latitude double precision, longitude double precision,
    start_date date, end_date date, categories text[], pricing_notes text
  ) on commit drop;

  insert into _stops values
${rows.join(',\n')};

  insert into public.sales
    (user_id, title, description, address, latitude, longitude,
     start_date, end_date, start_time, end_time, status, categories,
     pricing_notes, allow_messages, event_id)
  select
    v_owner, s.title, s.description, s.address, s.latitude,
    s.longitude, s.start_date, s.end_date, time '08:00', time '16:00',
    'active', s.categories, s.pricing_notes, false, v_event
  from _stops s
  where not exists (
    select 1 from public.sales x
    where x.end_date >= date ${q(EVENT.startDate)}
      and x.start_date <= date ${q(EVENT.endDate)}
      and regexp_replace(lower(x.address), '[^a-z0-9]', '', 'g')
          like regexp_replace(lower(split_part(s.address, ',', 1)), '[^a-z0-9]', '', 'g') || '%'
  );
end $$;

-- 4) Summary: the event share link + how many stops are on it.
select
  e.title,
  'https://trove.sale/event/' || e.share_slug as share_link,
  (select count(*) from public.sales where event_id = e.id) as stops_on_event
from public.sale_events e
where e.title = ${q(EVENT.title)} and e.start_date = date ${q(EVENT.startDate)};

-- ── Cleanup (run AFTER the weekend, optional) ────────────────────────────
-- Scoped to THIS EVENT only — never touches your other sales. You can also
-- just delete stops or the event from the app, since you own them.
-- delete from public.sales
--   where event_id in (select id from public.sale_events
--     where title = ${q(EVENT.title)} and start_date = date ${q(EVENT.startDate)});
-- delete from public.sale_events
--   where title = ${q(EVENT.title)} and start_date = date ${q(EVENT.startDate)};
`;
}

// ─── Main ─────────────────────────────────────────────────────────────────
const here = dirname(fileURLToPath(import.meta.url));
const failed = [];
const rows = [];
const coordsList = [];

console.log(`Geocoding ${STOPS.length} stops${MOCK ? ' (MOCK MODE — fake coords!)' : ''}…`);
for (const stop of STOPS) {
  const coords = await geocode(stop);
  if (coords) {
    coordsList.push(coords);
    rows.push(stopRow(stop, coords));
    console.log(`  ✓ ${stop.address}  (${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)})`);
  } else {
    failed.push(stop);
    console.log(`  ✗ ${stop.address}  — NOT FOUND, using town center (fix pin in-app or add to OVERRIDES)`);
    const c = { lat: YORKTOWN_CENTER.lat, lon: YORKTOWN_CENTER.lon };
    coordsList.push(c);
    rows.push(stopRow(stop, c));
  }
}

const centroid = {
  lat: coordsList.reduce((a, c) => a + c.lat, 0) / coordsList.length,
  lon: coordsList.reduce((a, c) => a + c.lon, 0) / coordsList.length,
};
// Radius: farthest stop + a small buffer, clamped to the schema's 100..5000m.
const distM = (a, b) => {
  const dLat = ((a.lat - b.lat) * Math.PI) / 180;
  const dLon = ((a.lon - b.lon) * Math.PI) / 180;
  const m = 6371000;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * m * Math.asin(Math.sqrt(h));
};
const radiusM = Math.min(
  5000,
  Math.max(800, Math.round(Math.max(...coordsList.map((c) => distM(c, centroid))) + 400)),
);

const outPath = join(here, 'seed_yorktown_rummage.sql');
writeFileSync(outPath, buildSql(rows, centroid, radiusM));
console.log(`\nWrote ${outPath}`);
console.log(`Event circle: center (${centroid.lat.toFixed(5)}, ${centroid.lon.toFixed(5)}), radius ${radiusM}m`);
if (failed.length) {
  console.log(`\n⚠ ${failed.length} address(es) fell back to the town center — fix their pins in-app`);
  console.log('  or add coordinates to OVERRIDES and re-run:');
  failed.forEach((s) => console.log(`    ${s.address}`));
}
if (MOCK) console.log('\n⚠ MOCK MODE: coordinates are fake. Do NOT run this SQL in production.');
console.log('\nNext: paste seed_yorktown_rummage.sql into the Supabase SQL editor.');
