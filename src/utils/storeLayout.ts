import { Listing, StoreSectionConfig } from '../types';

export interface StoreLayout {
  featuredListings: Listing[];
  sections: { id: string; name: string; listings: Listing[] }[];
  recentListings: Listing[];
}

export function buildStoreLayout(
  allListings: Listing[],
  featured: string[],
  sections: StoreSectionConfig[],
): StoreLayout {
  const byId = new Map(allListings.map((l) => [l.id, l]));
  const assignedIds = new Set([
    ...featured,
    ...sections.flatMap((s) => s.listingIds),
  ]);

  const featuredListings = featured
    .map((id) => byId.get(id))
    .filter((l): l is Listing => l !== undefined);

  const resolvedSections = sections.map((s) => ({
    id: s.id,
    name: s.name,
    listings: s.listingIds
      .map((id) => byId.get(id))
      .filter((l): l is Listing => l !== undefined),
  }));

  const recentListings = allListings
    .filter((l) => !assignedIds.has(l.id))
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

  return { featuredListings, sections: resolvedSections, recentListings };
}
