# Listing Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add posted date to listing detail, fix category label rendering (underscore bug), and expand subcategory filters for Furniture, Electronics, Books, Sports, and Kitchen.

**Architecture:** Three independent changes: (1) a new `formatPostedDate` utility wired into `ListingDetailScreen`, (2) a `getCategoryLabel` helper that replaces raw enum values in the same screen, and (3) new `ItemCategory` union values + `CATEGORY_GROUPS` entries in the category system. No DB migration needed — categories are stored as `text[]` with no enum constraint.

**Tech Stack:** TypeScript, React Native, NativeWind (Tailwind class strings), Jest

---

## File Map

| File | Change |
|---|---|
| `src/utils/format.ts` | Add `formatPostedDate(createdAt: string): string` |
| `src/utils/__tests__/format.test.ts` | New — tests for `formatPostedDate` |
| `src/types/index.ts` | Add 27 new values to `ItemCategory` union |
| `src/lib/categories.ts` | Add `getCategoryLabel()` helper + subcategory arrays for Furniture, Electronics, Books, Sports, Kitchen |
| `src/utils/__tests__/categories.test.ts` | New — tests for `getCategoryLabel` |
| `src/screens/listings/ListingDetailScreen.tsx` | Render posted date below seller; use `getCategoryLabel` for category chips |

---

## Task 1: `formatPostedDate` utility

**Files:**
- Modify: `src/utils/format.ts`
- Create: `src/utils/__tests__/format.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/format.test.ts`:

```typescript
import { formatPostedDate } from '../format';

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

describe('formatPostedDate', () => {
  it('returns "Posted today" when created within the last 24 hours', () => {
    expect(formatPostedDate(isoHoursAgo(1))).toBe('Posted today');
    expect(formatPostedDate(isoHoursAgo(23))).toBe('Posted today');
  });

  it('returns "Posted yesterday" when created 24–48 hours ago', () => {
    expect(formatPostedDate(isoHoursAgo(25))).toBe('Posted yesterday');
    expect(formatPostedDate(isoHoursAgo(47))).toBe('Posted yesterday');
  });

  it('returns "Posted 2 days ago" when created 48–72 hours ago', () => {
    expect(formatPostedDate(isoHoursAgo(49))).toBe('Posted 2 days ago');
    expect(formatPostedDate(isoHoursAgo(71))).toBe('Posted 2 days ago');
  });

  it('returns "Posted Month Year" for listings 3+ days old', () => {
    // Use mid-month noon UTC to avoid timezone-boundary false failures
    expect(formatPostedDate('2026-01-15T12:00:00.000Z')).toBe('Posted January 2026');
    expect(formatPostedDate('2025-11-15T12:00:00.000Z')).toBe('Posted November 2025');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern="format.test" --no-coverage
```

Expected: FAIL — `formatPostedDate is not a function`

- [ ] **Step 3: Implement `formatPostedDate` in `src/utils/format.ts`**

Append to the bottom of `src/utils/format.ts` (before the `// -- internals` comment block is fine, or after — just keep it with the other exports):

```typescript
/**
 * Human-friendly "when was this posted" label for listing detail screens.
 *   < 1 day  → "Posted today"
 *   1 day    → "Posted yesterday"
 *   2 days   → "Posted 2 days ago"
 *   3+ days  → "Posted May 2026"
 */
export function formatPostedDate(createdAt: string): string {
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysDiff = Math.floor((Date.now() - new Date(createdAt).getTime()) / msPerDay);

  if (daysDiff === 0) return 'Posted today';
  if (daysDiff === 1) return 'Posted yesterday';
  if (daysDiff < 3) return `Posted ${daysDiff} days ago`;

  return `Posted ${new Date(createdAt).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })}`;
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- --testPathPattern="format.test" --no-coverage
```

Expected: PASS — 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/utils/format.ts src/utils/__tests__/format.test.ts
git commit -m "feat(listings): add formatPostedDate utility"
```

---

## Task 2: Category system expansion

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/categories.ts`
- Create: `src/utils/__tests__/categories.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/categories.test.ts`:

