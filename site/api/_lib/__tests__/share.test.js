// Pure logic behind the SEO share pages (api/share-page.js). No network,
// no handler imports — just the helpers in ../share.js.
//
// The jest globals directive is needed because this is the only JS (not TS)
// test file in ESLint's scope — TS test files skip no-undef entirely, and
// scripts/__tests__ is lint-ignored.
/* global describe, it, expect */
const {
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
} = require('../share');

describe('escapeHtml', () => {
  it('escapes markup and attribute-breaking characters', () => {
    expect(escapeHtml(`<img src="x" onerror='hack()'> & more`)).toBe(
      '&lt;img src=&quot;x&quot; onerror=&#39;hack()&#39;&gt; &amp; more',
    );
  });

  it('stringifies null/undefined to empty', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('passes plain text through', () => {
    expect(escapeHtml('Multi-family yard sale')).toBe('Multi-family yard sale');
  });
});

describe('formatPrice', () => {
  it('formats with cents and thousands separators', () => {
    expect(formatPrice(1234.5)).toBe('$1,234.50');
    expect(formatPrice(5)).toBe('$5.00');
  });

  it('accepts numeric strings (Supabase numeric can arrive as string)', () => {
    expect(formatPrice('25')).toBe('$25.00');
  });

  it('renders 0 as Free', () => {
    expect(formatPrice(0)).toBe('Free');
  });

  it('returns null for missing or junk values', () => {
    expect(formatPrice(null)).toBeNull();
    expect(formatPrice(undefined)).toBeNull();
    expect(formatPrice('')).toBeNull();
    expect(formatPrice('a lot')).toBeNull();
  });
});

describe('formatTime / normTime', () => {
  it('normalizes short and long time strings', () => {
    expect(normTime('8:00')).toBe('08:00:00');
    expect(normTime('08:30:15')).toBe('08:30:15');
    expect(normTime(null)).toBeNull();
    expect(normTime('soon')).toBeNull();
  });

  it('formats 12-hour edge cases', () => {
    expect(formatTime('08:00:00')).toBe('8:00 AM');
    expect(formatTime('13:30')).toBe('1:30 PM');
    expect(formatTime('00:15')).toBe('12:15 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
  });
});

describe('formatDateRange', () => {
  it('formats a single day with times', () => {
    expect(formatDateRange('2026-06-14', '2026-06-14', '08:00:00', '14:00:00')).toBe(
      'Sun, Jun 14, 2026 · 8:00 AM – 2:00 PM',
    );
  });

  it('collapses a missing end date to a single day', () => {
    expect(formatDateRange('2026-06-14', null, null, null)).toBe(
      'Sun, Jun 14, 2026',
    );
  });

  it('formats a multi-day range with the year once', () => {
    expect(formatDateRange('2026-06-13', '2026-06-14', '08:00', '14:00')).toBe(
      'Sat, Jun 13 – Sun, Jun 14, 2026 · 8:00 AM – 2:00 PM',
    );
  });

  it('keeps both years across a year boundary', () => {
    expect(formatDateRange('2027-12-31', '2028-01-01', null, null)).toBe(
      'Fri, Dec 31, 2027 – Sat, Jan 1, 2028',
    );
  });

  it('handles a start time with no end time', () => {
    expect(formatDateRange('2026-06-14', null, '09:00', null)).toBe(
      'Sun, Jun 14, 2026 · from 9:00 AM',
    );
  });

  it('returns null without a parseable start date', () => {
    expect(formatDateRange(null, null, '08:00', '14:00')).toBeNull();
    expect(formatDateRange('junk', null, null, null)).toBeNull();
  });
});

describe('combineDateTime', () => {
  it('joins date and normalized time for JSON-LD', () => {
    expect(combineDateTime('2026-06-14', '8:00')).toBe('2026-06-14T08:00:00');
  });

  it('falls back to the bare date without a time', () => {
    expect(combineDateTime('2026-06-14', null)).toBe('2026-06-14');
  });

  it('returns null without a date', () => {
    expect(combineDateTime(null, '08:00')).toBeNull();
  });
});

describe('saleLiveState (America/New_York)', () => {
  const sale = {
    status: 'active',
    start_date: '2026-06-14',
    end_date: '2026-06-14',
    start_time: '08:00:00',
    end_time: '14:00:00',
  };
  // June => EDT (UTC-4). Instants below written with the explicit offset.
  const at = (iso) => new Date(iso);

  it('is on_now between start and end times on the sale day', () => {
    expect(saleLiveState(at('2026-06-14T09:30:00-04:00'), sale)).toBe('on_now');
  });

  it('is upcoming earlier the same morning', () => {
    expect(saleLiveState(at('2026-06-14T07:00:00-04:00'), sale)).toBe('upcoming');
  });

  it('is ended after hours on the final day', () => {
    expect(saleLiveState(at('2026-06-14T15:00:00-04:00'), sale)).toBe('ended');
  });

  it('is upcoming before the start date and ended after the end date', () => {
    expect(saleLiveState(at('2026-06-13T12:00:00-04:00'), sale)).toBe('upcoming');
    expect(saleLiveState(at('2026-06-15T09:00:00-04:00'), sale)).toBe('ended');
  });

  it('reads the evening between days of a multi-day sale as upcoming', () => {
    const multi = { ...sale, end_date: '2026-06-15' };
    expect(saleLiveState(at('2026-06-14T18:00:00-04:00'), multi)).toBe('upcoming');
    expect(saleLiveState(at('2026-06-15T09:00:00-04:00'), multi)).toBe('on_now');
  });

  it('is on_now all day when the sale has no times', () => {
    const untimed = { ...sale, start_time: null, end_time: null };
    expect(saleLiveState(at('2026-06-14T23:00:00-04:00'), untimed)).toBe('on_now');
  });

  it('respects the DB status over the clock', () => {
    expect(
      saleLiveState(at('2026-06-14T09:30:00-04:00'), { ...sale, status: 'ended' }),
    ).toBe('ended');
  });

  it('uses New York wall-clock time, not UTC', () => {
    // 13:00Z on the sale day is 9:00 AM EDT — inside sale hours.
    expect(saleLiveState(at('2026-06-14T13:00:00Z'), sale)).toBe('on_now');
    // 03:00Z on June 15 is still 11:00 PM June 14 EDT — past end time on
    // the final day => ended (not "after end_date").
    expect(saleLiveState(at('2026-06-15T03:00:00Z'), sale)).toBe('ended');
  });
});

describe('cityFromAddress', () => {
  it('parses the classic street, city, ST zip tail', () => {
    expect(cityFromAddress('123 Main St, Muncie, IN 47303')).toBe('Muncie, IN');
  });

  it('drops a trailing country', () => {
    expect(cityFromAddress('123 Main St, Muncie, IN 47303, USA')).toBe('Muncie, IN');
    expect(cityFromAddress('5th Ave, New York, NY 10001, United States')).toBe(
      'New York, NY',
    );
  });

  it('handles state without zip and full state names', () => {
    expect(cityFromAddress('123 Main St, Muncie, IN')).toBe('Muncie, IN');
    expect(cityFromAddress('123 Main St, Muncie, Indiana 47303')).toBe('Muncie, IN');
  });

  it('handles a City ST zip segment with no inner comma', () => {
    expect(cityFromAddress('123 Main St, Muncie IN 47303')).toBe('Muncie, IN');
  });

  it('returns null when unsure', () => {
    expect(cityFromAddress(null)).toBeNull();
    expect(cityFromAddress('just a street name')).toBeNull();
    // "candidate city" segment contains digits — likely a street, bail.
    expect(cityFromAddress('123 Main St, IN 47303')).toBeNull();
  });

  it('does not mistake a non-state two-letter word for a state', () => {
    expect(cityFromAddress('12 Elm St, Springfield, ZZ 12345')).toBeNull();
  });
});

describe('truncate', () => {
  it('passes short strings through, collapsing whitespace', () => {
    expect(truncate('hello   world')).toBe('hello world');
  });

  it('cuts near the limit at a word boundary with an ellipsis', () => {
    const long = 'word '.repeat(60).trim();
    const out = truncate(long, 155);
    expect(out.length).toBeLessThanOrEqual(155);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/wor…$/); // no mid-word cut
  });

  it('returns null for empty input', () => {
    expect(truncate(null)).toBeNull();
    expect(truncate('   ')).toBeNull();
  });
});

describe('buildMeta', () => {
  it('builds a sale title with the parsed city and a dated description', () => {
    const meta = buildMeta({
      type: 'sale',
      row: {
        title: 'Multi-family yard sale',
        address: '123 Main St, Muncie, IN 47303',
        start_date: '2026-06-14',
        end_date: '2026-06-14',
        start_time: '08:00',
        end_time: '14:00',
        description: 'Tools, toys, and furniture.',
      },
    });
    expect(meta.title).toBe('Multi-family yard sale in Muncie, IN — Trove');
    expect(meta.description).toBe(
      'Sun, Jun 14, 2026 · 8:00 AM – 2:00 PM · Tools, toys, and furniture.',
    );
  });

  it('omits the city when the address cannot be parsed', () => {
    const meta = buildMeta({
      type: 'sale',
      row: { title: 'Garage sale', address: 'somewhere' },
    });
    expect(meta.title).toBe('Garage sale — Trove');
    expect(meta.description).toBeTruthy(); // generic fallback
  });

  it('builds a listing title from pickup_display and a priced description', () => {
    const meta = buildMeta({
      type: 'listing',
      row: {
        title: 'Vintage oak dresser',
        pickup_display: 'Muncie, IN',
        price: 120,
        description: 'Solid wood, minor wear.',
      },
    });
    expect(meta.title).toBe('Vintage oak dresser in Muncie, IN — Trove');
    expect(meta.description).toBe('$120.00 · Solid wood, minor wear.');
  });

  it('keeps descriptions at or under ~155 characters', () => {
    const meta = buildMeta({
      type: 'listing',
      row: { title: 'Box of books', price: 10, description: 'x'.repeat(400) },
    });
    expect(meta.description.length).toBeLessThanOrEqual(155);
  });
});

describe('transformedImage', () => {
  it('rewrites Supabase storage URLs to the render CDN with params', () => {
    expect(
      transformedImage(
        'https://dxahcamntwtuzftxbxgx.supabase.co/storage/v1/object/public/sale-media/a/b.jpg',
        1200,
      ),
    ).toBe(
      'https://dxahcamntwtuzftxbxgx.supabase.co/storage/v1/render/image/public/sale-media/a/b.jpg?width=1200&quality=75',
    );
  });

  it('passes non-storage URLs through untouched', () => {
    expect(transformedImage('https://example.com/pic.jpg', 800)).toBe(
      'https://example.com/pic.jpg',
    );
  });

  it('returns null for missing URLs', () => {
    expect(transformedImage(null, 800)).toBeNull();
  });
});
