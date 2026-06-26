import { saleMatchesFilters } from '../filterSales';
import { MapFilters } from '../mapFilters';
import { Sale } from '../../types';

// Minimal Sale factory. Defaults sit firmly in the past so isOpenNow() is
// false unless a test explicitly opens a window — that keeps the openNow gate
// out of the way of the categories / vibe / when assertions.
let seq = 0;
function mkSale(p: Partial<Sale> = {}): Sale {
  seq += 1;
  return {
    id: p.id ?? `s${seq}`,
    user_id: 'u1',
    title: 'Sale',
    description: null,
    address: '123 Main St',
    latitude: 40.193,
    longitude: -85.386,
    start_date: '2020-01-01',
    end_date: '2020-01-02',
    start_time: '08:00',
    end_time: '14:00',
    status: 'active',
    view_count: 0,
    save_count: 0,
    categories: [],
    vibe_tags: [],
    pricing_notes: null,
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2020-01-01T00:00:00Z',
    ...p,
  } as Sale;
}

// MapFilters factory — mirrors DEFAULT_FILTERS, override per test.
function mkFilters(p: Partial<MapFilters> = {}): MapFilters {
  return {
    openNow: false,
    when: null,
    categories: [],
    vibeTags: [],
    savedOnly: false,
    ...p,
  };
}

describe('saleMatchesFilters — no active attribute filters', () => {
  it('passes any sale when filters are all default', () => {
    expect(saleMatchesFilters(mkSale(), mkFilters())).toBe(true);
  });
});

describe('saleMatchesFilters — openNow gate', () => {
  // isOpenNow() reads new Date() for both the date and the time, so pin the
  // clock to a deterministic instant inside / outside the sale's window.
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const openSale = () =>
    mkSale({
      status: 'active',
      start_date: '2024-03-15',
      end_date: '2024-03-15',
      start_time: '08:00',
      end_time: '14:00',
    });

  it('keeps a sale that is open at the current local time', () => {
    // 2024-03-15 10:00 local — inside 08:00–14:00.
    jest.setSystemTime(new Date(2024, 2, 15, 10, 0, 0));
    expect(saleMatchesFilters(openSale(), mkFilters({ openNow: true }))).toBe(
      true,
    );
  });

  it('drops a sale that is closed at the current local time', () => {
    // 2024-03-15 20:00 local — after 14:00 close.
    jest.setSystemTime(new Date(2024, 2, 15, 20, 0, 0));
    expect(saleMatchesFilters(openSale(), mkFilters({ openNow: true }))).toBe(
      false,
    );
  });

  it('ignores open/closed state when openNow is off', () => {
    jest.setSystemTime(new Date(2024, 2, 15, 20, 0, 0)); // closed
    expect(saleMatchesFilters(openSale(), mkFilters({ openNow: false }))).toBe(
      true,
    );
  });
});

describe('saleMatchesFilters — categories filter (OR)', () => {
  it('passes everything when f.categories is empty', () => {
    expect(
      saleMatchesFilters(mkSale({ categories: ['furniture'] }), mkFilters()),
    ).toBe(true);
    expect(saleMatchesFilters(mkSale({ categories: [] }), mkFilters())).toBe(
      true,
    );
  });

  it('matches when the sale shares at least one selected category', () => {
    const sale = mkSale({ categories: ['furniture', 'tools'] });
    expect(
      saleMatchesFilters(sale, mkFilters({ categories: ['clothing', 'tools'] })),
    ).toBe(true);
  });

  it('rejects when the sale shares none of the selected categories', () => {
    const sale = mkSale({ categories: ['furniture'] });
    expect(
      saleMatchesFilters(sale, mkFilters({ categories: ['clothing', 'toys'] })),
    ).toBe(false);
  });

  it('rejects a sale with no categories when a category filter is set', () => {
    expect(
      saleMatchesFilters(
        mkSale({ categories: [] }),
        mkFilters({ categories: ['tools'] }),
      ),
    ).toBe(false);
  });
});