```typescript
import { getCategoryLabel } from '../../lib/categories';

describe('getCategoryLabel', () => {
  it('returns the label for top-level categories', () => {
    expect(getCategoryLabel('furniture')).toBe('Furniture');
    expect(getCategoryLabel('clothing')).toBe('Clothing');
    expect(getCategoryLabel('kitchen')).toBe('Kitchen');
    expect(getCategoryLabel('other')).toBe('Misc');
  });

  it('returns human-readable labels for existing subcategories (no underscores)', () => {
    expect(getCategoryLabel('clothing_mens')).toBe("Men's");
    expect(getCategoryLabel('clothing_womens')).toBe("Women's");
    expect(getCategoryLabel('electronics_video_games')).toBe('Video Games');
    expect(getCategoryLabel('electronics_computers')).toBe('Computers');
  });

  it('returns labels for new Furniture subcategories', () => {
    expect(getCategoryLabel('furniture_bedroom')).toBe('Bedroom');
    expect(getCategoryLabel('furniture_living_room')).toBe('Living Room');
    expect(getCategoryLabel('furniture_dining_room')).toBe('Dining Room');
    expect(getCategoryLabel('furniture_kitchen')).toBe('Kitchen');
    expect(getCategoryLabel('furniture_office')).toBe('Office');
    expect(getCategoryLabel('furniture_outdoor')).toBe('Outdoor & Patio');
  });

  it('returns labels for new Electronics subcategories', () => {
    expect(getCategoryLabel('electronics_phones')).toBe('Phones & Tablets');
    expect(getCategoryLabel('electronics_audio')).toBe('Audio');
    expect(getCategoryLabel('electronics_tv')).toBe('TV & Video');
    expect(getCategoryLabel('electronics_cameras')).toBe('Cameras');
    expect(getCategoryLabel('electronics_smart_home')).toBe('Smart Home');
  });

  it('returns labels for new Books subcategories', () => {
    expect(getCategoryLabel('books_fiction')).toBe('Fiction');
    expect(getCategoryLabel('books_nonfiction')).toBe('Non-Fiction');
    expect(getCategoryLabel('books_childrens')).toBe("Children's");
    expect(getCategoryLabel('books_comics')).toBe('Comics & Manga');
    expect(getCategoryLabel('books_textbooks')).toBe('Textbooks');
    expect(getCategoryLabel('books_self_help')).toBe('Self-Help');
  });

  it('returns labels for new Sports subcategories', () => {
    expect(getCategoryLabel('sports_golf')).toBe('Golf');
    expect(getCategoryLabel('sports_cycling')).toBe('Cycling');
    expect(getCategoryLabel('sports_fishing')).toBe('Fishing');
    expect(getCategoryLabel('sports_camping')).toBe('Camping & Hiking');
    expect(getCategoryLabel('sports_fitness')).toBe('Fitness & Gym');
    expect(getCategoryLabel('sports_water')).toBe('Water Sports');
  });

  it('returns labels for new Kitchen subcategories', () => {
    expect(getCategoryLabel('kitchen_appliances')).toBe('Appliances');
    expect(getCategoryLabel('kitchen_cookware')).toBe('Cookware');
    expect(getCategoryLabel('kitchen_bakeware')).toBe('Bakeware');
    expect(getCategoryLabel('kitchen_dinnerware')).toBe('Dinnerware');
    expect(getCategoryLabel('kitchen_storage')).toBe('Storage');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern="categories.test" --no-coverage
```

Expected: FAIL — `getCategoryLabel is not a function` and TypeScript errors for unknown values

- [ ] **Step 3: Expand `ItemCategory` in `src/types/index.ts`**

Replace the entire `ItemCategory` type:

```typescript
export type ItemCategory =
  | 'furniture'
  | 'furniture_bedroom'
  | 'furniture_living_room'
  | 'furniture_dining_room'
  | 'furniture_kitchen'
  | 'furniture_office'
  | 'furniture_outdoor'
  | 'clothing'
  | 'clothing_womens'
  | 'clothing_mens'
  | 'clothing_toddler'
  | 'clothing_teen'
  | 'electronics'
  | 'electronics_video_games'
  | 'electronics_computers'
  | 'electronics_phones'
  | 'electronics_audio'
  | 'electronics_tv'
  | 'electronics_cameras'
  | 'electronics_smart_home'
  | 'toys'
  | 'tools'
  | 'books'
  | 'books_fiction'
  | 'books_nonfiction'
  | 'books_childrens'
  | 'books_comics'
  | 'books_textbooks'
  | 'books_self_help'
  | 'kitchen'
  | 'kitchen_appliances'
  | 'kitchen_cookware'
  | 'kitchen_bakeware'
  | 'kitchen_dinnerware'
  | 'kitchen_storage'
  | 'sports'
  | 'sports_golf'
  | 'sports_cycling'
  | 'sports_fishing'
  | 'sports_camping'
  | 'sports_fitness'
  | 'sports_water'
  | 'antiques'
  | 'other';
```

