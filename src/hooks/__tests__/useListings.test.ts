import { renderHook, act } from '@testing-library/react-native';
import { Listing } from '../../types';
import { hydrateHeldForNames, useMyListings } from '../useListings'; // jest.mock calls below are hoisted above this

// Controllable per-table mock responses — jest.mock factories may only
// close over vars prefixed `mock`. Keyed by table name since one
// useMyListings fetch now hits listings, listing_holds, and profiles in
// sequence (not concurrently), so a single shared chain resolving on the
// table set by the most recent `.from()` call is safe.
let mockResponses: Record<string, { data: any; error: any }> = {};

jest.mock('../../lib/supabase', () => {
  const chain: any = {
    __table: '',
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    in: () => chain,
    then: (resolve: any, reject: any) =>
      Promise.resolve(
        mockResponses[chain.__table] ?? { data: null, error: null },
      ).then(resolve, reject),
  };
  return {
    supabase: {
      from: (table: string) => {
        chain.__table = table;
        return chain;
      },
    },
  };
});

function makeListing(overrides: Partial<Listing> & { id: string }): Listing {
  return {
    user_id: 'seller-1',
    title: 'Vintage lamp',
    description: null,
    price: 20,
    categories: [],
    pickup_input: '',
    pickup_display: 'Nearby',
    pickup_lat: 0,
    pickup_lng: 0,
    status: 'available',
    sale_id: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('hydrateHeldForNames (pure — who a pending listing is held for)', () => {
  it('attaches the buyer display_name to a listing with a matching hold', () => {
    const listings = [makeListing({ id: 'l1', status: 'pending' })];
    const holds = [{ listing_id: 'l1', buyer_id: 'b1' }];
    const buyers = [{ id: 'b1', display_name: 'Jamie' }];
    const result = hydrateHeldForNames(listings, holds, buyers);
    expect(result[0].held_for_name).toBe('Jamie');
  });

  it('falls back to "a buyer" when the buyer has no display_name set', () => {
    const listings = [makeListing({ id: 'l1', status: 'pending' })];
    const holds = [{ listing_id: 'l1', buyer_id: 'b1' }];
    const buyers = [{ id: 'b1', display_name: null }];
    const result = hydrateHeldForNames(listings, holds, buyers);
    expect(result[0].held_for_name).toBe('a buyer');
  });

  it('falls back to "a buyer" when the hold points at a buyer with no profile row in the batch', () => {
    const listings = [makeListing({ id: 'l1', status: 'pending' })];
    const holds = [{ listing_id: 'l1', buyer_id: 'b1' }];
    const result = hydrateHeldForNames(listings, holds, []);
    expect(result[0].held_for_name).toBe('a buyer');
  });

  it('leaves a listing with no matching hold row unchanged (desynced pending, or not held)', () => {
    const listings = [makeListing({ id: 'l1', status: 'pending' })];
    const result = hydrateHeldForNames(listings, [], []);
    expect(result[0].held_for_name).toBeUndefined();
    expect(result).toBe(listings); // no-op short-circuit, not a copy
  });

  it('only hydrates the listing its hold row names, leaving siblings alone', () => {
    const listings = [
      makeListing({ id: 'l1', status: 'pending' }),
      makeListing({ id: 'l2', status: 'available' }),
    ];
    const holds = [{ listing_id: 'l1', buyer_id: 'b1' }];
    const buyers = [{ id: 'b1', display_name: 'Riley' }];
    const result = hydrateHeldForNames(listings, holds, buyers);
    expect(result[0].held_for_name).toBe('Riley');
    expect(result[1].held_for_name).toBeUndefined();
  });
});

describe('useMyListings — loading always clears, holds wired end to end', () => {
  beforeEach(() => {
    mockResponses = {};
  });

  it('clears loading with no listings at all', async () => {
    mockResponses.listings = { data: [], error: null };
    const { result } = await renderHook(() => useMyListings('seller-1'));
    await act(async () => {});
    expect(result.current.loading).toBe(false);
    expect(result.current.listings).toEqual([]);
  });

  it('clears loading and skips the hold round trips when nothing is pending', async () => {
    mockResponses.listings = {
      data: [makeListing({ id: 'l1', status: 'available' })],
      error: null,
    };
    // listing_holds/profiles deliberately left unset — if the hook queried
    // them here it would get {data: null}, which would just as silently
    // hydrate nothing, so this only really checks loading + no throw.
    const { result } = await renderHook(() => useMyListings('seller-1'));
    await act(async () => {});
    expect(result.current.loading).toBe(false);
    expect(result.current.listings[0].held_for_name).toBeUndefined();
  });

  it('clears loading and attaches held_for_name after the full listings -> holds -> profiles chain', async () => {
    mockResponses.listings = {
      data: [makeListing({ id: 'l1', status: 'pending' })],
      error: null,
    };
    mockResponses.listing_holds = {
      data: [{ listing_id: 'l1', buyer_id: 'b1' }],
      error: null,
    };
    mockResponses.profiles = {
      data: [{ id: 'b1', display_name: 'Casey' }],
      error: null,
    };
    const { result } = await renderHook(() => useMyListings('seller-1'));
    await act(async () => {});
    expect(result.current.loading).toBe(false);
    expect(result.current.listings[0].held_for_name).toBe('Casey');
  });

  it('clears loading even when the holds query comes back empty for a pending listing', async () => {
    mockResponses.listings = {
      data: [makeListing({ id: 'l1', status: 'pending' })],
      error: null,
    };
    mockResponses.listing_holds = { data: [], error: null };
    const { result } = await renderHook(() => useMyListings('seller-1'));
    await act(async () => {});
    expect(result.current.loading).toBe(false);
    expect(result.current.listings[0].held_for_name).toBeUndefined();
  });
});
