# Neighborhood Sales v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organizer-created Neighborhood Sale events that group independent sales: create + share, open join via link and location-only proximity prompts (with a date-alignment nudge), event map layer, and an event page with save-&-remind — all shippable via OTA.

**Architecture:** One new table (`sale_events`) + a nullable `sales.event_id` FK + `event_saves`; RLS follows the app's owner-writes/public-reads pattern with one `SECURITY DEFINER` RPC for organizer removal. Client is a pure-function match helper, two hooks, two screens, one prompt component, an additive map overlay, and small integrations into PostMenu/CreateSale/linking/site.

**Tech Stack:** Expo SDK 54 / RN 0.81.5, TypeScript strict, NativeWind + inline styles, Supabase (PostgREST + RLS), react-native-maps (`Marker`, `Circle`), expo-notifications (local scheduling), Jest + RNTL v14 (async `render`).

## Global Constraints

- **OTA-safe:** no new native dependencies, no `app.json` changes, no new permissions. Verify every `eas update` prints `Runtime version 13ae0c60e5076289ce40f51bf3d5ab10f1b1810a` (build 26).
- **Spec:** `docs/superpowers/specs/2026-08-07-neighborhood-sales-design.md`. Deviation locked in here: radius picker = preset chips (¼/½/¾/1 mi → 400/800/1200/1600 m), not a slider (no slider dep in the binary).
- Colors: `BRAND '#1F4D3A'`, `BRAND_SOFT '#E1ECDF'`, `BONE '#F7F2E8'`, `INK '#171513'`, `INK_MUTED '#8A857C'`, `HAIRLINE '#E5DECC'`, `ROSE '#A23E2D'`.
- RLS style: `(select auth.uid())`; definer functions set `search_path = public, pg_temp`.
- Migrations: file in `supabase/migrations/`, applied with `printf 'Y\n' | SUPABASE_ACCESS_TOKEN=<PAT> npx supabase db push` (ask the user for a PAT if the session one is revoked).
- `npx tsc --noEmit`, `npx jest`, and `SENTRY_DISABLE_AUTO_UPLOAD=true CI=1 npx expo export --platform ios` must pass before every commit. Suite baseline: 204 tests — only add.
- RNTL: `render` is async — every screen/component test `await render(...)`. `@expo/vector-icons` is globally mocked (icons render as their name in Text).
- Commits: no Co-Authored-By line.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260808090000_neighborhood_sales.sql`

**Interfaces:**
- Produces: tables `sale_events`, `event_saves`; column `sales.event_id`; RPC `remove_sale_from_event(p_sale_id uuid)`. Client code in later tasks reads `sale_events.*` with embedded `sales(count)` and writes `sales.event_id` as the sale owner.

- [ ] **Step 1: Write the migration**

```sql
-- Neighborhood Sales v1 (spec: docs/superpowers/specs/2026-08-07-neighborhood-sales-design.md)
-- Events group independent sales. Open join (owner sets their own
-- sales.event_id); organizer removal crosses ownership so it's a definer RPC.

create table public.sale_events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  cover_url text,
  start_date date not null,
  end_date date not null,
  latitude double precision not null,
  longitude double precision not null,
  radius_m integer not null default 800,
  share_slug text not null unique
    default lower(substring(md5(gen_random_uuid()::text) from 1 for 8)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sale_events_dates_ck check (end_date >= start_date),
  constraint sale_events_radius_ck check (radius_m between 100 and 5000)
);

create index sale_events_end_date_idx on public.sale_events (end_date);

create trigger on_sale_event_updated
  before update on public.sale_events
  for each row execute function public.handle_updated_at();

alter table public.sales
  add column event_id uuid references public.sale_events(id) on delete set null;

create index sales_event_id_idx on public.sales (event_id);

