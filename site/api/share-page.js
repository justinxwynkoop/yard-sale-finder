// Server-rendered share pages for trove.sale/sale/<id> and /listing/<id>.
//
// Replaces the static open.html interstitial for sales and listings so the
// pages are SEO-indexable: real content, Open Graph tags, and JSON-LD.
// Users WITH the app installed never see this page — iOS universal links
// intercept the tap first — so the copy targets everyone else.
//
// Wired via site/vercel.json:
//   ^/sale/([^/]+)$    -> /api/share-page?type=sale&id=$1
//   ^/listing/([^/]+)$ -> /api/share-page?type=listing&id=$1

const {
  escapeHtml: esc,
  formatPrice,
  formatDateRange,
  combineDateTime,
  saleLiveState,
  buildMeta,
  transformedImage,
} = require('./_lib/share');
const { supaTry } = require('./_lib/supa');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_STORE_URL = 'https://apps.apple.com/us/app/id6772838421';
const SITE = 'https://trove.sale';

// ---------------------------------------------------------------- rendering

const CSS = `
:root{--brand:#1F4D3A;--bg:#F7F2E8;--ink:#171513;--muted:#8A857C;--card:#fff;--hairline:#E5DECC}
*{box-sizing:border-box}
html,body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;background:var(--bg);color:var(--ink);line-height:1.55}
img{max-width:100%}
.wrap{max-width:640px;margin:0 auto;padding:20px 16px 64px}
.topbar{display:flex;align-items:center;gap:10px;padding:4px 0 16px}
.topbar .logo{width:36px;height:36px;background:var(--brand);border-radius:10px;display:grid;place-items:center;color:#fff;font-weight:800;font-size:19px}
.topbar a{color:var(--ink);text-decoration:none;font-weight:800;font-size:17px;letter-spacing:-.2px}
.hero{width:100%;border-radius:16px;border:1px solid var(--hairline);display:block;background:#fff}
.thumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}
.thumbs img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;border:1px solid var(--hairline)}
.card{background:var(--card);border:1px solid var(--hairline);border-radius:16px;padding:20px;margin-top:16px}
h1{font-size:24px;font-weight:800;margin:6px 0 4px;letter-spacing:-.4px}
.badge{display:inline-block;font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;letter-spacing:.2px}
.badge.on{background:#E3F0E8;color:var(--brand)}
.badge.up{background:#EFEAD9;color:#6B5E3E}
.badge.end{background:#F0E4E1;color:#8C4A3C}
.price{font-size:22px;font-weight:800;color:var(--brand);margin:2px 0 4px}
.meta{color:var(--muted);font-size:14px;margin:2px 0}
.meta strong{color:var(--ink);font-weight:600}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.chip{font-size:12px;font-weight:600;color:var(--brand);background:#EDF2EC;border:1px solid #D8E2D6;border-radius:999px;padding:3px 10px}
.desc{white-space:pre-wrap;font-size:15px;margin:12px 0 0}
.section-label{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin:16px 0 2px}
.banner{background:#F0E4E1;color:#8C4A3C;border:1px solid #E2CFC9;border-radius:12px;padding:12px 14px;font-size:14px;font-weight:600;margin-top:16px}
.seller{display:flex;align-items:center;gap:12px}
.avatar{width:48px;height:48px;border-radius:50%;object-fit:cover;border:1px solid var(--hairline);background:#EDE7D8}
.avatar-fallback{width:48px;height:48px;border-radius:50%;background:var(--brand);color:#fff;display:grid;place-items:center;font-weight:800;font-size:20px}
.seller-name{font-weight:700}
.seller-loc{color:var(--muted);font-size:13px}
.cta{margin-top:16px;text-align:center;padding:24px 20px}
.btn{display:inline-block;background:var(--brand);color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:14px}
.applink{display:block;margin-top:12px;color:var(--brand);font-weight:700;text-decoration:none;font-size:14px}
.cta-note{color:var(--muted);font-size:12px;margin-top:10px}
footer{margin-top:28px;text-align:center;color:var(--muted);font-size:13px}
footer a{color:var(--muted);text-decoration:none;margin:0 8px}
`.trim();

