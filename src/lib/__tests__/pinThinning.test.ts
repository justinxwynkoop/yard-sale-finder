import type { Region } from 'react-native-maps';
import { zoomBucket, pinPriority, thinPins } from '../pinThinning';
import { Sale } from '../../types';

// Minimal Sale factory. Dates sit firmly in the past so isOpenNow() is always
// false in tests — that keeps pinPriority deterministic (no "open now" boost),
// so priority is driven only by the fields each test sets.
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

const region = (latΔ: number, lngΔ: number): Region => ({
  latitude: 40.193,
  longitude: -85.386,
  latitudeDelta: latΔ,
  longitudeDelta: lngΔ,
});

const W = 390;
const H = 800;
const none = () => false;

describe('zoomBucket', () => {
  it('gives a finer grid (larger exponents) the more you zoom in', () => {
    const out = zoomBucket(region(2, 2), W, H);
    const inn = zoomBucket(region(0.02, 0.02), W, H);
    expect(inn.kx).toBeGreaterThan(out.kx);
    expect(inn.ky).toBeGreaterThan(out.ky);
  });

  it('clamps to a valid integer range and never returns NaN', () => {
    const huge = zoomBucket(region(0.000001, 0.000001), W, H); // extreme zoom-in
    expect(Number.isInteger(huge.kx)).toBe(true);
    expect(huge.kx).toBeLessThanOrEqual(22);
    expect(huge.ky).toBeLessThanOrEqual(23);

    const world = zoomBucket(region(180, 360), W, H); // whole planet
    expect(world.kx).toBeGreaterThanOrEqual(0);
    expect(world.ky).toBeGreaterThanOrEqual(0);
  });

  it('returns the same bucket for two regions at the same zoom (pan-stable)', () => {
    const a = zoomBucket(region(0.05, 0.05), W, H);
    const b = zoomBucket(
      { ...region(0.05, 0.05), latitude: 41, longitude: -80 },
      W,
      H,
    );
    expect(a).toEqual(b);
  });
});

describe('pinPriority', () => {
  it('ranks saved > live-ish active > popular active > quiet active', () => {
    const saved = pinPriority(mkSale({ save_count: 0 }), true);
    const popular = pinPriority(mkSale({ save_count: 50 }), false);
    const quiet = pinPriority(mkSale({ save_count: 0 }), false);
    expect(saved).toBeGreaterThan(popular);
    expect(popular).toBeGreaterThan(quiet);
  });

  it('boosts a recently-posted sale over an older one', () => {
    const fresh = pinPriority(
      mkSale({ created_at: new Date(Date.now() - 1000).toISOString() }),
      false,
    );
    const old = pinPriority(mkSale({ created_at: '2020-01-01T00:00:00Z' }), false);
    expect(fresh).toBeGreaterThan(old);
  });
});

describe('thinPins', () => {
  // kx=ky=1 → cells are 180°×90°, so anything near Muncie lands in one cell.
  const COARSE = 1;
  // Big exponents → sub-degree cells, so distinct coords separate out.
  const FINE = 20;

  it('returns the input untouched when fewer than 2 sales', () => {
    const one = [mkSale()];
    expect(thinPins(one, COARSE, COARSE, none)).toBe(one);
  });

  it('keeps only the highest-priority sale when several share a cell', () => {
    const winner = mkSale({ id: 'win', save_count: 99, latitude: 40.2, longitude: -85.4 });
    const loser = mkSale({ id: 'lose', save_count: 1, latitude: 40.21, longitude: -85.41 });
    const out = thinPins([loser, winner], COARSE, COARSE, none);
    expect(out.map((s) => s.id)).toEqual(['win']);
  });

  it('keeps every sale once zoomed in enough to separate them', () => {
    const a = mkSale({ id: 'a', latitude: 40.20, longitude: -85.40 });
    const b = mkSale({ id: 'b', latitude: 40.25, longitude: -85.45 });
    const out = thinPins([a, b], FINE, FINE, none);
    expect(out.map((s) => s.id).sort()).toEqual(['a', 'b']);
  });

  it('breaks ties toward the first-listed (closest) sale', () => {
    // Identical priority (same fields) + same cell → the earlier one wins.
    const near = mkSale({ id: 'near', latitude: 40.20, longitude: -85.40 });
    const far = mkSale({ id: 'far', latitude: 40.21, longitude: -85.41 });
    const out = thinPins([near, far], COARSE, COARSE, none);
    expect(out.map((s) => s.id)).toEqual(['near']);
  });

  it('lets a favorited sale beat a more-popular non-favorite in the same cell', () => {
    const fav = mkSale({ id: 'fav', save_count: 0, latitude: 40.20, longitude: -85.40 });
    const pop = mkSale({ id: 'pop', save_count: 400, latitude: 40.21, longitude: -85.41 });
    const out = thinPins([pop, fav], COARSE, COARSE, (id) => id === 'fav');
    expect(out.map((s) => s.id)).toEqual(['fav']);
  });

  it('preserves the input ordering of the kept sales', () => {
    // Three cells at FINE zoom; input order should be echoed in output.
    const s1 = mkSale({ id: '1', latitude: 40.10, longitude: -85.30 });
    const s2 = mkSale({ id: '2', latitude: 40.40, longitude: -85.60 });
    const s3 = mkSale({ id: '3', latitude: 40.70, longitude: -85.90 });
    const out = thinPins([s1, s2, s3], FINE, FINE, none);
    expect(out.map((s) => s.id)).toEqual(['1', '2', '3']);
  });
});
