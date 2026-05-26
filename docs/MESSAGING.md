# Messaging — Design Doc

Status: **DESIGN** (not yet implemented). Read this before writing code
for in-app messaging.

## Goal

Let a buyer ask a seller a question about a specific sale or listing
("is the dresser still available?") and let the seller reply, without
either party leaving the app.

## Non-goals

- General-purpose chat between any two users. Threads are anchored to a
  specific sale or listing.
- Group chats / multi-user threads.
- Voice / video / typed-out offers in v1. (See "Offers" under Future.)

## Data model

### `conversations`

One row per (target, buyer) pair. The seller is the owner of the target.

```sql
create table public.conversations (
  id            uuid primary key default gen_random_uuid(),
  target_type   text not null check (target_type in ('sale', 'listing')),
  target_id     uuid not null,
  -- The owner of the target. Stored explicitly (rather than re-derived
  -- via a join on every query) so block / RLS checks are cheap.
  seller_id     uuid references public.profiles(id) on delete cascade not null,
  buyer_id      uuid references public.profiles(id) on delete cascade not null,
  created_at    timestamptz default now() not null,
  last_message_at timestamptz default now() not null,
  -- Used by the unread badge on the Messages tab.
  seller_last_read_at timestamptz,
  buyer_last_read_at  timestamptz,
  unique (target_type, target_id, buyer_id),
  check (seller_id <> buyer_id)
);
```

### `messages`

```sql
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender_id       uuid references public.profiles(id) on delete cascade not null,
  body            text not null check (length(body) between 1 and 2000),
  created_at      timestamptz default now() not null
);

create index messages_conversation_idx
  on public.messages (conversation_id, created_at desc);
```

### RLS

- **Conversations:**
  - SELECT: visible to `seller_id` or `buyer_id` only.
  - INSERT: any authenticated user can create a conversation where
    they are `buyer_id` AND `seller_id` is the actual owner of the
    target row (enforced by a trigger or by re-deriving in a SECURITY
    DEFINER RPC like `start_conversation(target_type, target_id)` to
    avoid client-supplied seller_id spoofing).
  - UPDATE: limited to bumping `*_last_read_at` from your own side.
  - DELETE: no end-user delete (operator only).

- **Messages:**
  - SELECT: visible to the conversation's seller or buyer.
  - INSERT: only if you're a participant in the conversation AND you
    are not blocked by the recipient (checked via subquery against
    `public.blocked_users`).
  - UPDATE / DELETE: not allowed for end users (no edit / unsend in
    v1 — keeps moderation transcripts intact).

### Blocking interaction

The existing `blocked_users` table already filters sales / listings
out of feeds. For messaging:

- If user A blocks user B, neither can send NEW messages to the other.
- Existing conversations stay readable on both sides (we don't
  retroactively destroy history) but the input box is disabled with
  a "You can't message this user" hint.
- Reports against messages add `target_type = 'message'` to the
  existing `reports` table.

## UI surfaces

### Where the entry point lives

On SaleDetail and ListingDetail:

```
[ Sticky CTA at the bottom of the screen ]
┌────────────────────────────────────────┐
│ [Get directions]  [Message seller]    │
└────────────────────────────────────────┘
```

For listings, "Message seller" replaces nothing (currently no CTA).
For sales, the existing "Get directions" stays primary and the message
button is a secondary outlined button next to it. Hidden if the user
is the owner.

### Where threads list lives

**No new bottom tab** — we're already at 5 (the iOS soft cap). Instead:

- Add a **mail icon in the top-right of the Discover header**, with a
  red dot when there are unread messages. Tap → push the Inbox screen
  onto the Map stack.
- Mirror on Profile → "Messages" row.

This is the same pattern Airbnb uses (envelope icon in the top nav).

### Screens needed

1. **InboxScreen** — list of conversations, sorted by `last_message_at`.
   Each row: seller/buyer avatar (the other party), target preview (sale
   thumbnail + title), last message body, unread dot.
2. **ConversationScreen** — the actual message thread. Inverted FlatList
   (newest at the bottom), keyboard-aware input bar, system row at top
   showing what sale/listing this is about with a "View sale" link that
   pushes back into the detail screen.

### Notification surfaces

- **In-app badge** on the Inbox icon — driven by:
  ```sql
  -- Inside useInbox()
  select count(*) > 0 as has_unread
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where (c.buyer_id = auth.uid() and m.created_at > c.buyer_last_read_at)
     or (c.seller_id = auth.uid() and m.created_at > c.seller_last_read_at);
  ```
- **Realtime updates** while the app is foregrounded — subscribe to
  `postgres_changes` on the messages table filtered by the
  conversations the user participates in. New messages slide in live.
- **Push notifications** when the app is closed — deferred. Requires
  `expo-notifications` (new native dep, requires rebuild + new
  TestFlight) and a Supabase Edge Function that triggers on
  `messages` insert. See "Implementation order" below.

## Realtime model

We already use Supabase realtime for `sales` and `listings`
broadcasting. Add a third subscription for `messages`. To avoid each
user's client subscribing to every message in the system:

```ts
supabase
  .channel(`messages-${userId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      // Filter by conversations this user participates in. PostgREST
      // doesn't let us subquery here; the JS client filters on the
      // arrived row's conversation_id against the inbox set.
    },
    handleInsert,
  )
  .subscribe();
```

JS-side filter: drop any incoming insert whose `conversation_id` isn't
in the user's known inbox.

## Spam / abuse

- **Rate limit at the database**: a trigger blocks INSERT into
  `messages` if the same `sender_id` has sent >20 messages in the last
  minute. Returns a clean error the client can show.
- **Report a message**: long-press a message bubble → action sheet →
  Report. Uses the existing `reports` table with
  `target_type = 'message'`.
- **Block from a conversation**: kebab in the conversation header →
  Block user. Same path as the existing Block flow on detail screens.

## Implementation order

### v1 (must-ship before public launch)

1. Database: `conversations` + `messages` tables, RLS, the
   `start_conversation` RPC.
2. Hooks: `useInbox`, `useConversation(id)`, `useSendMessage`.
3. Screens: `InboxScreen`, `ConversationScreen`.
4. Entry points: "Message seller" buttons on SaleDetail /
   ListingDetail, envelope icon in the Discover header, Profile row.
5. In-app unread badge.
6. Realtime subscription for live message delivery while foregrounded.

### v1.1 (post-launch OTA + native rebuild)

7. `expo-notifications` integration: register push tokens on sign-in,
   store in a `push_tokens` table, Edge Function that fires on
   `messages` insert and dispatches via Expo's push service.
8. Block-aware send: the INSERT policy on `messages` checks the
   `blocked_users` table both ways.

### v1.2 (nice-to-haves, no urgency)

9. Read receipts (seen indicator under the last message you sent).
10. Image messages (uses the existing photo upload path on a new
    bucket `message-media`).
11. Structured **offers** — a separate row type with a price, an
    accept/decline button, and a state machine. Worth its own design
    doc when we get there.

## Open questions

- **Should sellers see the buyer's full email?** Default: no, only
  display name + avatar. Email reveal could be a future feature with
  consent.
- **Auto-archive old threads?** Probably not — sale-ended threads are
  still useful for honoring "still interested?" follow-ups.
- **Edit / unsend?** Default: no for v1. Adds significant complexity
  for negligible UX gain.

## Estimated effort

- v1 (without push): ~2-3 focused days. Database is small, but the
  inbox + conversation screens carry meaningful UX nuance (keyboard
  handling, realtime, unread badges, empty states).
- v1.1 push: ~1 day, gated on a fresh native build.
