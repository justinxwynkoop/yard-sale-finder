// Pure helpers behind the SEO share pages (/sale/<id>, /listing/<id>).
//
// Everything here is deterministic and network-free so it can be unit
// tested (site/api/_lib/__tests__/share.test.js) without touching the
// serverless handlers, which do the fetching. CommonJS to match the
// Vercel function style used in site/api/*.js.

/** Escape a user-generated string for HTML text AND attribute contexts. */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * "$1,234.50" for a numeric price. 0 renders as "Free"; null/undefined or
 * junk returns null so callers can just omit the price row.
 */
function formatPrice(price) {
  if (price === null || price === undefined || price === '') return null;
  const n = Number(price);
  if (!isFinite(n)) return null;
  if (n === 0) return 'Free';
  return (
    '$' +
    n.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** 'YYYY-MM-DD...' -> {y, mo, d} or null. Tolerates a timestamp tail. */
function parseDateParts(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d == null ? '' : d));
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3] };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDay(p, withYear) {
  // Date.UTC + getUTCDay keeps the weekday independent of server timezone.
  const wd = WEEKDAYS[new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay()];
  return wd + ', ' + MONTHS[p.mo - 1] + ' ' + p.d + (withYear ? ', ' + p.y : '');
}

/** Normalize '8:00' / '08:00' / '08:00:00' -> 'HH:MM:SS'; null when unparseable. */
function normTime(t) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(t == null ? '' : t));
  if (!m) return null;
  return m[1].padStart(2, '0') + ':' + m[2] + ':' + (m[3] || '00');
}

/** 'HH:MM[:SS]' -> '8:00 AM'; null when unparseable. */
function formatTime(t) {
  const norm = normTime(t);
  if (!norm) return null;
  let h = +norm.slice(0, 2);
  const min = norm.slice(3, 5);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + min + ' ' + ampm;
}

/**
 * Human-readable date/time range for a sale.
 *   "Sat, Jun 14, 2026 · 8:00 AM – 2:00 PM"
 *   "Sat, Jun 14 – Sun, Jun 15, 2026 · 8:00 AM – 2:00 PM"
 * Missing end_date collapses to a single day; missing times drop the tail.
 */
function formatDateRange(start_date, end_date, start_time, end_time) {
  const s = parseDateParts(start_date);
  if (!s) return null;
  const e = parseDateParts(end_date) || s;
  const sameDay = s.y === e.y && s.mo === e.mo && s.d === e.d;

  let datePart;
  if (sameDay) datePart = formatDay(s, true);
  else if (s.y === e.y) datePart = formatDay(s, false) + ' – ' + formatDay(e, true);
  else datePart = formatDay(s, true) + ' – ' + formatDay(e, true);

  const st = formatTime(start_time);
  const et = formatTime(end_time);
  let timePart = null;
  if (st && et) timePart = st + ' – ' + et;
  else if (st) timePart = 'from ' + st;

  return timePart ? datePart + ' · ' + timePart : datePart;
}

/** 'YYYY-MM-DD' (+ optional time) -> ISO-ish local datetime for JSON-LD. */
function combineDateTime(date, time) {
  const d = parseDateParts(date);
  if (!d) return null;
  const iso =
    d.y + '-' + String(d.mo).padStart(2, '0') + '-' + String(d.d).padStart(2, '0');
  const t = normTime(time);
  return t ? iso + 'T' + t : iso;
}

/** Current date + wall-clock time in America/New_York as sortable strings. */
function nyNow(nowDate) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(nowDate);
  const get = (type) => {
    const p = parts.find((x) => x.type === type);
    return p ? p.value : '00';
  };
  return {
    date: get('year') + '-' + get('month') + '-' + get('day'),
    time: get('hour') + ':' + get('minute') + ':' + get('second'),
  };
}

/**
 * 'on_now' | 'upcoming' | 'ended' for a sale, evaluated in America/New_York.
 * Zero-padded date/time strings compare lexicographically, so no Date math
 * on the sale side (dates are timezone-less DB values).
 */
function saleLiveState(nowDate, sale) {
  if (!sale) return 'ended';
  if (sale.status === 'ended') return 'ended';
  const start = parseDateParts(sale.start_date);
  if (!start) return 'upcoming';
  const { date: today, time: nowTime } = nyNow(nowDate);
  const startDate = String(sale.start_date).slice(0, 10);
  const endDate = sale.end_date ? String(sale.end_date).slice(0, 10) : startDate;

  if (today < startDate) return 'upcoming';
  if (today > endDate) return 'ended';

  const st = normTime(sale.start_time);
  const et = normTime(sale.end_time);
  if (st && nowTime < st) return 'upcoming';
  if (et && nowTime > et) {
    // Past hours on the final day = over; between days of a multi-day
    // sale = it resumes tomorrow, so it reads as upcoming, not ended.
    return today === endDate ? 'ended' : 'upcoming';
  }
  return 'on_now';
}

