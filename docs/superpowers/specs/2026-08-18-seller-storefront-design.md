# Seller Storefront Design Spec

**Date:** 2026-08-18  
**Branch:** justins-branch  
**Status:** Approved

---

## Overview

Add a public-facing seller storefront to Trove. When a user visits another user's `PublicProfileScreen`, they can tap "Visit Store" to see all of that seller's active listings organized into featured items, custom sections, and a recent catch-all — similar to an eBay seller profile.

This is a v1 scope. Bundle discounts, store branding (banner image, store name), and store-level analytics are intentionally deferred to future iterations.

---

## Architecture

### New Screens

| Screen | Path | Purpose |
|---|---|---|
| `StoreScreen` | `src/screens/profile/StoreScreen.tsx` | Public-facing storefront |
| `ManageStoreScreen` | `src/screens/profile/ManageStoreScreen.tsx` | Seller's store management UI |
| `StoreSectionDetailScreen` | `src/screens/profile/StoreSectionDetailScreen.tsx` | Edit a single section: rename, reorder listings, assign/remove items |

### New Components

| Component | Path | Purpose |
|---|---|---|
| `StoreFeaturedSection` | `src/components/StoreFeaturedSection.tsx` | Horizontal scroll row of featured items |
| `StoreSection` | `src/components/StoreSection.tsx` | Named section with 2-col listing grid |
| `StoreListingTile` | `src/components/StoreListingTile.tsx` | Listing card sized for store grid (extends existing `ListingTile`) |

### New Hooks

| Hook | Purpose |
|---|---|
| `useStore(userId)` | Fetches store config: featured item IDs, section definitions + ordered listing IDs |
| `useStoreListings(userId)` | Fetches all active listings for a seller; mirrors `useMyListings` pattern |

### Navigation

- `StoreScreen` is registered in `ProfileStack` (and any stack that navigates to `PublicProfileScreen`: Map, Listings, Messages).
- `ManageStoreScreen` is registered in `ProfileStack` only.
- `PublicProfileScreen` receives a "Visit Store" button.
- `ProfileScreen` (own profile view) receives a "Manage Store" button alongside the existing "Edit Profile" button.
- `StoreScreen` params: `{ userId: string, displayName: string, avatarUrl: string | null, memberSince: string }` — all passed from `PublicProfileScreen` (which already has the full profile) to avoid an extra fetch for the store header.

---

## Database Schema

### New Tables

```sql
-- Pinned featured listings per seller (max ~6 recommended, not enforced)
create table store_featured (
  user_id uuid references profiles(id) on delete cascade,
  listing_id uuid references listings(id) on delete cascade,
  position integer not null default 0,
  primary key (user_id, listing_id)
);

-- Seller-defined named sections
create table store_sections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  position integer not null default 0
);

-- Listings assigned to a section
create table store_section_items (
  section_id uuid references store_sections(id) on delete cascade,
  listing_id uuid references listings(id) on delete cascade,
  position integer not null default 0,
  primary key (section_id, listing_id)
);
```

RLS: owners can write their own rows; anyone can read.

---

## Store Screen Layout

```
┌─────────────────────────────┐
│  [Avatar]  Justin Wynkoop   │
│  Member since Aug 2024      │
│  [X items for sale]         │
├─────────────────────────────┤
│  ★ FEATURED                 │
│  ┌──────┐ ┌──────┐ ┌──────┐│
│  │ item │ │ item │ │ item ││  ← horizontal scroll
│  └──────┘ └──────┘ └──────┘│
├─────────────────────────────┤
│  ELECTRONICS                │
│  ┌──────┐ ┌──────┐         │
│  │ item │ │ item │         │  ← 2-col grid
│  └──────┘ └──────┘         │
├─────────────────────────────┤
│  RECENT                     │
│  ┌──────┐ ┌──────┐         │
│  │ item │ │ item │         │
│  └──────┘ └──────┘         │
└─────────────────────────────┘
```

**Rendering rules:**
- **Featured section** — shown only if seller has pinned at least one item; horizontal scroll row
- **Custom sections** — shown only if seller has created at least one section; each is a labeled 2-col grid
- **Recent catch-all** — always rendered; labeled "Recent" if other sections exist, no label if it's the only content; sorted newest-first; items whose IDs appear in featured or any section are excluded
- Tapping any item navigates to the existing `ListingDetailScreen`
- If the viewer is the store owner, a banner appears: "This is how your store looks to others" with a shortcut to `ManageStoreScreen`

---

## Manage Store Screen Layout

Entry point: "Manage Store" button on the seller's own `ProfileScreen`.

```
┌─────────────────────────────┐
│  ← Manage Store             │
├─────────────────────────────┤
│  ★ Featured Items      [+]  │
│  ┌──────┐ ┌──────┐         │
│  │ item │ │ item │  [Edit] │
│  └──────┘ └──────┘         │
├─────────────────────────────┤
│  Sections              [+]  │
│  ─ Electronics    [Edit]    │
│  ─ Vintage        [Edit]    │
│  [+ Add Section]            │
├─────────────────────────────┤
│  Unassigned Listings        │
│  ┌──────┐ ┌──────┐         │
│  │ item │ │ item │         │
│  └──────┘ └──────┘         │
└─────────────────────────────┘
```

**Interactions:**
- **Featured `[+]`** — opens a listing picker (from seller's active listings); selected items are added to `store_featured`
- **Featured `[Edit]`** — enables drag-to-reorder and swipe-to-remove on featured items
- **Sections `[+]` / `[+ Add Section]`** — opens a text input to name a new section; saved to `store_sections`
- **Section `[Edit]`** — opens a section detail screen to rename, reorder the section, or assign/remove listings
- **Unassigned Listings** — read-only list of the seller's active listings not in any section or featured; helps seller see what's uncategorized

---

## Data Flow

### `useStore(userId)`

Fetches in parallel:
1. `store_featured` where `user_id = userId`, ordered by `position`
2. `store_sections` where `user_id = userId`, ordered by `position`, with nested `store_section_items` ordered by `position`

Returns:
```ts
{
  featured: string[],  // listing IDs in order
  sections: { id: string, name: string, listingIds: string[] }[]
}
```

### `useStoreListings(userId)`

Fetches all active listings where `user_id = userId` (same filter as `useMyListings` but for any user). Returns a map of `listingId → Listing` for O(1) lookup.

### Client-side derivation in `StoreScreen`

```
assignedIds = new Set([...featured, ...sections.flatMap(s => s.listingIds)])
recentListings = allListings
  .filter(l => !assignedIds.has(l.id))
  .sort(newest-first)
```

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Seller has no listings | Full empty state: "Nothing for sale right now. Check back later." |
| Seller has listings, no store config | Skip featured + sections; show Recent catch-all only |
| A listing sells or expires | Disappears automatically (active-only fetch); orphaned IDs in store config are silently ignored on render |
| Featured section has 0 items | Featured section hidden entirely — no empty row shown |
| Seller views their own store | Banner: "This is how your store looks to others" + shortcut to Manage Store |

---

## Out of Scope (v1)

- Bundle discounts
- Store banner image or custom store name
- Store-level analytics (views, click-throughs)
- Follower notifications when seller adds new items
- Search within a store