function pageShell({ title, description, headExtra = '', body, noindex }) {
  return (
    '<!doctype html>\n<html lang="en">\n<head>\n' +
    '<meta charset="utf-8"/>\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>\n' +
    '<title>' + esc(title) + '</title>\n' +
    '<meta name="description" content="' + esc(description) + '"/>\n' +
    (noindex ? '<meta name="robots" content="noindex"/>\n' : '') +
    headExtra +
    '<style>' + CSS + '</style>\n' +
    '</head>\n<body>\n<div class="wrap">\n' +
    '<div class="topbar"><div class="logo">T</div><a href="' + SITE + '">Trove</a></div>\n' +
    body +
    '\n<footer><a href="/privacy">Privacy</a>·<a href="/terms">Terms</a>·<a href="' +
    SITE + '">trove.sale</a></footer>\n' +
    '</div>\n</body>\n</html>\n'
  );
}

function ctaBlock(deepLink, noun) {
  return (
    '<div class="card cta">' +
    '<a class="btn" href="' + esc(deepLink) + '">Open in Trove</a>' +
    '<a class="applink" href="' + APP_STORE_URL + '">Get Trove on the App Store</a>' +
    '<p class="cta-note">Already have Trove? Links like this open straight in the app — ' +
    'otherwise, grab it free and this ' + noun + ' will be waiting.</p>' +
    '</div>'
  );
}

function sellerCard(seller) {
  if (!seller || !seller.display_name) return '';
  const avatar = seller.avatar_url
    ? '<img class="avatar" src="' + esc(transformedImage(seller.avatar_url, 96)) +
      '" alt="" width="48" height="48"/>'
    : '<div class="avatar-fallback">' +
      esc(String(seller.display_name).trim().charAt(0).toUpperCase() || 'T') +
      '</div>';
  const loc =
    seller.city
      ? '<div class="seller-loc">Local to ' + esc(seller.city) +
        (seller.state ? ', ' + esc(seller.state) : '') + '</div>'
      : '';
  return (
    '<div class="card"><div class="seller">' + avatar +
    '<div><div class="seller-name">' + esc(seller.display_name) + '</div>' + loc +
    '</div></div></div>'
  );
}

function mediaBlock(media, altText) {
  const images = (Array.isArray(media) ? media : [])
    .filter((m) => m && m.url && m.type !== 'video')
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!images.length) return { html: '', ogImage: null };
  const ogImage = transformedImage(images[0].url, 1200);
  let html =
    '<img class="hero" src="' + esc(transformedImage(images[0].url, 800)) +
    '" alt="' + esc(altText) + '"/>';
  const rest = images.slice(1, 7);
  if (rest.length) {
    html +=
      '<div class="thumbs">' +
      rest
        .map(
          (m) =>
            '<img src="' + esc(transformedImage(m.url, 800)) +
            '" alt="" loading="lazy"/>',
        )
        .join('') +
      '</div>';
  }
  return { html, ogImage };
}

function chipsBlock(categories) {
  const cats = (Array.isArray(categories) ? categories : []).filter(Boolean);
  if (!cats.length) return '';
  return (
    '<div class="chips">' +
    cats
      .map((c) => {
        const label = String(c).replace(/[_-]+/g, ' ');
        return '<span class="chip">' +
          esc(label.charAt(0).toUpperCase() + label.slice(1)) + '</span>';
      })
      .join('') +
    '</div>'
  );
}

function ogTags({ title, description, ogImage, ogType, canonical }) {
  return (
    '<link rel="canonical" href="' + esc(canonical) + '"/>\n' +
    '<meta property="og:site_name" content="Trove"/>\n' +
    '<meta property="og:type" content="' + ogType + '"/>\n' +
    '<meta property="og:url" content="' + esc(canonical) + '"/>\n' +
    '<meta property="og:title" content="' + esc(title) + '"/>\n' +
    '<meta property="og:description" content="' + esc(description) + '"/>\n' +
    (ogImage ? '<meta property="og:image" content="' + esc(ogImage) + '"/>\n' : '') +
    '<meta name="twitter:card" content="' +
    (ogImage ? 'summary_large_image' : 'summary') + '"/>\n' +
    '<meta name="twitter:title" content="' + esc(title) + '"/>\n' +
    '<meta name="twitter:description" content="' + esc(description) + '"/>\n' +
    (ogImage ? '<meta name="twitter:image" content="' + esc(ogImage) + '"/>\n' : '')
  );
}

