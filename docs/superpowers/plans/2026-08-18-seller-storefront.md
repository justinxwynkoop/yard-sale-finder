# Seller Storefront Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public-facing seller storefront reachable from PublicProfileScreen, with featured items, custom sections, and a recent catch-all, plus a ManageStoreScreen for the seller to curate their store.

**Architecture:** Three new DB tables (`store_featured`, `store_sections`, `store_section_items`) back two new hooks (`useStore`, `useStoreListings`) and a pure utility (`buildStoreLayout`). `StoreScreen` is registered in all stacks that have `PublicProfile`; `ManageStoreScreen` and `StoreSectionDetailScreen` live in `ProfileStack` only.

**Tech Stack:** React Native, Expo SDK 54, TypeScript strict, NativeWind/inline styles (match existing pattern), Supabase JS client, `@react-navigation/native-stack`.

---

## File Map

| Action | Path |
|---|---|
| Create | `supabase/migrations/20260818120000_store.sql` |
| Modify | `src/types/index.ts` |
| Create | `src/utils/storeLayout.ts` |
| Create | `src/utils/__tests__/storeLayout.test.ts` |
| Create | `src/hooks/useStore.ts` |
| Create | `src/hooks/useStoreListings.ts` |
| Create | `src/components/StoreListingTile.tsx` |
| Create | `src/components/StoreFeaturedSection.tsx` |
| Create | `src/components/StoreSection.tsx` |
| Create | `src/screens/profile/StoreScreen.tsx` |
| Create | `src/screens/profile/ManageStoreScreen.tsx` |
| Create | `src/screens/profile/StoreSectionDetailScreen.tsx` |
| Modify | `src/navigation/index.tsx` |
| Modify | `src/screens/profile/PublicProfileScreen.tsx` |
| Modify | `src/screens/profile/ProfileScreen.tsx` |

---

### Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260818120000_store.sql`

- [ ] **Step 1: Write migration**

```sql
-- store_featured: pinned items per seller
create table if not exists public.store_featured (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  position   integer not null default 0,
  primary key (user_id, listing_id)
);

create index if not exists store_featured_user_idx on public.store_featured (user_id, position);

alter table public.store_featured enable row level security;

create policy "store_featured readable by all"
  on public.store_featured for select using (true);

create policy "store_featured writable by owner"
  on public.store_featured for insert with check (auth.uid() = user_id);

create policy "store_featured deletable by owner"
  on public.store_featured for delete using (auth.uid() = user_id);

-- store_sections: seller-named sections
create table if not exists public.store_sections (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references public.profiles(id) on delete cascade,
  name     text not null,
  position integer not null default 0
);

create index if not exists store_sections_user_idx on public.store_sections (user_id, position);

alter table public.store_sections enable row level security;

create policy "store_sections readable by all"
  on public.store_sections for select using (true);

create policy "store_sections writable by owner"
  on public.store_sections for insert with check (auth.uid() = user_id);

create policy "store_sections updatable by owner"
  on public.store_sections for update using (auth.uid() = user_id);

create policy "store_sections deletable by owner"
  on public.store_sections for delete using (auth.uid() = user_id);

-- store_section_items: listings assigned to a section
create table if not exists public.store_section_items (
  section_id uuid    not null references public.store_sections(id) on delete cascade,
  listing_id uuid    not null references public.listings(id)       on delete cascade,
  position   integer not null default 0,
  primary key (section_id, listing_id)
);

create index if not exists store_section_items_section_idx on public.store_section_items (section_id, position);

alter table public.store_section_items enable row level security;

create policy "store_section_items readable by all"
  on public.store_section_items for select using (true);

create policy "store_section_items writable by section owner"
  on public.store_section_items for insert
  with check (
    exists (
      select 1 from public.store_sections s
      where s.id = section_id and s.user_id = auth.uid()
    )
  );

create policy "store_section_items deletable by section owner"
  on public.store_section_items for delete
  using (
    exists (
      select 1 from public.store_sections s
      where s.id = section_id and s.user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Push migration**

```bash
npm run db:push
```

Expected: migration applied with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260818120000_store.sql
git commit -m "feat(db): store_featured, store_sections, store_section_items tables"
```

---

### Task 2: Types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add `StoreConfig` and `StoreSectionConfig` interfaces**

Add after the `ReviewSummary` interface (after line 114):

```typescript
export interface StoreSectionConfig {
  id: string;
  name: string;
  listingIds: string[];
}

export interface StoreConfig {
  featured: string[];
  sections: StoreSectionConfig[];
}
```

- [ ] **Step 2: Add `Store` route to all stacks that have `PublicProfile`**

