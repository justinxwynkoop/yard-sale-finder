import {
  PriceBucket,
  ListingsFilters,
  getListingsFilters,
  setListingsFilters,
  resetListingsFilters,
  countActiveListingsFilters,
  priceBucketToRange,
} from '../listingsFilters';
import { ItemCategory } from '../../types';

// The store is module-level shared state. Reset it before each test so the
// store/listener tests don't leak into one another.
beforeEach(() => {
  resetListingsFilters();
});

describe('priceBucketToRange', () => {
  it("maps 'free' to a fixed-zero range", () => {
    expect(priceBucketToRange('free')).toEqual({ min: 0, max: 0 });
  });

  it("maps 'under10' to an open-bottom range capped at 10", () => {
    expect(priceBucketToRange('under10')).toEqual({ min: null, max: 10 });
  });

  it("maps '10-50' to a bounded range", () => {
    expect(priceBucketToRange('10-50')).toEqual({ min: 10, max: 50 });
  });

  it("maps '50-100' to a bounded range", () => {
    expect(priceBucketToRange('50-100')).toEqual({ min: 50, max: 100 });
  });

  it("maps '100plus' to an open-top range starting at 100", () => {
    expect(priceBucketToRange('100plus')).toEqual({ min: 100, max: null });
  });

  it('maps null to an unbounded range', () => {
    expect(priceBucketToRange(null)).toEqual({ min: null, max: null });
  });

  it('maps an unknown bucket to an unbounded range (default case)', () => {
    // Force an out-of-union value to exercise the switch default branch.
    expect(priceBucketToRange('weird' as unknown as PriceBucket)).toEqual({
      min: null,
      max: null,
    });
  });
});

describe('countActiveListingsFilters', () => {
  const base: ListingsFilters = {
    categories: [],
    priceBucket: null,
    radiusMiles: null,
  };

  it('counts 0 for the default (empty) filter state', () => {
    expect(countActiveListingsFilters(base)).toBe(0);
  });

  it('counts +1 for non-empty categories', () => {
    expect(
      countActiveListingsFilters({
        ...base,
        categories: ['furniture' as ItemCategory],
      }),
    ).toBe(1);
  });

  it('counts +1 for a non-null priceBucket', () => {
    expect(
      countActiveListingsFilters({ ...base, priceBucket: 'free' }),
    ).toBe(1);
  });

  it('counts +1 for a non-null radiusMiles', () => {
    expect(
      countActiveListingsFilters({ ...base, radiusMiles: 25 }),
    ).toBe(1);
  });

  it('counts radiusMiles:0 as set because it is != null', () => {
    expect(
      countActiveListingsFilters({ ...base, radiusMiles: 0 }),
    ).toBe(1);
  });

  it('sums all active filters together', () => {
    expect(
      countActiveListingsFilters({
        categories: ['furniture' as ItemCategory, 'tools' as ItemCategory],
        priceBucket: '10-50',
        radiusMiles: 10,
      }),
    ).toBe(3);
  });
});

describe('listings filter store', () => {
  it('starts at the default state', () => {
    expect(getListingsFilters()).toEqual({
      categories: [],
      priceBucket: null,
      radiusMiles: null,
    });
  });

  it('setListingsFilters merges a partial without clobbering other keys', () => {
    setListingsFilters({ priceBucket: 'under10' });
    expect(getListingsFilters()).toEqual({
      categories: [],
      priceBucket: 'under10',
      radiusMiles: null,
    });

    setListingsFilters({ radiusMiles: 5 });
    expect(getListingsFilters()).toEqual({
      categories: [],
      priceBucket: 'under10',
      radiusMiles: 5,
    });
  });

  it('resetListingsFilters restores defaults after mutations', () => {
    setListingsFilters({
      categories: ['tools' as ItemCategory],
      priceBucket: '100plus',
      radiusMiles: 50,
    });
    expect(countActiveListingsFilters(getListingsFilters())).toBe(3);

    resetListingsFilters();
    expect(getListingsFilters()).toEqual({
      categories: [],
      priceBucket: null,
      radiusMiles: null,
    });
    expect(countActiveListingsFilters(getListingsFilters())).toBe(0);
  });
});
