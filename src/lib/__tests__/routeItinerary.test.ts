import {
  AVG_MPH,
  DEFAULT_BROWSE_MIN,
  parseTimeToMinutes,
  fmtTime,
  nowMinutes,
  estimateDriveMinutes,
  computeItinerary,
  orderByBestLoop,
  orderByClosingSoonest,
  regionForCoords,
} from '../routeItinerary';
import { Sale } from '../../types';

// Minimal Sale factory mirroring the style used in pinThinning.test.ts.
// Lat/lng default to a Muncie-ish point; tests override what they exercise.
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

describe('parseTimeToMinutes', () => {
  it('parses HH:MM:SS to minutes-from-midnight', () => {
    expect(parseTimeToMinutes('08:30:00')).toBe(510);
  });

  it('parses HH:MM without seconds', () => {
    expect(parseTimeToMinutes('14:00')).toBe(840);
  });

  it('falls back to end-of-day (23:59) for empty / null / undefined', () => {
    const eod = 23 * 60 + 59; // 1439
    expect(parseTimeToMinutes('')).toBe(eod);
    expect(parseTimeToMinutes(null)).toBe(eod);
    expect(parseTimeToMinutes(undefined)).toBe(eod);
  });

  it('treats a bare hour as hour:00', () => {
    expect(parseTimeToMinutes('9')).toBe(540);
  });

  it('treats garbage as 0', () => {
    expect(parseTimeToMinutes('garbage')).toBe(0);
    expect(parseTimeToMinutes('abc:def')).toBe(0);
  });
});

describe('fmtTime', () => {
  it('formats midnight as 12:00a', () => {
    expect(fmtTime(0)).toBe('12:00a');
  });

  it('formats 9am with zero-padded minutes', () => {
    expect(fmtTime(540)).toBe('9:00a');
  });

  it('formats noon as 12:00p', () => {
    expect(fmtTime(720)).toBe('12:00p');
  });

  it('formats an afternoon half-hour as 6:30p', () => {
    expect(fmtTime(1110)).toBe('6:30p');
  });

  it('zero-pads single-digit minutes', () => {
    expect(fmtTime(525)).toBe('8:45a');
  });
});

describe('nowMinutes', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('rounds up to the next 5-minute mark', () => {
    // 08:32 → 512 raw → ceil to 515
    jest.setSystemTime(new Date(2020, 0, 1, 8, 32, 0));
    expect(nowMinutes()).toBe(515);
  });

  it('leaves an exact 5-minute mark unchanged', () => {
    // 09:15 → 555, already a multiple of 5
    jest.setSystemTime(new Date(2020, 0, 1, 9, 15, 0));
    expect(nowMinutes()).toBe(555);
  });
});

describe('estimateDriveMinutes', () => {
  it('clamps identical coordinates to the minimum drive time', () => {
    // 0 distance would compute to 0 minutes; clamp floors it.
    expect(estimateDriveMinutes(40.193, -85.386, 40.193, -85.386)).toBe(3);
  });

  it('returns a plausible positive estimate for a ~30mi pair', () => {
    // ~0.5deg of latitude ≈ 34.5 mi straight-line near this latitude.
    const mins = estimateDriveMinutes(40.0, -85.0, 40.5, -85.0);
    // detour-adjusted miles / AVG_MPH * 60 — well above the floor.
    expect(mins).toBeGreaterThan(3);
    // sanity band: ~34.5mi * 1.3 detour ≈ 44.9mi @ 30mph ≈ 90min.
    expect(mins).toBeGreaterThan(70);
    expect(mins).toBeLessThan(110);
    expect(Number.isInteger(mins)).toBe(true);
  });

  it('uses AVG_MPH = 30 as the speed constant', () => {
    expect(AVG_MPH).toBe(30);
  });
});

describe('computeItinerary', () => {
  it('returns an empty array for an empty order', () => {
    expect(computeItinerary([])).toEqual([]);
  });

  it('for i=0 with no startLat: zero drive and arrival == startMin', () => {
    const sale = mkSale({ end_time: '14:00', latitude: 40.0, longitude: -85.0 });
    const [stop] = computeItinerary([sale], { startMin: 600 });
    expect(stop.driveFromPrev).toBe(0);
    expect(stop.arrival).toBe(600);
    expect(stop.depart).toBe(600 + DEFAULT_BROWSE_MIN);
    expect(stop.missed).toBe(false);
    expect(stop.closeMin).toBe(840);
  });

  it('for i=0 with a startLat: drive from the start location is non-zero', () => {
    const sale = mkSale({ end_time: '23:59', latitude: 40.5, longitude: -85.0 });
    const [stop] = computeItinerary([sale], {
      startMin: 600,
      startLat: 40.0,
      startLng: -85.0,
    });
    expect(stop.driveFromPrev).toBeGreaterThan(0);
    expect(stop.arrival).toBe(600 + stop.driveFromPrev);
    expect(stop.depart).toBe(stop.arrival + DEFAULT_BROWSE_MIN);
  });

  it('depart == arrival + browse for every stop', () => {
    const a = mkSale({ end_time: '23:59', latitude: 40.0, longitude: -85.0 });
    const b = mkSale({ end_time: '23:59', latitude: 40.1, longitude: -85.1 });
    const stops = computeItinerary([a, b], { startMin: 540, browseMin: 20 });
    for (const s of stops) {
      expect(s.depart).toBe(s.arrival + s.browse);
      expect(s.browse).toBe(20);
    }
  });

  it('flags missed=true when arrival is after the sale closes', () => {
    // Start at 13:00 (780) with a sale closing 12:00 (720) → already missed.
    const sale = mkSale({ end_time: '12:00', latitude: 40.0, longitude: -85.0 });
    const [stop] = computeItinerary([sale], { startMin: 780 });
    expect(stop.closeMin).toBe(720);
    expect(stop.missed).toBe(true);
  });

  it('honors a custom browseMin', () => {
    const sale = mkSale({ end_time: '23:59' });
    const [stop] = computeItinerary([sale], { startMin: 600, browseMin: 45 });
    expect(stop.browse).toBe(45);
    expect(stop.depart).toBe(600 + 45);
  });

  it('honors a custom startMin', () => {
    const sale = mkSale({ end_time: '23:59' });
    const [stop] = computeItinerary([sale], { startMin: 480 });
    expect(stop.arrival).toBe(480);
  });

  it('accumulates drive + browse across consecutive legs', () => {
    const a = mkSale({ end_time: '23:59', latitude: 40.0, longitude: -85.0 });
    const b = mkSale({ end_time: '23:59', latitude: 40.2, longitude: -85.0 });
    const [first, second] = computeItinerary([a, b], {
      startMin: 600,
      browseMin: 10,
    });
    // first leg has no start location → 0 drive
    expect(first.driveFromPrev).toBe(0);
    expect(first.arrival).toBe(600);
    expect(first.depart).toBe(610);
    // second leg drives from a → b
    expect(second.driveFromPrev).toBeGreaterThan(0);
    expect(second.arrival).toBe(first.depart + second.driveFromPrev);
    expect(second.depart).toBe(second.arrival + 10);
  });
});