function jsonLdScript(obj) {
  // JSON.stringify drops undefined props; <-escape < so user text can
  // never break out of the script element.
  return (
    '<script type="application/ld+json">' +
    JSON.stringify(obj).replace(/</g, '\\u003c') +
    '</script>\n'
  );
}

// --------------------------------------------------------------- responses

function sendHtml(res, status, html, cacheable) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    cacheable ? 's-maxage=300, stale-while-revalidate=3600' : 'no-store',
  );
  res.end(html);
}

function send404(res, type) {
  const noun = type === 'listing' ? 'listing' : 'sale';
  const body =
    '<div class="card" style="text-align:center;padding:32px 20px">' +
    '<h1>This ' + noun + ' isn&rsquo;t available</h1>' +
    '<p class="meta">It may have wrapped up or been taken down — but Trove is full of ' +
    'yard sales and secondhand finds happening near you right now.</p>' +
    '</div>' +
    '<div class="card cta">' +
    '<a class="btn" href="' + APP_STORE_URL + '">Get Trove on the App Store</a>' +
    '<a class="applink" href="' + SITE + '">Learn more at trove.sale</a>' +
    '</div>';
  sendHtml(
    res,
    404,
    pageShell({
      title: 'Not found — Trove',
      description: 'This page isn’t available on Trove.',
      body,
      noindex: true,
    }),
    false,
  );
}

// Supabase unreachable — degrade to a generic interstitial so a shared link
// never hard-fails. 200 + noindex + no-store.
function sendFallback(res, type, id) {
  const noun = type === 'listing' ? 'listing' : 'sale';
  const deepLink = 'trove://' + type + '/' + id;
  const body =
    '<div class="card" style="text-align:center;padding:32px 20px">' +
    '<h1>Open this ' + noun + ' in Trove</h1>' +
    '<p class="meta">A friend shared a find with you on Trove — the app for discovering ' +
    'yard sales and secondhand treasures near you.</p>' +
    '</div>' +
    ctaBlock(deepLink, noun);
  sendHtml(
    res,
    200,
    pageShell({
      title: 'Open in Trove',
      description:
        'This link opens in the Trove app — discover yard sales and secondhand finds near you.',
      body,
      noindex: true,
    }),
    false,
  );
}

// ------------------------------------------------------------------- pages

function renderSale(row, seller, canonical) {
  const state = saleLiveState(new Date(), row);
  const ended = state === 'ended';
  const { title, description } = buildMeta({ type: 'sale', row, seller });
  const media = mediaBlock(row.media, row.title);
  const when = formatDateRange(
    row.start_date, row.end_date, row.start_time, row.end_time,
  );

  const badge =
    state === 'on_now'
      ? '<span class="badge on">' +
        (row.status === 'winding_down' ? 'Winding down' : 'On now') +
        '</span>'
      : state === 'upcoming'
        ? '<span class="badge up">Upcoming</span>'
        : '<span class="badge end">Ended</span>';

  const jsonLd = jsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: row.title,
    startDate: combineDateTime(row.start_date, row.start_time) || undefined,
    endDate:
      combineDateTime(row.end_date || row.start_date, row.end_time) || undefined,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: row.address
      ? { '@type': 'Place', name: row.address, address: row.address }
      : undefined,
    description: row.description || undefined,
    image: media.ogImage ? [media.ogImage] : undefined,
    organizer:
      seller && seller.display_name
        ? { '@type': 'Person', name: seller.display_name }
        : undefined,
    url: canonical,
  });

  const body =
    media.html +
    '<div class="card">' +
    badge +
    '<h1>' + esc(row.title) + '</h1>' +
    (row.address
      ? '<p class="meta"><strong>Where:</strong> ' + esc(row.address) + '</p>'
      : '') +
    (when ? '<p class="meta"><strong>When:</strong> ' + esc(when) + '</p>' : '') +
    chipsBlock(row.categories) +
    (ended
      ? '<div class="banner">This sale has ended. Download Trove to find more sales ' +
        'happening near you.</div>'
      : '') +
    (row.description ? '<p class="desc">' + esc(row.description) + '</p>' : '') +
    (row.pricing_notes
      ? '<p class="section-label">Pricing</p><p class="desc" style="margin-top:0">' +
        esc(row.pricing_notes) + '</p>'
      : '') +
    '</div>' +
    sellerCard(seller) +
    ctaBlock('trove://sale/' + row.id, 'sale');

  return pageShell({
    title,
    description,
    headExtra:
      ogTags({
        title,
        description,
        ogImage: media.ogImage,
        ogType: 'article',
        canonical,
      }) + jsonLd,
    body,
    noindex: ended,
  });
}

