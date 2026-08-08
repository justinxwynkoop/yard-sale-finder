import { datesOverlap, eventMatchForSale } from '../eventMatch';
import { SaleEvent } from '../../types';

const ev = (o: Partial<SaleEvent>): SaleEvent => ({
  id: 'e1', organizer_id: 'u1', title: 'Maple Grove', description: null,
  cover_url: null, start_date: '2026-08-15', end_date: '2026-08-16',
  latitude: 40.0, longitude: -85.0, radius_m: 800, share_slug: 'abc12345',
  created_at: '', updated_at: '', ...o,
});
const TODAY = '2026-08-10';

describe('datesOverlap', () => {
  it('true when ranges intersect, inclusive of shared edge days', () => {
    expect(datesOverlap('2026-08-15', '2026-08-16', '2026-08-16', '2026-08-17')).toBe(true);
    expect(datesOverlap('2026-08-15', '2026-08-15', '2026-08-15', '2026-08-15')).toBe(true);
  });
  it('false when ranges are disjoint', () => {
    expect(datesOverlap('2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18')).toBe(false);
  });
});

describe('eventMatchForSale', () => {
  const sale = { latitude: 40.0, longitude: -85.0 };
  it('matches a sale inside the radius', () => {
    expect(eventMatchForSale(sale, [ev({})], TODAY)?.id).toBe('e1');
  });
  it('rejects a sale outside the radius', () => {
    // ~0.02 deg latitude ≈ 2.2 km > 800 m
    expect(eventMatchForSale({ latitude: 40.02, longitude: -85.0 }, [ev({})], TODAY)).toBeNull();
  });
  it('ignores ended events', () => {
    expect(eventMatchForSale(sale, [ev({ end_date: '2026-08-01' })], TODAY)).toBeNull();
  });
  it('date mismatch does NOT block matching (location-only trigger)', () => {
    expect(eventMatchForSale(sale, [ev({ start_date: '2026-09-01', end_date: '2026-09-02' })], TODAY)?.id).toBe('e1');
  });
  it('multiple matches -> soonest start date wins', () => {
    const later = ev({ id: 'later', start_date: '2026-09-01', end_date: '2026-09-02' });
    const sooner = ev({ id: 'sooner', start_date: '2026-08-12', end_date: '2026-08-13' });
    expect(eventMatchForSale(sale, [later, sooner], TODAY)?.id).toBe('sooner');
  });
  it('same start date -> nearest wins', () => {
    const near = ev({ id: 'near' });
    const far = ev({ id: 'far', latitude: 40.005 });
    expect(eventMatchForSale(sale, [far, near], TODAY)?.id).toBe('near');
  });
});
