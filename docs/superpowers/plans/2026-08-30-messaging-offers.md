# Messaging: Quick Replies, Offers, and Holds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Trove's messaging a vocabulary for agreeing on a price — one-tap conversation starters, structured offers with accept/counter/decline, and seller-controlled holds on listings.

**Architecture:** Offers are a new *kind* of row in the existing `messages` table, so the current realtime subscription, push trigger, and thread ordering all work unchanged. Every mutation that crosses ownership goes through a `SECURITY DEFINER` RPC, because `messages` deliberately has no UPDATE policy and Postgres RLS cannot restrict which columns change. Who a listing is held for lives in a separate `listing_holds` table, because `listings` is world-readable.

**Tech Stack:** React Native (Expo SDK 54), TypeScript strict, Supabase (Postgres + RLS + Realtime + Edge Functions), Jest + jest-expo, @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-08-30-messaging-offers-design.md`

## Global Constraints

- **`npm run db:push` writes to PRODUCTION.** There is no staging Supabase project. Migrations must be additive and idempotent (`add column if not exists`, `drop policy if exists`). Never write a destructive migration.
- **Migration filenames are hand-chosen and sequential.** The latest existing is `20260826210000`. Use exactly the timestamps given in each task.
- **Every migration opens with a prose header comment** explaining *why*, citing the spec path `docs/superpowers/specs/2026-08-30-messaging-offers-design.md`.
- **Wrap `auth.uid()` as `(select auth.uid())`** inside every RLS policy. `20260618170000_rls_initplan.sql` exists solely to fix this repo-wide; a bare call regresses it and trips the Supabase performance advisor.
- **Every `SECURITY DEFINER` function** sets `set search_path = public, pg_temp`, prefixes params `p_` and locals `v_`, and ends with the pair `revoke execute on function public.NAME(SIG) from public, anon;` / `grant execute on function public.NAME(SIG) to authenticated;`.
- **Do NOT write a migration that reads the `notify-new-message` trigger definition.** Three migrations already extract the bearer token from it at apply time; that trigger exists only in the Supabase dashboard, and a fourth dependent deepens an existing `db:reset` hazard.
- **No payments, escrow, or money movement.** Trove declared "no financial features" to Google Play on 2026-08-30. An offer is a social agreement about a cash, in-person deal.
- **Money is `numeric(10,2)`** — matches `listings.price` (verified in production).
- **Do not introduce a shared `colors.ts`.** 46 files declare their own `BRAND` const. Match the file you are in: `src/components/ui/` primitives use NativeWind `className`; everything else declares a local const block and uses inline `style={{}}`.
- **No screen tests.** This repo tests pure logic (`src/lib`, `src/utils`), some hooks, and presentational components. Zero screen tests exist. Do not add the first one.
- **Run `npm run typecheck` and `npm test` before every commit.**

## File Structure

**Created:**
- `supabase/migrations/20260830100000_message_offers.sql` — offer columns, constraint, RPCs, rate-limit + review-gate fixes
- `supabase/migrations/20260830100100_listing_holds.sql` — holds table, RLS, hold RPCs, `WITH CHECK` fix
- `src/lib/offers.ts` — pure offer logic (the only place transition rules live)
- `src/lib/__tests__/offers.test.ts`
- `src/components/OfferBubble.tsx` — presentational offer row
- `src/components/__tests__/OfferBubble.test.tsx`
- `src/components/QuickReplyChips.tsx` — presentational starter chips
- `src/lib/listingStatus.ts` — the single write path for status + hold transitions

**Modified:**
- `src/types/index.ts` — `OfferStatus`, `MessageKind`, `Message` fields, `Listing` unchanged
- `src/hooks/useConversation.ts` — offer send, realtime UPDATE handler
- `src/hooks/useInbox.ts` — widen select, preview text
- `src/screens/messages/ConversationScreen.tsx` — offer composer entry, bubble render, pending target card
- `src/screens/listings/ListingDetailScreen.tsx` — quick replies, CTA status gate, use shared helper
- `src/screens/profile/MyListingsScreen.tsx` — hold row + Release, use shared helper
- `src/screens/map/SaleDetailScreen.tsx` — quick replies
- `src/screens/profile/NotificationsScreen.tsx` — unhide `notify_offers`
- `src/lib/analytics.ts` — extend `EventName`
- `supabase/functions/notify-new-message/index.ts` — kind-aware push
- `site/api/share-page.js` — pending branch
- `docs/MESSAGING.md`, `CLAUDE.md`

---

# Phase 1 — Quick replies and status gating

No migration. Ships via OTA. Targets the measured drop-off (3 senders / 36 users).

### Task 1: Quick-reply starter chips

**Files:**
- Create: `src/components/QuickReplyChips.tsx`
- Modify: `src/screens/listings/ListingDetailScreen.tsx`, `src/screens/map/SaleDetailScreen.tsx`

**Interfaces:**
- Consumes: `Chip` from `src/components/ui`, `navigateToConversation(conversationId, opts?: { initialDraft?: string })` from `src/lib/navigationRef.ts`, `useStartConversation()` from `src/hooks/useConversation.ts`
- Produces: `<QuickReplyChips prompts={string[]} onPick={(text: string) => void} />`

**Context:** The `initialDraft` mechanism already exists — `MessagesStackParamList.Conversation` carries it (`src/types/index.ts:277-278`), `ConversationScreen` consumes it as a `useState` initializer (`:301-304`), and `navigateToConversation` plumbs it (`src/lib/navigationRef.ts:29`). You are adding a UI affordance for a path that already works. The buyer still presses send — never auto-send.

- [ ] **Step 1: Create the presentational component**

```tsx
// src/components/QuickReplyChips.tsx
import React from 'react';
import { View, ScrollView } from 'react-native';
import { Chip } from './ui';

/**
 * One-tap conversation starters. Purely presentational — the parent
 * decides what a pick does (we pre-fill the composer, never auto-send,
 * so the buyer always owns the message they appear to have written).
 */