- [ ] **Step 4: Update `src/lib/categories.ts` — add subcategories + `getCategoryLabel`**

Replace the entire contents of `src/lib/categories.ts`:

```typescript
import { ItemCategory } from '../types';

export interface SubCategory {
  value: ItemCategory;
  label: string;
}

export interface CategoryGroup {
  value: ItemCategory;
  label: string;
  subcategories?: SubCategory[];
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    value: 'furniture',
    label: 'Furniture',
    subcategories: [
      { value: 'furniture_bedroom', label: 'Bedroom' },
      { value: 'furniture_living_room', label: 'Living Room' },
      { value: 'furniture_dining_room', label: 'Dining Room' },
      { value: 'furniture_kitchen', label: 'Kitchen' },
      { value: 'furniture_office', label: 'Office' },
      { value: 'furniture_outdoor', label: 'Outdoor & Patio' },
    ],
  },
  {
    value: 'clothing',
    label: 'Clothing',
    subcategories: [
      { value: 'clothing_womens', label: "Women's" },
      { value: 'clothing_mens', label: "Men's" },
      { value: 'clothing_toddler', label: 'Toddler' },
      { value: 'clothing_teen', label: 'Teen' },
    ],
  },
  {
    value: 'electronics',
    label: 'Electronics',
    subcategories: [
      { value: 'electronics_phones', label: 'Phones & Tablets' },
      { value: 'electronics_audio', label: 'Audio' },
      { value: 'electronics_tv', label: 'TV & Video' },
      { value: 'electronics_cameras', label: 'Cameras' },
      { value: 'electronics_smart_home', label: 'Smart Home' },
      { value: 'electronics_video_games', label: 'Video Games' },
      { value: 'electronics_computers', label: 'Computers' },
    ],
  },
  { value: 'toys', label: 'Toys' },
  { value: 'tools', label: 'Tools' },
  {
    value: 'books',
    label: 'Books',
    subcategories: [
      { value: 'books_fiction', label: 'Fiction' },
      { value: 'books_nonfiction', label: 'Non-Fiction' },
      { value: 'books_childrens', label: "Children's" },
      { value: 'books_comics', label: 'Comics & Manga' },
      { value: 'books_textbooks', label: 'Textbooks' },
      { value: 'books_self_help', label: 'Self-Help' },
    ],
  },
  {
    value: 'kitchen',
    label: 'Kitchen',
    subcategories: [
      { value: 'kitchen_appliances', label: 'Appliances' },
      { value: 'kitchen_cookware', label: 'Cookware' },
      { value: 'kitchen_bakeware', label: 'Bakeware' },
      { value: 'kitchen_dinnerware', label: 'Dinnerware' },
      { value: 'kitchen_storage', label: 'Storage' },
    ],
  },
  {
    value: 'sports',
    label: 'Sports',
    subcategories: [
      { value: 'sports_golf', label: 'Golf' },
      { value: 'sports_cycling', label: 'Cycling' },
      { value: 'sports_fishing', label: 'Fishing' },
      { value: 'sports_camping', label: 'Camping & Hiking' },
      { value: 'sports_fitness', label: 'Fitness & Gym' },
      { value: 'sports_water', label: 'Water Sports' },
    ],
  },
  { value: 'antiques', label: 'Antiques' },
  { value: 'other', label: 'Misc' },
];

// Returns the human-readable label for any ItemCategory value.
// Used wherever raw enum values would otherwise appear in the UI.
export function getCategoryLabel(value: ItemCategory): string {
  for (const group of CATEGORY_GROUPS) {
    if (group.value === value) return group.label;
    const sub = group.subcategories?.find((s) => s.value === value);
    if (sub) return sub.label;
  }
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

// Returns the parent group for a subcategory value, or null if it's a top-level category.
export function getParentGroup(value: ItemCategory): CategoryGroup | null {
  for (const group of CATEGORY_GROUPS) {
    if (group.subcategories?.some((s) => s.value === value)) return group;
  }
  return null;
}

// Given a set of selected categories, add a new one:
// - If adding a subcategory, also ensure the parent is included
// - If adding a parent, just add the parent (subcategories optional)
export function addCategory(selected: ItemCategory[], value: ItemCategory): ItemCategory[] {
  const result = new Set(selected);
  result.add(value);
  const parent = getParentGroup(value);
  if (parent) result.add(parent.value);
  return Array.from(result);
}

// Given a set of selected categories, remove one:
// - If removing a parent, also remove all its subcategories
// - If removing a subcategory, just remove that subcategory (parent stays)
export function removeCategory(selected: ItemCategory[], value: ItemCategory): ItemCategory[] {
  const group = CATEGORY_GROUPS.find((g) => g.value === value);
  const toRemove = new Set<ItemCategory>([value]);
  if (group?.subcategories) {
    group.subcategories.forEach((s) => toRemove.add(s.value));
  }
  return selected.filter((c) => !toRemove.has(c));
}

export function toggleCategory(selected: ItemCategory[], value: ItemCategory): ItemCategory[] {
  return selected.includes(value)
    ? removeCategory(selected, value)
    : addCategory(selected, value);
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npm test -- --testPathPattern="categories.test" --no-coverage
```