describe('saleMatchesFilters — vibeTags filter (OR)', () => {
  it('matches when the sale shares at least one selected vibe tag', () => {
    const sale = mkSale({ vibe_tags: ['cash_only', 'estate'] });
    expect(
      saleMatchesFilters(sale, mkFilters({ vibeTags: ['estate'] })),
    ).toBe(true);
  });

  it('rejects when the sale shares none of the selected vibe tags', () => {
    const sale = mkSale({ vibe_tags: ['cash_only'] });
    expect(
      saleMatchesFilters(sale, mkFilters({ vibeTags: ['moving'] })),
    ).toBe(false);
  });

  it('excludes a sale with an empty vibe_tags array when a vibe filter is set', () => {
    expect(
      saleMatchesFilters(
        mkSale({ vibe_tags: [] }),
        mkFilters({ vibeTags: ['early_bird'] }),
      ),
    ).toBe(false);
  });

  it('excludes a sale with null vibe_tags when a vibe filter is set', () => {
    // vibe_tags is typed string[] but rows can come back null from the DB;
    // the impl coalesces with `?? []`, so this must be EXCLUDED, not crash.
    const sale = mkSale({ vibe_tags: null as unknown as string[] });
    expect(
      saleMatchesFilters(sale, mkFilters({ vibeTags: ['early_bird'] })),
    ).toBe(false);
  });

  it('passes everything when f.vibeTags is empty (even null vibe_tags)', () => {
    expect(
      saleMatchesFilters(
        mkSale({ vibe_tags: null as unknown as string[] }),
        mkFilters({ vibeTags: [] }),
      ),
    ).toBe(true);
  });
});

describe('saleMatchesFilters — when=today', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('matches a sale whose [start,end] range contains the local today', () => {
    jest.setSystemTime(new Date(2024, 2, 15, 12, 0, 0)); // local 2024-03-15
    const sale = mkSale({ start_date: '2024-03-14', end_date: '2024-03-16' });
    expect(saleMatchesFilters(sale, mkFilters({ when: 'today' }))).toBe(true);
  });

  it('matches a single-day sale that is exactly today', () => {
    jest.setSystemTime(new Date(2024, 2, 15, 12, 0, 0));
    const sale = mkSale({ start_date: '2024-03-15', end_date: '2024-03-15' });
    expect(saleMatchesFilters(sale, mkFilters({ when: 'today' }))).toBe(true);
  });

  it('rejects a sale that already ended before today', () => {
    jest.setSystemTime(new Date(2024, 2, 15, 12, 0, 0));
    const sale = mkSale({ start_date: '2024-03-10', end_date: '2024-03-14' });
    expect(saleMatchesFilters(sale, mkFilters({ when: 'today' }))).toBe(false);
  });

  it('rejects a sale that starts after today', () => {
    jest.setSystemTime(new Date(2024, 2, 15, 12, 0, 0));
    const sale = mkSale({ start_date: '2024-03-16', end_date: '2024-03-17' });
    expect(saleMatchesFilters(sale, mkFilters({ when: 'today' }))).toBe(false);
  });

  it('uses the LOCAL day, not the UTC day', () => {
    // 2024-03-15 23:30 local. In a UTC-negative offset this would already be
    // 2024-03-16 in UTC; isoDate uses local components, so "today" is the 15th.
    jest.setSystemTime(new Date(2024, 2, 15, 23, 30, 0));
    const onlyThe15th = mkSale({
      start_date: '2024-03-15',
      end_date: '2024-03-15',
    });
    expect(saleMatchesFilters(onlyThe15th, mkFilters({ when: 'today' }))).toBe(
      true,
    );
  });
});

