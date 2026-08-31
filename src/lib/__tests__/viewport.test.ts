import type { Region } from 'react-native-maps';
import { regionContains, scopedByRegion } from '../viewport';

// A Region centered on Muncie. The deltas are the FULL span; regionContains
// must treat the visible bounds as center ± delta/2 on each axis.
const region = (
  latitude: number,
  longitude: number,
  latitudeDelta: number,
  longitudeDelta: number,
): Region => ({ latitude, longitude, latitudeDelta, longitudeDelta });

describe('regionContains', () => {
  // 1°×1° span around (40, -85): bounds are lat [39.5, 40.5], lng [-85.5, -84.5].
  const r = region(40, -85, 1, 1);

  it('contains a point at the exact center', () => {
    expect(regionContains(r, 40, -85)).toBe(true);
  });

  it('treats each edge as inclusive (point exactly on the boundary)', () => {
    expect(regionContains(r, 39.5, -85)).toBe(true); // south edge
    expect(regionContains(r, 40.5, -85)).toBe(true); // north edge
    expect(regionContains(r, 40, -85.5)).toBe(true); // west edge
    expect(regionContains(r, 40, -84.5)).toBe(true); // east edge
  });

  it('excludes a point just outside each of the four edges', () => {
    expect(regionContains(r, 39.499, -85)).toBe(false); // below south
    expect(regionContains(r, 40.501, -85)).toBe(false); // above north
    expect(regionContains(r, 40, -85.501)).toBe(false); // west of west
    expect(regionContains(r, 40, -84.499)).toBe(false); // east of east
  });

  it('halves the deltas: delta 2 spans ±1, so the corner is in but +0.001 is out', () => {
    // latΔ=2 / lngΔ=2 centered at (40,-85) → bounds lat [39,41], lng [-86,-84].
    const half = region(40, -85, 2, 2);
    expect(regionContains(half, 41, -84)).toBe(true); // NE corner, on bounds
    expect(regionContains(half, 41.001, -85)).toBe(false); // just past north edge
    expect(regionContains(half, 40, -83.999)).toBe(false); // just past east edge
  });
});

describe('scopedByRegion', () => {
  // Yorktown Heights NY, and the two mid-country points that exposed the bug.
  const yorktown = { latitude: 41.2709, longitude: -73.7793 };
  const mankatoKS = { latitude: 39.7288, longitude: -98.326 };
  const almaNE = { latitude: 40.1389, longitude: -99.3887 };
  const nearYorktown = { latitude: 41.2801, longitude: -73.7712 };

  // A ~0.05° city view around Yorktown — what the map shows on a normal open.
  const yorktownView = region(yorktown.latitude, yorktown.longitude, 0.05, 0.05);

  it('returns EMPTY for a null scope — never the unscoped input', () => {
    // The regression: before the map's first settle the scope is null, and
    // returning the input here rendered every sale in the country under the
    // "N sales nearby" header.
    expect(scopedByRegion([mankatoKS, almaNE], null)).toEqual([]);
  });

  it('excludes sales 1,200 miles outside the visible region', () => {
    expect(scopedByRegion([mankatoKS, almaNE], yorktownView)).toEqual([]);
  });

  it('keeps only the sales actually inside the region', () => {
    const out = scopedByRegion([mankatoKS, nearYorktown, almaNE], yorktownView);
    expect(out).toEqual([nearYorktown]);
  });

  it('sorts nearest-first from the region center', () => {
    // Both inside a wide view; the closer one to center must come first.
    const wide = region(yorktown.latitude, yorktown.longitude, 60, 60);
    const out = scopedByRegion([almaNE, mankatoKS], wide);
    expect(out).toEqual([mankatoKS, almaNE]); // Kansas is nearer to NY than Nebraska
  });

  it('does not mutate or reorder the caller’s array', () => {
    const input = [almaNE, mankatoKS];
    const wide = region(yorktown.latitude, yorktown.longitude, 60, 60);
    scopedByRegion(input, wide);
    expect(input).toEqual([almaNE, mankatoKS]);
  });
});
