# Drafts + Polish Wave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Device-local drafts for the Create Sale / Create Listing forms (spec: `docs/superpowers/specs/2026-08-13-drafts-design.md`), plus Repost prefill, neighborhood-sale search discoverability, a report-alert backend, and a batch of evidence-cited quick wins (error/retry states, embed fix, Edit Sale address editing, pull-to-refresh, photo-cap toast, Share pill).

**Architecture:** A tiny pure module `src/lib/drafts.ts` owns AsyncStorage draft slots (one per form type); the two create screens add a debounced autosave, an explicit "Save draft" button, and a restore banner; the two manage screens pin a draft row. Everything ships JS-only over OTA except Task 7 (one new edge function + one migration, no app-binary changes).

**Tech Stack:** React Native + Expo SDK 54, TypeScript strict, AsyncStorage, Supabase (PostgREST + edge functions), Jest + jest-expo + RNTL v14.

## Global Constraints

- **JS-only:** no new native dependencies, no app.json changes, no entitlement changes — anything native shifts the fingerprint and orphans the OTA. Runtime must stay `13ae0c60e5076289ce40f51bf3d5ab10f1b1810a`.
- **Never regenerate `package-lock.json`.** Never touch the `overrides` block in package.json.
- **Copy fidelity:** user-facing strings byte-for-byte as written in this plan, including typographic characters (’ · “ ” —). `Couldn't` uses ’ (U+2019), never '.
- **Local dates:** never `toISOString().slice(0,10)` for "today" — use `localTodayIso()` from `src/lib/eventMatch.ts`.
- **Gates before every commit:** `npx tsc --noEmit` (clean) and `npx jest` (all pass, pristine output — an `act()` warning is a failure).
- **Commits:** conventional style (`feat:`/`fix:`/`test:`), NO Co-Authored-By line, no emoji.
- **RNTL v14 / React 19:** `render` is async — `await render(...)`. `@expo/vector-icons` renders icon names as text.
- **Test isolation:** in test files that touch AsyncStorage, mock it: `jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));`
- **Supabase work (Task 7 only):** project ref `dxahcamntwtuzftxbxgx`. The connected Supabase MCP points at a DIFFERENT project — use the CLI / Management API only, with the session PAT as `SUPABASE_ACCESS_TOKEN`.
- **After any external tool runs:** `git diff .gitignore` — revert cosmetic appends.

## File Map

| File | Role |
|---|---|
| `src/lib/drafts.ts` (create) | Draft storage: load/save/clear, meaningfulness, relative age, media-type inference |
| `src/lib/__tests__/drafts.test.ts` (create) | Unit tests for the above |
| `src/components/DraftBanner.tsx` (create) | "Pick up where you left off?" card (both create screens) |
| `src/components/DraftRow.tsx` (create) | Pinned draft row (both manage screens) |
| `src/components/__tests__/DraftBanner.test.tsx`, `__tests__/DraftRow.test.tsx` (create) | RNTL tests |
| `src/screens/sale/CreateSaleScreen.tsx` | Autosave + Save draft + restore + repost prefill + remote-media upload |
| `src/screens/listings/CreateListingScreen.tsx` | Autosave + Save draft + restore |
| `src/screens/profile/MySalesScreen.tsx` | Draft row, Repost param |
| `src/screens/profile/MyListingsScreen.tsx` | Draft row, Share pill |
| `src/screens/listings/ListingsScreen.tsx` | Event search rows, error/retry, pull-to-refresh |
| `src/screens/map/MapHomeScreen.tsx` | Event-title search match, error banner |
| `src/screens/map/SaleDetailScreen.tsx`, `src/screens/listings/ListingDetailScreen.tsx` | Error vs not-found split + Try again |
| `src/screens/sale/EditSaleScreen.tsx` | Address/pin editing, photo-cap toast |
| `src/hooks/useListings.ts` | Drop profile embed |
| `src/types/index.ts` | New CreateSale/CreateListing route params |
| `supabase/functions/notify-new-report/index.ts` (create) + `supabase/migrations/<ts>_report_webhook.sql` (create) | Report alert push |

---

### Task 1: `src/lib/drafts.ts` (TDD)

**Files:**
- Create: `src/lib/drafts.ts`
- Create: `src/lib/__tests__/drafts.test.ts`

**Interfaces:**
- Produces (later tasks import these exact names from `../../lib/drafts`):
  - `type DraftType = 'sale' | 'listing'`
  - `interface Draft { v: 1; savedAt: string; fields: Record<string, unknown>; media: string[] }`
  - `saveDraft(type: DraftType, fields: Record<string, unknown>, media: string[]): Promise<void>`
  - `loadDraft(type: DraftType): Promise<Draft | null>` — null when absent, corrupt, or wrong version
  - `clearDraft(type: DraftType): Promise<void>`
  - `isMeaningful(input: { title?: string; description?: string; mediaCount: number }): boolean`
  - `draftAge(savedAtIso: string, nowMs?: number): string` — "just now" / "5 min ago" / "1 hour ago" / "3 hours ago" / "yesterday" / "3 days ago"
  - `mediaTypeForUri(uri: string): 'image' | 'video'` — `.mp4`/`.mov` (case-insensitive) → video

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/drafts.test.ts
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveDraft,
  loadDraft,
  clearDraft,
  isMeaningful,
  draftAge,
  mediaTypeForUri,
} from '../drafts';

beforeEach(() => AsyncStorage.clear());

describe('save/load/clear round-trip', () => {
  it('round-trips fields and media under the sale key', async () => {
    await saveDraft('sale', { title: 'Moving sale', startDate: '2026-08-15' }, ['file:///a.jpg']);
    const d = await loadDraft('sale');
    expect(d).not.toBeNull();
    expect(d!.v).toBe(1);
    expect(d!.fields.title).toBe('Moving sale');
    expect(d!.media).toEqual(['file:///a.jpg']);
    expect(typeof d!.savedAt).toBe('string');
    expect(Number.isNaN(Date.parse(d!.savedAt))).toBe(false);
  });

  it('sale and listing slots are independent', async () => {
    await saveDraft('sale', { title: 'S' }, []);
    await saveDraft('listing', { title: 'L' }, []);
    expect((await loadDraft('sale'))!.fields.title).toBe('S');
    expect((await loadDraft('listing'))!.fields.title).toBe('L');
  });

  it('saving again overwrites (one draft per type)', async () => {
    await saveDraft('sale', { title: 'first' }, []);
    await saveDraft('sale', { title: 'second' }, []);
    expect((await loadDraft('sale'))!.fields.title).toBe('second');
  });

  it('returns null when nothing is stored', async () => {
    expect(await loadDraft('sale')).toBeNull();
  });

  it('returns null on corrupt JSON', async () => {
    await AsyncStorage.setItem('trove:draft:sale', 'not json {');
    expect(await loadDraft('sale')).toBeNull();
  });

  it('returns null on an unknown version', async () => {
    await AsyncStorage.setItem(
      'trove:draft:sale',
      JSON.stringify({ v: 99, savedAt: new Date().toISOString(), fields: {}, media: [] }),
    );
    expect(await loadDraft('sale')).toBeNull();
  });

  it('clearDraft removes the slot', async () => {
    await saveDraft('listing', { title: 'x' }, []);
    await clearDraft('listing');
    expect(await loadDraft('listing')).toBeNull();
  });
});

describe('isMeaningful', () => {
  it('false for an empty form', () => {
    expect(isMeaningful({ title: '', description: '', mediaCount: 0 })).toBe(false);
  });
  it('false for whitespace-only text', () => {
    expect(isMeaningful({ title: '   ', description: '\n', mediaCount: 0 })).toBe(false);
  });
  it('true with a title', () => {
    expect(isMeaningful({ title: 'Yard sale', mediaCount: 0 })).toBe(true);
  });
  it('true with a description only', () => {
    expect(isMeaningful({ description: 'lots of stuff', mediaCount: 0 })).toBe(true);
  });
  it('true with a photo only', () => {
    expect(isMeaningful({ mediaCount: 1 })).toBe(true);
  });
});

