# Neighborhood Sales — v1 Design

**Date:** 2026-08-07
**Status:** Approved for implementation planning
**Ships as:** JS + database only → OTA to the live build (26). No native changes, no App Review.

## Summary

A **Neighborhood Sale** is an organizer-created event that groups many individual
sales under one banner: a name, a date window, a circular area on the map, and a
roster of member sales. Sales keep their full independent identity (owner,
photos, messaging, dates) — event membership is a nullable foreign key, not a
container.

Real-world anchor: subdivision/block/community-wide sales are the biggest
traffic events in this domain. One organizer recruits dozens of households; each
join is a new Trove user. This is the app's growth loop.

## Decisions (settled during brainstorming)

| Decision | Choice |
|---|---|
| Creation model | Organizer-led creation; **open join** (no approvals); organizer gets a **remove** tool (model "C") |
| Proximity prompt trigger | **Location only** — inside the event circle is enough; date mismatch does NOT suppress the prompt (it becomes a date-alignment nudge instead) |
| Date alignment | Never forced. Mismatched-date joins get a one-tap "move my sale to the event weekend" option, plus "join with my dates" |
| Buyer payoff in v1 | Event page + map treatment + save-with-reminder. **Route planner stays parked** (v2) |
| Area shape | Center pin + radius circle (polygon drawing is v2) |
| Reminders | Device-local scheduled notification (no server cron in v1) |
| Multiple matching events | Prompt only for the **soonest** upcoming match |

## Data model

### New table: `sale_events`

| column | type | notes |
|---|---|---|
| id | uuid pk default gen_random_uuid() | |
| organizer_id | uuid not null → profiles(id) | |
| title | text not null | e.g. "Maple Grove Neighborhood Sale" |
| description | text | |
| cover_url | text | optional; UI falls back to a brand tile |
| start_date | date not null | |
| end_date | date not null | ≥ start_date (check constraint) |
| latitude / longitude | double precision not null | event center |
| radius_m | integer not null default 800 | UI slider 200–2000 m, displayed imperial (~0.1–1.2 mi) |
| share_slug | text unique not null | 8-char lowercase base36, generated at insert |
| created_at / updated_at | timestamptz | updated_at via existing `handle_updated_at` trigger |

### Changed table: `sales`

- `event_id uuid null references sale_events(id) on delete set null`
- Index on `sales(event_id)`.

Deleting an event releases its sales unharmed (`set null`).

### New table: `event_saves`

- `(user_id uuid → profiles, event_id uuid → sale_events on delete cascade)`,
  composite pk, `created_at`. Powers "Save & remind me" and lets a future v2
  move reminders server-side without a schema change.

### RLS (follows the app's existing patterns)

- `sale_events`: SELECT for everyone (`public`, `using (true)`) — guests browse
  events. INSERT/UPDATE/DELETE only where `organizer_id = (select auth.uid())`.
- `sales.event_id`: joining/leaving is the sale **owner** updating their own row
  — already covered by the existing owner-update policy. No new policy.
- `event_saves`: owner-only (all commands, `user_id = (select auth.uid())`).
- Organizer removal crosses ownership, so it is a **`SECURITY DEFINER` RPC**,
  not a policy: `remove_sale_from_event(p_sale_id uuid)` — verifies the caller
  organizes the event the sale belongs to, then nulls `sales.event_id`.
  `set search_path = public, pg_temp`; EXECUTE granted to `authenticated` only.

### Migration

One migration file (`supabase/migrations/…_neighborhood_sales.sql`) applied via
`npm run db:push`, containing: table, FK column, saves table, indexes
(`sales(event_id)`, `sale_events(end_date)`, `sale_events(share_slug)` via the
unique constraint), RLS, the RPC, and grants.

## Matching helper (pure function)

`src/lib/eventMatch.ts`

```
eventMatchForSale(sale: {latitude, longitude}, events: SaleEvent[], today: string):
  SaleEvent | null
```

- Candidate events: `end_date >= today` (upcoming or in progress).
- Inside: `haversineMeters(sale, event) <= event.radius_m` (reuses
  `src/utils/distance.ts`).
- Multiple matches → soonest `start_date` wins; ties → nearest.
- Pure and unit-tested; no I/O.

Dates deliberately do NOT filter matching. A separate helper
`datesOverlap(sale, event): boolean` drives which prompt variant renders.

## Flows

### 1 · Organizer creates an event

- Entry: the Post menu (center **+** tab) gains a third option, **"Host a
  neighborhood sale"** (guests get the existing `promptSignIn` gate).
- `CreateEventScreen`: title, description (optional), start/end dates (reusing
  the date-field patterns from CreateSale), cover photo (optional, existing
  image-picker + compression + `sale-media` bucket upload path), and an area
  picker: a small MapView centered on the user with a draggable pin and a
  radius slider (Circle overlay previews the boundary live).
- On create: navigate to the new EventDetail and open the native share sheet
  with `https://trove.sale/event/<slug>`.

### 2 · Joining — door one: the link