Expected: PASS — all tests pass

- [ ] **Step 6: Run full test suite to confirm nothing regressed**

```bash
npm test --no-coverage
```

Expected: all existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/lib/categories.ts src/utils/__tests__/categories.test.ts
git commit -m "feat(listings): expand subcategory filters + add getCategoryLabel helper"
```

---

## Task 3: Wire up `ListingDetailScreen`

**Files:**
- Modify: `src/screens/listings/ListingDetailScreen.tsx`

- [ ] **Step 1: Add imports at the top of `ListingDetailScreen.tsx`**

The file already imports from `../../lib/supabase`, `../../types`, etc. Add two more imports alongside the existing ones:

```typescript
import { formatPostedDate } from '../../utils/format';
import { getCategoryLabel } from '../../lib/categories';
```

- [ ] **Step 2: Add posted date display**

Find this block (after the seller `View`, before the first divider — around line 308–310):

```tsx
          )}

          <View className="my-5 h-px bg-zinc-100" />
```

Replace with:

```tsx
          )}

          <Text className="mt-2 text-xs text-zinc-400">
            {formatPostedDate(listing.created_at)}
          </Text>

          <View className="my-5 h-px bg-zinc-100" />
```

- [ ] **Step 3: Fix category chip labels**

Find this block (the category chip text, around line 334–337):

```tsx
                    <Text className="text-xs font-semibold capitalize text-brand-700">
                      {cat}
                    </Text>
```

Replace with (remove `capitalize` — `getCategoryLabel` returns properly-cased labels):

```tsx
                    <Text className="text-xs font-semibold text-brand-700">
                      {getCategoryLabel(cat)}
                    </Text>
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: no new errors (pre-existing errors in `usePushNotifications.ts`, `CompleteProfileScreen.tsx`, and the Supabase edge function are unrelated — ignore them)

- [ ] **Step 5: Commit**

```bash
git add src/screens/listings/ListingDetailScreen.tsx
git commit -m "feat(listings): show posted date and fix category label rendering"
```

---

## Task 4: Push and PR

- [ ] **Step 1: Push branch**

```bash
git push
```

- [ ] **Step 2: Create PR**

```bash
gh pr create \
  --title "feat(listings): posted date, category label fix, subcategory expansion" \
  --body "$(cat <<'EOF'
## Summary
- Listing detail now shows when the listing was posted (relative for <3 days, month+year for older)
- Fixed category chips on listing detail showing raw values like \`clothing_mens\` — now shows human-readable labels like \"Men's\"
- Expanded subcategory filters: Furniture (6), Electronics (+5), Books (6), Sports (6), Kitchen (5)

## Test plan
- [ ] Open a listing posted today — detail shows "Posted today"
- [ ] Open a listing posted ~2 days ago — detail shows "Posted 2 days ago"
- [ ] Open an older listing — detail shows "Posted [Month] [Year]"
- [ ] Open any listing with subcategory tags — confirm no underscores in the chips
- [ ] Open the filter picker on the Listings screen — confirm Furniture, Books, Sports, Kitchen, Electronics all show expanded subcategory rows
- [ ] Select a subcategory (e.g. Furniture > Bedroom) — confirm parent \"Furniture\" chip also activates
- [ ] Select only parent (e.g. \"Sports\") without subcategory — confirm filter still works
EOF
)"
```
