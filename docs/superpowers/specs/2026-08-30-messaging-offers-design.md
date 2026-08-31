# Messaging: quick replies, structured offers, seller-controlled holds

Design doc. Brainstormed 2026-08-30. Supersedes the placeholder in
`docs/MESSAGING.md:213-215` ("Structured offers — a separate row type with a
price, an accept/decline button, and a state machine. Worth its own design doc
when we get there.").

## Summary

Trove's messaging works but is thin: 1:1 threads scoped to a sale or listing,
photos, read state, archive, push. It has no vocabulary for the thing the app
exists to do — agreeing on a price for a used item.

This adds three things, in order of how cheap they are relative to what they buy:

1. **Quick-reply starters** — one-tap openers on sale/listing detail.
2. **Structured offers** — a buyer names a price; the seller gets Accept /
   Counter / Decline inline in the thread.
3. **Seller-controlled holds** — accepting an offer puts the listing on hold for
   that buyer until the seller releases it or marks it sold.

### Why this order

Production usage as of 2026-08-30: **6 conversations, 24 messages, 3 distinct
senders out of 36 users**, 5 of 6 conversations on listings, 4.8 messages per
conversation.

The threads that start go fine. Almost nobody starts one. Quick replies attack
the step where the funnel actually dies (the blank composer) and are a small
fraction of the work, so they ship first even though offers are the larger
feature.

The 5:1 listing-to-sale conversation ratio also confirms offers belong on
listings only.

## Decisions (settled during brainstorming)

| Decision | Rationale |
|---|---|
| Offers are a **message kind**, not a separate table | Pre-registered intent in `docs/MESSAGING.md:213`. The existing realtime subscription, push trigger, and thread ordering all come free. A future "Offers inbox" is a view over `messages where kind='offer'`. |
| Mutations go through **SECURITY DEFINER RPCs**, never an UPDATE policy on `messages` | The repo deliberately has no UPDATE/DELETE policies on `messages` ("keeps the moderation trail intact", `20260524120000_messaging.sql:112-113`). Postgres RLS cannot restrict *which columns* change, so a seller-scoped UPDATE policy would also let a seller rewrite the buyer's message text. |
| **No hold expiry.** Only the seller changes status | User decision. A timer could sell an item out from under a committed buyer. Rot is addressed with visibility, not automation. |
| Hold occupancy lives in a **`listing_holds` side table**, not a `held_for` column on `listings` | `listings` SELECT policy is `using (true)` and the publishable key ships in the app binary — verified live that anon can read arbitrary listing columns. A `held_for` column would let anyone enumerate who is holding what. |
| Offers apply to **listing conversations only** | A yard sale event has no single price. Sale threads get quick replies and live status only. |
| Every offer/system message carries **human-readable body text** | Three independent consumers require it: the `messages_body_or_image_check` constraint, `notify-new-message` (400s on a body-less row), and `useInbox`'s preview (`body ?? '📷 Photo'`). One decision satisfies all three. |
| Offer state transitions live in **`src/lib/offers.ts`** as pure functions | Mirrors `src/lib/eventMatch.ts` — the neighborhood-sales feature's testable-logic extraction. Screens and hooks both import it. |

## Data model

### `messages` — three new columns

```
kind          text not null default 'text'   -- 'text' | 'offer' | 'system'
offer_amount  numeric(10,2)                  -- non-null iff kind='offer'
offer_status  text                           -- non-null iff kind='offer'
recipient_id  uuid                           -- non-null iff kind='system'
```

`offer_status` ∈ `pending | accepted | declined | countered`.

`recipient_id` exists because `notify-new-message` derives the recipient as
`buyer_id === senderId ? seller_id : buyer_id` — a ternary that **fails open**:
a non-participant sender silently pushes to `buyer_id`. System notices have no
meaningful "other party", so the RPC states the recipient explicitly and the
edge function uses it when present. This also lets us fix the fails-open bug.

`kind` defaults to `'text'` so all 24 existing rows remain valid with no backfill.

### `messages_body_or_image_check` — widened a third time

Currently `(body is null or len 1..2000) and (body is not null or image_url is not null)`.
Since every offer/system row carries body text, the constraint does **not** need
to admit body-less rows. It needs no change. Recorded here because the first
instinct — "add `or kind in ('offer','system')`" — is the wrong fix and would
silently permit rows that break push and inbox preview.

### `listing_holds` — new table

```
listing_id   uuid primary key references listings(id) on delete cascade
buyer_id     uuid not null references profiles(id) on delete cascade
offer_id     uuid references messages(id) on delete set null
created_at   timestamptz not null default now()
```

Primary key on `listing_id` enforces one hold per listing. RLS: the listing
owner and the held buyer may select; nobody may write directly (RPCs only).

The public signal that an item is spoken for stays `listings.status = 'pending'`,
which is already shipped and already renders. Only *who* it is held for is
protected.

### Types (`src/types/index.ts`)

```ts
export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'countered';
export type MessageKind = 'text' | 'offer' | 'system';
```

New `Message` fields are **optional** (`offer_amount?: number | null`) so every
existing construction site — notably the optimistic-send literal at
`useConversation.ts:304-311` — keeps compiling. `kind` is required with a
default at the DB level but optional client-side for the same reason.

## RLS and RPCs

Four RPCs, all `security definer`, `set search_path = public, pg_temp`, params
`p_`-prefixed, locals `v_`-prefixed, `revoke execute from public, anon` +
`grant execute to authenticated`. Template per `set_conversation_archived`.

| RPC | Who | Does |
|---|---|---|
| `send_offer(p_conversation_id, p_amount)` | any participant, listing conversations only | Inserts `kind='offer'` row with composed body. Rejects if the target is a sale, or if the caller already has a pending offer. **If the caller owns the listing** it is a counter and requires an existing pending offer from the buyer, which it stamps `countered` in the same transaction; a listing owner cannot open a negotiation against themselves. |
| `respond_to_offer(p_offer_id, p_action)` | listing owner only | `accept` \| `decline`. Flips `offer_status`, and on accept sets `listings.status='pending'`, upserts `listing_holds`, inserts a system message. |
| `release_hold(p_listing_id)` | listing owner | Deletes the hold, sets status back to `available`, inserts a system message so the buyer isn't left guessing. |
| `mark_listing_sold(p_listing_id)` | listing owner | Sets `sold`, deletes the hold, inserts a system message. |

A counter-offer is not a distinct RPC — it is `send_offer` from the seller, which
stamps the prior pending offer `countered` in the same transaction.

### Pre-existing holes fixed while we're here

- **`listings` UPDATE policy has no `WITH CHECK`.** `using ((select auth.uid()) = user_id)`
  validates the pre-image only, so an owner can currently `set user_id = <someone else>`
  and orphan a row. Add `with check ((select auth.uid()) = user_id)`.
- **Rate limiter counts every row per sender** (20/rolling minute,
  `20260524120000_messaging.sql:157-176`) and aborts the transaction. System rows
  generated by an RPC would eat a human's budget and a burst could trip it. Add
  `and kind = 'text'` to the count.
- **Review eligibility counts raw messages with no `kind` filter**
  (`20260617180000_reviews_require_real_thread.sql`). Auto-generated system rows
  would let two users unlock reviewing each other without a real exchange —
  precisely the loophole that migration exists to close. Add `kind = 'text'`.

## Flows

### Quick replies

Chips on `ListingDetailScreen` / `SaleDetailScreen` above the message CTA:
"Is this still available?", "What time are you open?", "Can you hold it for me?".

Reuses the **existing** `initialDraft` param
(`MessagesStackParamList.Conversation`, `navigationRef.navigateToConversation`),
which already exists and is documented as "a Make-offer template". The chip
opens the thread with the text pre-filled and the buyer still presses send — it
is never a ghost-written message.

Sale threads get "What time?" and "Still available?"; no offer chip.

### Offer

1. Buyer taps **Make offer** (a fourth sibling in the composer row — the comment
   at `ConversationScreen.tsx:649-653` warns against restructuring that row after
   three regressions), enters an amount.
2. `send_offer` inserts `kind='offer'`, body `"Offered $15 for Vintage Indiana glass"`.
3. Push fires via the existing INSERT trigger, gated on `notify_offers`.
4. Seller sees an offer bubble with Accept / Counter / Decline.
5. `respond_to_offer('accept')` → listing `pending` + hold row + system message
   "Offer accepted — on hold for Kayla" (`recipient_id` = buyer).
6. Seller later taps **Mark sold** or **Release hold** from the thread header or
   My Listings.

Declining touches no listing state. A later accept supersedes.

### Realtime

`useConversation` subscribes to **INSERT only** (`:254-256`), so an
`offer_status` flip would never reach the buyer's open thread. Add a second
`.on(...)` with `event: 'UPDATE'` and a merge handler — `useInbox.ts:253-262`
already demonstrates registering both on one channel. The existing INSERT
handler cannot be reused: it ignores rows it already has.

Verified live: all three triggers on `public.messages` are **AFTER INSERT only**,
so status updates fire no duplicate pushes. `bump_conversation_last_message` is
likewise INSERT-only, so the accompanying system message is what re-sorts the
inbox — which is the desired behavior anyway.

### Push

`notify-new-message` changes:
- Read `kind` (default `'text'`) and `recipient_id`.
- Use `recipient_id` when present; otherwise the existing ternary, **plus** a
  participant assertion and self-guard to close the fails-open path.
- Title: sender name for `text`/`offer`; the listing title (never a person) for
  `system`.
- Pref: `notify_offers` for offers, `notify_messages` for text/system.
- **Keep `channelId: 'messages'`.** Android silently drops notifications on an
  unregistered channel and `usePushNotifications` registers only
  `messages`/`sales`/`nearby`. A dedicated `offers` channel is a v2 item that
  must ship with the registration change.

`profiles.notify_offers` already exists (`20260528130000_reviews_follows.sql:107`),
is typed, and is hidden in `NotificationsScreen` because "no toggles without a
real push path". This feature unhides it.

### Surfaces that need a `pending`/hold branch

`pending` is **already live** — `ListingDetailScreen` has a shipped owner-facing
available/pending/sold control. What's missing:

- `ListingDetailScreen:720` — buyer CTA is gated on `!isOwnListing` only, so
  buyers can still message/offer on a sold or held item. **Pre-existing bug.**
- `MyListingsScreen` `ListingManageRow` — no hold indicator, no Release action.
  This is where a stale hold becomes visible instead of rotting silently.
- `ConversationScreen:172-176` — target card branches on `'sold'` only.
- Saved listings — no pending indicator.
- `site/api/share-page.js` — no status filter on fetch; `renderListing` treats
  anything not `sold` as `InStock` in JSON-LD and leaves it indexable. A held
  listing currently advertises availability to Google. **Pre-existing bug.**
- Two parallel status-write paths exist (`MyListingsScreen:70-88`,
  `ListingDetailScreen:86-99`), both inline `supabase.from('listings').update()`.
  Every transition must now also manage the hold row, so extract one
  `setListingStatus` helper and point both at it — leaving them separate
  guarantees one path forgets.

## Testing

Follows the repo's actual pattern: pure logic and presentational components are
tested; screens and RPCs are not.

- **`src/lib/__tests__/offers.test.ts`** — the core. `canRespond(offer, viewerId,
  listing)`, `nextStatus(offer, action)`, `offerLabel(offer)`, and the guards
  (no offering on your own listing, no second pending offer, sale conversations
  rejected). Modeled on `eventMatch.test.ts`: typed factory with `Partial`
  override, fixed date constants, behavioral test names that encode the rule.
- **`src/components/__tests__/OfferBubble.test.tsx`** — modeled on
  `EventJoinPrompt.test.tsx`. Asserts Accept/Decline/Counter render only for the
  seller and only while pending, and that callbacks fire with exact args.
- **`useInbox` tests** — widen the mocked select shape; assert an offer's preview
  reads as text, not "Tap to view".

No screen tests. No RPC tests (no local Postgres — `db:push` targets production).

## Out of scope (v2 parking lot)

- Offers on sales.
- An "Offers" inbox across conversations.
- A dedicated `offers` Android notification channel.
- Offer expiry of any kind (explicitly rejected).
- Counter-offer threading/history UI beyond `countered` status.
- Message pagination — unbounded today, worsened slightly by offer rows, but
  irrelevant at 24 total messages. Tracked in `docs/SCALING.md`.

## Non-goals

- **No payments, escrow, or in-app money movement.** We declared "no financial
  features" and "no digital purchases" to Google Play on 2026-08-30. An offer is
  a social agreement about a cash, in-person deal. Anything else re-opens the
  financial-features declaration and the store review that goes with it.
- No edit/unsend of messages (`docs/MESSAGING.md:224`, enforced by the absence
  of UPDATE/DELETE policies).
- No shared `colors.ts` refactor. 46 files declare their own `BRAND` const;
  fixing that is a separate change and would make this diff unreviewable.

## Sequencing

Three shippable phases. Each is independently useful and independently
releasable via OTA except where noted.

1. **Quick replies + status gating.** No migration. Chips on detail screens using
   the existing `initialDraft`; gate the buyer CTA on status; pending branches in
   the conversation target card and saved listings. Fixes a live bug and targets
   the measured drop-off.
2. **Offers.** Migration (columns + RPCs + rate-limit and review-gate fixes),
   `src/lib/offers.ts`, offer bubble, composer entry, realtime UPDATE handler,
   edge-function changes, unhide `notify_offers`.
3. **Holds.** `listing_holds`, `setListingStatus` helper, My Listings hold row +
   Release, `WITH CHECK` fix, share-page pending branch.

Phase 2's edge-function change deploys separately from the OTA
(`supabase functions deploy notify-new-message`) and must land **before** the
app OTA, or offers will insert fine and push nothing.

## Migration notes

- Name it after `20260826210000` — timestamps are hand-chosen and sequential.
- Open with a prose header citing this spec path, per
  `20260808090000_neighborhood_sales.sql:1-3`.
- `drop policy if exists` + `create policy`; wrap `auth.uid()` as
  `(select auth.uid())` — `20260618170000_rls_initplan.sql` exists solely to fix
  that repo-wide and a bare call regresses it.
- **Do not** write a migration that reads the `notify-new-message` trigger
  definition. Three migrations already extract the bearer token from it at apply
  time, and that trigger exists only in the dashboard — a fourth dependent
  deepens an existing `db:reset` hazard.
- `npm run db:push` writes to **production**. There is no staging project.
  Additive changes only.

## Docs to update on completion

- `docs/MESSAGING.md` — replace the line 213 placeholder.
- `CLAUDE.md` — the RPC list at :155 is already stale (omits `hide_conversation`,
  `set_conversation_archived`, `my_blocked_user_ids`, `remove_sale_from_event`);
  add the four new ones and fix the omissions.
- `src/lib/analytics.ts` — extend the closed `EventName` union with
  `offer_sent`, `offer_accepted`, `offer_declined`. Amounts are fine as props;
  never message text.