function renderListing(row, seller, canonical) {
  const sold = row.status === 'sold';
  const { title, description } = buildMeta({ type: 'listing', row, seller });
  const media = mediaBlock(row.media, row.title);
  const price = formatPrice(row.price);
  const priceNum = Number(row.price);

  const jsonLd = jsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: row.title,
    description: row.description || undefined,
    image: media.ogImage ? [media.ogImage] : undefined,
    offers: isFinite(priceNum)
      ? {
          '@type': 'Offer',
          price: priceNum.toFixed(2),
          priceCurrency: 'USD',
          availability: sold
            ? 'https://schema.org/SoldOut'
            : 'https://schema.org/InStock',
          url: canonical,
        }
      : undefined,
    url: canonical,
  });

  const body =
    media.html +
    '<div class="card">' +
    (sold ? '<span class="badge end">Sold</span>' : '') +
    '<h1>' + esc(row.title) + '</h1>' +
    (price ? '<p class="price">' + esc(price) + '</p>' : '') +
    (row.pickup_display
      ? '<p class="meta"><strong>Pickup:</strong> ' + esc(row.pickup_display) + '</p>'
      : '') +
    chipsBlock(row.categories) +
    (sold
      ? '<div class="banner">This item has been sold. Download Trove to browse more ' +
        'finds near you.</div>'
      : '') +
    (row.description ? '<p class="desc">' + esc(row.description) + '</p>' : '') +
    '</div>' +
    sellerCard(seller) +
    ctaBlock('trove://listing/' + row.id, 'listing');

  return pageShell({
    title,
    description,
    headExtra:
      ogTags({
        title,
        description,
        ogImage: media.ogImage,
        ogType: 'product',
        canonical,
      }) + jsonLd,
    body,
    noindex: sold,
  });
}

// ----------------------------------------------------------------- handler

function getQuery(req) {
  if (req.query && (req.query.type || req.query.id)) {
    return { type: req.query.type, id: req.query.id };
  }
  try {
    const u = new URL(req.url, 'http://localhost');
    return { type: u.searchParams.get('type'), id: u.searchParams.get('id') };
  } catch {
    return {};
  }
}

module.exports = async (req, res) => {
  const { type, id } = getQuery(req);
  if ((type !== 'sale' && type !== 'listing') || !UUID_RE.test(String(id || ''))) {
    return send404(res, type);
  }

  let row = null;
  let seller = null;
  try {
    const base =
      type === 'sale'
        ? 'sales?select=*,media:sale_media(*)&id=eq.' + id
        : 'listings?select=*,media:listing_media(*)&id=eq.' + id;
    // hidden_at may not exist until its migration lands; a 400 retries
    // without the filter (supaTry falls through on 400).
    const rows = await supaTry([base + '&hidden_at=is.null', base]);
    row = Array.isArray(rows) ? rows[0] || null : null;

    if (row && row.user_id) {
      try {
        const profiles = await supaTry([
          'profiles?select=id,display_name,avatar_url,city,state&id=eq.' +
            row.user_id,
        ]);
        seller = (Array.isArray(profiles) && profiles[0]) || null;
      } catch {
        seller = null; // page renders fine without the seller card
      }
    }
  } catch {
    return sendFallback(res, type, id);
  }

  if (!row) return send404(res, type);

  try {
    const canonical = SITE + '/' + type + '/' + row.id;
    const html =
      type === 'sale'
        ? renderSale(row, seller, canonical)
        : renderListing(row, seller, canonical);
    return sendHtml(res, 200, html, true);
  } catch {
    return sendFallback(res, type, id);
  }
};