- `trove.sale/event/<slug>`: the existing `site/open.html` landing learns the
  `/event/` path (Vercel rewrite, same mechanism as `/sale/:id`), deep-linking
  to `trove://event/<slug>`.
- App linking config routes `event/<slug>` → EventDetail (slug resolved to id
  by query).
- EventDetail's primary CTA for a signed-in non-member with no sale attached:
  **"Add your sale"** → CreateSale **pre-filled with the event's dates** and
  carrying `eventId`; on save the sale is created already joined (no prompt
  needed). Guests → `promptSignIn`.

### 3 · Joining — door two: the proximity prompt

- After a successful sale creation (CreateSaleScreen post-save, before the
  normal post-save navigation), fetch upcoming events (`end_date >= today` —
  a tiny table at current scale) and run `eventMatchForSale`.
- No match, or sale already carries `event_id` → nothing happens.
- Match → bottom-sheet prompt, date-aware:
  - **Dates overlap:** "Your sale is inside the *{title}* ({date range}) —
    want to be part of it?" → **Join** / **No thanks**.
  - **Dates differ:** "The *{title}* runs {event range}. Your sale is set for
    {sale range}." → **Join & move my sale to that weekend** (sets the sale's
    start/end to the event's) / **Join with my dates** / **No thanks**.
- Join = update own sale's `event_id` (+ dates if chosen). Decline is recorded
  in AsyncStorage (`trove:event-prompt-declined:<eventId>`) — that event never
  re-prompts on this device.
- v1 scope: the prompt fires on **create** only (editing a sale into range is
  v2, listed in the parking lot).

### 4 · Organizer control

- EventDetail, viewed by the organizer: an Edit action (same form as create),
  a Delete action (destructive confirm; FK releases member sales), and a
  per-member-sale **Remove from event** action calling the RPC.
- No join notifications, approvals, or announcements in v1.

## Map treatment (additive, minimal)

- New hook `useSaleEvents()` fetches events with `end_date >= today` (plain
  fetch + focus refresh; no realtime channel in v1).
- MapHome renders, per event: a **distinct event marker** at the center —
  visually unlike sale dots (brand-green house/flag tile with the member count,
  e.g. "🏘 23") — and a **soft boundary Circle** (react-native-maps `Circle`,
  already compiled into the binary) with a translucent brand fill.
- Member sales keep their normal individual pins; the pin-thinning algorithm is
  untouched. The event layer is purely additive.
- Tapping the event marker → EventDetail.

## EventDetail screen (the buyer payoff)

Registered in the Map stack and Listings stack (same dual-registration pattern
as SaleDetail), plus reachable via deep link.

Content: cover (or brand-tile fallback), title, date range, organizer (name →
PublicProfile), description, mini-map with the boundary circle and member pins,
then the roster: member sales as rows (existing SaleCard in compact density),
**sorted by distance from the user**, each opening the normal SaleDetail.

Actions:
- **Save & remind me** — inserts into `event_saves` and schedules a
  **device-local notification** (expo-notifications, already in the binary) for
  9:00 AM on `start_date`: "The {title} starts today — {n} sales nearby."
  Unsaving deletes the row and cancels the scheduled notification. Guests →
  `promptSignIn`.
- **Share** — the web link via the existing `share.ts` pattern
  (`shareEvent(event)` added alongside `shareSale`/`shareListing`).

Guest mode: the whole page is viewable; "Add your sale" and "Save & remind me"
are gated.

## Site changes

- `site/vercel.json`: rewrite `^/event/[a-z0-9]+$` → `/open.html`.
- `site/open.html`: recognize the `/event/` path (headline "Open this
  neighborhood sale in Trove", deep link `trove://event/<slug>`).

## Testing

- **Unit (jest):** `eventMatchForSale` — inside/outside radius, boundary
  equality, ended events excluded, soonest-of-several, tie-goes-nearest;
  `datesOverlap` edge cases (adjacent days, single-day events); slug generator
  shape/uniqueness-retry.
- **RTL:** join-prompt component renders the correct variant (overlap vs
  mismatch) and fires the right mutation per button.
- **RLS/RPC verification against production** (session pattern): stranger
  cannot update someone else's event; organizer RPC removes a member sale;
  non-organizer RPC call is rejected; guest can read events.
- **Manual smoke:** create event → share link on a second device → join via
  link; post an in-radius sale from a third account → prompt appears → date
  nudge path re-dates the sale; organizer removes a sale; save event →
  scheduled notification present (device settings).

## Out of scope (v2 parking lot)

Route planner integration ("Plan my route" through an event), approval-mode
joins, organizer announcements/participant chat, polygon boundaries, printable
flyer/QR generator, server-side reminders (pg_cron), organizer analytics,
prompts when *editing* a sale into range, event discovery rail beyond the map,
join notifications to the organizer.

## Non-goals

- Events do not change sale ownership, messaging, or RLS on sales.
- No new native dependencies or permissions — v1 must remain OTA-compatible
  with build 26's fingerprint.
