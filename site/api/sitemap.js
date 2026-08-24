// XML sitemap for trove.sale — static pages plus every live sale and
// available listing (the share pages rendered by api/share-page.js).
// Wired via site/vercel.json: ^/sitemap\.xml$ -> /api/sitemap.

const { supaTry } = require('./_lib/supa');

const SITE = 'https://trove.sale';
const LIMIT = 5000;

/**
 * Fetch id + timestamps with graceful degradation: `hidden_at` (filter) and
 * `updated_at` (selected column) may not exist yet, and either missing piece
 * 400s the whole query — so try every combination, most complete first.
 * supaTry falls through variants on 400.
 */
function rowVariants(table, statusFilter) {
  const tail = '&' + statusFilter + '&order=created_at.desc&limit=' + LIMIT;
  const full = table + '?select=id,created_at,updated_at' + tail;
  const bare = table + '?select=id,created_at' + tail;
  return [
    full + '&hidden_at=is.null',
    full,
    bare + '&hidden_at=is.null',
    bare,
  ];
}

function lastmod(row) {
  const raw = row.updated_at || row.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function urlEntry(loc, mod) {
  return (
    '  <url>\n    <loc>' + loc + '</loc>\n' +
    (mod ? '    <lastmod>' + mod + '</lastmod>\n' : '') +
    '  </url>\n'
  );
}

module.exports = async (req, res) => {
  let sales = [];
  let listings = [];
  let degraded = false;
  try {
    [sales, listings] = await Promise.all([
      supaTry(rowVariants('sales', 'status=neq.ended')),
      supaTry(rowVariants('listings', 'status=eq.available')),
    ]);
    if (!Array.isArray(sales)) sales = [];
    if (!Array.isArray(listings)) listings = [];
  } catch {
    // Supabase unreachable — still serve the static pages, briefly cached.
    sales = [];
    listings = [];
    degraded = true;
  }

  let xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urlEntry(SITE + '/', null) +
    urlEntry(SITE + '/privacy', null) +
    urlEntry(SITE + '/terms', null);
  for (const row of sales.slice(0, LIMIT)) {
    if (row && row.id) xml += urlEntry(SITE + '/sale/' + row.id, lastmod(row));
  }
  for (const row of listings.slice(0, LIMIT)) {
    if (row && row.id) xml += urlEntry(SITE + '/listing/' + row.id, lastmod(row));
  }
  xml += '</urlset>\n';

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    degraded ? 's-maxage=60' : 's-maxage=3600, stale-while-revalidate=86400',
  );
  res.end(xml);
};
