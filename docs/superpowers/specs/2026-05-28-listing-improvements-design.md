# Listing Improvements — Design Spec

**Date:** 2026-05-28
**Status:** Approved
**Scope:** Three focused improvements to listings: posted date on detail screen, fix category label rendering, expand subcategory filters.

---

## 1. Posted Date on Listing Detail

### Goal
Buyers should be able to see how long ago a listing was posted when viewing its detail screen. Currently the only age signal is the "New" badge on cards (visible for the first 3 days), which disappears on the detail screen and is absent entirely on older listings.

### Behavior
- **Under 3 days old:** show relative time — "Posted today", "Posted yesterday", "Posted 2 days ago"
- **3 days or older:** show month and year — "Posted May 2026"

### Placement
Displayed just below the price line on `ListingDetailScreen`, in the same muted small-text style (`text-xs`, zinc-400) used for other secondary metadata on that screen.

### Implementation
Add `formatPostedDate(createdAt: string): string` to `src/utils/format.ts` alongside the existing `formatSaleDate` / `formatSaleTime` helpers. The function:
- Computes days elapsed since `createdAt`
- Returns relative string for 0–2 days ("today", "yesterday", "2 days ago")
- Returns `"Posted [Month] [Year]"` for 3+ days (e.g. "Posted May 2026")

The `Listing` type already carries `created_at`; no data-fetching changes needed.

---

## 2. Category Label Display Fix

### Problem
`ListingDetailScreen` renders category tags using the raw `ItemCategory` enum value (e.g. `clothing_mens`) with a CSS `capitalize` class, producing "clothing_mens" with a visible underscore. The human-readable labels already exist in `categories.ts` but are not used here.

### Fix
Add `getCategoryLabel(value: ItemCategory): string` to `src/lib/categories.ts`. It walks `CATEGORY_GROUPS` and their `subcategories` arrays, returning the matching `label`. Falls back to capitalizing the raw value if no match is found (defensive, should never trigger with valid data).

Replace `{cat}` at `ListingDetailScreen:336` with `{getCategoryLabel(cat)}`.

---

## 3. Subcategory Filter Expansion

### Goal
Give buyers finer-grained filter options within several broad categories. Subcategory filters are optional — selecting a parent category without a subcategory still returns all listings under that parent (existing behaviour, unchanged).

### No DB Migration Required
Categories are stored as `text[]` with no enum constraint in the database. All changes are purely in `src/types/index.ts` (union type) and `src/lib/categories.ts` (group definitions).

### New Subcategory Values and Labels

**Furniture** (currently no subcategories)
| Value | Label |
|---|---|
| `furniture_bedroom` | Bedroom |
| `furniture_living_room` | Living Room |
| `furniture_dining_room` | Dining Room |
| `furniture_kitchen` | Kitchen |
| `furniture_office` | Office |
| `furniture_outdoor` | Outdoor & Patio |

**Electronics** (currently: Video Games, Computers)
| Value | Label |
|---|---|
| `electronics_phones` | Phones & Tablets |
| `electronics_audio` | Audio |
| `electronics_tv` | TV & Video |
| `electronics_cameras` | Cameras |
| `electronics_smart_home` | Smart Home |

**Books** (currently no subcategories)
| Value | Label |
|---|---|
| `books_fiction` | Fiction |
| `books_nonfiction` | Non-Fiction |
| `books_childrens` | Children's |
| `books_comics` | Comics & Manga |
| `books_textbooks` | Textbooks |
| `books_self_help` | Self-Help |

**Sports** (currently no subcategories)
| Value | Label |
|---|---|
| `sports_golf` | Golf |
| `sports_cycling` | Cycling |
| `sports_fishing` | Fishing |
| `sports_camping` | Camping & Hiking |
| `sports_fitness` | Fitness & Gym |
| `sports_water` | Water Sports |

**Kitchen** (currently no subcategories; top-level represents appliances/utilities)
| Value | Label |
|---|---|
| `kitchen_appliances` | Appliances |
| `kitchen_cookware` | Cookware |
| `kitchen_bakeware` | Bakeware |
| `kitchen_dinnerware` | Dinnerware |
| `kitchen_storage` | Storage |

**Unchanged (broad, no subcategories)**
- Toys
- Tools
- Antiques

### Existing Subcategories (Clothing, Electronics partial)
Clothing subcategories (Women's, Men's, Toddler, Teen) and the two existing Electronics subcategories (Video Games, Computers) are unchanged.

---

## Files Changed

| File | Change |
|---|---|
| `src/types/index.ts` | Add ~25 new values to `ItemCategory` union |
| `src/lib/categories.ts` | Add `getCategoryLabel()` helper; add subcategory arrays to Furniture, Electronics, Books, Sports, Kitchen groups |
| `src/utils/format.ts` | Add `formatPostedDate()` helper |
| `src/screens/listings/ListingDetailScreen.tsx` | Render posted date below price; use `getCategoryLabel()` for category chips |