describe('saleMatchesFilters — when=weekend', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('matches a Saturday-only sale when today is a midweek Wednesday', () => {
    // Wed 2024-03-13. This weekend = Sat 2024-03-16 / Sun 2024-03-17.
    jest.setSystemTime(new Date(2024, 2, 13, 9, 0, 0));
    const satOnly = mkSale({
      start_date: '2024-03-16',
      end_date: '2024-03-16',
    });
    expect(saleMatchesFilters(satOnly, mkFilters({ when: 'weekend' }))).toBe(
      true,
    );
  });

  it('rejects a sale that ends before this weekend (from a Wednesday)', () => {
    jest.setSystemTime(new Date(2024, 2, 13, 9, 0, 0)); // Wed 2024-03-13
    const endsThursday = mkSale({
      start_date: '2024-03-14',
      end_date: '2024-03-14', // before Sat 03-16
    });
    expect(
      saleMatchesFilters(endsThursday, mkFilters({ when: 'weekend' })),
    ).toBe(false);
  });

  it('treats Sunday as part of "this weekend" (the Sat–Sun pair containing today)', () => {
    // Sun 2024-03-17. "this weekend" should be Sat 03-16 / Sun 03-17.
    jest.setSystemTime(new Date(2024, 2, 17, 9, 0, 0));

    // Sale on the Saturday that precedes today's Sunday — still "this weekend".
    const satOfThisWeekend = mkSale({
      start_date: '2024-03-16',
      end_date: '2024-03-16',
    });
    expect(
      saleMatchesFilters(satOfThisWeekend, mkFilters({ when: 'weekend' })),
    ).toBe(true);

    // Sale on today (the Sunday) — also "this weekend".
    const sunOfThisWeekend = mkSale({
      start_date: '2024-03-17',
      end_date: '2024-03-17',
    });
    expect(
      saleMatchesFilters(sunOfThisWeekend, mkFilters({ when: 'weekend' })),
    ).toBe(true);

    // Next Saturday is NOT this weekend.
    const nextSat = mkSale({
      start_date: '2024-03-23',
      end_date: '2024-03-23',
    });
    expect(saleMatchesFilters(nextSat, mkFilters({ when: 'weekend' }))).toBe(
      false,
    );
  });

  it('matches a multi-day sale that straddles the weekend (start<=sun && end>=sat)', () => {
    jest.setSystemTime(new Date(2024, 2, 13, 9, 0, 0)); // Wed 2024-03-13
    // Fri–Sun spanning Sat 03-16: starts before Sun, ends after Sat.
    const fridayToSunday = mkSale({
      start_date: '2024-03-15',
      end_date: '2024-03-17',
    });
    expect(
      saleMatchesFilters(fridayToSunday, mkFilters({ when: 'weekend' })),
    ).toBe(true);
  });
});

describe('saleMatchesFilters — when=next_weekend', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shifts the window forward by 7 days', () => {
    // Wed 2024-03-13 → this weekend Sat 03-16/Sun 03-17, next weekend +7 =
    // Sat 03-23 / Sun 03-24.
    jest.setSystemTime(new Date(2024, 2, 13, 9, 0, 0));

    const nextSat = mkSale({ start_date: '2024-03-23', end_date: '2024-03-23' });
    expect(
      saleMatchesFilters(nextSat, mkFilters({ when: 'next_weekend' })),
    ).toBe(true);

    // This weekend's Saturday must NOT match the next_weekend filter.
    const thisSat = mkSale({ start_date: '2024-03-16', end_date: '2024-03-16' });
    expect(
      saleMatchesFilters(thisSat, mkFilters({ when: 'next_weekend' })),
    ).toBe(false);
  });
});

describe('saleMatchesFilters — month-boundary setDate rollover', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('rolls weekendRange into the next month correctly (31-day month)', () => {
    // Wed 2024-01-31 (January has 31 days). 6 - day(=3) = +3 → Sat 2024-02-03,
    // Sun 2024-02-04. setDate(31 + 3 = 34) must roll over into February.
    jest.setSystemTime(new Date(2024, 0, 31, 9, 0, 0));

    const febSat = mkSale({ start_date: '2024-02-03', end_date: '2024-02-03' });
    expect(saleMatchesFilters(febSat, mkFilters({ when: 'weekend' }))).toBe(
      true,
    );

    const febSun = mkSale({ start_date: '2024-02-04', end_date: '2024-02-04' });
    expect(saleMatchesFilters(febSun, mkFilters({ when: 'weekend' }))).toBe(
      true,
    );

    // A late-January date is past, not this weekend.
    const janSale = mkSale({ start_date: '2024-01-27', end_date: '2024-01-27' });
    expect(saleMatchesFilters(janSale, mkFilters({ when: 'weekend' }))).toBe(
      false,
    );
  });
});

describe('saleMatchesFilters — combined filters are AND-ed across dimensions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('requires every active dimension to pass', () => {
    jest.setSystemTime(new Date(2024, 2, 15, 12, 0, 0)); // local 2024-03-15
    const sale = mkSale({
      start_date: '2024-03-15',
      end_date: '2024-03-15',
      categories: ['tools'],
      vibe_tags: ['cash_only'],
    });

    // All dimensions satisfied → match.
    expect(
      saleMatchesFilters(
        sale,
        mkFilters({
          when: 'today',
          categories: ['tools'],
          vibeTags: ['cash_only'],
        }),
      ),
    ).toBe(true);

    // One dimension (category) fails → no match.
    expect(
      saleMatchesFilters(
        sale,
        mkFilters({
          when: 'today',
          categories: ['clothing'],
          vibeTags: ['cash_only'],
        }),
      ),
    ).toBe(false);
  });
});