const STATE_ABBREVS = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS',
  'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK',
  'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
  'WI', 'WY', 'DC',
]);

const STATE_NAMES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR',
  california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI',
  minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
  'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
};

/** "IN" / "IN 47303" / "Indiana" / "Indiana 47303" -> "IN"; null otherwise. */
function stateAbbrevFromPart(part) {
  const m = /^([A-Za-z][A-Za-z .]*?)(?:\s+\d{5}(?:-\d{4})?)?$/.exec(part);
  if (!m) return null;
  const name = m[1].trim();
  if (/^[A-Za-z]{2}$/.test(name) && STATE_ABBREVS.has(name.toUpperCase())) {
    return name.toUpperCase();
  }
  return STATE_NAMES[name.toLowerCase()] || null;
}

/**
 * Best-effort "City, ST" from the tail of a US address string.
 * Handles "123 Main St, Muncie, IN 47303[, USA]", "Muncie, Indiana 47303",
 * and "123 Main St, Muncie IN 47303". Returns null whenever it isn't sure —
 * a wrong city in a page title is worse than no city.
 */
function cityFromAddress(address) {
  if (!address) return null;
  const parts = String(address)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  while (
    parts.length &&
    /^(usa|us|united states( of america)?)$/i.test(parts[parts.length - 1])
  ) {
    parts.pop();
  }

  for (let i = parts.length - 1; i >= 0; i--) {
    const st = stateAbbrevFromPart(parts[i]);
    if (st) {
      const city = i > 0 ? parts[i - 1] : null;
      if (city && !/\d/.test(city) && city.length <= 40) return city + ', ' + st;
      return null;
    }
    // Single "City ST 47303" segment (no comma between city and state).
    const m = /^(.+?)\s+([A-Za-z]{2})\s+\d{5}(?:-\d{4})?$/.exec(parts[i]);
    if (m && STATE_ABBREVS.has(m[2].toUpperCase())) {
      const city = m[1].trim();
      if (city && !/\d/.test(city) && city.length <= 40) {
        return city + ', ' + m[2].toUpperCase();
      }
      return null;
    }
  }
  return null;
}

/** Collapse whitespace and cut near max chars at a word boundary, with '…'. */
function truncate(s, max = 155) {
  if (s == null) return null;
  const clean = String(s).replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  if (clean.length <= max) return clean;
  let cut = clean.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  if (sp > 60) cut = cut.slice(0, sp);
  return cut + '…';
}

/**
 * <title> + meta description for a share page. Seller/imageUrl accepted for
 * future use; today the meta only needs the row itself.
 */
function buildMeta({ type, row }) {
  if (type === 'sale') {
    const city = cityFromAddress(row.address);
    const title = row.title + (city ? ' in ' + city : '') + ' — Trove';
    const when = formatDateRange(
      row.start_date,
      row.end_date,
      row.start_time,
      row.end_time,
    );
    const description =
      truncate([when, row.description].filter(Boolean).join(' · ')) ||
      'A yard sale shared on Trove — the app for discovering yard sales and secondhand finds near you.';
    return { title, description };
  }
  const where = row.pickup_display;
  const title = row.title + (where ? ' in ' + where : '') + ' — Trove';
  const price = formatPrice(row.price);
  const description =
    truncate([price, row.description].filter(Boolean).join(' · ')) ||
    'A secondhand find shared on Trove — the app for discovering yard sales and finds near you.';
  return { title, description };
}

/**
 * Supabase storage URL -> CDN image-transform URL at the given width.
 * Non-storage URLs pass through untouched.
 */
function transformedImage(url, width) {
  if (!url) return null;
  if (!/\/storage\/v1\/object\//.test(url)) return url;
  return (
    url.replace('/storage/v1/object/', '/storage/v1/render/image/') +
    '?width=' + width + '&quality=75'
  );
}

module.exports = {
  escapeHtml,
  formatPrice,
  formatDateRange,
  formatTime,
  normTime,
  combineDateTime,
  saleLiveState,
  cityFromAddress,
  truncate,
  buildMeta,
  transformedImage,
};