export function QuickReplyChips({
  prompts,
  onPick,
}: {
  prompts: string[];
  onPick: (text: string) => void;
}) {
  if (prompts.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
    >
      {prompts.map((p) => (
        <Chip
          key={p}
          label={p}
          tone="tonal"
          onPress={() => onPick(p)}
          accessibilityLabel={`Send: ${p}`}
        />
      ))}
      <View style={{ width: 8 }} />
    </ScrollView>
  );
}
```

- [ ] **Step 2: Verify Chip's actual props before wiring**

Run: `sed -n '1,40p' src/components/ui/Chip.tsx`
Expected: confirms `label: string` (not children), `tone?: 'default' | 'active' | 'tonal'`, and that it forwards `onPress`. If `tone="tonal"` does not exist, use `tone="default"` — do not add a new tone in this task.

- [ ] **Step 3: Wire into ListingDetailScreen**

Find the existing "Message seller" CTA (around `:720`). Directly above it, for non-owners only, render:

```tsx
{!isOwnListing && listing.status === 'available' && (
  <QuickReplyChips
    prompts={[
      'Is this still available?',
      'Can you hold it for me?',
      'Where can I pick it up?',
    ]}
    onPick={(text) => startConversationWithDraft(text)}
  />
)}
```

Where `startConversationWithDraft` reuses the screen's existing message-seller handler, passing `{ initialDraft: text }` through to `navigateToConversation`. Do not duplicate the conversation-creation logic — call the same function the CTA already calls, with the extra argument.

- [ ] **Step 4: Wire into SaleDetailScreen**

Same placement relative to its message CTA, with sale-appropriate prompts (a yard sale has no single price, so no "hold it" prompt):

```tsx
prompts={['Is your sale still on?', 'What time are you open?', 'Do you have any tools?']}
```

- [ ] **Step 5: Typecheck and test**

Run: `npm run typecheck && npm test`
Expected: tsc clean, all suites pass (no new tests in this task — the component has no logic to test; it is a thin wrapper over `Chip`).

- [ ] **Step 6: Commit**

```bash
git add src/components/QuickReplyChips.tsx src/screens/listings/ListingDetailScreen.tsx src/screens/map/SaleDetailScreen.tsx
git commit -m "feat(messages): one-tap conversation starters on sale and listing detail"
```

---

### Task 2: Gate contact actions on item status

**Files:**
- Modify: `src/screens/listings/ListingDetailScreen.tsx:720` (sticky CTA), `src/screens/messages/ConversationScreen.tsx:172-176` (target card)

**Interfaces:**
- Consumes: `Listing.status` (`'available' | 'sold' | 'pending'`), `ConversationTarget` listing variant (already types `status`)
- Produces: nothing new

**Context:** This is a pre-existing bug, not new work. `ListingDetailScreen:720` gates the buyer CTA on `!isOwnListing` only, so a buyer can still start a negotiation over a sold item. The conversation target card branches on `'sold'` only and renders a held item as plainly available.

- [ ] **Step 1: Gate the sticky CTA**

At `ListingDetailScreen:720`, the CTA currently renders when `!isOwnListing`. Change the condition to also require the item be obtainable, and render an explanatory disabled state otherwise:

```tsx
{!isOwnListing && (
  listing.status === 'available' ? (
    /* existing CTA unchanged */
  ) : (
    <View style={{ padding: 14, borderRadius: 12, backgroundColor: BONE, alignItems: 'center' }}>
      <Text style={{ fontSize: 13.5, fontWeight: '700', color: INK_MUTED }}>
        {listing.status === 'sold' ? 'This item has sold' : 'This item is on hold'}
      </Text>
    </View>
  )
)}
```

Use the local const block already declared at the top of that file. Do not introduce new colors.

- [ ] **Step 2: Add the pending branch to the conversation target card**

At `ConversationScreen.tsx:172-176`, the card branches on `'sold'`. Extend to three states so a held item reads correctly mid-thread:

```tsx
{target.status === 'sold' ? (
  <Text style={{ fontSize: 12, fontWeight: '800', color: '#A23E2D' }}>SOLD</Text>
) : target.status === 'pending' ? (
  <Text style={{ fontSize: 12, fontWeight: '800', color: '#B8772C' }}>ON HOLD</Text>
) : null}
```

`#B8772C` is the amber already used for the PENDING pill at `ListingDetailScreen:465-497` — match it exactly rather than inventing a shade.

- [ ] **Step 3: Typecheck and test**

Run: `npm run typecheck && npm test`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/screens/listings/ListingDetailScreen.tsx src/screens/messages/ConversationScreen.tsx
git commit -m "fix(listings): don't offer to message about a sold or held item"
```

---

# Phase 2 — Structured offers

### Task 3: Offers migration

**Files:**
- Create: `supabase/migrations/20260830100000_message_offers.sql`

**Interfaces:**
- Produces: columns `messages.kind`, `messages.offer_amount`, `messages.offer_status`, `messages.recipient_id`; RPCs `send_offer(uuid, numeric) returns uuid` and `respond_to_offer(uuid, text) returns void`

**Context:** `messages` has no UPDATE policy by design. All mutation is via these RPCs. The `messages_body_or_image_check` constraint is deliberately **not** widened — every offer and system row carries readable body text, which the push function and inbox preview both require.

- [ ] **Step 1: Write the migration**

```sql
-- Structured offers (spec: docs/superpowers/specs/2026-08-30-messaging-offers-design.md)
--
-- Offers are a KIND of message, not a separate table: the existing realtime
-- subscription, the notify-new-message trigger, and thread ordering all work
-- unchanged. Mutation goes through definer RPCs because messages deliberately
-- has no UPDATE policy (20260524120000_messaging.sql:112-113) and because RLS
-- cannot restrict WHICH columns an update touches -- a seller-scoped UPDATE
-- policy would also let a seller rewrite the buyer's message text.
--
-- Every offer/system row carries human-readable body text. Three consumers
-- require it: messages_body_or_image_check, notify-new-message (400s on a
-- body-less row), and useInbox's `body ?? '[photo]'` preview. So the check
-- constraint is deliberately NOT widened here.

alter table public.messages
  add column if not exists kind text not null default 'text',
  add column if not exists offer_amount numeric(10,2),
  add column if not exists offer_status text,
  add column if not exists recipient_id uuid references public.profiles(id) on delete set null;

alter table public.messages drop constraint if exists messages_kind_ck;
alter table public.messages
  add constraint messages_kind_ck check (kind in ('text', 'offer', 'system'));

alter table public.messages drop constraint if exists messages_offer_fields_ck;
alter table public.messages
  add constraint messages_offer_fields_ck check (
    (kind = 'offer' and offer_amount is not null and offer_status is not null)
    or (kind <> 'offer' and offer_amount is null and offer_status is null)
  );

alter table public.messages drop constraint if exists messages_offer_status_ck;
alter table public.messages
  add constraint messages_offer_status_ck check (
    offer_status is null
    or offer_status in ('pending', 'accepted', 'declined', 'countered')
  );

create index if not exists messages_pending_offers_idx
  on public.messages (conversation_id)
  where kind = 'offer' and offer_status = 'pending';

-- Rate limit: system rows are generated by RPCs, not typed by a human. Counting
-- them would let an accepted offer eat the sender's 20/minute budget and a burst
-- could abort the whole transaction (errcode P0001).
create or replace function public.check_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recent integer;
begin
  select count(*) into v_recent
  from public.messages
  where sender_id = new.sender_id
    and kind = 'text'
    and created_at > now() - interval '1 minute';

  if v_recent >= 20 then
    raise exception 'Slow down -- too many messages' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke execute on function public.check_message_rate_limit() from public, anon, authenticated;