create table public.event_saves (
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.sale_events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

-- RLS
alter table public.sale_events enable row level security;
alter table public.event_saves enable row level security;

create policy "Events are viewable by everyone"
  on public.sale_events for select using (true);
create policy "Organizers can insert their own events"
  on public.sale_events for insert
  with check (organizer_id = (select auth.uid()));
create policy "Organizers can update their own events"
  on public.sale_events for update
  using (organizer_id = (select auth.uid()));
create policy "Organizers can delete their own events"
  on public.sale_events for delete
  using (organizer_id = (select auth.uid()));

create policy "Users manage their own event saves"
  on public.event_saves for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Organizer removes a member sale (crosses sale ownership → definer RPC).
create or replace function public.remove_sale_from_event(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.sales s
    join public.sale_events e on e.id = s.event_id
    where s.id = p_sale_id
      and e.organizer_id = auth.uid()
  ) then
    raise exception 'not the organizer of this sale''s event';
  end if;

  update public.sales set event_id = null where id = p_sale_id;
end;
$$;

revoke execute on function public.remove_sale_from_event(uuid) from public, anon;
grant execute on function public.remove_sale_from_event(uuid) to authenticated;
```

- [ ] **Step 2: Apply**

Run (Git Bash, repo root):
```bash
printf 'Y\n' | SUPABASE_ACCESS_TOKEN=<PAT> npx supabase db push
```
Expected: `Applying migration 20260808090000_neighborhood_sales.sql... Finished supabase db push.`

- [ ] **Step 3: Verify security against production**

Run each check via the Management API (`POST https://api.supabase.com/v1/projects/dxahcamntwtuzftxbxgx/database/query`, `Authorization: Bearer <PAT>`):

1. `select count(*) from pg_policies where tablename in ('sale_events','event_saves');` → expect `6`.
2. `select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='remove_sale_from_event';` → expect `true`.
3. Anonymous read works: `curl -s "https://dxahcamntwtuzftxbxgx.supabase.co/rest/v1/sale_events?select=id" -H "apikey: sb_publishable_mpxg4esDmwVJ6CkJTTJ6CA__-6QrZqJ"` → `[]` with HTTP 200 (not an error object).
4. Anonymous cannot call the RPC: `curl -s -o /dev/null -w "%{http_code}" -X POST "https://dxahcamntwtuzftxbxgx.supabase.co/rest/v1/rpc/remove_sale_from_event" -H "apikey: sb_publishable_mpxg4esDmwVJ6CkJTTJ6CA__-6QrZqJ" -H "Content-Type: application/json" -d '{"p_sale_id":"00000000-0000-0000-0000-000000000000"}'` → `401` or `404` (not 2xx/204).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260808090000_neighborhood_sales.sql
git commit -m "feat(db): neighborhood sale events - tables, RLS, organizer-remove RPC"
```

---

### Task 2: Types + match helper (TDD)

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/eventMatch.ts`
- Test: `src/lib/__tests__/eventMatch.test.ts`

**Interfaces:**
- Consumes: `haversineMeters(lat1, lng1, lat2, lng2): number` from `src/utils/distance.ts`.
- Produces: type `SaleEvent`; `Sale.event_id?: string | null`; `datesOverlap(aStart, aEnd, bStart, bEnd): boolean`; `eventMatchForSale(sale, events, todayIso): SaleEvent | null`; nav param additions (below) that Tasks 4–8 rely on.

- [ ] **Step 1: Add types** (in `src/types/index.ts`)

Next to the `Sale` type add the field, and add the new type after `Listing`:

```ts
// inside Sale:
  event_id?: string | null;

// new type:
export type SaleEvent = {
  id: string;
  organizer_id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  share_slug: string;
  created_at: string;
  updated_at: string;
  /** hydrated client-side */
  organizer?: Profile;
  sale_count?: number;
};
```

Param-list changes (exact):
- `MapStackParamList` and `ListingsStackParamList`: add `EventDetail: { eventId?: string; slug?: string };`
- `PostStackParamList`: add `CreateEvent: { eventId?: string } | undefined;` and change `CreateSale: undefined;` → `CreateSale: { eventId?: string; presetStart?: string; presetEnd?: string } | undefined;`
- `ProfileStackParamList`: same `CreateSale` param change.

- [ ] **Step 2: Write failing tests** (`src/lib/__tests__/eventMatch.test.ts`)

```ts
import { datesOverlap, eventMatchForSale } from '../eventMatch';
import { SaleEvent } from '../../types';

const ev = (o: Partial<SaleEvent>): SaleEvent => ({
  id: 'e1', organizer_id: 'u1', title: 'Maple Grove', description: null,
  cover_url: null, start_date: '2026-08-15', end_date: '2026-08-16',
  latitude: 40.0, longitude: -85.0, radius_m: 800, share_slug: 'abc12345',
  created_at: '', updated_at: '', ...o,
});
const TODAY = '2026-08-10';

describe('datesOverlap', () => {
  it('true when ranges intersect, inclusive of shared edge days', () => {
    expect(datesOverlap('2026-08-15', '2026-08-16', '2026-08-16', '2026-08-17')).toBe(true);
    expect(datesOverlap('2026-08-15', '2026-08-15', '2026-08-15', '2026-08-15')).toBe(true);
  });
  it('false when ranges are disjoint', () => {
    expect(datesOverlap('2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18')).toBe(false);
  });
});

describe('eventMatchForSale', () => {
  const sale = { latitude: 40.0, longitude: -85.0 };
  it('matches a sale inside the radius', () => {
    expect(eventMatchForSale(sale, [ev({})], TODAY)?.id).toBe('e1');
  });
  it('rejects a sale outside the radius', () => {
    // ~0.02 deg latitude ≈ 2.2 km > 800 m
    expect(eventMatchForSale({ latitude: 40.02, longitude: -85.0 }, [ev({})], TODAY)).toBeNull();
  });
  it('ignores ended events', () => {
    expect(eventMatchForSale(sale, [ev({ end_date: '2026-08-01' })], TODAY)).toBeNull();
  });
  it('date mismatch does NOT block matching (location-only trigger)', () => {
    expect(eventMatchForSale(sale, [ev({ start_date: '2026-09-01', end_date: '2026-09-02' })], TODAY)?.id).toBe('e1');
  });
  it('multiple matches -> soonest start date wins', () => {
    const later = ev({ id: 'later', start_date: '2026-09-01', end_date: '2026-09-02' });
    const sooner = ev({ id: 'sooner', start_date: '2026-08-12', end_date: '2026-08-13' });
    expect(eventMatchForSale(sale, [later, sooner], TODAY)?.id).toBe('sooner');
  });
  it('same start date -> nearest wins', () => {
    const near = ev({ id: 'near' });
    const far = ev({ id: 'far', latitude: 40.005 });
    expect(eventMatchForSale(sale, [far, near], TODAY)?.id).toBe('near');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx jest src/lib/__tests__/eventMatch.test.ts`
Expected: FAIL — cannot find module `../eventMatch`.

- [ ] **Step 4: Implement** (`src/lib/eventMatch.ts`)

```ts
import { SaleEvent } from '../types';
import { haversineMeters } from '../utils/distance';

/** Inclusive YYYY-MM-DD range overlap (string compare is safe for ISO dates). */
export function datesOverlap(
  aStart: string, aEnd: string, bStart: string, bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * The proximity-prompt matcher. Location-only by design (spec): a date
 * mismatch must NOT suppress the prompt — it becomes a date-alignment
 * nudge in the UI instead. Soonest upcoming event wins; ties go nearest.
 */
export function eventMatchForSale(
  sale: { latitude: number; longitude: number },
  events: SaleEvent[],
  todayIso: string,
): SaleEvent | null {
  const dist = (e: SaleEvent) =>
    haversineMeters(sale.latitude, sale.longitude, e.latitude, e.longitude);
  const candidates = events.filter(
    (e) => e.end_date >= todayIso && dist(e) <= e.radius_m,
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) =>
    a.start_date < b.start_date ? -1 :
    a.start_date > b.start_date ? 1 :
    dist(a) - dist(b),
  );
  return candidates[0];
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx jest src/lib/__tests__/eventMatch.test.ts && npx tsc --noEmit`
Expected: 7 tests PASS; tsc exit 0 (fix any param-list fallout in navigation callsites by leaving existing `navigate('CreateSale')` calls untouched — params are optional).

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/lib/eventMatch.ts src/lib/__tests__/eventMatch.test.ts
git commit -m "feat: SaleEvent types + location-only event match helper (TDD)"
```

---

### Task 3: Hooks + share link

**Files:**
- Create: `src/hooks/useSaleEvents.ts`
- Modify: `src/lib/share.ts`
- Modify: `src/lib/navigationRef.ts`

**Interfaces:**
- Consumes: `SaleEvent`, `Sale` types; `supabase` client.
- Produces:
  - `useSaleEvents(): { events: SaleEvent[]; loading: boolean; refetch(): Promise<void> }` — upcoming events with `sale_count`.
  - `useSaleEvent(params: { eventId?: string; slug?: string }): { event: SaleEvent | null; sales: Sale[]; loading: boolean; refetch(): Promise<void> }` — one event, organizer hydrated, roster with media.
  - `shareEvent(event: SaleEvent): Promise<void>` — shares `https://trove.sale/event/<slug>`.
  - `navigateToEvent(params: { eventId?: string; slug?: string }): void`.

- [ ] **Step 1: Write the hooks file** (`src/hooks/useSaleEvents.ts`)

```ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Sale, SaleEvent } from '../types';

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Upcoming + in-progress neighborhood sale events (end_date >= today) with a
 * member-sale count. Plain fetch — tiny table, no realtime channel (spec).
 */
export function useSaleEvents() {
  const [events, setEvents] = useState<SaleEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from('sale_events')
      .select('*, sales(count)')
      .gte('end_date', todayIso());
    setEvents(
      ((data as any[]) ?? []).map((e) => ({
        ...e,
        sale_count: e.sales?.[0]?.count ?? 0,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  return { events, loading, refetch };
}

/**
 * One event by id or share slug, with organizer profile (separate query —
 * same no-embed pattern as useSales) and the member-sale roster with media.
 */
export function useSaleEvent({ eventId, slug }: { eventId?: string; slug?: string }) {
  const [event, setEvent] = useState<SaleEvent | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!eventId && !slug) { setLoading(false); return; }
    let q = supabase.from('sale_events').select('*, sales(count)');
    q = eventId ? q.eq('id', eventId) : q.eq('share_slug', slug!);
    const { data: ev } = await q.maybeSingle();
    if (!ev) { setEvent(null); setSales([]); setLoading(false); return; }

    const [{ data: organizer }, { data: memberSales }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', ev.organizer_id).maybeSingle(),
      supabase
        .from('sales')
        .select('*, media:sale_media(*)')
        .eq('event_id', ev.id)
        .order('created_at', { ascending: true }),
    ]);
    setEvent({
      ...(ev as any),
      sale_count: (ev as any).sales?.[0]?.count ?? 0,
      organizer: organizer ?? undefined,
    });
    setSales((memberSales as Sale[]) ?? []);
    setLoading(false);
  }, [eventId, slug]);

  useEffect(() => { refetch(); }, [refetch]);
  return { event, sales, loading, refetch };
}
```

- [ ] **Step 2: Add `shareEvent`** (in `src/lib/share.ts`, after `shareListing`)

```ts
export function shareEvent(event: SaleEvent): Promise<void> {
  const url = `${WEB_ORIGIN}/event/${event.share_slug}`;
  const dates = `${event.start_date} – ${event.end_date}`;
  const lines = [
    `${event.title} — neighborhood sale`,
    dates,
    url,
  ];
  return present(event.title, lines.join('\n'));
}
```
Add `SaleEvent` to the types import at the top of the file.

- [ ] **Step 3: Add `navigateToEvent`** (in `src/lib/navigationRef.ts`, after `navigateToSale`)

```ts
/**
 * Open a neighborhood sale event on the Map tab — used by deep links
 * (trove://event/<slug>) and post-create navigation.
 */
export function navigateToEvent(params: { eventId?: string; slug?: string }) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main' as any, { screen: 'Map' } as any);
  navigationRef.navigate('Main' as any, {
    screen: 'Map',
    params: { screen: 'EventDetail', params },
  } as any);
}
```

- [ ] **Step 4: Gates + commit**

Run: `npx tsc --noEmit && npx jest`
Expected: clean, 211 tests (204 + 7).

```bash
git add src/hooks/useSaleEvents.ts src/lib/share.ts src/lib/navigationRef.ts
git commit -m "feat: sale-event hooks, shareEvent link, navigateToEvent"
```

---

### Task 4: EventJoinPrompt component (TDD)

**Files:**
- Create: `src/components/EventJoinPrompt.tsx`
- Test: `src/components/__tests__/EventJoinPrompt.test.tsx`

**Interfaces:**
- Consumes: `SaleEvent`, `datesOverlap`.
- Produces: `<EventJoinPrompt visible event saleStart saleEnd onJoin={(moveDates: boolean) => void} onDecline={() => void} />`. Task 7 (CreateSale integration) renders it.

- [ ] **Step 1: Failing tests** (`src/components/__tests__/EventJoinPrompt.test.tsx`)

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { EventJoinPrompt } from '../EventJoinPrompt';
import { SaleEvent } from '../../types';

const event: SaleEvent = {
  id: 'e1', organizer_id: 'u1', title: 'Maple Grove Neighborhood Sale',
  description: null, cover_url: null, start_date: '2026-08-15',
  end_date: '2026-08-16', latitude: 0, longitude: 0, radius_m: 800,
  share_slug: 'abc12345', created_at: '', updated_at: '',
};

describe('EventJoinPrompt', () => {
  it('overlap variant: one Join button, joins without moving dates', async () => {
    const onJoin = jest.fn();
    await render(
      <EventJoinPrompt visible event={event} saleStart="2026-08-15"
        saleEnd="2026-08-15" onJoin={onJoin} onDecline={jest.fn()} />,
    );
    expect(screen.getByText(/want to be part of it/i)).toBeTruthy();
    fireEvent.press(screen.getByText('Join'));
    expect(onJoin).toHaveBeenCalledWith(false);
  });

  it('mismatch variant: offers moving the sale to the event weekend', async () => {
    const onJoin = jest.fn();
    await render(
      <EventJoinPrompt visible event={event} saleStart="2026-08-22"
        saleEnd="2026-08-22" onJoin={onJoin} onDecline={jest.fn()} />,
    );
    fireEvent.press(screen.getByText(/move my sale/i));
    expect(onJoin).toHaveBeenCalledWith(true);
  });

  it('mismatch variant: can join keeping own dates, and decline', async () => {
    const onJoin = jest.fn();
    const onDecline = jest.fn();
    await render(
      <EventJoinPrompt visible event={event} saleStart="2026-08-22"
        saleEnd="2026-08-22" onJoin={onJoin} onDecline={onDecline} />,
    );
    fireEvent.press(screen.getByText(/join with my dates/i));
    expect(onJoin).toHaveBeenCalledWith(false);
    fireEvent.press(screen.getByText(/no thanks/i));
    expect(onDecline).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/components/__tests__/EventJoinPrompt.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (`src/components/EventJoinPrompt.tsx`)

```tsx
import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './ui';
import { SaleEvent } from '../types';
import { datesOverlap } from '../lib/eventMatch';

const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_MUTED = '#8A857C';

function prettyRange(start: string, end: string): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  };
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

/**
 * Post-create proximity prompt (spec §3, door two). Location-only trigger;
 * this component decides the copy by comparing dates:
 *  - overlap  → simple Join / No thanks
 *  - mismatch → nudge: move sale to the event weekend / keep dates / decline
 */
export function EventJoinPrompt({
  visible, event, saleStart, saleEnd, onJoin, onDecline,
}: {
  visible: boolean;
  event: SaleEvent;
  saleStart: string;
  saleEnd: string;
  onJoin: (moveDates: boolean) => void;
  onDecline: () => void;
}) {
  const overlap = datesOverlap(saleStart, saleEnd, event.start_date, event.end_date);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDecline}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(23,21,19,0.45)' }}
        onPress={onDecline}
        accessibilityLabel="Dismiss"
      />
      <View
        style={{
          backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingHorizontal: 24, paddingTop: 14, paddingBottom: 34,
        }}
      >
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E4E4E7', marginBottom: 18 }} />
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#E8EFE9', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <Ionicons name="home-outline" size={26} color={BRAND} />
        </View>
        <Text style={{ fontSize: 20, fontWeight: '800', color: INK, letterSpacing: -0.3 }}>
          {overlap ? 'You’re inside a neighborhood sale' : 'Your street has a neighborhood sale'}
        </Text>
        <Text style={{ marginTop: 6, fontSize: 14.5, lineHeight: 21, color: INK_MUTED }}>
          {overlap
            ? `Your sale is inside the ${event.title} (${prettyRange(event.start_date, event.end_date)}) — want to be part of it? You'll show up with the group on the map.`
            : `The ${event.title} runs ${prettyRange(event.start_date, event.end_date)}. Your sale is set for ${prettyRange(saleStart, saleEnd)} — group sales pull far more shoppers.`}
        </Text>
        <View style={{ marginTop: 20, gap: 10 }}>
          {overlap ? (
            <Button size="lg" onPress={() => onJoin(false)}>Join</Button>
          ) : (
            <>
              <Button size="lg" onPress={() => onJoin(true)}>
                Join & move my sale to that weekend
              </Button>
              <Button variant="ghost" onPress={() => onJoin(false)}>
                Join with my dates
              </Button>
            </>
          )}
          <Button variant="ghost" onPress={onDecline}>No thanks</Button>
        </View>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 4: Run tests, gates, commit**

Run: `npx jest src/components/__tests__/EventJoinPrompt.test.tsx && npx tsc --noEmit`
Expected: 3 tests PASS.

```bash
git add src/components/EventJoinPrompt.tsx src/components/__tests__/EventJoinPrompt.test.tsx
git commit -m "feat: date-aware event join prompt (TDD)"
```

---

### Task 5: CreateEventScreen + Post menu entry

**Files:**
- Create: `src/screens/events/CreateEventScreen.tsx`
- Modify: `src/components/PostMenu.tsx`
- Modify: `src/navigation/index.tsx`

**Interfaces:**
- Consumes: `DateTimeField` (`{label, mode:'date', value:'YYYY-MM-DD', onChange, min?}`), `Button`, `Input`, `useUserLocation()` (`{ latitude, longitude } | null`), `shareEvent`, `navigateToEvent`, `useAuth`.
- Produces: route `CreateEvent` in `PostStackParamList` (create mode `undefined`, edit mode `{ eventId }`). EventDetail (Task 6) navigates here for edit.

- [ ] **Step 1: Implement the screen** (`src/screens/events/CreateEventScreen.tsx`)

```tsx
import React, { useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Circle, Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../../hooks/useAuth';
import { useUserLocation } from '../../hooks/useUserLocation';
import { supabase } from '../../lib/supabase';
import { shareEvent } from '../../lib/share';
import { navigateToEvent } from '../../lib/navigationRef';
import { toast } from '../../lib/toast';
import { Button, DateTimeField, Input } from '../../components/ui';
import { SaleEvent } from '../../types';

const BRAND = '#1F4D3A';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

// Preset radii (OTA constraint: no slider dependency in the binary).
const RADII = [
  { label: '¼ mi', m: 400 },
  { label: '½ mi', m: 800 },
  { label: '¾ mi', m: 1200 },
  { label: '1 mi', m: 1600 },
];

const DEFAULT_CENTER = { latitude: 40.1934, longitude: -85.3864 }; // Muncie fallback

export default function CreateEventScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const editingId: string | undefined = route.params?.eventId;
  const { user } = useAuth();
  const userLocation = useUserLocation();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [center, setCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [radiusM, setRadiusM] = useState(800);
  const [saving, setSaving] = useState(false);

  // Edit mode: hydrate the form once.
  useEffect(() => {
    if (!editingId) return;
    supabase.from('sale_events').select('*').eq('id', editingId).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setTitle(data.title);
        setDescription(data.description ?? '');
        setStartDate(data.start_date);
        setEndDate(data.end_date);
        setCenter({ latitude: data.latitude, longitude: data.longitude });
        setRadiusM(data.radius_m);
      });
  }, [editingId]);

  // Default the pin to the user's location once it resolves (create mode).
  useEffect(() => {
    if (!editingId && !center && userLocation) {
      setCenter({ latitude: userLocation.latitude, longitude: userLocation.longitude });
    }
  }, [userLocation, center, editingId]);

  const mapCenter = center ?? userLocation ?? DEFAULT_CENTER;
  const valid =
    title.trim().length > 0 && startDate && endDate && endDate >= startDate && center;

  const save = async () => {
    if (!user || !valid || !center) return;
    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase.from('sale_events').update({
          title: title.trim(),
          description: description.trim() || null,
          start_date: startDate,
          end_date: endDate,
          latitude: center.latitude,
          longitude: center.longitude,
          radius_m: radiusM,
        }).eq('id', editingId);
        if (error) throw error;
        toast.success('Event updated');
        navigation.goBack();
        return;
      }
      const { data, error } = await supabase.from('sale_events').insert({
        organizer_id: user.id,
        title: title.trim(),
        description: description.trim() || null,
        start_date: startDate,
        end_date: endDate,
        latitude: center.latitude,
        longitude: center.longitude,
        radius_m: radiusM,
      }).select().single();
      if (error) throw error;
      toast.success('Neighborhood sale created');
      navigation.goBack();
      navigateToEvent({ eventId: data.id });
      // Offer the share sheet right away — the link is the recruiting tool.
      shareEvent(data as SaleEvent);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={INK} />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: INK }}>
              {editingId ? 'Edit neighborhood sale' : 'Host a neighborhood sale'}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={{ gap: 16 }}>
            <Input label="Name" value={title} onChangeText={setTitle}
              placeholder="Maple Grove Neighborhood Sale" autoCapitalize="words" />
            <Input label="Description (optional)" value={description} onChangeText={setDescription}
              placeholder="30+ households, rain or shine!" multiline />
            <DateTimeField label="First day" mode="date" value={startDate}
              onChange={(v) => { setStartDate(v); if (!endDate || endDate < v) setEndDate(v); }}
              min={new Date()} />
            <DateTimeField label="Last day" mode="date" value={endDate}
              onChange={setEndDate} min={new Date()} />

            <View>
              <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: '600', color: '#3F3F46' }}>
                Neighborhood area
              </Text>
              <Text style={{ marginBottom: 8, fontSize: 12.5, color: INK_MUTED }}>
                Tap the map to place the center, then pick a size. Sales posted
                inside the circle get invited to join.
              </Text>
              <View style={{ height: 260, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: HAIRLINE }}>
                <MapView
                  style={{ flex: 1 }}
                  initialRegion={{ ...mapCenter, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
                  onPress={(e) => setCenter(e.nativeEvent.coordinate)}
                >
                  {center && (
                    <>
                      <Marker coordinate={center} draggable
                        onDragEnd={(e) => setCenter(e.nativeEvent.coordinate)} />
                      <Circle center={center} radius={radiusM}
                        strokeColor="rgba(31,77,58,0.5)" fillColor="rgba(31,77,58,0.10)" />
                    </>
                  )}
                </MapView>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                {RADII.map((r) => (
                  <Pressable key={r.m} onPress={() => setRadiusM(r.m)}
                    accessibilityRole="button" accessibilityLabel={`Radius ${r.label}`}
                    style={{
                      flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                      borderWidth: 1,
                      borderColor: radiusM === r.m ? BRAND : HAIRLINE,
                      backgroundColor: radiusM === r.m ? '#E8EFE9' : '#fff',
                    }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: radiusM === r.m ? BRAND : INK }}>
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Button size="lg" onPress={save} loading={saving} disabled={!valid || saving}>
              {editingId ? 'Save changes' : 'Create & share'}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
```

Note: cover photo upload is deliberately omitted from the form in v1 implementation — `cover_url` stays in the schema; the event page falls back to a brand tile. (Spec lists cover as optional; skipping the upload flow keeps this task shippable. If the user wants covers, it's a small follow-up.)

- [ ] **Step 2: PostMenu third option** (modify `src/components/PostMenu.tsx`)

Add to `Props`: `onPickEvent: () => void;` and destructure it. After the "An item" `PostRow` add:

```tsx
          <PostRow
            iconBg="bg-brand-soft"
            iconColor="#1F4D3A"
            iconName="home-outline"
            title="A neighborhood sale"
            subtitle="Rally your street — one event, many sales"
            onPress={() => {
              onClose();
              onPickEvent();
            }}
          />
```

- [ ] **Step 3: Navigation wiring** (modify `src/navigation/index.tsx`)

1. Import the screen: `import CreateEventScreen from '../screens/events/CreateEventScreen';`
2. In `PostFlowNavigator`, register: `<PostStack.Screen name="CreateEvent" component={CreateEventScreen} />`
3. In `MainTabs`, next to `handlePickSale`:
```tsx
  const handlePickEvent = () => {
    navigationRef.navigate('PostFlow' as any, { screen: 'CreateEvent' } as any);
  };
```
4. Pass it: `<PostMenu ... onPickEvent={handlePickEvent} />`

(The Post tab button is already guest-gated; no additional gating needed.)

- [ ] **Step 4: Gates + commit**

Run: `npx tsc --noEmit && npx jest && rm -rf dist && SENTRY_DISABLE_AUTO_UPLOAD=true CI=1 npx expo export --platform ios`
Expected: all green.

```bash
git add src/screens/events/CreateEventScreen.tsx src/components/PostMenu.tsx src/navigation/index.tsx
git commit -m "feat: host-a-neighborhood-sale flow (create/edit screen + post menu entry)"
```

---

### Task 6: EventDetailScreen + registrations + deep link

**Files:**
- Create: `src/screens/events/EventDetailScreen.tsx`
- Modify: `src/navigation/index.tsx`

**Interfaces:**
- Consumes: `useSaleEvent`, `useSaleEvents` types, `shareEvent`, `useAuth`, `promptSignIn`, `useUserLocation`, `haversineMeters`, `SaleCard` (`{sale, index, density:'comfy'|'compact', userLat?, userLng?, onPress}`), `remove_sale_from_event` RPC, `event_saves` table, `expo-notifications`.
- Produces: route `EventDetail` on Map + Listings stacks; deep link path `event/:slug`.

- [ ] **Step 1: Implement the screen** (`src/screens/events/EventDetailScreen.tsx`)

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Circle, Marker } from 'react-native-maps';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../../hooks/useAuth';
import { useSaleEvent } from '../../hooks/useSaleEvents';
import { useUserLocation } from '../../hooks/useUserLocation';
import { haversineMeters } from '../../utils/distance';
import { supabase } from '../../lib/supabase';
import { shareEvent } from '../../lib/share';
import { promptSignIn } from '../../lib/guestGate';
import { toast } from '../../lib/toast';
import SaleCard from '../../components/SaleCard';

const BRAND = '#1F4D3A';
const BONE = '#F7F2E8';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';

const REMINDER_KEY = (eventId: string) => `trove:event-reminder:${eventId}`;

function prettyRange(start: string, end: string): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  };
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

export default function EventDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { eventId, slug } = route.params ?? {};
  const { user } = useAuth();
  const userLocation = useUserLocation();
  const { event, sales, loading, refetch } = useSaleEvent({ eventId, slug });
  const [saved, setSaved] = useState(false);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  // Saved state
  useEffect(() => {
    if (!user || !event) { setSaved(false); return; }
    supabase.from('event_saves').select('event_id').eq('user_id', user.id)
      .eq('event_id', event.id).maybeSingle()
      .then(({ data }) => setSaved(!!data));
  }, [user, event?.id]);

  const isOrganizer = !!user && !!event && event.organizer_id === user.id;

  const sortedSales = [...sales].sort((a, b) => {
    if (!userLocation) return 0;
    return (
      haversineMeters(userLocation.latitude, userLocation.longitude, a.latitude, a.longitude) -
      haversineMeters(userLocation.latitude, userLocation.longitude, b.latitude, b.longitude)
    );
  });

  const toggleSave = async () => {
    if (!event) return;
    if (!user) { promptSignIn('save this neighborhood sale and get a reminder'); return; }
    if (saved) {
      await supabase.from('event_saves').delete()
        .eq('user_id', user.id).eq('event_id', event.id);
      const notifId = await AsyncStorage.getItem(REMINDER_KEY(event.id));
      if (notifId) {
        await Notifications.cancelScheduledNotificationAsync(notifId).catch(() => {});
        await AsyncStorage.removeItem(REMINDER_KEY(event.id));
      }
      setSaved(false);
      return;
    }
    await supabase.from('event_saves').insert({ user_id: user.id, event_id: event.id });
    setSaved(true);
    // Local reminder, 9 AM on the first day (spec §"Reminders").
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') {
      const [y, m, d] = event.start_date.split('-').map(Number);
      const when = new Date(y, m - 1, d, 9, 0, 0);
      if (when > new Date()) {
        const notifId = await Notifications.scheduleNotificationAsync({
          content: {
            title: event.title,
            body: `Starts today — ${sales.length || 'the'} sales in the neighborhood. Happy hunting!`,
          },
          trigger: when as any,
        });
        await AsyncStorage.setItem(REMINDER_KEY(event.id), notifId);
      }
    }
    toast.success('Saved — we’ll remind you the morning it starts');
  };

  const removeSale = (saleId: string, title: string) => {
    Alert.alert('Remove from event?', `“${title}” stays live — it just leaves this neighborhood sale.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('remove_sale_from_event', { p_sale_id: saleId });
          if (error) { toast.error('Could not remove'); return; }
          toast.success('Removed');
          refetch();
        },
      },
    ]);
  };

  const deleteEvent = () => {
    if (!event) return;
    Alert.alert('Delete this neighborhood sale?',
      'Member sales stay live and keep their own pages — only the event and its map circle go away.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('sale_events').delete().eq('id', event.id);
            if (error) { toast.error('Could not delete'); return; }
            toast.success('Event deleted');
            navigation.goBack();
          },
        },
      ]);
  };

  if (loading && !event) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BONE }}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BONE }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="home-outline" size={36} color={INK_MUTED} />
          <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '700', color: INK }}>
            This neighborhood sale is gone
          </Text>
          <Text style={{ marginTop: 6, fontSize: 13, color: INK_MUTED, textAlign: 'center' }}>
            The organizer may have removed it.
          </Text>
          <Pressable onPress={() => navigation.goBack()} style={{ marginTop: 16 }}
            accessibilityRole="button" accessibilityLabel="Go back">
            <Text style={{ color: BRAND, fontWeight: '700' }}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BONE }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Header row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}
            accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={24} color={INK} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => shareEvent(event)} hitSlop={8}
            accessibilityRole="button" accessibilityLabel="Share event">
            <Ionicons name="share-outline" size={22} color={INK} />
          </Pressable>
          {isOrganizer && (
            <Pressable
              onPress={() =>
                Alert.alert(event.title, undefined, [
                  { text: 'Edit', onPress: () => navigation.navigate('PostFlow' as any, { screen: 'CreateEvent', params: { eventId: event.id } } as any) },
                  { text: 'Delete event', style: 'destructive', onPress: deleteEvent },
                  { text: 'Cancel', style: 'cancel' },
                ])
              }
              hitSlop={8} accessibilityRole="button" accessibilityLabel="Organizer options">
              <Ionicons name="ellipsis-horizontal" size={22} color={INK} />
            </Pressable>
          )}
        </View>

        {/* Title block */}
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: '#E8EFE9', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="home" size={22} color={BRAND} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 21, fontWeight: '800', color: INK, letterSpacing: -0.4 }}>
                {event.title}
              </Text>
              <Text style={{ fontSize: 13, color: INK_MUTED, marginTop: 1 }}>
                {prettyRange(event.start_date, event.end_date)} · {sales.length}{' '}
                {sales.length === 1 ? 'sale' : 'sales'}
                {event.organizer?.display_name ? ` · hosted by ${event.organizer.display_name}` : ''}
              </Text>
            </View>
          </View>
          {event.description ? (
            <Text style={{ marginTop: 10, fontSize: 14, lineHeight: 20, color: INK }}>
              {event.description}
            </Text>
          ) : null}
        </View>

        {/* Mini-map */}
        <View style={{ height: 180, borderRadius: 16, overflow: 'hidden', marginHorizontal: 16, marginTop: 14, borderWidth: 1, borderColor: HAIRLINE }}>
          <MapView
            style={{ flex: 1 }}
            pointerEvents="none"
            initialRegion={{
              latitude: event.latitude, longitude: event.longitude,
              latitudeDelta: Math.max(0.02, (event.radius_m / 111000) * 3),
              longitudeDelta: Math.max(0.02, (event.radius_m / 111000) * 3),
            }}
          >
            <Circle center={{ latitude: event.latitude, longitude: event.longitude }}
              radius={event.radius_m}
              strokeColor="rgba(31,77,58,0.5)" fillColor="rgba(31,77,58,0.10)" />
            {sales.map((s) => (
              <Marker key={s.id}
                coordinate={{ latitude: s.latitude, longitude: s.longitude }}
                anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND, borderWidth: 1.5, borderColor: '#fff' }} />
              </Marker>
            ))}
          </MapView>
        </View>

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 12 }}>
          <Pressable onPress={toggleSave}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
              paddingVertical: 12, borderRadius: 12,
              backgroundColor: saved ? '#E8EFE9' : BRAND,
              borderWidth: saved ? 1 : 0, borderColor: BRAND,
            }}
            accessibilityRole="button"
            accessibilityLabel={saved ? 'Remove reminder' : 'Save and remind me'}>
            <Ionicons name={saved ? 'notifications' : 'notifications-outline'} size={15}
              color={saved ? BRAND : '#fff'} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: saved ? BRAND : '#fff' }}>
              {saved ? 'Reminder set' : 'Save & remind me'}
            </Text>
          </Pressable>
        </View>

        {/* Roster */}
        <Text style={{ marginTop: 20, marginBottom: 8, marginHorizontal: 20, fontSize: 12, fontWeight: '700', color: INK_MUTED, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Sales in this event
        </Text>
        {sortedSales.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 28, paddingHorizontal: 32 }}>
            <Text style={{ fontSize: 13.5, color: INK_MUTED, textAlign: 'center' }}>
              No sales have joined yet. Share the event link with your neighbors —
              anyone who posts a sale inside the circle gets invited automatically.
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 12 }}>
            {sortedSales.map((s, i) => (
              <View key={s.id}>
                <SaleCard
                  sale={s} index={i} density="compact"
                  userLat={userLocation?.latitude} userLng={userLocation?.longitude}
                  onPress={() => navigation.navigate('SaleDetail', { saleId: s.id })}
                />
                {isOrganizer && (
                  <Pressable onPress={() => removeSale(s.id, s.title)}
                    style={{ alignSelf: 'flex-end', marginTop: -6, marginBottom: 8, marginRight: 6 }}
                    accessibilityRole="button" accessibilityLabel={`Remove ${s.title} from event`}>
                    <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#A23E2D' }}>
                      Remove from event
                    </Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Register + deep link** (modify `src/navigation/index.tsx`)

1. `import EventDetailScreen from '../screens/events/EventDetailScreen';`
2. Map stack (after `SaleDetail`):
```tsx
      <MapStack.Screen name="EventDetail" component={EventDetailScreen}
        options={{ headerShown: false }} />
```
3. Listings stack (after its `SaleDetail`): same one-liner with `ListingsStack.Screen`.
4. Linking config — in the `Map.screens` block add: `EventDetail: 'event/:slug',`

- [ ] **Step 3: Gates + commit**

Run: `npx tsc --noEmit && npx jest && rm -rf dist && SENTRY_DISABLE_AUTO_UPLOAD=true CI=1 npx expo export --platform ios`
Expected: all green.

```bash
git add src/screens/events/EventDetailScreen.tsx src/navigation/index.tsx
git commit -m "feat: neighborhood sale event page (roster, save-&-remind, organizer tools, deep link)"
```

---

### Task 7: Map layer on MapHome

**Files:**
- Modify: `src/screens/map/MapHomeScreen.tsx`

**Interfaces:**
- Consumes: `useSaleEvents()`; `Circle` (add to the existing `react-native-maps` import); existing `navigation`.
- Produces: event markers/circles on the main map.

- [ ] **Step 1: Wire the layer**

1. Change the maps import to `import MapView, { Circle, Marker, Region } from 'react-native-maps';`
2. `import { useSaleEvents } from '../../hooks/useSaleEvents';`
3. In the component body (near `useSales`): `const { events: saleEvents } = useSaleEvents();`
4. Inside the `<MapView>` children, after the existing sale `Marker` mapping block, add:

```tsx
        {/* Neighborhood sale events — additive layer (spec: thinning untouched). */}
        {saleEvents.map((ev) => (
          <React.Fragment key={ev.id}>
            <Circle
              center={{ latitude: ev.latitude, longitude: ev.longitude }}
              radius={ev.radius_m}
              strokeColor="rgba(31,77,58,0.40)"
              fillColor="rgba(31,77,58,0.07)"
            />
            <Marker
              coordinate={{ latitude: ev.latitude, longitude: ev.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              onPress={() => navigation.navigate('EventDetail', { eventId: ev.id })}
            >
              <View
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: '#1F4D3A', paddingHorizontal: 9, paddingVertical: 5,
                  borderRadius: 999, borderWidth: 1.5, borderColor: '#fff',
                  shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4,
                  shadowOffset: { width: 0, height: 2 }, elevation: 3,
                }}
              >
                <Ionicons name="home" size={11} color="#fff" />
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>
                  {ev.sale_count ?? 0}
                </Text>
              </View>
            </Marker>
          </React.Fragment>
        ))}
```

- [ ] **Step 2: Gates + commit**

Run: `npx tsc --noEmit && npx jest && rm -rf dist && SENTRY_DISABLE_AUTO_UPLOAD=true CI=1 npx expo export --platform ios`
Expected: all green.

```bash
git add src/screens/map/MapHomeScreen.tsx
git commit -m "feat: event markers + boundary circles on the map"
```

---

### Task 8: CreateSale integration (prefill + proximity prompt)

**Files:**
- Modify: `src/screens/sale/CreateSaleScreen.tsx`

**Interfaces:**
- Consumes: route params `{ eventId?, presetStart?, presetEnd? }` (Task 2 types); `eventMatchForSale`; `EventJoinPrompt`; `supabase`; AsyncStorage.
- Produces: sales created from an event link join instantly; other new sales trigger the prompt.

- [ ] **Step 1: Params + prefill**

Add imports:
```tsx
import { useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SaleEvent } from '../../types';
import { eventMatchForSale } from '../../lib/eventMatch';
import { EventJoinPrompt } from '../../components/EventJoinPrompt';
```
In the component body (top, near other state):
```tsx
  const route = useRoute<any>();
  const eventIdParam: string | undefined = route.params?.eventId;
  const [joinPrompt, setJoinPrompt] = useState<{
    event: SaleEvent; saleId: string; saleStart: string; saleEnd: string;
  } | null>(null);

  // Event-link joins arrive with the event's dates prefilled (spec §2).
  useEffect(() => {
    const { presetStart, presetEnd } = route.params ?? {};
    if (presetStart && !startDate) setStartDate(presetStart);
    if (presetEnd && !endDate) setEndDate(presetEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 2: Insert + post-save prompt**

In the insert payload add: `event_id: eventIdParam ?? null,`

Replace the success tail (`toast.success('Sale posted'); navigation.goBack();`) with:

```tsx
      // Proximity prompt (spec §3, door two): location-only match against
      // upcoming events, skipped when the sale already joined via link or
      // this device previously declined this event.
      if (!eventIdParam) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: events } = await supabase
          .from('sale_events').select('*').gte('end_date', today);
        const match = eventMatchForSale(sale, (events as SaleEvent[]) ?? [], today);
        if (match) {
          const declined = await AsyncStorage.getItem(
            `trove:event-prompt-declined:${match.id}`,
          );
          if (!declined) {
            toast.success('Sale posted');
            setSubmitting(false);
            setJoinPrompt({
              event: match, saleId: sale.id,
              saleStart: sale.start_date, saleEnd: sale.end_date,
            });
            return; // prompt handlers perform the final goBack()
          }
        }
      }
      toast.success('Sale posted');
      navigation.goBack();
```

- [ ] **Step 3: Prompt handlers + render**

Add next to the other handlers:

```tsx
  const handleJoinEvent = async (moveDates: boolean) => {
    if (!joinPrompt) return;
    const patch: Record<string, unknown> = { event_id: joinPrompt.event.id };
    if (moveDates) {
      patch.start_date = joinPrompt.event.start_date;
      patch.end_date = joinPrompt.event.end_date;
    }
    const { error } = await supabase
      .from('sales').update(patch).eq('id', joinPrompt.saleId);
    if (error) toast.error("Couldn't join the event");
    else toast.success(`Joined ${joinPrompt.event.title}`);
    setJoinPrompt(null);
    navigation.goBack();
  };

  const handleDeclineEvent = async () => {
    if (!joinPrompt) return;
    await AsyncStorage.setItem(
      `trove:event-prompt-declined:${joinPrompt.event.id}`, '1',
    ).catch(() => {});
    setJoinPrompt(null);
    navigation.goBack();
  };
```

At the bottom of the returned JSX (inside the outermost container, after existing content):

```tsx
      {joinPrompt && (
        <EventJoinPrompt
          visible
          event={joinPrompt.event}
          saleStart={joinPrompt.saleStart}
          saleEnd={joinPrompt.saleEnd}
          onJoin={handleJoinEvent}
          onDecline={handleDeclineEvent}
        />
      )}
```

- [ ] **Step 4: "Add your sale" CTA on EventDetail**

(Small follow-through in `src/screens/events/EventDetailScreen.tsx`, actions row —
add before the save button; joins door one.)

```tsx
          {!isOrganizer && (
            <Pressable
              onPress={() => {
                if (!user) { promptSignIn('add your sale to this neighborhood event'); return; }
                navigation.navigate('PostFlow' as any, {
                  screen: 'CreateSale',
                  params: {
                    eventId: event.id,
                    presetStart: event.start_date,
                    presetEnd: event.end_date,
                  },
                } as any);
              }}
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: BRAND, backgroundColor: '#fff',
              }}
              accessibilityRole="button" accessibilityLabel="Add your sale to this event">
              <Ionicons name="add" size={16} color={BRAND} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: BRAND }}>Add your sale</Text>
            </Pressable>
          )}
```
Note: `PostFlow` is only registered for signed-in users, and the CTA sign-in-gates guests first, so the navigate is safe.

- [ ] **Step 5: Gates + commit**

Run: `npx tsc --noEmit && npx jest && rm -rf dist && SENTRY_DISABLE_AUTO_UPLOAD=true CI=1 npx expo export --platform ios`
Expected: all green (211 tests).

```bash
git add src/screens/sale/CreateSaleScreen.tsx src/screens/events/EventDetailScreen.tsx
git commit -m "feat: event joins - link prefill door + post-create proximity prompt with date nudge"
```

---

### Task 9: Web share landing

**Files:**
- Modify: `site/vercel.json`
- Modify: `site/open.html`

- [ ] **Step 1: Rewrite rule** — in `site/vercel.json` `routes`, after the sale/listing route add:

```json
    { "src": "^/event/[a-z0-9]+$", "dest": "/open.html" },
```

- [ ] **Step 2: open.html event path** — in the `<script>` block, replace the path regex line with:

```js
        var m = location.pathname.match(/^\/(sale|listing|event)\/([A-Za-z0-9-]+)/);
```
and extend the headline branch:

```js
          if (m[1] === 'listing') {
            document.getElementById('headline').textContent = 'Open this listing in Trove';
          } else if (m[1] === 'event') {
            document.getElementById('headline').textContent = 'Open this neighborhood sale in Trove';
            document.getElementById('subline').textContent =
              'A whole neighborhood is selling at once — see every sale on the map in the Trove app.';
          } else {
            document.getElementById('headline').textContent = 'Open this sale in Trove';
          }
```

- [ ] **Step 3: Deploy + verify + commit**

Run (from `site/`): `npx vercel deploy --prod --yes`
Then: `curl -s -o /dev/null -w "%{http_code}" -L "https://trove.sale/event/testslug1"` → expect `200`.
⚠️ After deploying, run `git diff .gitignore` — the Vercel CLI sometimes appends to it; revert any change (fingerprint hazard).

```bash
git add site/vercel.json site/open.html
git commit -m "feat: trove.sale/event/<slug> share landing"
```

---

### Task 10: Ship + smoke test

- [ ] **Step 1: Full gates** — `npx tsc --noEmit && npx jest && npx eslint src && rm -rf dist && SENTRY_DISABLE_AUTO_UPLOAD=true CI=1 npx expo export --platform ios` — all green.
- [ ] **Step 2: Push** — `git push origin main`.
- [ ] **Step 3: OTA** — `SENTRY_DISABLE_AUTO_UPLOAD=true CI=1 npx eas update --branch production --message "feat: neighborhood sales v1" --non-interactive`
  **Verify the printed iOS `Runtime version` equals `13ae0c60e5076289ce40f51bf3d5ab10f1b1810a`.** If it differs, STOP — something native-relevant changed; diagnose with `npx eas fingerprint:compare` before proceeding.
- [ ] **Step 4: On-device smoke (user)** — relaunch twice, then:
  1. Post menu → "A neighborhood sale" → create with area + dates → share sheet shows `trove.sale/event/<slug>`.
  2. Map shows the green count-pill marker + circle; tapping opens the event page.
  3. Second account: open the shared link → event page → "Add your sale" → dates arrive prefilled → post → sale appears in the roster.
  4. Third account (or same second one, new sale): post a sale inside the circle *without* the link → proximity prompt appears; test the "move my sale" path re-dates it.
  5. Organizer: remove a member sale; edit the event; verify delete leaves the member sales alive.
  6. Save & remind on a device → iOS Settings shows a pending notification (or wait for 9 AM day-of).

---

## Self-Review Notes

- Spec coverage: every spec section maps to a task (schema→1, matcher→2, hooks/share→3, prompt→4, organizer flow→5, event page/reminders/deep link→6, map→7, joins→8, site→9, ship→10). Cover-photo *upload UI* deliberately deferred (schema supports it) — recorded in Task 5.
- Types consistent: `eventMatchForSale(sale, events, todayIso)`, `EventJoinPrompt` props, `useSaleEvent({eventId, slug})`, `navigateToEvent({eventId, slug})` used identically across tasks.
- No placeholders: every code step contains the actual code.