describe('draftAge', () => {
  const now = Date.parse('2026-08-13T12:00:00Z');
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();
  it('under a minute → "just now"', () => {
    expect(draftAge(at(30_000), now)).toBe('just now');
  });
  it('minutes', () => {
    expect(draftAge(at(5 * 60_000), now)).toBe('5 min ago');
  });
  it('one hour', () => {
    expect(draftAge(at(60 * 60_000), now)).toBe('1 hour ago');
  });
  it('hours', () => {
    expect(draftAge(at(3 * 3_600_000), now)).toBe('3 hours ago');
  });
  it('one day → "yesterday"', () => {
    expect(draftAge(at(26 * 3_600_000), now)).toBe('yesterday');
  });
  it('days', () => {
    expect(draftAge(at(3 * 86_400_000), now)).toBe('3 days ago');
  });
});

describe('mediaTypeForUri', () => {
  it.each([
    ['file:///x/photo.jpg', 'image'],
    ['file:///x/clip.mp4', 'video'],
    ['file:///x/clip.MOV', 'video'],
    ['https://cdn.example.com/a/0.jpg', 'image'],
    ['https://cdn.example.com/a/1.mp4', 'video'],
  ])('%s → %s', (uri, expected) => {
    expect(mediaTypeForUri(uri)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/__tests__/drafts.test.ts`
Expected: FAIL — `Cannot find module '../drafts'`

- [ ] **Step 3: Implement `src/lib/drafts.ts`**

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Device-local drafts for the Create Sale / Create Listing forms.
 * ONE slot per form type; saving again overwrites. Drafts never leave
 * the device (spec: docs/superpowers/specs/2026-08-13-drafts-design.md),
 * which is why every surface that shows one says "on this device".
 */

export type DraftType = 'sale' | 'listing';

export interface Draft {
  v: 1;
  savedAt: string; // ISO timestamp
  fields: Record<string, unknown>;
  media: string[]; // local (or remote, for reposts-in-progress) URIs
}

const keyFor = (type: DraftType) => `trove:draft:${type}`;

export async function saveDraft(
  type: DraftType,
  fields: Record<string, unknown>,
  media: string[],
): Promise<void> {
  const draft: Draft = { v: 1, savedAt: new Date().toISOString(), fields, media };
  await AsyncStorage.setItem(keyFor(type), JSON.stringify(draft)).catch(() => {});
}

export async function loadDraft(type: DraftType): Promise<Draft | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(type));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.v !== 1 || typeof parsed.savedAt !== 'string') return null;
    return {
      v: 1,
      savedAt: parsed.savedAt,
      fields: parsed.fields && typeof parsed.fields === 'object' ? parsed.fields : {},
      media: Array.isArray(parsed.media)
        ? parsed.media.filter((u: unknown): u is string => typeof u === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

export async function clearDraft(type: DraftType): Promise<void> {
  await AsyncStorage.removeItem(keyFor(type)).catch(() => {});
}

/**
 * A draft is worth keeping once the form has a title, a description, or at
 * least one photo — an empty tapped-into form never nags (spec).
 */
export function isMeaningful(input: {
  title?: string;
  description?: string;
  mediaCount: number;
}): boolean {
  return !!(input.title?.trim() || input.description?.trim() || input.mediaCount > 0);
}

/**
 * Relative age for draft rows: "just now", "5 min ago", "1 hour ago",
 * "yesterday", "3 days ago". `nowMs` is injectable for tests.
 */
export function draftAge(savedAtIso: string, nowMs: number = Date.now()): string {
  const ms = Math.max(0, nowMs - Date.parse(savedAtIso));
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * Draft media is stored as bare URIs; recover image/video from the
 * extension on restore so a drafted video isn't re-uploaded as a jpg.
 */
export function mediaTypeForUri(uri: string): 'image' | 'video' {
  return /\.(mp4|mov)$/i.test(uri) ? 'video' : 'image';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/__tests__/drafts.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Gates + commit**

Run: `npx tsc --noEmit` then `npx jest`
Expected: clean / all pass.

```bash
git add src/lib/drafts.ts src/lib/__tests__/drafts.test.ts
git commit -m "feat: device-local draft storage module (drafts.ts, TDD)"
```

---

### Task 2: DraftBanner + DraftRow components (TDD)

**Files:**
- Create: `src/components/DraftBanner.tsx`
- Create: `src/components/DraftRow.tsx`
- Create: `src/components/__tests__/DraftBanner.test.tsx`
- Create: `src/components/__tests__/DraftRow.test.tsx`

**Interfaces:**
- Consumes: `draftAge` from Task 1.
- Produces:
  - `DraftBanner({ savedAt, onRestore, onStartFresh }: { savedAt: string; onRestore: () => void; onStartFresh: () => void })`
  - `DraftRow({ kind, title, savedAt, onPress, onDiscard }: { kind: 'sale' | 'listing'; title: string; savedAt: string; onPress: () => void; onDiscard: () => void })`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/__tests__/DraftBanner.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { DraftBanner } from '../DraftBanner';

describe('DraftBanner', () => {
  const savedAt = new Date(Date.now() - 5 * 60_000).toISOString();

  it('shows the prompt, the age, and the on-this-device label', async () => {
    await render(
      <DraftBanner savedAt={savedAt} onRestore={jest.fn()} onStartFresh={jest.fn()} />,
    );
    expect(screen.getByText('Pick up where you left off?')).toBeTruthy();
    expect(screen.getByText('Saved 5 min ago · on this device')).toBeTruthy();
  });

  it('fires onRestore and onStartFresh', async () => {
    const onRestore = jest.fn();
    const onStartFresh = jest.fn();
    await render(
      <DraftBanner savedAt={savedAt} onRestore={onRestore} onStartFresh={onStartFresh} />,
    );
    fireEvent.press(screen.getByText('Restore'));
    expect(onRestore).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByText('Start fresh'));
    expect(onStartFresh).toHaveBeenCalledTimes(1);
  });
});
```

```tsx
// src/components/__tests__/DraftRow.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { DraftRow } from '../DraftRow';

describe('DraftRow', () => {
  const savedAt = new Date(Date.now() - 2 * 3_600_000).toISOString();

  it('renders title, DRAFT chip, and age sublabel', async () => {
    await render(
      <DraftRow kind="sale" title="Moving sale" savedAt={savedAt} onPress={jest.fn()} onDiscard={jest.fn()} />,
    );
    expect(screen.getByText('Moving sale')).toBeTruthy();
    expect(screen.getByText('DRAFT')).toBeTruthy();
    expect(screen.getByText('Saved 2 hours ago · on this device')).toBeTruthy();
  });

  it('falls back to an untitled label per kind', async () => {
    await render(
      <DraftRow kind="listing" title="" savedAt={savedAt} onPress={jest.fn()} onDiscard={jest.fn()} />,
    );
    expect(screen.getByText('Untitled item')).toBeTruthy();
  });

  it('fires onPress on the row and onDiscard on the pill', async () => {
    const onPress = jest.fn();
    const onDiscard = jest.fn();
    await render(
      <DraftRow kind="sale" title="X" savedAt={savedAt} onPress={onPress} onDiscard={onDiscard} />,
    );
    fireEvent.press(screen.getByLabelText('Continue draft'));
    expect(onPress).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByText('Discard'));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1); // pill press must not bubble
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/components/__tests__/DraftBanner.test.tsx src/components/__tests__/DraftRow.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement both components**

```tsx
// src/components/DraftBanner.tsx
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { draftAge } from '../lib/drafts';

const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

/**
 * "Pick up where you left off?" — shown at the top of a Create form when a
 * device-local draft exists. Restore hydrates the form; Start fresh clears
 * the slot. Purely presentational; the screens own the draft lifecycle.
 */
export function DraftBanner({
  savedAt,
  onRestore,
  onStartFresh,
}: {
  savedAt: string;
  onRestore: () => void;
  onStartFresh: () => void;
}) {
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 12,
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: HAIRLINE,
        padding: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="document-text-outline" size={16} color={BRAND} />
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: INK }}>
          Pick up where you left off?
        </Text>
      </View>
      <Text style={{ marginTop: 3, marginLeft: 24, fontSize: 11, color: INK_MUTED }}>
        {`Saved ${draftAge(savedAt)} · on this device`}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <Pressable
          onPress={onRestore}
          accessibilityRole="button"
          accessibilityLabel="Restore draft"
          style={{
            flex: 1,
            backgroundColor: BRAND,
            borderRadius: 10,
            paddingVertical: 9,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>Restore</Text>
        </Pressable>
        <Pressable
          onPress={onStartFresh}
          accessibilityRole="button"
          accessibilityLabel="Start fresh"
          style={{
            flex: 1,
            backgroundColor: '#fff',
            borderRadius: 10,
            borderWidth: 1,
            borderColor: HAIRLINE,
            paddingVertical: 9,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: INK, fontSize: 12.5, fontWeight: '700' }}>Start fresh</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

```tsx
// src/components/DraftRow.tsx
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { draftAge } from '../lib/drafts';

const BRAND = '#1F4D3A';
const BRAND_SOFT = '#E1ECDF';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';
const ROSE = '#A23E2D';

/**
 * Pinned "Draft" row for My Sales / My Listings — the second door back into
 * an unfinished post (the first is the DraftBanner on the Create form).
 * Labeled "on this device" because local drafts don't follow the account.
 */
export function DraftRow({
  kind,
  title,
  savedAt,
  onPress,
  onDiscard,
}: {
  kind: 'sale' | 'listing';
  title: string;
  savedAt: string;
  onPress: () => void;
  onDiscard: () => void;
}) {
  const displayTitle =
    title.trim() || (kind === 'sale' ? 'Untitled sale' : 'Untitled item');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Continue draft"
      style={{
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: HAIRLINE,
        borderStyle: 'dashed',
        marginBottom: 10,
        flexDirection: 'row',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: 84,
          minHeight: 84,
          backgroundColor: BRAND_SOFT,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="document-text-outline" size={26} color={BRAND} />
      </View>
      <View style={{ flex: 1, padding: 10, paddingLeft: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View
            style={{
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 99,
              backgroundColor: BRAND_SOFT,
            }}
          >
            <Text
              style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.4, color: BRAND }}
            >
              DRAFT
            </Text>
          </View>
        </View>
        <Text
          numberOfLines={1}
          style={{ fontSize: 14, fontWeight: '700', color: INK, marginTop: 5 }}
        >
          {displayTitle}
        </Text>
        <Text style={{ fontSize: 11, color: INK_MUTED, marginTop: 3 }}>
          {`Saved ${draftAge(savedAt)} · on this device`}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onDiscard();
            }}
            accessibilityRole="button"
            accessibilityLabel="Discard"
            style={{
              paddingVertical: 5,
              paddingHorizontal: 11,
              borderWidth: 1,
              borderColor: '#F0D9D3',
              borderRadius: 99,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: ROSE }}>Discard</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/components/__tests__/DraftBanner.test.tsx src/components/__tests__/DraftRow.test.tsx`
Expected: PASS, no act() warnings.

- [ ] **Step 5: Gates + commit**

Run: `npx tsc --noEmit` then `npx jest`

```bash
git add src/components/DraftBanner.tsx src/components/DraftRow.tsx src/components/__tests__/DraftBanner.test.tsx src/components/__tests__/DraftRow.test.tsx
git commit -m "feat: DraftBanner and DraftRow components (TDD)"
```

---

### Task 3: CreateSaleScreen — drafts + repost prefill

**Files:**
- Modify: `src/screens/sale/CreateSaleScreen.tsx`
- Modify: `src/types/index.ts` (route params)

**Interfaces:**
- Consumes: `loadDraft/saveDraft/clearDraft/isMeaningful/mediaTypeForUri` (Task 1), `DraftBanner` (Task 2), plus `Draft` type.
- Produces: CreateSale now accepts route params `{ eventId?, presetStart?, presetEnd?, fromDraftRow?: boolean, repostSaleId?: string }`. Task 5 navigates with `fromDraftRow`/`repostSaleId`; Task 4 mirrors the same draft pattern on CreateListing.

**Behavior contract (from the spec):**
- Debounced (~1s) silent autosave while the form is meaningful (title, description, or ≥1 photo).
- "Save draft" ghost button beside the sticky Post CTA, rendered only when meaningful: saves, toasts `Draft saved`, closes the screen.
- On mount with a draft present: `fromDraftRow` → restore silently; otherwise show DraftBanner (Restore / Start fresh).
- Event params (`presetStart`/`presetEnd`) win over the draft's dates on restore.
- Successful post, Start fresh, and (Task 5) discard all clear the slot.
- Repost (`repostSaleId`): prefill everything except dates/times from the existing sale, reuse its remote photos without re-upload, and **disable all draft reads/writes** for that screen instance (a repost must never clobber a held draft).
- Remove the dead static `Draft` header label (it promised behavior that didn't exist).

- [ ] **Step 1: Route param types**

In `src/types/index.ts`, replace the two CreateSale param entries:

```ts
// PostStackParamList (line ~235)
  CreateSale: {
    eventId?: string;
    presetStart?: string;
    presetEnd?: string;
    fromDraftRow?: boolean;
    repostSaleId?: string;
  } | undefined;
```

```ts
// ProfileStackParamList (line ~304)
  CreateSale: {
    eventId?: string;
    presetStart?: string;
    presetEnd?: string;
    fromDraftRow?: boolean;
    repostSaleId?: string;
  } | undefined;
```

- [ ] **Step 2: Imports + params in CreateSaleScreen**

Add imports (top of file, alongside existing `../../lib/*` imports):

```ts
import {
  Draft,
  clearDraft,
  isMeaningful,
  loadDraft,
  mediaTypeForUri,
  saveDraft,
} from '../../lib/drafts';
import { DraftBanner } from '../../components/DraftBanner';
```

Below `const eventIdParam: string | undefined = route.params?.eventId;` (line ~71) add:

```ts
  const repostSaleId: string | undefined = route.params?.repostSaleId;
  const fromDraftRow: boolean = !!route.params?.fromDraftRow;
  // Draft machinery is fully disabled on a repost instance — autosaving the
  // repost's prefill would silently overwrite whatever draft is being held.
  const draftsEnabled = !repostSaleId;
  const [draftBanner, setDraftBanner] = useState<Draft | null>(null);
```

- [ ] **Step 3: Restore + autosave + repost effects**

Add after the preset-dates `useEffect` (line ~82):

```ts
  // Restore a device-local draft: silently when arriving from the Draft row,
  // via the banner otherwise. Event presets (join-a-neighborhood-sale links)
  // win over the draft's dates (spec).
  const applyDraft = (d: Draft) => {
    const f = d.fields;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    setTitle(str(f.title));
    setDescription(str(f.description));
    setAddress(str(f.address));
    setAddressInput(str(f.addressInput) || str(f.address));
    if (
      Array.isArray(f.pinCoords) &&
      f.pinCoords.length === 2 &&
      f.pinCoords.every((n) => typeof n === 'number')
    ) {
      setPinCoords(f.pinCoords as [number, number]);
    }
    const hasEventPreset = !!(route.params?.presetStart || route.params?.presetEnd);
    if (!hasEventPreset) {
      setStartDate(str(f.startDate));
      setEndDate(str(f.endDate));
      setStartTime(str(f.startTime));
      setEndTime(str(f.endTime));
    }
    if (Array.isArray(f.selectedCategories)) {
      setSelectedCategories(
        f.selectedCategories.filter((c): c is ItemCategory => typeof c === 'string'),
      );
    }
    setPricingNotes(str(f.pricingNotes));
    if (typeof f.allowMessages === 'boolean') setAllowMessages(f.allowMessages);
    // Photos the OS purged since the draft was saved are skipped silently.
    const alive = d.media.filter((uri) => {
      try {
        return new File(uri).exists;
      } catch {
        return false;
      }
    });
    setMedia(alive.map((uri) => ({ uri, type: mediaTypeForUri(uri) })));
    setDraftBanner(null);
  };

  useEffect(() => {
    if (!draftsEnabled) return;
    loadDraft('sale').then((d) => {
      if (!d) return;
      if (fromDraftRow) applyDraft(d);
      else setDraftBanner(d);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Silent autosave — the safety net under the explicit button. Runs ~1s
  // after the last change, only once the form is meaningful.
  useEffect(() => {
    if (!draftsEnabled) return;
    if (!isMeaningful({ title, description, mediaCount: media.length })) return;
    const t = setTimeout(() => {
      void saveDraft('sale', draftFieldsSnapshot(), media.map((m) => m.uri));
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    title, description, address, addressInput, pinCoords,
    startDate, endDate, startTime, endTime,
    selectedCategories, pricingNotes, allowMessages, media,
  ]);

  const draftFieldsSnapshot = () => ({
    title, description, address, addressInput, pinCoords,
    startDate, endDate, startTime, endTime,
    selectedCategories, pricingNotes, allowMessages,
  });

  const handleSaveDraft = async () => {
    await saveDraft('sale', draftFieldsSnapshot(), media.map((m) => m.uri));
    toast.success('Draft saved');
    navigation.goBack();
  };

  const handleStartFresh = () => {
    void clearDraft('sale');
    setDraftBanner(null);
  };

  // Repost: prefill everything except dates/times from an existing sale.
  // Media arrives as remote URLs; uploadMedia reuses them without
  // re-uploading (see the http branch there).
  useEffect(() => {
    if (!repostSaleId) return;
    (async () => {
      const { data } = await supabase
        .from('sales')
        .select('*, media:sale_media(*)')
        .eq('id', repostSaleId)
        .single();
      if (!data) return;
      setTitle(data.title ?? '');
      setDescription(data.description ?? '');
      setAddress(data.address ?? '');
      setAddressInput(data.address ?? '');
      if (typeof data.longitude === 'number' && typeof data.latitude === 'number') {
        setPinCoords([data.longitude, data.latitude]);
      }
      setSelectedCategories(data.categories ?? []);
      setPricingNotes(data.pricing_notes ?? '');
      setAllowMessages(data.allow_messages ?? true);
      const sorted = [...(data.media ?? [])].sort(
        (a: { order: number }, b: { order: number }) => a.order - b.order,
      );
      setMedia(
        sorted.map((m: { url: string; type: 'image' | 'video' }) => ({
          uri: m.url,
          type: m.type,
        })),
      );
    })();
  }, [repostSaleId]);
```

Note: `applyDraft` and `draftFieldsSnapshot` reference state declared later in the file — declare these effects AFTER the state block (lines 84–106), not before. Place the whole block right after the `pricingNotes` state declaration (line ~106).

- [ ] **Step 4: Remote-media branch in uploadMedia**

At the top of the `for` loop in `uploadMedia` (line ~250, before the compress call), add:

```ts
      // Repost path: media already lives in Supabase storage — just point a
      // new sale_media row at it instead of downloading + re-uploading.
      if (item.uri.startsWith('http')) {
        const { error: reuseError } = await supabase.from('sale_media').insert({
          sale_id: saleId,
          url: item.uri,
          type: item.type,
          order: i,
        });
        if (reuseError) {
          const enriched: any = new Error(
            `sale_media insert rejected: ${reuseError.message}`,
          );
          enriched.code = reuseError.code;
          throw enriched;
        }
        continue;
      }
```

- [ ] **Step 5: Clear on post + UI**

In `submit()`, immediately after `resetForm();` (line ~402), add:

```ts
      void clearDraft('sale');
```

In the header (lines 539–548), DELETE the static `Draft` `<Text>` element entirely (it labeled nothing). Replace it with a same-width spacer so the title stays centered:

```tsx
          <View style={{ width: 44 }} />
```

At the top of the `<ScrollView>` (line ~561, before the PHOTOS PostSection), add:

```tsx
          {draftBanner && (
            <DraftBanner
              savedAt={draftBanner.savedAt}
              onRestore={() => applyDraft(draftBanner)}
              onStartFresh={handleStartFresh}
            />
          )}
```

Replace the sticky-CTA `<Pressable onPress={submit} ...>` block (lines 915–942) with a row that adds the ghost button when the form is meaningful:

```tsx
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {draftsEnabled &&
              isMeaningful({ title, description, mediaCount: media.length }) && (
                <Pressable
                  onPress={handleSaveDraft}
                  accessibilityRole="button"
                  accessibilityLabel="Save draft"
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#E5DECC',
                    borderRadius: 14,
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#171513', fontSize: 14, fontWeight: '700' }}>
                    Save draft
                  </Text>
                </Pressable>
              )}
            <Pressable
              onPress={submit}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityLabel="Post sale"
              style={{
                flex: 1,
                backgroundColor: canSubmit ? '#1F4D3A' : '#C7C1B0',
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
              }}
            >
              <Text
                style={{
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: '700',
                  marginRight: 8,
                }}
              >
                {submitting ? 'Posting…' : 'Post sale'}
              </Text>
              {!submitting && (
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              )}
            </Pressable>
          </View>
```

- [ ] **Step 6: Gates + commit**

Run: `npx tsc --noEmit` then `npx jest` then `npx eslint src/screens/sale/CreateSaleScreen.tsx src/types/index.ts`
Expected: all clean.

```bash
git add src/screens/sale/CreateSaleScreen.tsx src/types/index.ts
git commit -m "feat: sale drafts (autosave + Save draft + restore) and repost prefill in CreateSaleScreen"
```

---

### Task 4: CreateListingScreen — drafts

**Files:**
- Modify: `src/screens/listings/CreateListingScreen.tsx`
- Modify: `src/types/index.ts`

**Interfaces:**
- Consumes: Task 1 module, Task 2 `DraftBanner`.
- Produces: CreateListing accepts `{ fromDraftRow?: boolean } | undefined` (used by Task 5's MyListings draft row).

- [ ] **Step 1: Route param types**

In `src/types/index.ts` change ALL THREE CreateListing entries (`PostStackParamList` line ~237, `ListingsStackParamList` line ~263, `ProfileStackParamList` line ~307, and `SaleStackParamList` line ~290) from `CreateListing: undefined;` to:

```ts
  CreateListing: { fromDraftRow?: boolean } | undefined;
```

- [ ] **Step 2: Screen integration**

CreateListingScreen currently never reads `route`. Add `useRoute` to the `@react-navigation/native` import and add imports:

```ts
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  Draft,
  clearDraft,
  isMeaningful,
  loadDraft,
  mediaTypeForUri,
  saveDraft,
} from '../../lib/drafts';
import { DraftBanner } from '../../components/DraftBanner';
```

After the `selectedCategories` state (line ~69), add (note `React.useEffect` is not imported — add `useEffect` to the React import at line 1):

```ts
  const route = useRoute<any>();
  const fromDraftRow: boolean = !!route.params?.fromDraftRow;
  const [draftBanner, setDraftBanner] = useState<Draft | null>(null);

  const applyDraft = (d: Draft) => {
    const f = d.fields;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    setTitle(str(f.title));
    setDescription(str(f.description));
    setPrice(str(f.price));
    setPickupInput(str(f.pickupInput));
    setPickupDisplay(str(f.pickupDisplay));
    const pc = f.pinCoords as { lat?: unknown; lng?: unknown } | null;
    if (pc && typeof pc.lat === 'number' && typeof pc.lng === 'number') {
      setPinCoords({ lat: pc.lat, lng: pc.lng });
    }
    if (Array.isArray(f.selectedCategories)) {
      setSelectedCategories(
        f.selectedCategories.filter((c): c is ItemCategory => typeof c === 'string'),
      );
    }
    // Photos the OS purged since the draft was saved are skipped silently.
    const alive = d.media.filter((uri) => {
      try {
        return new File(uri).exists;
      } catch {
        return false;
      }
    });
    setMedia(alive.map((uri) => ({ uri, type: mediaTypeForUri(uri) })));
    setDraftBanner(null);
  };

  useEffect(() => {
    loadDraft('listing').then((d) => {
      if (!d) return;
      if (fromDraftRow) applyDraft(d);
      else setDraftBanner(d);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draftFieldsSnapshot = () => ({
    title, description, price, pickupInput, pickupDisplay, pinCoords, selectedCategories,
  });

  // Silent autosave (~1s debounce), only once the form is meaningful.
  useEffect(() => {
    if (!isMeaningful({ title, description, mediaCount: media.length })) return;
    const t = setTimeout(() => {
      void saveDraft('listing', draftFieldsSnapshot(), media.map((m) => m.uri));
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, price, pickupInput, pickupDisplay, pinCoords, selectedCategories, media]);

  const handleSaveDraft = async () => {
    await saveDraft('listing', draftFieldsSnapshot(), media.map((m) => m.uri));
    toast.success('Draft saved');
    navigation.goBack();
  };

  const handleStartFresh = () => {
    void clearDraft('listing');
    setDraftBanner(null);
  };
```

- [ ] **Step 3: Clear on post + UI**

In `submit()` after `resetForm();` (line ~320): add `void clearDraft('listing');`

Header (lines 397–406): DELETE the static `Draft` `<Text>` and replace with `<View style={{ width: 44 }} />`.

Top of `<ScrollView>` (line ~419, before the Photos PostSection):

```tsx
          {draftBanner && (
            <DraftBanner
              savedAt={draftBanner.savedAt}
              onRestore={() => applyDraft(draftBanner)}
              onStartFresh={handleStartFresh}
            />
          )}
```

Sticky CTA: replace the `<Pressable onPress={submit} ...>` block (lines 652–679) with this two-button row (no `draftsEnabled` guard here — listings have no repost path):

```tsx
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {isMeaningful({ title, description, mediaCount: media.length }) && (
            <Pressable
              onPress={handleSaveDraft}
              accessibilityRole="button"
              accessibilityLabel="Save draft"
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#E5DECC',
                borderRadius: 14,
                paddingVertical: 14,
                paddingHorizontal: 16,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#171513', fontSize: 14, fontWeight: '700' }}>
                Save draft
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Post listing"
            style={{
              flex: 1,
              backgroundColor: canSubmit ? '#1F4D3A' : '#C7C1B0',
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
            }}
          >
            <Text
              style={{
                color: '#fff',
                fontSize: 14,
                fontWeight: '700',
                marginRight: 8,
              }}
            >
              {submitting ? 'Posting…' : 'Post listing'}
            </Text>
            {!submitting && (
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            )}
          </Pressable>
        </View>
```

- [ ] **Step 4: Gates + commit**

Run: `npx tsc --noEmit` then `npx jest` then `npx eslint src/screens/listings/CreateListingScreen.tsx src/types/index.ts`

```bash
git add src/screens/listings/CreateListingScreen.tsx src/types/index.ts
git commit -m "feat: listing drafts (autosave + Save draft + restore) in CreateListingScreen"
```

---

### Task 5: Draft rows in My Sales / My Listings + Repost param + Share pill

**Files:**
- Modify: `src/screens/profile/MySalesScreen.tsx`
- Modify: `src/screens/profile/MyListingsScreen.tsx`

**Interfaces:**
- Consumes: `loadDraft/clearDraft/Draft` (Task 1), `DraftRow` (Task 2), CreateSale/CreateListing params (Tasks 3–4), `shareListing(listing)` from `src/lib/share.ts`.

- [ ] **Step 1: MySalesScreen — draft row + Repost prefill**

Add imports:

```ts
import { Draft, clearDraft, loadDraft } from '../../lib/drafts';
import { DraftRow } from '../../components/DraftRow';
```

Add state + focus read (below the `segment` state, line ~47):

```ts
  const [draft, setDraft] = useState<Draft | null>(null);
```

Extend the existing `useFocusEffect` callback (line ~51) to also read the slot:

```ts
  useFocusEffect(
    React.useCallback(() => {
      refetch();
      loadDraft('sale').then(setDraft);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );
```

Add a discard handler (near `handleShare`, line ~120):

```ts
  const handleDiscardDraft = () => {
    Alert.alert('Discard draft?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          void clearDraft('sale');
          setDraft(null);
        },
      },
    ]);
  };
```

Pin the row: add a `ListHeaderComponent` to the FlatList (after `contentContainerStyle`, line ~187):

```tsx
          ListHeaderComponent={
            segment === 'active' && draft ? (
              <DraftRow
                kind="sale"
                title={typeof draft.fields.title === 'string' ? draft.fields.title : ''}
                savedAt={draft.savedAt}
                onPress={() => navigation.navigate('CreateSale', { fromDraftRow: true })}
                onDiscard={handleDiscardDraft}
              />
            ) : null
          }
```

Fix Repost (line 199): change `onRepost={() => navigation.navigate('CreateSale')}` to:

```tsx
              onRepost={() => navigation.navigate('CreateSale', { repostSaleId: item.id })}
```

- [ ] **Step 2: MyListingsScreen — draft row + Share pill**

Add imports:

```ts
import { Draft, clearDraft, loadDraft } from '../../lib/drafts';
import { DraftRow } from '../../components/DraftRow';
import { shareListing } from '../../lib/share';
```

Add `const [draft, setDraft] = useState<Draft | null>(null);` below the `segment` state (line ~40), and extend the `useFocusEffect` callback (line ~47) with `loadDraft('listing').then(setDraft);` (same shape as Step 1).

Add discard handler (near `confirmDelete`):

```ts
  const handleDiscardDraft = () => {
    Alert.alert('Discard draft?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          void clearDraft('listing');
          setDraft(null);
        },
      },
    ]);
  };
```

Add `ListHeaderComponent` to the FlatList (line ~168):

```tsx
          ListHeaderComponent={
            segment === 'live' && draft ? (
              <DraftRow
                kind="listing"
                title={typeof draft.fields.title === 'string' ? draft.fields.title : ''}
                savedAt={draft.savedAt}
                onPress={() => navigation.navigate('CreateListing', { fromDraftRow: true })}
                onDiscard={handleDiscardDraft}
              />
            ) : null
          }
```

Share pill: in `ListingManageRow`, add an `onShare` prop (type `() => void`), pass `onShare={() => shareListing(item)}` at the call site (line ~173 block), and in the pill row (lines 312–322) add `<PillButton label="Share" onPress={onShare} />` between `Edit` and `Mark sold` in the non-sold branch:

```tsx
          {sold ? (
            <PillButton label="Relist" onPress={onRelist} />
          ) : (
            <>
              <PillButton label="Edit" onPress={onEdit} />
              <PillButton label="Share" onPress={onShare} />
              <PillButton label="Mark sold" onPress={onMarkSold} />
            </>
          )}
```

- [ ] **Step 3: Gates + commit**

Run: `npx tsc --noEmit` then `npx jest` then `npx eslint src/screens/profile/MySalesScreen.tsx src/screens/profile/MyListingsScreen.tsx`

```bash
git add src/screens/profile/MySalesScreen.tsx src/screens/profile/MyListingsScreen.tsx
git commit -m "feat: pinned draft rows, Repost prefill param, Share pill on listings"
```

---

### Task 6: Neighborhood sales in search (Listings tab + map)

**Files:**
- Modify: `src/screens/listings/ListingsScreen.tsx`
- Modify: `src/screens/map/MapHomeScreen.tsx`

**Interfaces:**
- Consumes: `useSaleEvents()` from `src/hooks/useSaleEvents.ts` (`{ events, loading, refetch }`, upcoming only, block-filtered), `prettyRange` from `src/utils/format.ts`. Both stacks already register `EventDetail: { eventId?, slug? }`.

- [ ] **Step 1: Listings tab — event rows above sale results**

In `ListingsScreen.tsx` add imports:

```ts
import { useSaleEvents } from '../../hooks/useSaleEvents';
import { prettyRange } from '../../utils/format';
import { SaleEvent } from '../../types';
```

Below the `useSales()` call (line ~70) add `const { events: saleEvents } = useSaleEvents();`

Below `filteredListings` (line ~187) add:

```ts
  // Neighborhood sales are searchable here too — they don't live in the
  // sales list, so a title match surfaces them as tappable rows on top.
  const matchingEvents = useMemo(
    () =>
      query.trim()
        ? saleEvents.filter((e) => matchesQuery([e.title, e.description], query))
        : [],
    [saleEvents, query],
  );
```

Add `ListHeaderComponent` to the sales FlatList (`key="sales-list"`, line ~392):

```tsx
          ListHeaderComponent={
            matchingEvents.length > 0 ? (
              <View style={{ paddingTop: 4 }}>
                {matchingEvents.map((e) => (
                  <EventSearchRow
                    key={e.id}
                    event={e}
                    onPress={() =>
                      navigation.navigate('EventDetail', { eventId: e.id })
                    }
                  />
                ))}
              </View>
            ) : null
          }
```

Add the row component at the bottom of the file (beside `EmptyTab`):

```tsx
function EventSearchRow({
  event,
  onPress,
}: {
  event: SaleEvent;
  onPress: () => void;
}) {
  const count = event.sale_count ?? 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View ${event.title}`}
      style={{
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: HAIRLINE,
        marginHorizontal: 4,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          backgroundColor: '#E1ECDF',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="home" size={22} color={BRAND} />
      </View>
      <View style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: INK }}>
          {event.title}
        </Text>
        <Text style={{ fontSize: 11, color: INK_MUTED, marginTop: 3 }}>
          {`Neighborhood sale · ${prettyRange(event.start_date, event.end_date)} · ${count} ${
            count === 1 ? 'sale' : 'sales'
          }`}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={INK_MUTED}
        style={{ marginRight: 12 }}
      />
    </Pressable>
  );
}
```

- [ ] **Step 2: Map search — event-title match before geocoding**

In `MapHomeScreen.tsx`, `handleAreaSearch` (line ~494): after `setAreaSearching(true);` / inside the `try`, BEFORE `Location.geocodeAsync(q)`, add:

```ts
      // Typing a neighborhood sale's name should work like typing a city:
      // fly to its circle and open its page. Checked before geocoding so
      // "Maple Grove Sale" doesn't get swallowed by the place lookup.
      const qLower = q.toLowerCase();
      const eventMatch = saleEvents.find((e) =>
        e.title.toLowerCase().includes(qLower),
      );
      if (eventMatch) {
        mapRef.current?.animateToRegion(
          {
            latitude: eventMatch.latitude,
            longitude: eventMatch.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          },
          800,
        );
        navigation.navigate('EventDetail', { eventId: eventMatch.id });
        return;
      }
```

Update the callback's dependency array from `[areaQuery]` to `[areaQuery, saleEvents, navigation]`. (`saleEvents` and `navigation` are already in scope; the `finally` block still resets `areaSearching`.)

- [ ] **Step 3: Gates + commit**

Run: `npx tsc --noEmit` then `npx jest` then `npx eslint src/screens/listings/ListingsScreen.tsx src/screens/map/MapHomeScreen.tsx`

```bash
git add src/screens/listings/ListingsScreen.tsx src/screens/map/MapHomeScreen.tsx
git commit -m "feat: neighborhood sales surface in Listings search and map search"
```

---

### Task 7: Report alert backend (edge function + webhook trigger)

The app promises reports are "reviewed within 24 hours" but nothing notifies the operator when one lands. Mirror the existing notify-new-sale webhook pattern.

**Files:**
- Create: `supabase/functions/notify-new-report/index.ts`
- Create: `supabase/migrations/20260813120000_report_webhook.sql`

**Interfaces:**
- Consumes: `reports` insert shape (`id, reporter_id, target_type, target_id, reason, notes`), `user_push_tokens (user_id, token)`, env `NOTIFY_WEBHOOK_TOKEN` (already set project-wide), new env `OPERATOR_USER_ID`.

- [ ] **Step 1: Edge function**

```ts
// supabase/functions/notify-new-report/index.ts
/**
 * notify-new-report
 *
 * Triggered by a DB webhook on public.reports INSERT. Pushes an alert to the
 * operator's devices so the "reviewed within 24 hours" promise in the report
 * sheet is backed by an actual signal, not by someone remembering to check.
 *
 * Webhook body: { type, table, record: { ...new row } }
 * Env: NOTIFY_WEBHOOK_TOKEN (shared webhook secret), OPERATOR_USER_ID
 *      (auth.users id of the operator account), plus the auto-injected
 *      SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const REASON_LABELS: Record<string, string> = {
  inappropriate: 'Inappropriate content',
  spam_misleading: 'Spam or misleading',
  illegal: 'Illegal items',
  safety: 'Safety concern',
  off_topic: "Doesn't belong here",
  other: 'Something else',
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const webhookToken = Deno.env.get('NOTIFY_WEBHOOK_TOKEN');
  if (!webhookToken || req.headers.get('Authorization') !== `Bearer ${webhookToken}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: { record?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const record = payload.record;
  if (!record) return new Response('No record', { status: 400 });

  const operatorId = Deno.env.get('OPERATOR_USER_ID');
  if (!operatorId) {
    console.error('OPERATOR_USER_ID is not set');
    return new Response('Not configured', { status: 500 });
  }

  const targetType = (record.target_type as string) ?? 'content';
  const targetId = record.target_id as string;
  const reason = (record.reason as string) ?? 'other';
  const notes = (record.notes as string) ?? '';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: tokens } = await supabase
    .from('user_push_tokens')
    .select('token')
    .eq('user_id', operatorId);
  const toList = (tokens ?? []).map((t) => t.token as string).filter(Boolean);
  if (toList.length === 0) return new Response('No operator tokens', { status: 200 });

  const label = REASON_LABELS[reason] ?? reason;
  const body = notes
    ? notes.length > 120
      ? notes.slice(0, 117) + '…'
      : notes
    : `A ${targetType} was reported`;
  // Deep-link the tap to the reported content where a route exists.
  const data: Record<string, unknown> =
    targetType === 'sale'
      ? { saleId: targetId }
      : targetType === 'listing'
        ? { listingId: targetId }
        : {};

  const messages = toList.map((to) => ({
    to,
    sound: 'default' as const,
    title: `New report — ${label}`,
    body,
    data,
    channelId: 'sales',
  }));

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    console.error('Expo push error:', res.status, await res.text());
  }
  return new Response('OK', { status: 200 });
});
```

- [ ] **Step 2: Migration**

```sql
-- supabase/migrations/20260813120000_report_webhook.sql
-- Webhook: on a new abuse report, call notify-new-report (pushes an alert to
-- the operator's devices — backs the "reviewed within 24 hours" promise in
-- the report sheet). Same do-block pattern as 20260618200000: the service
-- token is read from the existing dashboard-created notify-new-message
-- trigger at apply time so the secret never appears in this file.

do $$
declare
  tok text;
  hdr text;
  base text := 'https://dxahcamntwtuzftxbxgx.supabase.co/functions/v1/';
begin
  select (regexp_match(pg_get_triggerdef(oid), 'Bearer ([A-Za-z0-9._-]+)'))[1]
    into tok
    from pg_trigger
    where tgname = 'notify-new-message'
      and tgrelid = 'public.messages'::regclass;
  if tok is null then
    raise exception 'Could not read the service-role token from the notify-new-message trigger';
  end if;

  hdr := json_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || tok
  )::text;

  execute 'drop trigger if exists notify_new_report_webhook on public.reports';
  execute format(
    'create trigger notify_new_report_webhook after insert on public.reports '
    || 'for each row execute function supabase_functions.http_request(%L,%L,%L,%L,%L)',
    base || 'notify-new-report', 'POST', hdr, '{}', '5000');
end $$;
```

- [ ] **Step 3: Deploy + configure (Bash, PAT from the session env)**

```bash
# 1. Operator user id (Management API SQL; expects exactly one row)
curl -s -X POST "https://api.supabase.com/v1/projects/dxahcamntwtuzftxbxgx/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select id from auth.users where email = '\''jasonwynkoop1@yahoo.com'\''"}'
# 2. Set the secret
SUPABASE_ACCESS_TOKEN=<PAT> npx supabase secrets set OPERATOR_USER_ID=<uuid-from-step-1>
# 3. Deploy the function (no JWT verify — auth is the webhook token check)
SUPABASE_ACCESS_TOKEN=<PAT> npx supabase functions deploy notify-new-report --no-verify-jwt
# 4. Apply the migration
printf 'Y\n' | SUPABASE_ACCESS_TOKEN=<PAT> npx supabase db push
```

Expected: secret set, function deployed, migration `20260813120000` applied.

- [ ] **Step 4: End-to-end verify**

Insert a synthetic report via the Management API (fires the trigger), confirm delivery, then clean up:

```sql
insert into public.reports (reporter_id, target_type, target_id, reason, notes)
select id, 'profile', id, 'other', 'TEST report alert — ignore' from auth.users
 where email = 'jasonwynkoop1@yahoo.com';
```

Expected: a push arrives on the operator's phone titled `New report — Something else`. Then:

```sql
delete from public.reports where notes = 'TEST report alert — ignore';
```

Also check function logs show `OK` (Management API `GET /v1/projects/dxahcamntwtuzftxbxgx/analytics/endpoints/logs.all` or dashboard).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/notify-new-report/index.ts supabase/migrations/20260813120000_report_webhook.sql
git commit -m "feat: push the operator a report alert (notify-new-report webhook)"
```

---

### Task 8: Error + retry states (Map, Listings, SaleDetail, ListingDetail) + pull-to-refresh

Today a failed fetch renders as an empty screen or "not found" — flaky cell service reads as "Trove has no sales in my town."

**Files:**
- Modify: `src/screens/listings/ListingsScreen.tsx`
- Modify: `src/screens/map/MapHomeScreen.tsx`
- Modify: `src/screens/map/SaleDetailScreen.tsx`
- Modify: `src/screens/listings/ListingDetailScreen.tsx`

**Interfaces:**
- Consumes: `useSales()` / `useListings()` already return `{ error, refetch }`.

- [ ] **Step 1: ListingsScreen — error empties + pull-to-refresh on Yard sales**

Change line 70 to destructure everything:

```ts
  const { sales, loading: salesLoading, error: salesError, refetch: refetchSales } = useSales();
```

and line ~76 to also take `error: listingsError` from `useListings`.

Sales FlatList (line ~392): add pull-to-refresh props after `contentContainerStyle`:

```tsx
          onRefresh={refetchSales}
          refreshing={salesLoading}
```

Replace its `ListEmptyComponent` chain with an error branch FIRST:

```tsx
          ListEmptyComponent={
            salesLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <ActivityIndicator color={BRAND} />
              </View>
            ) : salesError ? (
              <EmptyTab
                title="Couldn’t load yard sales"
                description="Check your connection and try again."
                ctaLabel="Try again"
                onCta={refetchSales}
              />
            ) : query.trim() ? (
              <EmptyTab
                title={`No yard sales match “${query.trim()}”`}
                description="Try a different keyword."
              />
            ) : (
              <EmptyTab
                title="No yard sales near you"
                description="Try widening the area or check back this weekend."
              />
            )
          }
```

Items FlatList `ListEmptyComponent` (line ~451): insert the same-shaped branch between the loading and query branches:

```tsx
            ) : listingsError ? (
              <EmptyTab
                title="Couldn’t load items"
                description="Check your connection and try again."
                ctaLabel="Try again"
                onCta={refetchListings}
              />
```

- [ ] **Step 2: MapHomeScreen — retry banner under the search card**

Change line 94 to `const { sales, loading, error: salesError, refetch: refetchSales } = useSales();`

Inside the search-card absolute container (line ~720–738), directly after `<SearchCard ... />`, add:

```tsx
        {salesError && !loading ? (
          <Pressable
            onPress={refetchSales}
            accessibilityRole="button"
            accessibilityLabel="Retry loading sales"
            style={{
              marginTop: 8,
              backgroundColor: '#fff',
              borderRadius: 12,
              paddingVertical: 10,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              borderWidth: 1,
              borderColor: '#F0D9D3',
            }}
          >
            <Ionicons name="cloud-offline-outline" size={15} color="#A23E2D" />
            <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: INK }}>
              Couldn’t load sales. Tap to retry.
            </Text>
          </Pressable>
        ) : null}
```

(`INK` is an existing const in this file; if the file uses a different name, match it.)

- [ ] **Step 3: SaleDetailScreen — split network failure from not-found**

Add state next to the existing `loading` state:

```ts
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
```

In the fetch effect (line ~137): change deps to `[saleId, reloadKey]`, start with `setLoading(true); setLoadError(null);`, and destructure the error:

```ts
      const { data: saleData, error: saleErr } = await supabase
        .from('sales')
        .select('*, media:sale_media(*)')
        .eq('id', saleId)
        .single();
      if (cancelled) return;
      // PGRST116 = zero rows (a genuinely missing/deleted sale). Anything
      // else is a fetch failure and must NOT render as "Sale not found."
      if (saleErr && saleErr.code !== 'PGRST116') {
        setLoadError(saleErr.message);
        setLoading(false);
        return;
      }
      if (!saleData) {
        setLoading(false);
        return;
      }
```

Before the existing `if (!sale)` not-found block (line ~279), add:

```tsx
  if (loadError && !sale) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fff',
          paddingHorizontal: 32,
        }}
      >
        <Ionicons name="cloud-offline-outline" size={48} color={INK_MUTED} />
        <Text style={{ marginTop: 12, color: INK_SOFT }}>
          Couldn’t load this sale.
        </Text>
        <Pressable
          onPress={() => setReloadKey((k) => k + 1)}
          style={{
            marginTop: 24,
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: BRAND,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Try again</Text>
        </Pressable>
        <Pressable onPress={() => goBack()} style={{ marginTop: 14 }}>
          <Text style={{ color: INK, fontWeight: '600' }}>Go back</Text>
        </Pressable>
      </View>
    );
  }
```

- [ ] **Step 4: ListingDetailScreen — same split**

Add the same `loadError`/`reloadKey` state pair. Convert the fetch effect (lines 99–116) to:

```ts
  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    supabase
      .from('listings')
      .select('*, profile:profiles(*), media:listing_media(*)')
      .eq('id', listingId)
      .single()
      .then(({ data, error }) => {
        if (error && error.code !== 'PGRST116') {
          setLoadError(error.message);
          setLoading(false);
          return;
        }
        if (data) {
          data.media = (data.media ?? []).sort(
            (a: ListingMedia, b: ListingMedia) => a.order - b.order,
          );
          setListing(data);
        }
        setLoading(false);
      });
    // Count this view (the RPC skips the owner's own views).
    void supabase.rpc('increment_listing_view', { p_id: listingId });
  }, [listingId, reloadKey]);
```

Before the `if (!listing)` block (line ~204), add the same `if (loadError && !listing)` screen as Step 3 with the copy `Couldn’t load this listing.`, `Try again` → `setReloadKey((k) => k + 1)`, and `Go back` → `goBack()`.

- [ ] **Step 5: Gates + commit**

Run: `npx tsc --noEmit` then `npx jest` then `npx eslint src/screens/listings/ListingsScreen.tsx src/screens/map/MapHomeScreen.tsx src/screens/map/SaleDetailScreen.tsx src/screens/listings/ListingDetailScreen.tsx`

```bash
git add src/screens/listings/ListingsScreen.tsx src/screens/map/MapHomeScreen.tsx src/screens/map/SaleDetailScreen.tsx src/screens/listings/ListingDetailScreen.tsx
git commit -m "fix: honest error + retry states on Map, Listings, and both detail screens; pull-to-refresh on Yard sales"
```

---

### Task 9: Drop the profile embed in useListings browse query

Same failure class as the fixed useSales bug: PostgREST's auto-INNER-JOIN on the NOT NULL `user_id` FK can silently drop a real user's listings when their profile row is missing. Nothing in the browse path consumes `listing.profile` (verified: `ListingTile` and `ListingsScreen` never touch it; `ListingDetailScreen` does its own fetch).

**Files:**
- Modify: `src/hooks/useListings.ts:25`

- [ ] **Step 1: Verify the embed is unused, then remove it**

Run: `grep -rn "\.profile" src/components/ListingTile.tsx src/screens/listings/ListingsScreen.tsx`
Expected: no matches on data coming from `useListings` (ListingDetailScreen has its own fetch and is allowed to keep its embed).

Change line 25 from:

```ts
        .select('*, profile:profiles(*), media:listing_media(*)')
```

to:

```ts
        // No profile embed — PostgREST's auto-INNER-JOIN on the NOT NULL
        // user_id FK drops listings whose owner has no profile row yet
        // (same bug class as useSales; see that hook's comment). The detail
        // screen fetches the seller profile itself.
        .select('*, media:listing_media(*)')
```

- [ ] **Step 2: Gates + commit**

Run: `npx tsc --noEmit` then `npx jest`

```bash
git add src/hooks/useListings.ts
git commit -m "fix: drop profile embed from useListings so profileless sellers' items still list"
```

---

### Task 10: Edit Sale — address/pin editing + photo-cap toast

Sellers can't fix a typo'd address today: EditSaleScreen has no location UI and the update payload never touches `address`/`latitude`/`longitude`.

**Files:**
- Modify: `src/screens/sale/EditSaleScreen.tsx`

**Interfaces:**
- Consumes: same geocode helpers pattern as CreateSaleScreen (expo-location), `sales` columns `address, latitude, longitude`.

- [ ] **Step 1: Imports + state**

Add imports:

```ts
import MapView, { Marker, MapPressEvent } from 'react-native-maps';
import * as Location from 'expo-location';
```

Add `StyleSheet` to the existing `react-native` import list. Add state below `status` (line ~76):

```ts
  // Where — editable location (address + draggable pin), prefilled from the
  // sale row. [lng, lat] to match CreateSaleScreen's convention.
  const [pinCoords, setPinCoords] = useState<[number, number] | null>(null);
  const [address, setAddress] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [geocoding, setGeocoding] = useState(false);
```

In the load effect (after `setStatus(data.status);`, line ~115) add:

```ts
        setAddress(data.address ?? '');
        setAddressInput(data.address ?? '');
        if (typeof data.longitude === 'number' && typeof data.latitude === 'number') {
          setPinCoords([data.longitude, data.latitude]);
        }
```

- [ ] **Step 2: Handlers (copy of CreateSaleScreen's, adapted)**

Add above `save`:

```ts
  const geocodeAddress = async () => {
    if (!addressInput.trim()) return;
    setGeocoding(true);
    try {
      const results = await Location.geocodeAsync(addressInput);
      if (results.length > 0) {
        const { latitude, longitude } = results[0];
        setPinCoords([longitude, latitude]);
        setAddress(addressInput);
      } else {
        Alert.alert(
          'Address not found',
          'Try a different address, or tap on the map to drop a pin manually.',
        );
      }
    } catch {
      Alert.alert('Geocoding failed', 'Could not look up that address.');
    } finally {
      setGeocoding(false);
    }
  };

  const onMapPress = async (e: MapPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setPinCoords([longitude, latitude]);
    try {
      const [result] = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (result) {
        const parts = [
          result.streetNumber,
          result.street,
          result.city,
          result.region,
        ].filter(Boolean);
        const formatted = parts.join(', ');
        if (formatted) {
          setAddress(formatted);
          setAddressInput(formatted);
        }
      }
    } catch {
      /* ignore */
    }
  };
```

- [ ] **Step 3: Save payload + validation**

In `save()`, before `setSaving(true)`:

```ts
    if (!pinCoords || !address) {
      Alert.alert('Location required', 'Please set a location.');
      return;
    }
```

In the `.update({...})` payload add:

```ts
          address,
          latitude: pinCoords[1],
          longitude: pinCoords[0],
```

- [ ] **Step 4: WHERE section UI**

Insert between the DESCRIPTION block and QUICK PICK (line ~489):

```tsx
          {/* WHERE */}
          <View>
            <Text className="mb-2 text-sm font-medium text-zinc-700">
              Location
            </Text>
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <View className="flex-1">
                <Input
                  placeholder="Enter an address"
                  value={addressInput}
                  onChangeText={setAddressInput}
                  onSubmitEditing={geocodeAddress}
                  returnKeyType="search"
                />
              </View>
              <Pressable
                onPress={geocodeAddress}
                disabled={geocoding || !addressInput.trim()}
                className="rounded-xl bg-zinc-900 px-4 py-3 active:bg-zinc-700"
                style={{ opacity: !addressInput.trim() || geocoding ? 0.4 : 1 }}
              >
                {geocoding ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="search" size={18} color="#fff" />
                )}
              </Pressable>
            </View>
            <View
              className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100"
              style={{ height: 200 }}
            >
              <MapView
                style={StyleSheet.absoluteFillObject}
                initialRegion={
                  pinCoords
                    ? {
                        latitude: pinCoords[1],
                        longitude: pinCoords[0],
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                      }
                    : undefined
                }
                onPress={onMapPress}
              >
                {pinCoords && (
                  <Marker
                    coordinate={{ latitude: pinCoords[1], longitude: pinCoords[0] }}
                    draggable
                    onDragEnd={(e) => {
                      const { latitude, longitude } = e.nativeEvent.coordinate;
                      setPinCoords([longitude, latitude]);
                    }}
                    pinColor="#1F4D3A"
                  />
                )}
              </MapView>
            </View>
            {address ? (
              <View className="mt-2 flex-row items-start">
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text className="ml-1.5 flex-1 text-xs text-zinc-600">{address}</Text>
              </View>
            ) : null}
          </View>
```

(The map first renders only after `loading` is false, so `pinCoords` is already prefilled and `initialRegion` centers on the sale.)

- [ ] **Step 5: Photo-cap toast**

Change the two silent guards (lines 150 and 167):

```ts
    if (remainingSlots <= 0) {
      toast.info('Photo limit reached', `Max ${MAX_MEDIA} photos per sale.`);
      return;
    }
```

- [ ] **Step 6: Gates + commit**

Run: `npx tsc --noEmit` then `npx jest` then `npx eslint src/screens/sale/EditSaleScreen.tsx`

```bash
git add src/screens/sale/EditSaleScreen.tsx
git commit -m "feat: address and pin editing in Edit Sale, photo-cap toast"
```

---

### Task 11: Ship — gates, docs, OTA, smoke

**Files:**
- Modify: `CLAUDE.md` (Notable Utilities: add `drafts.ts`; Backend: mention `notify-new-report`)
- Modify: `.superpowers/sdd/progress.md` (append this wave's ledger)

- [ ] **Step 1: Full gates**

```bash
npx tsc --noEmit
npx jest
npx eslint src
rm -rf dist && SENTRY_DISABLE_AUTO_UPLOAD=true CI=1 npx expo export --platform ios
```

Expected: clean, all tests pass (216 + the new suites), lint clean, export ends `Exported: dist`.

- [ ] **Step 2: Docs**

CLAUDE.md → Notable Utilities, add:

```markdown
- `drafts.ts` — device-local one-per-type drafts for the Create Sale/Listing forms (AsyncStorage `trove:draft:<type>`); screens debounce-autosave into it and clear on post
```

Backend RPC/functions area, add `notify-new-report` beside the other notify functions. Append a ledger entry to `.superpowers/sdd/progress.md` with the commit range and any accepted debt.

- [ ] **Step 3: Verify no fingerprint drift, then OTA**

```bash
git status --short   # nothing unexpected; check .gitignore untouched
git push origin main
SENTRY_DISABLE_AUTO_UPLOAD=true CI=1 npx eas update --branch production --message "Drafts, repost prefill, event search, error states, edit-sale address" --non-interactive
```

Expected: output prints `Runtime version 13ae0c60e5076289ce40f51bf3d5ab10f1b1810a`. **If it prints anything else, STOP — do not publish further; a native-affecting change slipped in.**

- [ ] **Step 4: Manual smoke checklist (user, on device)**

1. Create Sale → type a title → background the app → relaunch → open Create Sale → banner appears → Restore restores the title.
2. Add a photo + title → Save draft → toast + screen closes → Profile → Your sales shows the pinned Draft row → tap → form restored.
3. Post the restored draft → draft row gone.
4. Draft row → Discard → confirm → gone.
5. Ended sale → Repost → form prefilled (photos + title + address, dates empty) → post succeeds, photos attached.
6. Listings tab → search a neighborhood sale's name → event row appears → taps through.
7. Map search box → type the event name → flies to circle + opens event page.
8. Airplane mode → Listings tab → "Couldn’t load yard sales" + Try again; sale link → "Couldn’t load this sale." + Try again.
9. Edit Sale → change address → save → pin moved on the map.
10. Have someone (or a second account) file a report → operator push arrives.

- [ ] **Step 5: Final commit**

```bash
git add CLAUDE.md .superpowers/sdd/progress.md
git commit -m "docs: drafts + polish wave ledger and CLAUDE.md notes"
git push origin main
```