-- Review eligibility must count only human messages. Auto-generated system rows
-- would otherwise let two users unlock reviewing each other without a real
-- exchange -- the exact loophole 20260617180000_reviews_require_real_thread.sql
-- was written to close.
create or replace function public.can_review(p_subject_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ok  boolean;
begin
  if v_uid is null or v_uid = p_subject_id then
    return false;
  end if;

  select exists (
    select 1
    from public.conversations c
    where ((c.buyer_id = v_uid and c.seller_id = p_subject_id)
        or (c.seller_id = v_uid and c.buyer_id = p_subject_id))
      and (select count(*) from public.messages m
           where m.conversation_id = c.id and m.sender_id = v_uid
             and m.kind = 'text') >= 2
      and (select count(*) from public.messages m
           where m.conversation_id = c.id and m.sender_id = p_subject_id
             and m.kind = 'text') >= 1
  ) into v_ok;

  return v_ok;
end;
$$;

revoke execute on function public.can_review(uuid) from public, anon;
grant   execute on function public.can_review(uuid) to authenticated;

-- Send (or counter) an offer. Crosses ownership: stamps the other party's
-- pending offer as countered, so it cannot be a plain INSERT policy.
create or replace function public.send_offer(
  p_conversation_id uuid,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_conv     record;
  v_listing  record;
  v_is_owner boolean;
  v_pending  uuid;
  v_body     text;
  v_id       uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > 99999999 then
    raise exception 'invalid amount';
  end if;

  select id, buyer_id, seller_id, target_type, target_id
    into v_conv
  from public.conversations
  where id = p_conversation_id;

  if not found then
    raise exception 'conversation not found';
  end if;

  if v_uid <> v_conv.buyer_id and v_uid <> v_conv.seller_id then
    raise exception 'not a participant';
  end if;

  if v_conv.target_type <> 'listing' then
    raise exception 'offers are only supported on listings';
  end if;

  select id, user_id, title, status into v_listing
  from public.listings
  where id = v_conv.target_id;

  if not found then
    raise exception 'listing not found';
  end if;

  if v_listing.status = 'sold' then
    raise exception 'listing already sold';
  end if;

  v_is_owner := (v_listing.user_id = v_uid);

  -- Caller already has an offer awaiting a response.
  select id into v_pending
  from public.messages
  where conversation_id = p_conversation_id
    and kind = 'offer' and offer_status = 'pending' and sender_id = v_uid
  limit 1;

  if v_pending is not null then
    raise exception 'you already have a pending offer';
  end if;

  if v_is_owner then
    -- The owner may only COUNTER an existing offer, never open a negotiation
    -- against their own item.
    select id into v_pending
    from public.messages
    where conversation_id = p_conversation_id
      and kind = 'offer' and offer_status = 'pending' and sender_id <> v_uid
    limit 1;

    if v_pending is null then
      raise exception 'nothing to counter';
    end if;

    update public.messages set offer_status = 'countered' where id = v_pending;
  end if;

  v_body := 'Offered $' || trim(to_char(p_amount, 'FM999999990.00'))
            || ' for ' || v_listing.title;

  insert into public.messages
    (conversation_id, sender_id, body, kind, offer_amount, offer_status)
  values
    (p_conversation_id, v_uid, v_body, 'offer', p_amount, 'pending')
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.send_offer(uuid, numeric) from public, anon;
grant   execute on function public.send_offer(uuid, numeric) to authenticated;

-- Accept or decline. Only the listing owner may respond. Accept also holds the
-- item; the hold table itself arrives in 20260830100100.
create or replace function public.respond_to_offer(
  p_offer_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_msg     record;
  v_conv    record;
  v_listing record;
  v_buyer   uuid;
  v_body    text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_action not in ('accept', 'decline') then
    raise exception 'invalid action';
  end if;

  select id, conversation_id, sender_id, offer_amount, offer_status, kind
    into v_msg
  from public.messages
  where id = p_offer_id;

  if not found or v_msg.kind <> 'offer' then
    raise exception 'offer not found';
  end if;

  if v_msg.offer_status <> 'pending' then
    raise exception 'offer is no longer pending';
  end if;

  select id, buyer_id, seller_id, target_type, target_id
    into v_conv
  from public.conversations where id = v_msg.conversation_id;

  select id, user_id, title into v_listing
  from public.listings where id = v_conv.target_id;

  if v_listing.user_id <> v_uid then
    raise exception 'only the listing owner can respond';
  end if;

  v_buyer := v_msg.sender_id;

  update public.messages
  set offer_status = case when p_action = 'accept' then 'accepted' else 'declined' end
  where id = p_offer_id;

  if p_action = 'accept' then
    update public.listings set status = 'pending' where id = v_listing.id;
    v_body := 'Offer accepted -- $'
              || trim(to_char(v_msg.offer_amount, 'FM999999990.00'))
              || '. This item is on hold.';
  else
    v_body := 'Offer declined.';
  end if;

  insert into public.messages
    (conversation_id, sender_id, body, kind, recipient_id)
  values
    (v_msg.conversation_id, v_uid, v_body, 'system', v_buyer);
end;
$$;

revoke execute on function public.respond_to_offer(uuid, text) from public, anon;
grant   execute on function public.respond_to_offer(uuid, text) to authenticated;
```

- [ ] **Step 2: Verify the SQL parses without applying it**

Run: `npx supabase db lint --schema public` (if it errors on connectivity, skip — Step 3 is the real gate)
Expected: no syntax errors reported.

- [ ] **Step 3: Push to production and verify**

Run: `npm run db:push`
Then verify:
```bash
npx supabase db query --linked "select column_name from information_schema.columns where table_schema='public' and table_name='messages' and column_name in ('kind','offer_amount','offer_status','recipient_id') order by column_name"
```
Expected: four rows — `kind`, `offer_amount`, `offer_status`, `recipient_id`.

Then confirm existing rows survived:
```bash
npx supabase db query --linked "select kind, count(*) from public.messages group by kind"
```
Expected: one row, `text | 24` (all pre-existing messages defaulted correctly).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260830100000_message_offers.sql
git commit -m "feat(db): offer columns and RPCs on messages

Also fixes two latent issues the audit surfaced: the rate limiter now
counts only human text (system rows generated by an RPC would otherwise
eat a sender's 20/min budget and abort the transaction), and review
eligibility now counts only text messages so auto-generated system rows
can't unlock reviews without a real exchange."
```

---

### Task 4: Types and pure offer logic (TDD)

**Files:**
- Create: `src/lib/offers.ts`, `src/lib/__tests__/offers.test.ts`
- Modify: `src/types/index.ts`

**Interfaces:**
- Produces: `OfferStatus`, `MessageKind` types; `canRespondToOffer()`, `offerStatusLabel()`, `formatOfferAmount()`, `isOfferMessage()`

**Context:** Model this on `src/lib/eventMatch.ts` + its test — the neighborhood-sales feature extracted decision logic into a pure module so hooks and components could share one source of truth and it could be tested without a DB. New `Message` fields must be **optional** so the optimistic-send literal at `useConversation.ts:304-311` keeps compiling.

- [ ] **Step 1: Add the types**

In `src/types/index.ts`, immediately above `export interface Message`:

```ts
export type MessageKind = 'text' | 'offer' | 'system';
export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'countered';
```

And extend `Message` (keep existing fields; add these):

```ts
  /** 'text' for everything sent before offers shipped. */
  kind?: MessageKind;
  /** Set iff kind === 'offer'. */
  offer_amount?: number | null;
  offer_status?: OfferStatus | null;
  /** Set iff kind === 'system' — who the notice is FOR. */
  recipient_id?: string | null;
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/__tests__/offers.test.ts
import { Message } from '../../types';
import {
  canRespondToOffer,
  formatOfferAmount,
  isOfferMessage,
  offerStatusLabel,
} from '../offers';

const msg = (o: Partial<Message>): Message => ({
  id: 'm1',
  conversation_id: 'c1',
  sender_id: 'buyer',
  body: 'Offered $15 for Thing',
  created_at: '2026-08-30T12:00:00Z',
  kind: 'offer',
  offer_amount: 15,
  offer_status: 'pending',
  ...o,
});

describe('isOfferMessage', () => {
  it('treats a row with no kind as text (rows sent before offers shipped)', () => {
    expect(isOfferMessage(msg({ kind: undefined }))).toBe(false);
  });

  it('identifies an offer row', () => {
    expect(isOfferMessage(msg({}))).toBe(true);
  });
});

describe('canRespondToOffer', () => {
  it('lets the listing owner respond to a pending offer', () => {
    expect(canRespondToOffer(msg({}), 'seller', 'seller')).toBe(true);
  });

  it('does NOT let the buyer respond to their own offer', () => {
    expect(canRespondToOffer(msg({}), 'buyer', 'seller')).toBe(false);
  });

  it('does NOT let a non-owner respond even if they are in the thread', () => {
    expect(canRespondToOffer(msg({}), 'buyer', 'seller')).toBe(false);
  });

  it('does NOT allow responding twice — only pending offers are actionable', () => {
    expect(canRespondToOffer(msg({ offer_status: 'accepted' }), 'seller', 'seller')).toBe(false);
    expect(canRespondToOffer(msg({ offer_status: 'countered' }), 'seller', 'seller')).toBe(false);
  });

  it('returns false for a signed-out viewer', () => {
    expect(canRespondToOffer(msg({}), null, 'seller')).toBe(false);
  });

  it('returns false for a non-offer row', () => {
    expect(canRespondToOffer(msg({ kind: 'text', offer_status: null }), 'seller', 'seller')).toBe(false);
  });
});

describe('formatOfferAmount', () => {
  it('drops cents on a whole-dollar amount', () => {
    expect(formatOfferAmount(15)).toBe('$15');
  });

  it('keeps cents when they are significant', () => {
    expect(formatOfferAmount(15.5)).toBe('$15.50');
  });

  it('handles null defensively (a malformed row must not crash the thread)', () => {
    expect(formatOfferAmount(null)).toBe('');
  });
});

describe('offerStatusLabel', () => {
  it('reads as plain English for each state', () => {
    expect(offerStatusLabel('pending')).toBe('Pending');
    expect(offerStatusLabel('accepted')).toBe('Accepted');
    expect(offerStatusLabel('declined')).toBe('Declined');
    expect(offerStatusLabel('countered')).toBe('Countered');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest src/lib/__tests__/offers.test.ts`
Expected: FAIL — `Cannot find module '../offers'`.

- [ ] **Step 4: Implement**

```ts
// src/lib/offers.ts
import { Message, OfferStatus } from '../types';

/**
 * Offer rules, in one place. Both the thread UI and the hook import these so
 * "can this person act on this offer?" is answered identically everywhere.
 * Mirrors src/lib/eventMatch.ts — pure, no Supabase, trivially testable.
 */

/** Rows written before offers shipped have no `kind`; they are text. */
export function isOfferMessage(m: Message): boolean {
  return m.kind === 'offer';
}

/**
 * Only the listing's owner can accept or decline, only while pending, and
 * never their own offer. The server enforces this too (respond_to_offer);
 * this is the client-side mirror so we don't render dead buttons.
 */
export function canRespondToOffer(
  m: Message,
  viewerId: string | null | undefined,
  listingOwnerId: string | null | undefined,
): boolean {
  if (!viewerId || !listingOwnerId) return false;
  if (!isOfferMessage(m)) return false;
  if (m.offer_status !== 'pending') return false;
  if (viewerId !== listingOwnerId) return false;
  if (m.sender_id === viewerId) return false;
  return true;
}

export function formatOfferAmount(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '';
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

export function offerStatusLabel(status: OfferStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'accepted':
      return 'Accepted';
    case 'declined':
      return 'Declined';
    case 'countered':
      return 'Countered';
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/lib/__tests__/offers.test.ts && npm run typecheck`
Expected: PASS, 12 tests. tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/offers.ts src/lib/__tests__/offers.test.ts src/types/index.ts
git commit -m "feat(offers): offer types and pure transition rules"
```

---

### Task 5: OfferBubble component (TDD)

**Files:**
- Create: `src/components/OfferBubble.tsx`, `src/components/__tests__/OfferBubble.test.tsx`

**Interfaces:**
- Consumes: `canRespondToOffer`, `formatOfferAmount`, `offerStatusLabel` from `src/lib/offers`
- Produces: `<OfferBubble message viewerId listingOwnerId onAccept onDecline onCounter />`

**Context:** Model on `src/components/EventJoinPrompt.tsx` (presentational, fully controlled, inline prop type literal, JSDoc on semantically distinct callbacks) and its test. Declare a local color const block; do not use NativeWind here.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/__tests__/OfferBubble.test.tsx
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { OfferBubble } from '../OfferBubble';
import { Message } from '../../types';

const offer = (o: Partial<Message> = {}): Message => ({
  id: 'm1',
  conversation_id: 'c1',
  sender_id: 'buyer',
  body: 'Offered $15 for Thing',
  created_at: '2026-08-30T12:00:00Z',
  kind: 'offer',
  offer_amount: 15,
  offer_status: 'pending',
  ...o,
});

describe('OfferBubble', () => {
  it('shows the amount', async () => {
    await render(
      <OfferBubble message={offer()} viewerId="seller" listingOwnerId="seller"
        onAccept={jest.fn()} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    expect(screen.getByText(/\$15/)).toBeTruthy();
  });

  it('shows actions to the listing owner while pending', async () => {
    await render(
      <OfferBubble message={offer()} viewerId="seller" listingOwnerId="seller"
        onAccept={jest.fn()} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    expect(screen.getByText('Accept')).toBeTruthy();
    expect(screen.getByText('Decline')).toBeTruthy();
  });

  it('hides actions from the buyer who sent it', async () => {
    await render(
      <OfferBubble message={offer()} viewerId="buyer" listingOwnerId="seller"
        onAccept={jest.fn()} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    expect(screen.queryByText('Accept')).toBeNull();
  });

  it('hides actions once the offer is resolved', async () => {
    await render(
      <OfferBubble message={offer({ offer_status: 'accepted' })} viewerId="seller"
        listingOwnerId="seller" onAccept={jest.fn()} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.getByText('Accepted')).toBeTruthy();
  });

  it('calls onAccept when Accept is pressed', async () => {
    const onAccept = jest.fn();
    await render(
      <OfferBubble message={offer()} viewerId="seller" listingOwnerId="seller"
        onAccept={onAccept} onDecline={jest.fn()} onCounter={jest.fn()} />,
    );
    await act(async () => { fireEvent.press(screen.getByText('Accept')); });
    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/components/__tests__/OfferBubble.test.tsx`
Expected: FAIL — cannot find `../OfferBubble`.

- [ ] **Step 3: Implement**

```tsx
// src/components/OfferBubble.tsx
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Message } from '../types';
import { canRespondToOffer, formatOfferAmount, offerStatusLabel } from '../lib/offers';

const BRAND = '#1F4D3A';
const BONE = '#F7F2E8';
const INK = '#171513';
const INK_MUTED = '#8A857C';
const HAIRLINE = '#E5DECC';
const AMBER = '#B8772C';
const ROSE = '#A23E2D';

/**
 * An offer, rendered inline in the thread. Presentational and fully
 * controlled — it decides what to SHOW from the offer's state, never what
 * the offer's state should become (that lives in src/lib/offers.ts and,
 * authoritatively, in the respond_to_offer RPC).
 */
export function OfferBubble({
  message,
  viewerId,
  listingOwnerId,
  onAccept,
  onDecline,
  onCounter,
}: {
  message: Message;
  viewerId: string | null | undefined;
  /** Owner of the listing under negotiation — only they may respond. */
  listingOwnerId: string | null | undefined;
  onAccept: () => void;
  onDecline: () => void;
  /** Opens the amount sheet pre-filled — a counter is a new offer. */
  onCounter: () => void;
}) {
  const actionable = canRespondToOffer(message, viewerId, listingOwnerId);
  const status = message.offer_status ?? 'pending';
  const statusColor =
    status === 'accepted' ? BRAND : status === 'declined' ? ROSE : AMBER;

  return (
    <View
      style={{
        alignSelf: 'center',
        width: '86%',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: HAIRLINE,
        borderRadius: 16,
        padding: 14,
        marginVertical: 6,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '800', color: INK_MUTED, letterSpacing: 0.5 }}>
        OFFER
      </Text>
      <Text style={{ fontSize: 26, fontWeight: '800', color: INK, marginTop: 2 }}>
        {formatOfferAmount(message.offer_amount)}
      </Text>
      <Text style={{ fontSize: 12.5, fontWeight: '700', color: statusColor, marginTop: 2 }}>
        {offerStatusLabel(status)}
      </Text>

      {actionable && (
        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          <Pressable
            onPress={onAccept}
            accessibilityRole="button"
            style={{ flex: 1, backgroundColor: BRAND, paddingVertical: 10, borderRadius: 10, alignItems: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13.5 }}>Accept</Text>
          </Pressable>
          <Pressable
            onPress={onCounter}
            accessibilityRole="button"
            style={{ flex: 1, marginLeft: 8, backgroundColor: BONE, paddingVertical: 10, borderRadius: 10, alignItems: 'center' }}
          >
            <Text style={{ color: INK, fontWeight: '800', fontSize: 13.5 }}>Counter</Text>
          </Pressable>
          <Pressable
            onPress={onDecline}
            accessibilityRole="button"
            style={{ flex: 1, marginLeft: 8, paddingVertical: 10, borderRadius: 10, alignItems: 'center' }}
          >
            <Text style={{ color: ROSE, fontWeight: '800', fontSize: 13.5 }}>Decline</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/components/__tests__/OfferBubble.test.tsx && npm run typecheck`
Expected: PASS, 5 tests. tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/OfferBubble.tsx src/components/__tests__/OfferBubble.test.tsx
git commit -m "feat(offers): offer bubble with owner-only accept/counter/decline"
```

---

### Task 6: Hook support — send offers and react to status changes

**Files:**
- Modify: `src/hooks/useConversation.ts`

**Interfaces:**
- Consumes: RPCs `send_offer`, `respond_to_offer`
- Produces: `sendOffer(amount: number): Promise<{ error: string | null }>`, `respondToOffer(offerId: string, action: 'accept' | 'decline'): Promise<{ error: string | null }>` on the `useConversation` return object

**Context:** The realtime subscription at `:252-273` listens for **INSERT only**, so an accepted offer's status flip would never reach the buyer's open thread. The existing INSERT handler cannot be reused for updates — it ignores rows it already has (`prev.some(...) ? prev : [...]`). `useInbox.ts:253-262` already demonstrates registering both event types on one channel.

- [ ] **Step 1: Add an UPDATE handler to the realtime channel**

Immediately after the existing `.on('postgres_changes', { event: 'INSERT', ... })` block (which ends around `:273`), chain a second handler **before** `.subscribe(...)`:

```ts
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const m = payload.new as Message;
          if (m.conversation_id !== conversationId) return;
          // Offer status flips arrive as UPDATEs. The INSERT handler above
          // deliberately ignores rows it already has, so it cannot merge these.
          setMessages((prev) =>
            prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)),
          );
        },
      )