In `MapStackParamList`, add after `PublicProfile`:
```typescript
Store: { userId: string; displayName: string; avatarUrl: string | null; memberSince: string };
```

In `ListingsStackParamList`, add after `PublicProfile`:
```typescript
Store: { userId: string; displayName: string; avatarUrl: string | null; memberSince: string };
```

In `MessagesStackParamList`, add after `PublicProfile`:
```typescript
Store: { userId: string; displayName: string; avatarUrl: string | null; memberSince: string };
```

In `ProfileStackParamList`, add after `ListingDetail`:
```typescript
Store: { userId: string; displayName: string; avatarUrl: string | null; memberSince: string };
ManageStore: undefined;
StoreSectionDetail: { sectionId: string; sectionName: string };
```

- [ ] **Step 3: Type-check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): StoreConfig, StoreSectionConfig, Store nav params"
```

---

### Task 3: `buildStoreLayout` utility + tests

**Files:**
- Create: `src/utils/storeLayout.ts`
- Create: `src/utils/__tests__/storeLayout.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/utils/__tests__/storeLayout.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test -- storeLayout
```

Expected: FAIL — `Cannot find module '../storeLayout'`

- [ ] **Step 3: Implement `buildStoreLayout`**

`src/utils/storeLayout.ts`:
```typescript
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
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test -- storeLayout
```

Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/storeLayout.ts src/utils/__tests__/storeLayout.test.ts
git commit -m "feat(utils): buildStoreLayout with tests"
```

---

### Task 4: `useStore` hook

**Files:**
- Create: `src/hooks/useStore.ts`

- [ ] **Step 1: Write hook**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { StoreConfig } from '../types';

