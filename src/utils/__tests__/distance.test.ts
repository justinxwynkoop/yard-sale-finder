import { formatDistanceMiles, haversineMeters } from '../distance';

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters(40, -75, 40, -75)).toBeCloseTo(0, 2);
  });

  it('approximates a known short distance', () => {
    // ~1.6km north-south
    const meters = haversineMeters(40.0, -75.0, 40.01437, -75.0);
    expect(meters).toBeGreaterThan(1500);
    expect(meters).toBeLessThan(1700);
  });

  it('approximates the NYC -> LA distance (~3936km)', () => {
    const meters = haversineMeters(40.7128, -74.006, 34.0522, -118.2437);
    expect(meters).toBeGreaterThan(3_900_000);
    expect(meters).toBeLessThan(4_000_000);
  });
});

describe('formatDistanceMiles', () => {
  it('shows < 0.1 mi for very short distances', () => {
    expect(formatDistanceMiles(50)).toBe('< 0.1 mi');
  });

  it('shows one decimal under 10 miles', () => {
    expect(formatDistanceMiles(800)).toMatch(/0\.5 mi/);
    expect(formatDistanceMiles(8_000)).toMatch(/5\.0 mi/);
  });

  it('rounds to whole miles above 10', () => {
    expect(formatDistanceMiles(20_000)).toMatch(/12 mi/);
  });
});