describe('orderByBestLoop', () => {
  it('returns a copy unchanged for length <= 1', () => {
    const empty: Sale[] = [];
    expect(orderByBestLoop(empty)).toEqual([]);
    expect(orderByBestLoop(empty)).not.toBe(empty);

    const one = [mkSale({ id: 'only' })];
    const out = orderByBestLoop(one);
    expect(out.map((s) => s.id)).toEqual(['only']);
    expect(out).not.toBe(one);
  });

  it('produces a deterministic nearest-neighbour ordering from a start point', () => {
    // A row of points; starting near 'a' should visit a → b → c.
    const a = mkSale({ id: 'a', latitude: 40.0, longitude: -85.0 });
    const b = mkSale({ id: 'b', latitude: 40.0, longitude: -85.1 });
    const c = mkSale({ id: 'c', latitude: 40.0, longitude: -85.2 });
    // Feed them out of order; nearest-neighbour from the start should re-sort.
    const out = orderByBestLoop([c, b, a], 40.0, -85.001);
    expect(out.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate its input array', () => {
    const a = mkSale({ id: 'a', latitude: 40.0, longitude: -85.2 });
    const b = mkSale({ id: 'b', latitude: 40.0, longitude: -85.0 });
    const input = [a, b];
    const snapshot = input.map((s) => s.id);
    orderByBestLoop(input, 40.0, -85.0);
    expect(input.map((s) => s.id)).toEqual(snapshot);
  });
});

describe('orderByClosingSoonest', () => {
  it('sorts by end_time ascending', () => {
    const late = mkSale({ id: 'late', end_time: '17:00' });
    const early = mkSale({ id: 'early', end_time: '11:00' });
    const mid = mkSale({ id: 'mid', end_time: '14:00' });
    const out = orderByClosingSoonest([late, early, mid]);
    expect(out.map((s) => s.id)).toEqual(['early', 'mid', 'late']);
  });

  it('does not mutate its input array', () => {
    const late = mkSale({ id: 'late', end_time: '17:00' });
    const early = mkSale({ id: 'early', end_time: '11:00' });
    const input = [late, early];
    const snapshot = input.map((s) => s.id);
    orderByClosingSoonest(input);
    expect(input.map((s) => s.id)).toEqual(snapshot);
  });
});

describe('regionForCoords', () => {
  it('returns null for an empty list', () => {
    expect(regionForCoords([])).toBeNull();
  });

  it('uses the minimum delta floor for a single coordinate', () => {
    const region = regionForCoords([{ latitude: 40.0, longitude: -85.0 }]);
    expect(region).not.toBeNull();
    expect(region!.latitude).toBe(40.0);
    expect(region!.longitude).toBe(-85.0);
    expect(region!.latitudeDelta).toBe(0.01);
    expect(region!.longitudeDelta).toBe(0.01);
  });

  it('returns a padded center for multiple coordinates', () => {
    const region = regionForCoords([
      { latitude: 40.0, longitude: -85.0 },
      { latitude: 41.0, longitude: -84.0 },
    ]);
    expect(region).not.toBeNull();
    // center is the midpoint of the bounding box
    expect(region!.latitude).toBeCloseTo(40.5, 10);
    expect(region!.longitude).toBeCloseTo(-84.5, 10);
    // span (1.0) * default paddingFactor (1.5) = 1.5
    expect(region!.latitudeDelta).toBeCloseTo(1.5, 10);
    expect(region!.longitudeDelta).toBeCloseTo(1.5, 10);
  });

  it('honors a custom padding factor', () => {
    const region = regionForCoords(
      [
        { latitude: 40.0, longitude: -85.0 },
        { latitude: 42.0, longitude: -83.0 },
      ],
      2,
    );
    // span 2.0 * paddingFactor 2 = 4.0
    expect(region!.latitudeDelta).toBeCloseTo(4.0, 10);
    expect(region!.longitudeDelta).toBeCloseTo(4.0, 10);
  });
});