```

- [ ] **Step 2: Add sendOffer and respondToOffer**

Alongside the existing `send`, following its contract exactly — return `{ error }`, never throw (`ConversationScreen` surfaces it via `Alert.alert`):

```ts
  const sendOffer = useCallback(
    async (amount: number): Promise<{ error: string | null }> => {
      const { error } = await supabase.rpc('send_offer', {
        p_conversation_id: conversationId,
        p_amount: amount,
      });
      // The row arrives via the realtime INSERT subscription, so there is no
      // optimistic insert here -- an offer is a server-authoritative object
      // (it can be rejected for a pending duplicate, a sold listing, etc.)
      // and showing it before the server agrees would be a lie.
      return { error: error ? error.message : null };
    },
    [conversationId],
  );

  const respondToOffer = useCallback(
    async (
      offerId: string,
      action: 'accept' | 'decline',
    ): Promise<{ error: string | null }> => {
      const { error } = await supabase.rpc('respond_to_offer', {
        p_offer_id: offerId,
        p_action: action,
      });
      return { error: error ? error.message : null };
    },
    [],
  );
```

Add both to the hook's return object.

- [ ] **Step 3: Typecheck and run the full suite**

Run: `npm run typecheck && npm test`
Expected: tsc clean; all suites pass. If `useInbox` tests fail on a changed mock shape, fix the mock — do not change the hook to satisfy a stale test.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useConversation.ts
git commit -m "feat(offers): send/respond RPCs and realtime UPDATE handling

The message channel listened for INSERT only, so an accepted offer never
reached the other party's open thread."
```