export function useStore(userId: string) {
  const [config, setConfig] = useState<StoreConfig>({ featured: [], sections: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [featuredResult, sectionsResult] = await Promise.all([
        supabase
          .from('store_featured')
          .select('listing_id, position')
          .eq('user_id', userId)
          .order('position'),
        supabase
          .from('store_sections')
          .select('id, name, position, items:store_section_items(listing_id, position)')
          .eq('user_id', userId)
          .order('position'),
      ]);

      if (featuredResult.error) throw featuredResult.error;
      if (sectionsResult.error) throw sectionsResult.error;

      setConfig({
        featured: (featuredResult.data ?? []).map((r: any) => r.listing_id as string),
        sections: (sectionsResult.data ?? []).map((s: any) => ({
          id: s.id as string,
          name: s.name as string,
          listingIds: ((s.items ?? []) as { listing_id: string; position: number }[])
            .sort((a, b) => a.position - b.position)
            .map((item) => item.listing_id),
        })),
      });
    } catch (e: any) {
      setError(e.message as string);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { config, loading, error, refetch: fetch };
}
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useStore.ts
git commit -m "feat(hooks): useStore — fetches store_featured and store_sections"
```

---

### Task 5: `useStoreListings` hook

**Files:**
- Create: `src/hooks/useStoreListings.ts`

- [ ] **Step 1: Write hook**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Listing } from '../types';

export function useStoreListings(userId: string) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('listings')
        .select('*, media:listing_media(*)')
        .eq('user_id', userId)
        .eq('status', 'available')
        .order('created_at', { ascending: false });
      setListings(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { listings, loading, refetch: fetch };
}
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useStoreListings.ts
git commit -m "feat(hooks): useStoreListings — active listings for any userId"
```

---

### Task 6: `StoreListingTile` component

**Files:**
- Create: `src/components/StoreListingTile.tsx`

- [ ] **Step 1: Write component**

```typescript
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Listing } from '../types';
import { transformedImageUrl, PLACEHOLDER_BLURHASH } from '../lib/imageUrl';

const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const HAIRLINE = '#E5DECC';

interface Props {
  listing: Listing;
  onPress: () => void;
}

export function StoreListingTile({ listing, onPress }: Props) {
  const firstImage = listing.media?.find((m) => m.type === 'image');
  const thumb = transformedImageUrl(firstImage?.url, {
    width: 280,
    height: 280,
    resize: 'cover',
    quality: 75,
  });

  return (
    <Pressable
      onPress={onPress}
      style={{
        width: '47%',
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: HAIRLINE,
        overflow: 'hidden',
      }}
      accessibilityRole="button"
      accessibilityLabel={listing.title}
    >
      <View style={{ height: 110, backgroundColor: BRAND_SOFT }}>
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={120}
          />
        ) : null}
      </View>
      <View style={{ padding: 9 }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: INK }}>
          ${listing.price.toFixed(0)}
        </Text>
        <Text
          style={{ fontSize: 11, fontWeight: '600', color: INK, marginTop: 1 }}
          numberOfLines={1}
        >
          {listing.title}
        </Text>
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/StoreListingTile.tsx
git commit -m "feat(components): StoreListingTile"
```

---

### Task 7: `StoreFeaturedSection` component

**Files:**
- Create: `src/components/StoreFeaturedSection.tsx`

- [ ] **Step 1: Write component**

```typescript
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Listing } from '../types';
import { transformedImageUrl, PLACEHOLDER_BLURHASH } from '../lib/imageUrl';

const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const HAIRLINE = '#E5DECC';
const AMBER = '#FBCB6B';

interface Props {
  listings: Listing[];
  onPress: (listing: Listing) => void;
}

export function StoreFeaturedSection({ listings, onPress }: Props) {
  if (listings.length === 0) return null;

  return (
    <View style={{ paddingTop: 18 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 16,
          marginBottom: 10,
        }}
      >
        <Ionicons name="star" size={12} color={AMBER} />
        <Text
          style={{
            fontSize: 12,
            fontWeight: '700',
            color: INK,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}
        >
          Featured
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
      >
        {listings.map((listing) => {
          const firstImage = listing.media?.find((m) => m.type === 'image');
          const thumb = transformedImageUrl(firstImage?.url, {
            width: 320,
            height: 200,
            resize: 'cover',
            quality: 75,
          });
          return (
            <Pressable
              key={listing.id}
              onPress={() => onPress(listing)}
              style={{
                width: 160,
                backgroundColor: '#fff',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: HAIRLINE,
                overflow: 'hidden',
              }}
              accessibilityRole="button"
              accessibilityLabel={listing.title}
            >
              <View style={{ height: 100, backgroundColor: BRAND_SOFT }}>
                {thumb ? (
                  <Image
                    source={{ uri: thumb }}
                    placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    transition={120}
                  />
                ) : null}
              </View>
              <View style={{ padding: 9 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: INK }}>
                  ${listing.price.toFixed(0)}
                </Text>
                <Text
                  style={{ fontSize: 11, fontWeight: '600', color: INK, marginTop: 1 }}
                  numberOfLines={1}
                >
                  {listing.title}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/StoreFeaturedSection.tsx
git commit -m "feat(components): StoreFeaturedSection"
```

---

### Task 8: `StoreSection` component

**Files:**
- Create: `src/components/StoreSection.tsx`

- [ ] **Step 1: Write component**

```typescript
import React from 'react';
import { Text, View } from 'react-native';
import { Listing } from '../types';
import { StoreListingTile } from './StoreListingTile';

const INK = '#171513';

interface Props {
  name: string;
  listings: Listing[];
  onPressListing: (listing: Listing) => void;
}

export function StoreSection({ name, listings, onPressListing }: Props) {
  if (listings.length === 0) return null;

  return (
    <View style={{ paddingTop: 18 }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: '700',
          color: INK,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          paddingHorizontal: 16,
          marginBottom: 10,
        }}
      >
        {name}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          paddingHorizontal: 16,
          gap: 10,
        }}
      >
        {listings.map((listing) => (
          <StoreListingTile
            key={listing.id}
            listing={listing}
            onPress={() => onPressListing(listing)}
          />
        ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/StoreSection.tsx
git commit -m "feat(components): StoreSection"
```

---

### Task 9: `StoreScreen`

**Files:**
- Create: `src/screens/profile/StoreScreen.tsx`

- [ ] **Step 1: Write screen**

```typescript
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { useStore } from '../../hooks/useStore';
import { useStoreListings } from '../../hooks/useStoreListings';
import { buildStoreLayout } from '../../utils/storeLayout';
import { StoreFeaturedSection } from '../../components/StoreFeaturedSection';
import { StoreSection } from '../../components/StoreSection';
import { StoreListingTile } from '../../components/StoreListingTile';
import { ProfileStackParamList } from '../../types';

const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const BONE = '#F7F2E8';
const INK = '#171513';
const INK_MUTED = '#8A857C';

type Route = RouteProp<ProfileStackParamList, 'Store'>;

export default function StoreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<Route>();
  const { userId, displayName, avatarUrl, memberSince } = route.params;
  const { user } = useAuth();
  const isOwner = user?.id === userId;

  const { config, loading: configLoading } = useStore(userId);
  const { listings, loading: listingsLoading } = useStoreListings(userId);
  const loading = configLoading || listingsLoading;

  const layout = useMemo(
    () => buildStoreLayout(listings, config.featured, config.sections),
    [listings, config],
  );

  if (loading) {
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BONE }}
      >
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }

  const hasContent =
    layout.featuredListings.length > 0 ||
    layout.sections.some((s) => s.listings.length > 0) ||
    layout.recentListings.length > 0;

  const showRecentLabel =
    layout.featuredListings.length > 0 || layout.sections.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: BONE }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header band */}
        <View
          style={{
            backgroundColor: BRAND,
            paddingTop: insets.top + 8,
            paddingHorizontal: 18,
            paddingBottom: 22,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <CircleButton
              icon="chevron-back"
              onPress={() => navigation.goBack()}
              accessibilityLabel="Back"
            />
            {isOwner ? (
              <CircleButton
                icon="create-outline"
                onPress={() => navigation.navigate('ManageStore')}
                accessibilityLabel="Manage store"
              />
            ) : null}
          </View>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 }}
          >
            <Avatar uri={avatarUrl ?? undefined} name={displayName} px={56} />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: '800',
                  color: '#fff',
                  letterSpacing: -0.4,
                }}
                numberOfLines={1}
              >
                {displayName}'s Store
              </Text>
              <Text
                style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}
              >
                Member since {memberSince} ·{' '}
                {listings.length} item{listings.length !== 1 ? 's' : ''} for sale
              </Text>
            </View>
          </View>
        </View>

        {/* Owner banner */}
        {isOwner ? (
          <Pressable
            onPress={() => navigation.navigate('ManageStore')}
            style={{
              backgroundColor: BRAND_SOFT,
              paddingVertical: 10,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
            accessibilityRole="button"
            accessibilityLabel="Manage your store"
          >
            <Ionicons name="eye-outline" size={14} color={BRAND} />
            <Text style={{ flex: 1, fontSize: 12, color: BRAND, fontWeight: '600' }}>
              This is how your store looks to others
            </Text>
            <Text style={{ fontSize: 12, color: BRAND, fontWeight: '700' }}>
              Manage →
            </Text>
          </Pressable>
        ) : null}

        {!hasContent ? (
          <View
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 64,
              paddingHorizontal: 24,
            }}
          >
            <Ionicons name="storefront-outline" size={40} color={INK_MUTED} />
            <Text
              style={{
                fontSize: 16,
                fontWeight: '700',
                color: INK,
                marginTop: 16,
                textAlign: 'center',
              }}
            >
              Nothing for sale right now
            </Text>
            <Text
              style={{ fontSize: 13, color: INK_MUTED, marginTop: 8, textAlign: 'center' }}
            >
              Check back later
            </Text>
          </View>
        ) : (
          <>
            {layout.featuredListings.length > 0 ? (
              <StoreFeaturedSection
                listings={layout.featuredListings}
                onPress={(listing) =>
                  navigation.navigate('ListingDetail', { listingId: listing.id })
                }
              />
            ) : null}

            {layout.sections.map((section) =>
              section.listings.length > 0 ? (
                <StoreSection
                  key={section.id}
                  name={section.name}
                  listings={section.listings}
                  onPressListing={(listing) =>
                    navigation.navigate('ListingDetail', { listingId: listing.id })
                  }
                />
              ) : null,
            )}

            {layout.recentListings.length > 0 ? (
              <View style={{ paddingTop: 18 }}>
                {showRecentLabel ? (
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: INK,
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                      paddingHorizontal: 16,
                      marginBottom: 10,
                    }}
                  >
                    Recent
                  </Text>
                ) : null}
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    paddingHorizontal: 16,
                    gap: 10,
                  }}
                >
                  {layout.recentListings.map((listing) => (
                    <StoreListingTile
                      key={listing.id}
                      listing={listing}
                      onPress={() =>
                        navigation.navigate('ListingDetail', { listingId: listing.id })
                      }
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function CircleButton({
  icon,
  onPress,
  accessibilityLabel,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 36,
        height: 36,
        borderRadius: 99,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name={icon} size={18} color="#fff" />
    </Pressable>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/screens/profile/StoreScreen.tsx
git commit -m "feat(screens): StoreScreen"
```

---

### Task 10: `ManageStoreScreen`

**Files:**
- Create: `src/screens/profile/ManageStoreScreen.tsx`

- [ ] **Step 1: Write screen**

```typescript
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useStore } from '../../hooks/useStore';
import { useStoreListings } from '../../hooks/useStoreListings';
import { StoreListingTile } from '../../components/StoreListingTile';
import { supabase } from '../../lib/supabase';
import { Listing } from '../../types';

const BRAND = '#1F4D3A';
const BONE = '#F7F2E8';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';
const ROSE = '#A23E2D';

export default function ManageStoreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const { config, loading: configLoading, refetch } = useStore(userId);
  const { listings, loading: listingsLoading } = useStoreListings(userId);
  const [showFeaturedPicker, setShowFeaturedPicker] = useState(false);
  const [showSectionInput, setShowSectionInput] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [saving, setSaving] = useState(false);

  // Refetch when returning from StoreSectionDetailScreen
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const assignedIds = useMemo(
    () =>
      new Set([
        ...config.featured,
        ...config.sections.flatMap((s) => s.listingIds),
      ]),
    [config],
  );

  const unassignedListings = useMemo(
    () => listings.filter((l) => !assignedIds.has(l.id)),
    [listings, assignedIds],
  );

  const featuredEligible = useMemo(
    () => listings.filter((l) => !config.featured.includes(l.id)),
    [listings, config.featured],
  );

  const featuredListings = useMemo(
    () =>
      config.featured
        .map((id) => listings.find((l) => l.id === id))
        .filter((l): l is Listing => l !== undefined),
    [config.featured, listings],
  );

  const handleAddFeatured = async (listingId: string) => {
    setSaving(true);
    await supabase
      .from('store_featured')
      .insert({ user_id: userId, listing_id: listingId, position: config.featured.length });
    await refetch();
    setSaving(false);
    setShowFeaturedPicker(false);
  };

  const handleRemoveFeatured = async (listingId: string) => {
    setSaving(true);
    await supabase
      .from('store_featured')
      .delete()
      .eq('user_id', userId)
      .eq('listing_id', listingId);
    await refetch();
    setSaving(false);
  };

  const handleCreateSection = async () => {
    const name = newSectionName.trim();
    if (!name) return;
    setSaving(true);
    await supabase
      .from('store_sections')
      .insert({ user_id: userId, name, position: config.sections.length });
    await refetch();
    setNewSectionName('');
    setShowSectionInput(false);
    setSaving(false);
  };

  const handleDeleteSection = (sectionId: string, sectionName: string) => {
    Alert.alert(
      'Delete section',
      `Remove "${sectionName}"? Its listings stay in your store under Recent.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            await supabase.from('store_sections').delete().eq('id', sectionId);
            await refetch();
            setSaving(false);
          },
        },
      ],
    );
  };

  if (configLoading || listingsLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BONE }}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BONE }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View
          style={{
            paddingTop: insets.top + 12,
            paddingHorizontal: 18,
            paddingBottom: 16,
            backgroundColor: '#fff',
            borderBottomWidth: 1,
            borderBottomColor: HAIRLINE,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={22} color={INK} />
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: '700', color: INK }}>Manage Store</Text>
          {saving ? <ActivityIndicator size="small" color={BRAND} style={{ marginLeft: 8 }} /> : null}
        </View>

        {/* Featured */}
        <SectionCard
          title="★ Featured Items"
          action={{ label: '+ Add', onPress: () => setShowFeaturedPicker(true) }}
        >
          {featuredListings.length === 0 ? (
            <Text style={{ fontSize: 13, color: INK_MUTED, padding: 16 }}>
              No featured items yet. Tap + Add to pin items to the top of your store.
            </Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 10 }}>
              {featuredListings.map((listing) => (
                <View key={listing.id} style={{ position: 'relative', width: '47%' }}>
                  <StoreListingTile listing={listing} onPress={() => {}} />
                  <Pressable
                    onPress={() => handleRemoveFeatured(listing.id)}
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      backgroundColor: 'rgba(0,0,0,0.55)',
                      borderRadius: 99,
                      padding: 4,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${listing.title} from featured`}
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </SectionCard>

        {/* Sections */}
        <SectionCard
          title="Sections"
          action={{ label: '+ Add', onPress: () => setShowSectionInput(true) }}
        >
          {config.sections.length === 0 ? (
            <Text style={{ fontSize: 13, color: INK_MUTED, padding: 16 }}>
              No sections yet. Group your listings under custom names like "Vintage" or "Electronics".
            </Text>
          ) : (
            config.sections.map((section, idx) => (
              <View
                key={section.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 13,
                  borderBottomWidth: idx < config.sections.length - 1 ? 1 : 0,
                  borderBottomColor: HAIRLINE,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: INK }}>
                    {section.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: INK_MUTED, marginTop: 1 }}>
                    {section.listingIds.length} item{section.listingIds.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    navigation.navigate('StoreSectionDetail', {
                      sectionId: section.id,
                      sectionName: section.name,
                    })
                  }
                  style={{ marginRight: 16 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${section.name}`}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND }}>Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleDeleteSection(section.id, section.name)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${section.name}`}
                >
                  <Ionicons name="trash-outline" size={16} color={ROSE} />
                </Pressable>
              </View>
            ))
          )}
        </SectionCard>

        {/* Unassigned */}
        {unassignedListings.length > 0 ? (
          <SectionCard title="Unassigned Listings">
            <Text style={{ fontSize: 12, color: INK_MUTED, paddingHorizontal: 16, paddingTop: 10 }}>
              These items appear under "Recent" in your store. Add them to a section or feature them.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 10 }}>
              {unassignedListings.map((listing) => (
                <StoreListingTile key={listing.id} listing={listing} onPress={() => {}} />
              ))}
            </View>
          </SectionCard>
        ) : null}
      </ScrollView>

      {/* Featured picker modal */}
      <Modal
        visible={showFeaturedPicker}
        animationType="slide"
        onRequestClose={() => setShowFeaturedPicker(false)}
      >
        <View style={{ flex: 1, backgroundColor: BONE }}>
          <View
            style={{
              paddingTop: insets.top + 12,
              paddingHorizontal: 18,
              paddingBottom: 16,
              backgroundColor: '#fff',
              borderBottomWidth: 1,
              borderBottomColor: HAIRLINE,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Pressable
              onPress={() => setShowFeaturedPicker(false)}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={INK} />
            </Pressable>
            <Text style={{ fontSize: 17, fontWeight: '700', color: INK }}>
              Pick featured item
            </Text>
          </View>
          <FlatList
            data={featuredEligible}
            keyExtractor={(l) => l.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 10, paddingHorizontal: 16, paddingTop: 10 }}
            renderItem={({ item }) => (
              <StoreListingTile
                listing={item}
                onPress={() => handleAddFeatured(item.id)}
              />
            )}
            ListEmptyComponent={
              <Text style={{ padding: 24, color: INK_MUTED, textAlign: 'center' }}>
                All listings are already featured
              </Text>
            }
          />
        </View>
      </Modal>

      {/* New section name modal */}
      <Modal
        visible={showSectionInput}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSectionInput(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.4)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              padding: 20,
              width: '100%',
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: INK, marginBottom: 12 }}>
              Section name
            </Text>
            <TextInput
              value={newSectionName}
              onChangeText={setNewSectionName}
              placeholder="e.g. Vintage, Electronics..."
              autoFocus
              style={{
                borderWidth: 1,
                borderColor: HAIRLINE,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 15,
                color: INK,
                marginBottom: 16,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => {
                  setShowSectionInput(false);
                  setNewSectionName('');
                }}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: HAIRLINE,
                  alignItems: 'center',
                }}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: INK_MUTED }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleCreateSection}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  backgroundColor: BRAND,
                  alignItems: 'center',
                }}
                accessibilityRole="button"
                accessibilityLabel="Create section"
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 20,
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E5DECC',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: '#E5DECC',
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#171513' }}>{title}</Text>
        {action ? (
          <Pressable
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1F4D3A' }}>
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/screens/profile/ManageStoreScreen.tsx
git commit -m "feat(screens): ManageStoreScreen"
```

