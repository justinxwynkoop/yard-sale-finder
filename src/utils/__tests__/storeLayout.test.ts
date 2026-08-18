import { buildStoreLayout } from '../storeLayout';
import { Listing, StoreSectionConfig } from '../../types';

function makeListing(id: string, created_at: string): Listing {
  return {
    id,
    user_id: 'user-1',
    title: `Item ${id}`,
    description: null,
    price: 10,
    categories: [],
    pickup_input: '',
    pickup_display: '',
    pickup_lat: 0,
    pickup_lng: 0,
    status: 'available',
    sale_id: null,
    created_at,
    updated_at: created_at,
  };
}

const A = makeListing('a', '2026-08-01T00:00:00Z');
const B = makeListing('b', '2026-08-02T00:00:00Z');
const C = makeListing('c', '2026-08-03T00:00:00Z');
const D = makeListing('d', '2026-08-04T00:00:00Z');
const all = [A, B, C, D];

describe('buildStoreLayout', () => {
  it('returns featured in specified order', () => {
    const { featuredListings } = buildStoreLayout(all, ['b', 'a'], []);
    expect(featuredListings.map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('silently drops orphaned featured IDs', () => {
    const { featuredListings } = buildStoreLayout(all, ['missing', 'a'], []);
    expect(featuredListings.map((l) => l.id)).toEqual(['a']);
  });

  it('excludes featured items from recent', () => {
    const { recentListings } = buildStoreLayout(all, ['a', 'b'], []);
    expect(recentListings.map((l) => l.id)).toEqual(['d', 'c']);
  });

  it('excludes section items from recent', () => {
    const sections: StoreSectionConfig[] = [{ id: 's1', name: 'X', listingIds: ['c', 'd'] }];
    const { recentListings } = buildStoreLayout(all, [], sections);
    expect(recentListings.map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('sorts recent newest-first', () => {
    const { recentListings } = buildStoreLayout(all, [], []);
    expect(recentListings.map((l) => l.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('resolves section listings in listingIds order', () => {
    const sections: StoreSectionConfig[] = [{ id: 's1', name: 'X', listingIds: ['d', 'b'] }];
    const { sections: out } = buildStoreLayout(all, [], sections);
    expect(out[0].listings.map((l) => l.id)).toEqual(['d', 'b']);
  });

  it('silently drops orphaned section listing IDs', () => {
    const sections: StoreSectionConfig[] = [{ id: 's1', name: 'X', listingIds: ['missing', 'a'] }];
    const { sections: out } = buildStoreLayout(all, [], sections);
    expect(out[0].listings.map((l) => l.id)).toEqual(['a']);
  });

  it('returns empty recent when all listings are assigned', () => {
    const sections: StoreSectionConfig[] = [{ id: 's1', name: 'X', listingIds: ['a', 'b', 'c', 'd'] }];
    const { recentListings } = buildStoreLayout(all, [], sections);
    expect(recentListings).toHaveLength(0);
  });
});