---

### Task 7: Render offers and system messages in the thread

**Files:**
- Modify: `src/screens/messages/ConversationScreen.tsx`

**Interfaces:**
- Consumes: `OfferBubble`, `isOfferMessage` from `src/lib/offers`, `sendOffer`/`respondToOffer` from `useConversation`

**Context:** `MessageBubble` (`:37-153`) branches on field truthiness, not `kind`, and `isMine` is computed at `:629` from `sender_id` — meaningless for a system row, which would otherwise render as a right-aligned green "me" bubble for one party. The composer row at `:654-733` has a comment at `:649-653` warning against restructuring it after three regressions: add the offer entry point as a **fourth sibling**, not a wrapper.

- [ ] **Step 1: Branch the row renderer on kind**

In the `renderItem` for the FlatList (around `:620-640`), before constructing `MessageBubble`:

```tsx
  if (item.message.kind === 'offer') {
    return (
      <OfferBubble
        message={item.message}
        viewerId={user?.id}
        listingOwnerId={target?.kind === 'listing' ? targetOwnerId : null}
        onAccept={() => handleRespond(item.message.id, 'accept')}
        onDecline={() => handleRespond(item.message.id, 'decline')}
        onCounter={() => setOfferSheetOpen(true)}
      />
    );
  }
  if (item.message.kind === 'system') {
    return (
      <Text
        style={{
          alignSelf: 'center',
          maxWidth: '80%',
          textAlign: 'center',
          color: '#8A857C',
          fontSize: 12.5,
          marginVertical: 8,
        }}
      >
        {item.message.body}
      </Text>
    );
  }
```