---

### Task 11: `StoreSectionDetailScreen`

**Files:**
- Create: `src/screens/profile/StoreSectionDetailScreen.tsx`

- [ ] **Step 1: Write screen**

```typescript
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useStore } from '../../hooks/useStore';
import { useStoreListings } from '../../hooks/useStoreListings';
import { StoreListingTile } from '../../components/StoreListingTile';
import { supabase } from '../../lib/supabase';
import { Listing, ProfileStackParamList } from '../../types';

const BRAND = '#1F4D3A';
const BONE = '#F7F2E8';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

type Route = RouteProp<ProfileStackParamList, 'StoreSectionDetail'>;

export default function StoreSectionDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<Route>();
  const { sectionId, sectionName } = route.params;
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const { config, loading: configLoading, refetch } = useStore(userId);
  const { listings, loading: listingsLoading } = useStoreListings(userId);
  const [showPicker, setShowPicker] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(sectionName);
  const [saving, setSaving] = useState(false);

  const section = config.sections.find((s) => s.id === sectionId);

  const sectionListings = useMemo(
    () =>
      (section?.listingIds ?? [])
        .map((id) => listings.find((l) => l.id === id))
        .filter((l): l is Listing => l !== undefined),
    [section, listings],
  );

  const eligibleListings = useMemo(
    () => listings.filter((l) => !(section?.listingIds ?? []).includes(l.id)),
    [listings, section],
  );

  const handleRenameSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    await supabase
      .from('store_sections')
      .update({ name: trimmed })
      .eq('id', sectionId);
    await refetch();
    setEditingName(false);
    setSaving(false);
  };

  const handleAddListing = async (listingId: string) => {
    setSaving(true);
    const position = section?.listingIds.length ?? 0;
    await supabase
      .from('store_section_items')
      .insert({ section_id: sectionId, listing_id: listingId, position });
    await refetch();
    setSaving(false);
    setShowPicker(false);
  };

  const handleRemoveListing = async (listingId: string) => {
    setSaving(true);
    await supabase
      .from('store_section_items')
      .delete()
      .eq('section_id', sectionId)
      .eq('listing_id', listingId);
    await refetch();
    setSaving(false);
  };

  if (configLoading || listingsLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BONE }}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BONE }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View
          style={{
            paddingTop: insets.top + 12,
            paddingHorizontal: 18,
            paddingBottom: 16,
            backgroundColor: '#fff',
            borderBottomWidth: 1,
            borderBottomColor: HAIRLINE,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={22} color={INK} />
          </Pressable>
          {editingName ? (
            <>
              <TextInput
                value={name}
                onChangeText={setName}
                autoFocus
                style={{
                  flex: 1,
                  fontSize: 17,
                  fontWeight: '700',
                  color: INK,
                  borderBottomWidth: 1,
                  borderBottomColor: BRAND,
                  paddingVertical: 2,
                }}
              />
              <Pressable
                onPress={handleRenameSave}
                accessibilityRole="button"
                accessibilityLabel="Save name"
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: BRAND }}>Save</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: INK }}>
                {section?.name ?? sectionName}
              </Text>
              {saving ? (
                <ActivityIndicator size="small" color={BRAND} />
              ) : (
                <Pressable
                  onPress={() => setEditingName(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Rename section"
                >
                  <Ionicons name="create-outline" size={18} color={BRAND} />
                </Pressable>
              )}
            </>
          )}
        </View>

        {/* Items in section */}
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 20,
            backgroundColor: '#fff',
            borderRadius: 14,
            borderWidth: 1,
            borderColor: HAIRLINE,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: HAIRLINE,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: INK }}>
              Items in this section
            </Text>
            <Pressable
              onPress={() => setShowPicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Add item"
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND }}>+ Add</Text>
            </Pressable>
          </View>

          {sectionListings.length === 0 ? (
            <Text style={{ fontSize: 13, color: INK_MUTED, padding: 16 }}>
              No items in this section yet. Tap + Add to assign listings here.
            </Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 10 }}>
              {sectionListings.map((listing) => (
                <View key={listing.id} style={{ position: 'relative', width: '47%' }}>
                  <StoreListingTile listing={listing} onPress={() => {}} />
                  <Pressable
                    onPress={() => handleRemoveListing(listing.id)}
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      backgroundColor: 'rgba(0,0,0,0.55)',
                      borderRadius: 99,
                      padding: 4,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${listing.title}`}
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Listing picker modal */}
      <Modal
        visible={showPicker}
        animationType="slide"
        onRequestClose={() => setShowPicker(false)}
      >
        <View style={{ flex: 1, backgroundColor: BONE }}>
          <View
            style={{
              paddingTop: insets.top + 12,
              paddingHorizontal: 18,
              paddingBottom: 16,
              backgroundColor: '#fff',
              borderBottomWidth: 1,
              borderBottomColor: HAIRLINE,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Pressable
              onPress={() => setShowPicker(false)}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={INK} />
            </Pressable>
            <Text style={{ fontSize: 17, fontWeight: '700', color: INK }}>Add to section</Text>
          </View>
          <FlatList
            data={eligibleListings}
            keyExtractor={(l) => l.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 10, paddingHorizontal: 16, paddingTop: 10 }}
            renderItem={({ item }) => (
              <StoreListingTile listing={item} onPress={() => handleAddListing(item.id)} />
            )}
            ListEmptyComponent={
              <Text style={{ padding: 24, color: INK_MUTED, textAlign: 'center' }}>
                No more listings to add
              </Text>
            }
          />
        </View>
      </Modal>
    </View>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/screens/profile/StoreSectionDetailScreen.tsx
git commit -m "feat(screens): StoreSectionDetailScreen"
```

---

### Task 12: Register screens in navigation

**Files:**
- Modify: `src/navigation/index.tsx`

- [ ] **Step 1: Add imports at top of navigation/index.tsx (after existing screen imports)**

```typescript
import StoreScreen from '../screens/profile/StoreScreen';
import ManageStoreScreen from '../screens/profile/ManageStoreScreen';
import StoreSectionDetailScreen from '../screens/profile/StoreSectionDetailScreen';
```

- [ ] **Step 2: Register `Store` in MapNavigator**

Inside `MapStack.Navigator`, add after the `PublicProfile` screen registration:

```typescript
<MapStack.Screen
  name="Store"
  component={StoreScreen as any}
  options={{ headerShown: false }}
/>
```

- [ ] **Step 3: Register `Store` in ListingsNavigator**

Inside `ListingsStack.Navigator`, add after the `PublicProfile` screen registration:

```typescript
<ListingsStack.Screen
  name="Store"
  component={StoreScreen as any}
  options={{ headerShown: false }}
/>
```

- [ ] **Step 4: Register `Store` in MessagesNavigator**

Inside `MessagesStack.Navigator`, add after the `PublicProfile` screen registration:

```typescript
<MessagesStack.Screen
  name="Store"
  component={StoreScreen as any}
  options={{ headerShown: false }}
/>
```

- [ ] **Step 5: Register `Store`, `ManageStore`, `StoreSectionDetail` in ProfileNavigator**

Inside `ProfileStack.Navigator`, add after the `ListingDetail` screen registration:

```typescript
<ProfileStack.Screen
  name="Store"
  component={StoreScreen}
  options={{ headerShown: false }}
/>
<ProfileStack.Screen
  name="ManageStore"
  component={ManageStoreScreen}
  options={{ headerShown: false }}
/>
<ProfileStack.Screen
  name="StoreSectionDetail"
  component={StoreSectionDetailScreen}
  options={{ headerShown: false }}
/>
```

- [ ] **Step 6: Type-check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/navigation/index.tsx
git commit -m "feat(nav): register Store, ManageStore, StoreSectionDetail screens"
```

---

### Task 13: Wire entry points

**Files:**
- Modify: `src/screens/profile/PublicProfileScreen.tsx`
- Modify: `src/screens/profile/ProfileScreen.tsx`

- [ ] **Step 1: Add "Visit Store" button in PublicProfileScreen**

In `PublicProfileScreen.tsx`, find the sticky bottom action bar section (around line 574, the `!self && !isSelf` block). Add a "Visit Store" `Pressable` between the Follow and Message buttons:

```typescript
<Pressable
  onPress={() =>
    navigation.navigate('Store', {
      userId,
      displayName,
      avatarUrl: profile?.avatar_url ?? null,
      memberSince: profile?.created_at
        ? new Date(profile.created_at).getFullYear().toString()
        : '',
    })
  }
  style={{
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: HAIRLINE,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
  }}
  accessibilityRole="button"
  accessibilityLabel="Visit store"
>
  <Ionicons name="storefront-outline" size={15} color={INK} />
  <Text style={{ fontSize: 13, fontWeight: '700', color: INK }}>Store</Text>
</Pressable>
```

Place this between the Follow button and the Message button in the `flexDirection: 'row'` container. The Message button's `flex: 1` style ensures it still expands to fill remaining space.

- [ ] **Step 2: Add "Manage Store" row in ProfileScreen**

In `ProfileScreen.tsx`, find the `MANAGE` section's `RowList` (around line 316). Add a new `Row` after the "Your listings" row and before the "Saved sales" row:

```typescript
<Row
  icon="storefront-outline"
  label="My store"
  sublabel={
    liveListingsCount > 0
      ? `${liveListingsCount} item${liveListingsCount !== 1 ? 's' : ''} listed`
      : 'Showcase your listings'
  }
  onPress={() =>
    profile?.id &&
    navigation.navigate('ManageStore')
  }
/>
```

- [ ] **Step 3: Type-check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/screens/profile/PublicProfileScreen.tsx src/screens/profile/ProfileScreen.tsx
git commit -m "feat: wire Store entry points in PublicProfile and Profile screens"
```

---

## Self-Review Checklist

- **Spec coverage:**
  - ✅ Public-facing `StoreScreen` reachable from `PublicProfileScreen`
  - ✅ Featured items (horizontal scroll)
  - ✅ Custom sections (2-col grid)
  - ✅ Recent catch-all (excludes featured + section items, newest-first)
  - ✅ Owner banner with Manage shortcut
  - ✅ Empty state when no listings
  - ✅ `ManageStoreScreen` accessible from `ProfileScreen`
  - ✅ Add/remove featured items via picker modal
  - ✅ Create/delete sections
  - ✅ `StoreSectionDetailScreen` for rename + add/remove listings per section
  - ✅ Unassigned listings panel in ManageStore
  - ✅ DB tables with RLS
  - ✅ Header inherits profile data via nav params (no extra fetch)
  - ✅ Orphaned IDs silently ignored (via `buildStoreLayout`)
  - ✅ Sold/expired listings auto-disappear (`status = 'available'` fetch)
  - ✅ `Store` registered in all stacks that have `PublicProfile`

- **No placeholders:** all steps contain complete code.

- **Type consistency:**
  - `StoreSectionConfig.listingIds` used in types, `useStore`, `buildStoreLayout`, and screens — consistent.
  - `StoreLayout.sections[].listings` returned by `buildStoreLayout` and consumed by `StoreSection` — consistent.
  - Nav params `Store: { userId, displayName, avatarUrl, memberSince }` defined in all four param lists and passed correctly from `PublicProfileScreen`.