`targetOwnerId` is the listing's `user_id`. `useConversation` already loads the target; if it does not expose `user_id`, add it to the `ConversationTarget` listing variant (`useConversation.ts:28-34`) and to the select that populates it.

- [ ] **Step 2: Stop offers and system rows from breaking bubble grouping**

`renderItems` (`:392-412`) groups consecutive rows by `sender_id`. Make a non-text row always break the run so a system notice never inherits a neighbor's tail:

```tsx
const isTextRow = (m: Message) => (m.kind ?? 'text') === 'text';
```

Use it in the grouping comparison: two rows group only if both are text rows **and** their `sender_id` matches.

- [ ] **Step 3: Add the offer entry point and amount sheet**

As a fourth sibling in the composer row (do not wrap the existing three), owner-excluded and listing-only:

```tsx
{target?.kind === 'listing' && user?.id !== targetOwnerId && (
  <Pressable
    onPress={() => setOfferSheetOpen(true)}
    accessibilityLabel="Make an offer"
    style={{ paddingHorizontal: 10, justifyContent: 'center' }}
  >
    <Ionicons name="pricetag-outline" size={22} color="#1F4D3A" />
  </Pressable>
)}
```

The sheet is a `Modal` with a numeric `TextInput` and a Send button calling:

```tsx
const handleSendOffer = async (raw: string) => {
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    Alert.alert('Enter an amount', 'Offers must be a positive dollar amount.');
    return;
  }
  const { error } = await sendOffer(amount);
  if (error) Alert.alert('Could not send offer', error);
  else { setOfferSheetOpen(false); track('offer_sent', { conversationId }); }
};

const handleRespond = async (offerId: string, action: 'accept' | 'decline') => {
  const { error } = await respondToOffer(offerId, action);
  if (error) Alert.alert('Could not update offer', error);
  else track(action === 'accept' ? 'offer_accepted' : 'offer_declined', { conversationId });
};
```

- [ ] **Step 4: Typecheck and test**

Run: `npm run typecheck && npm test`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/screens/messages/ConversationScreen.tsx src/hooks/useConversation.ts src/lib/analytics.ts
git commit -m "feat(offers): offer and system rows in the conversation thread"
```

---

### Task 8: Kind-aware push notifications

**Files:**
- Modify: `supabase/functions/notify-new-message/index.ts`, `src/screens/profile/NotificationsScreen.tsx`

**Interfaces:**
- Consumes: `messages.kind`, `messages.recipient_id`, `profiles.notify_offers`

**Context:** The function currently 400s on a body-less row, titles every push with the sender's display name, and derives the recipient with a ternary that **fails open** — a non-participant sender pushes to `buyer_id`. `profiles.notify_offers` already exists (`20260528130000_reviews_follows.sql:107`) and is hidden in settings because there was "no push path yet"; this task creates one.

- [ ] **Step 1: Read kind and recipient_id**

At the payload destructure (`:51-57`), add:

```ts
const kind: string = payload.record?.kind ?? 'text';
const explicitRecipient: string | null = payload.record?.recipient_id ?? null;
```

- [ ] **Step 2: Fix the recipient derivation and close the fails-open path**

Replace the ternary at `:84-86`:

```ts
let recipientId: string;
if (explicitRecipient) {
  recipientId = explicitRecipient;
} else if (senderId === conv.buyer_id) {
  recipientId = conv.seller_id;
} else if (senderId === conv.seller_id) {
  recipientId = conv.buyer_id;
} else {
  // Sender is not a participant. Previously this fell through to buyer_id and
  // pushed a stranger's message to the wrong person.
  return new Response('Sender not a participant', { status: 200 });
}
if (recipientId === senderId) {
  return new Response('Self-notification skipped', { status: 200 });
}
```

- [ ] **Step 3: Gate on the right preference**

At the pref lookup (`:89-98`), select both columns and pick by kind:

```ts
const prefColumn = kind === 'offer' ? 'notify_offers' : 'notify_messages';
// ...select('notify_messages, notify_offers')...
if (profile?.[prefColumn] === false) {
  return new Response('Recipient muted this category', { status: 200 });
}
```

- [ ] **Step 4: Title system notices on the app, not a person**

At title construction (`:120`):

```ts
const title = kind === 'system' ? 'Trove' : (sender?.display_name ?? 'Someone');
```

Leave `channelId: 'messages'` unchanged. Android silently drops notifications on an unregistered channel and `usePushNotifications` registers only `messages`/`sales`/`nearby`; a dedicated `offers` channel is a v2 item that must ship together with its registration.

- [ ] **Step 5: Deploy the function BEFORE the app OTA**

Run: `npx supabase functions deploy notify-new-message`
Expected: deploy succeeds. If this lags the app release, offers will insert correctly and notify nobody.

- [ ] **Step 6: Unhide the offers toggle**

In `NotificationsScreen.tsx`, the comment at `:17-19` explains that only toggles with a real push path are shown. Offers now have one — add the `notify_offers` row alongside `notify_messages`, and update that comment to remove offers from the "no sender yet" list.

- [ ] **Step 7: Typecheck, test, commit**

```bash
npm run typecheck && npm test
git add supabase/functions/notify-new-message/index.ts src/screens/profile/NotificationsScreen.tsx
git commit -m "feat(push): kind-aware notifications and a real offers toggle

Also closes a fails-open bug: a message whose sender was not a
conversation participant pushed to buyer_id unconditionally."
```

---

### Task 9: Inbox preview for offers and system rows

**Files:**
- Modify: `src/hooks/useInbox.ts`

**Context:** The preview is `lastMsg.body ?? (image_url ? '[photo]' : undefined)` at `:199-201`, and the select at `:161-166` does not fetch `kind`. Because every offer/system row carries readable body text, the preview already works — this task widens the select so a future kind-specific prefix is possible and adds a regression test.

- [ ] **Step 1: Widen the select**

At `:161-166`, add `kind` to the selected columns.

- [ ] **Step 2: Add a regression test**

In `src/hooks/__tests__/useInbox.test.ts`, following the file's existing style, assert that an offer row's preview is its body text and not the `'Tap to view'` fallback that `InboxScreen:509` substitutes for undefined.

- [ ] **Step 3: Run, then commit**

```bash
npm test && npm run typecheck
git add src/hooks/useInbox.ts src/hooks/__tests__/useInbox.test.ts
git commit -m "feat(inbox): offer-aware last-message preview"
```

---

# Phase 3 — Seller-controlled holds

### Task 10: Holds migration

**Files:**
- Create: `supabase/migrations/20260830100100_listing_holds.sql`

**Interfaces:**
- Produces: table `listing_holds`; RPCs `release_hold(uuid)`, `mark_listing_sold(uuid)`; accept path now writes a hold

**Context:** `held_for` must NOT be a column on `listings` — that table's SELECT policy is `using (true)` and the publishable key ships in the app binary, so anyone could enumerate who is holding what (verified against the live REST API).

- [ ] **Step 1: Write the migration**

```sql
-- Seller-controlled holds (spec: docs/superpowers/specs/2026-08-30-messaging-offers-design.md)
--
-- Occupancy lives in its own table, NOT as listings.held_for: the listings
-- SELECT policy is `using (true)` and the publishable key ships inside the app
-- binary, so a buyer id on that row would let anyone enumerate who is holding
-- what. The PUBLIC signal stays listings.status = 'pending' (already shipped);
-- only WHO is protected.
--
-- There is deliberately no expiry and no cron job. Only the seller changes the
-- state -- a timer could sell an item out from under a committed buyer.

create table if not exists public.listing_holds (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  buyer_id   uuid not null references public.profiles(id) on delete cascade,
  offer_id   uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.listing_holds enable row level security;

drop policy if exists "Owner or held buyer can read the hold" on public.listing_holds;
create policy "Owner or held buyer can read the hold"
  on public.listing_holds for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or exists (
      select 1 from public.listings l
      where l.id = listing_id and l.user_id = (select auth.uid())
    )
  );

-- No insert/update/delete policies: holds are written only by definer RPCs.

-- Pre-existing hole: the listings UPDATE policy has USING but no WITH CHECK, so
-- an owner can currently reassign user_id and orphan their own row.
drop policy if exists "Users can update own listings" on public.listings;
create policy "Users can update own listings"
  on public.listings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.release_hold(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_hold  record;
  v_conv  uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.listings
    where id = p_listing_id and user_id = v_uid
  ) then
    raise exception 'not the listing owner';
  end if;

  select buyer_id into v_hold from public.listing_holds where listing_id = p_listing_id;

  delete from public.listing_holds where listing_id = p_listing_id;
  update public.listings set status = 'available'
  where id = p_listing_id and status = 'pending';

  if v_hold.buyer_id is not null then
    select id into v_conv from public.conversations
    where target_type = 'listing' and target_id = p_listing_id
      and buyer_id = v_hold.buyer_id
    limit 1;

    if v_conv is not null then
      insert into public.messages
        (conversation_id, sender_id, body, kind, recipient_id)
      values
        (v_conv, v_uid, 'The hold on this item was released.', 'system', v_hold.buyer_id);
    end if;
  end if;
end;
$$;

revoke execute on function public.release_hold(uuid) from public, anon;
grant   execute on function public.release_hold(uuid) to authenticated;

create or replace function public.mark_listing_sold(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_hold record;
  v_conv uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.listings
    where id = p_listing_id and user_id = v_uid
  ) then
    raise exception 'not the listing owner';
  end if;

  select buyer_id into v_hold from public.listing_holds where listing_id = p_listing_id;

  delete from public.listing_holds where listing_id = p_listing_id;
  update public.listings set status = 'sold' where id = p_listing_id;

  if v_hold.buyer_id is not null then
    select id into v_conv from public.conversations
    where target_type = 'listing' and target_id = p_listing_id
      and buyer_id = v_hold.buyer_id
    limit 1;

    if v_conv is not null then
      insert into public.messages
        (conversation_id, sender_id, body, kind, recipient_id)
      values
        (v_conv, v_uid, 'This item is marked sold. Thanks!', 'system', v_hold.buyer_id);
    end if;
  end if;
end;
$$;

revoke execute on function public.mark_listing_sold(uuid) from public, anon;
grant   execute on function public.mark_listing_sold(uuid) to authenticated;
```

- [ ] **Step 2: Extend respond_to_offer to write the hold**

In the same migration, re-declare `respond_to_offer` (full `create or replace`, copying the body from Task 3) with this inserted in the `if p_action = 'accept'` branch, after the `update public.listings`:

```sql
    insert into public.listing_holds (listing_id, buyer_id, offer_id)
    values (v_listing.id, v_buyer, p_offer_id)
    on conflict (listing_id) do update
      set buyer_id = excluded.buyer_id,
          offer_id = excluded.offer_id,
          created_at = now();
```

- [ ] **Step 3: Push and verify**

Run: `npm run db:push`
Then:
```bash
npx supabase db query --linked "select tablename from pg_tables where schemaname='public' and tablename='listing_holds'"
npx supabase db query --linked "select polname, polcmd, pg_get_expr(polwithcheck, polrelid) as with_check from pg_policy where polrelid='public.listings'::regclass and polcmd='w'"
```
Expected: the table exists; the listings UPDATE policy now has a non-null `with_check`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260830100100_listing_holds.sql
git commit -m "feat(db): listing holds, release/sold RPCs, and a WITH CHECK fix

The listings UPDATE policy had USING without WITH CHECK, which let an
owner reassign user_id and orphan their own row."
```

---

### Task 11: One write path for listing status

**Files:**
- Create: `src/lib/listingStatus.ts`
- Modify: `src/screens/listings/ListingDetailScreen.tsx:86-99`, `src/screens/profile/MyListingsScreen.tsx:70-88`

**Interfaces:**
- Produces: `setListingStatus(listingId, next: ListingStatus): Promise<{ error: string | null }>`

**Context:** Two parallel inline `supabase.from('listings').update({ status })` paths exist today. Every transition must now also manage the hold row, so leaving them separate guarantees one path forgets and strands a hold.

- [ ] **Step 1: Create the helper**

```ts
// src/lib/listingStatus.ts
import { supabase } from './supabase';
import { ListingStatus } from '../types';

/**
 * The single write path for a listing's status. Sold and available go through
 * RPCs because they must also clear the hold row atomically; there is no
 * client-side path that can do both, and two screens used to update `status`
 * inline (one of them would inevitably have stranded a hold).
 *
 * 'pending' is intentionally NOT settable here — an item goes on hold only by
 * accepting an offer, which is respond_to_offer's job.
 */
export async function setListingStatus(
  listingId: string,
  next: Exclude<ListingStatus, 'pending'>,
): Promise<{ error: string | null }> {
  const rpc = next === 'sold' ? 'mark_listing_sold' : 'release_hold';
  const { error } = await supabase.rpc(rpc, { p_listing_id: listingId });
  return { error: error ? error.message : null };
}
```

- [ ] **Step 2: Rewire ListingDetailScreen**

Replace the body of `updateStatus` (`:86-99`) to call `setListingStatus`, keeping its existing optimistic-set-then-rollback-on-error structure and its toast. The three-way segmented control at `:528-566` keeps `available` and `sold`; **remove `pending` from the user-selectable options** — it is now a consequence of accepting an offer, not a manual state.

- [ ] **Step 3: Rewire MyListingsScreen**

Point `mutateStatus` (`:70-81`) at `setListingStatus`. Keep the `Alert.alert` confirm in `confirmMarkSold`.

- [ ] **Step 4: Typecheck, test, commit**

```bash
npm run typecheck && npm test
git add src/lib/listingStatus.ts src/screens/listings/ListingDetailScreen.tsx src/screens/profile/MyListingsScreen.tsx
git commit -m "refactor(listings): one write path for status so holds can't be stranded"
```

---

### Task 12: Hold visibility in My Listings

**Files:**
- Modify: `src/screens/profile/MyListingsScreen.tsx` (`ListingManageRow`, `:244` and `:346-354`)

**Context:** With no expiry, an abandoned hold's only failsafe is that the seller can always see it. `ListingManageRow` computes only `const sold = listing.status === 'sold'` and renders "Edit / Share / Mark sold" — a held item currently looks identical to an available one.

- [ ] **Step 1: Fetch holds for the user's listings**

In `useMyListings` (inside `src/hooks/useListings.ts`), after the listings query, fetch the holds the RLS policy permits and hydrate them:

```ts
const { data: holds } = await supabase
  .from('listing_holds')
  .select('listing_id, buyer_id')
  .in('listing_id', ids);
```

Attach `held_for_name` by looking up those buyer profiles (separate query — the repo's no-embed convention, since a PostgREST inner join drops rows whose owner has no profile).

- [ ] **Step 2: Render the hold state**

In `ListingManageRow`, add a third branch alongside `sold`:

```tsx
const onHold = listing.status === 'pending';
```

When `onHold`, show an amber badge reading `On hold for {name}` and replace the "Mark sold" pill row with **Mark sold** and **Release hold**, the latter calling `setListingStatus(listing.id, 'available')` behind an `Alert.alert` confirm modeled on `MySalesScreen.tsx:179-193`.

- [ ] **Step 3: Typecheck, test, commit**

```bash
npm run typecheck && npm test
git add src/screens/profile/MyListingsScreen.tsx src/hooks/useListings.ts
git commit -m "feat(listings): show who an item is held for, with one-tap release"
```

---

### Task 13: Stop advertising held items as in stock

**Files:**
- Modify: `site/api/share-page.js` (`renderListing`, around `:331`, `:348-350`, `:360`, `:367`, `:388`)

**Context:** Pre-existing SEO bug. `const sold = row.status === 'sold'` is the only branch, so JSON-LD emits `schema.org/InStock` and the page stays indexable for a held listing.

- [ ] **Step 1: Add the pending branch**

```js
const sold = row.status === 'sold';
const onHold = row.status === 'pending';
const availability = sold
  ? 'https://schema.org/SoldOut'
  : onHold
    ? 'https://schema.org/LimitedAvailability'
    : 'https://schema.org/InStock';
```

Use `availability` in the JSON-LD at `:348-350`, show an "On hold" state in the visible markup where `sold` is currently branched (`:360`, `:367`), and set `noindex: sold || onHold` at `:388`.

- [ ] **Step 2: Verify locally, then deploy**

Run: `node -e "require('./site/api/share-page.js')"` to confirm it still parses.
Deploy is a separate step from the app OTA:
```bash
cd site && npx vercel deploy --prod --yes
```

- [ ] **Step 3: Commit**

```bash
git add site/api/share-page.js
git commit -m "fix(seo): a held listing no longer advertises as in stock"
```

---

### Task 14: Documentation and ship

**Files:**
- Modify: `docs/MESSAGING.md:213-215`, `CLAUDE.md:155`, `src/lib/analytics.ts`

- [ ] **Step 1: Replace the MESSAGING.md placeholder**

Line 213 currently reads "Structured offers — a separate row type with a price, an accept/decline button, and a state machine. Worth its own design doc when we get there." Replace with a short description of what shipped and a link to the spec.

- [ ] **Step 2: Fix the RPC list in CLAUDE.md**

`:155` lists `start_conversation`, `mark_conversation_read`, `unmark_conversation_read`, `delete_my_account`. It already omits `hide_conversation`, `set_conversation_archived`, `my_blocked_user_ids`, `remove_sale_from_event`. Add those **and** the four new ones (`send_offer`, `respond_to_offer`, `release_hold`, `mark_listing_sold`).

- [ ] **Step 3: Extend the analytics vocabulary**

In `src/lib/analytics.ts`, add `'offer_sent' | 'offer_accepted' | 'offer_declined'` to the closed `EventName` union. Amounts are acceptable props; **never** message text.

- [ ] **Step 4: Full verification**

```bash
npm run typecheck && npm test && npm run lint
```
Expected: all clean.

- [ ] **Step 5: Ship**

```bash
git fetch origin && git status -sb   # confirm not behind — publishing from a
                                     # behind checkout is a rollback, not a deploy
node scripts/check-runtime.mjs       # pinned runtime must match the live build
npx eas update --branch production --message "feat: offers, holds, and quick replies"
node scripts/build-releases.mjs
git add site/releases.json && git commit -m "chore: record the offers OTA in the deployment feed"
```

- [ ] **Step 6: Smoke test on the emulator**

Install the current preview APK, sign in as the review account, and verify end to end: quick reply pre-fills the composer; an offer sends and renders; accepting flips the listing to on-hold and posts a system message; My Listings shows the hold with a Release action; releasing returns the item to available.

---

## Self-Review Notes

**Spec coverage.** Every section of the spec maps to a task: quick replies → 1; status gating → 2; offer data model and RPCs → 3; types and pure logic → 4; offer UI → 5, 7; realtime and hook wiring → 6; push and `notify_offers` → 8; inbox preview → 9; holds table, `WITH CHECK`, hold RPCs → 10; the shared write path → 11; hold visibility → 12; share-page SEO → 13; docs, analytics, ship → 14. The three pre-existing bugs named in the spec are fixed in Tasks 2, 10, and 13. The two latent issues found during the audit (rate limiter, review gate) are in Task 3.

**Deliberate omissions.** No screen tests (the repo has none). No RPC tests (no local Postgres; `db:push` targets production). No `offers` push channel (would silently drop on Android without a matching registration change — parked in the spec's v2 list).

**Ordering constraint.** Task 8's edge-function deploy must precede the Phase 2 OTA, or offers will insert correctly and notify nobody. Task 10 re-declares `respond_to_offer` from Task 3; apply the migrations in filename order.
