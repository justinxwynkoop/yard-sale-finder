# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Trove (repo name `trove`) is a mobile-first community marketplace app for discovering and posting yard sales and individual item listings. Built with React Native + Expo SDK 54, TypeScript (strict mode), NativeWind (Tailwind) for styling, and Supabase backend.

## Development Commands

**See `docs/PIPELINES.md` for the full runbook.** TL;DR:

```bash
npm install                    # First-time setup
npm run doctor                 # Confirm env vars, EAS auth, Supabase link
npm run dev                    # Metro hot-reload for the dev client (default loop)
npm run dev:tunnel             # Same, but routed via a tunnel if Wi-Fi is finicky
npm run ota                    # Publish current code as an OTA update (auto-message from last commit)
npm run ship:beta              # Production build + auto-submit to TestFlight (~30 min)
```

The app *cannot* run in Expo Go — too many native modules. The two
test paths are Metro (`npm run dev`) and TestFlight builds. The OTA
path layers on top of a dev client built with `npm run build:dev:ios`.

### Linting, formatting, type checking

```bash
npm run lint                   # ESLint
npm run lint:fix               # ESLint with auto-fix
npm run format                 # Prettier
npm run typecheck              # tsc --noEmit
```

### Testing

```bash
npm test                       # Jest (all tests)
npm run test:watch             # Watch mode
npm run test:coverage          # Coverage report
```

Tests live in `src/utils/__tests__/`. There are currently tests for `distance.ts` and `saleStatus.ts`.

### Database migrations (Supabase CLI)

```bash
npm run db:link                # One-time: link to remote project (prompts for DB password)
npm run db:push                # Apply pending migrations to the remote DB
npm run db:new -- short_name   # Create a new migration file
npm run db:pull                # Pull dashboard-only changes into a migration
npm run db:status              # See applied vs pending migrations
npm run db:seed                # Copy test-data SQL to clipboard, open SQL editor
```

Migrations live in `supabase/migrations/*.sql` and are tracked via
`supabase_migrations.schema_migrations` on the remote DB. Edit the
generated SQL file by hand, then `db:push`. One-off scripts (e.g.
seed data) live in `supabase/scripts/` and are NOT auto-applied.

### Env vars

`EXPO_PUBLIC_*` env vars come from two committed sources:

- **`.env`** at the repo root → Metro / `npm run dev` reads these.
- **`eas.json`** `env` block per build profile → EAS Build / Update reads these.

Both currently carry the same public Supabase publishable values. If
you add a new EXPO_PUBLIC_ var, add it to BOTH files. `npm run doctor`
sanity-checks the second one.

## Architecture

### Navigation Flow (`src/navigation/index.tsx`)

Root navigator switches between Auth and Main based on session state.

**Post-sign-in gate sequence** (enforced by `MainGate`):
1. `CompleteProfileScreen` — if `isProfileComplete(profile)` is false (name, birthdate, city/state/zip required)
2. `TermsScreen` — if `hasAcceptedTerms(profile)` is false
3. `OnboardingScreen` — one-time welcome slides (tracked via `useOnboarding`)
4. `MainTabs` — the real app

**Main Tabs**: Map (Discover) | Listings | Messages | Profile

- **Map Stack**: `MapHomeScreen` → `SaleDetailScreen`
- **Listings Stack**: `ListingsScreen` → `ListingDetailScreen` / `CreateListingScreen` / `EditListingScreen` / `SavedHome` / `SavedListings` / `SaleDetail`
- **Messages Stack**: `InboxScreen` → `ConversationScreen`
- **Profile Stack**: `ProfileScreen` → `EditProfileScreen` / `MySalesScreen` → `CreateSaleScreen` / `EditSaleScreen` / `CaptureSaleScreen` / `CreateListingScreen` / `EditListingScreen`

`CreateListing` and `EditListing` are registered in both `ListingsStack` and `ProfileStack` so they open within the current tab rather than yanking the user across tabs.

Deep links: `trove://sale/<id>` and `https://trove.app/sale/<id>` navigate to `SaleDetail`.

Full-screen routes (`Conversation`, `Capture`) hide the tab bar; this is controlled by `FULL_SCREEN_ROUTES` in `navigation/index.tsx`.

### State Management

No external state library — state lives in custom hooks:

**Auth & user**
- `useAuth()` — session, user, `inRecovery` flag, `signOut`; handles stale refresh tokens silently
- `useProfile()` / `invalidateProfile()` — fetches current user's profile row. Uses a module-level listener set instead of Supabase realtime for cross-instance invalidation; call `invalidateProfile()` after any profile mutation
- `isProfileComplete(profile)` / `hasAcceptedTerms(profile)` — pure helpers used in `MainGate`

**Sales**
- `useSales()` — fetches all non-ended sales (no viewport bounding; full fetch is cheaper at current scale), real-time via Postgres changes; filters blocked users client-side
- `useMySales(userId)` — fetches current user's sales

**Listings**
- `useListings(filters)` — fetches available listings with optional category/price filters; multi-category OR filtering is done client-side (PostgREST `@>` only supports AND); real-time via Postgres changes; filters blocked users client-side
- `useMyListings(userId)` — fetches current user's listings

**Messaging**
- `useInbox()` — loads conversations sorted by recency; hydrates other-party profile, target preview (sale/listing), last message body, and unread flag in JS (not DB joins) due to the polymorphic `target_type`; real-time via Postgres changes; exposes `deleteConversation`, `markAsUnread`, `unreadCount`
- `useConversation(conversationId)` — loads a single conversation + messages, live tail, optimistic send; calls `mark_conversation_read` RPC on mount
- `useStartConversation()` — wraps the `start_conversation` RPC (create-or-fetch idempotent)

**Other**
- `useFavorites()` / `useFavoriteListings()` — save/unsave sales and listings
- `useBlockedUsers()` — fetches blocked user IDs; applied as client-side filter in `useSales` and `useListings`
- `usePushNotifications()` — registers device token, persists to profile; skips on simulators; mounted once in `MainTabs`
- `useOnboarding()` — tracks whether the user has seen the onboarding slides (AsyncStorage)
- `useUserLocation()` — expo-location permission + current position
- `useLastMapRegion()` — persists the last map viewport region across navigation

### Backend (Supabase)

- **Client**: `src/lib/supabase.ts` — configured with AsyncStorage for session persistence
- **Schema**: `supabase/migrations/*.sql`. Core tables:
  - `profiles` — 1:1 with auth.users; auto-created via trigger on signup
  - `sales` + `sale_media` — yard sale events with photos
  - `listings` + `listing_media` — individual item marketplace
  - `favorites` — saved sales (user → sale)
  - `listing_favorites` — saved listings (user → listing)
  - `conversations` + `messages` — in-app messaging; `target_type` is `'sale' | 'listing'`
  - `blocked_users` — block relationships
  - `reports` — abuse reports targeting sales, listings, or profiles
  - `push_tokens` — FCM/APNs tokens per user
- **Auth**: Supabase Auth — email+password primary, Google/Apple OAuth available
- **Storage**: `sale-media` and `avatars` buckets
- **RLS**: Row-level security on all tables — anyone can read, only owners can write
- **RPCs**: `start_conversation`, `mark_conversation_read`, `unmark_conversation_read`, `delete_my_account`
- **API pattern**: media sorted by `.order` field; profile NOT embedded in `useSales` (avoids PostgREST inner-join dropping sales whose owner has no profile row yet)

### Key Types (`src/types/index.ts`)

`Sale` and `Listing` are the two content types. Both have `categories: ItemCategory[]`, nested `Profile`, and nested media arrays. `Conversation` has a polymorphic `target_type: 'sale' | 'listing'` + `target_id`. All navigation param lists are typed and exported from this file.

### Notable Utilities (`src/lib/`)

- `imageUrl.ts` — `transformedImageUrl(url, opts)` appends Supabase CDN image transform params (resize/quality) to storage URLs; no-ops on local `file:` URIs
- `captureBus.ts` — tiny module-level emitter that passes captured photo URIs from `CaptureSaleScreen` back to `CreateSaleScreen` without putting a non-serializable function in navigation params
- `navigationRef.ts` — `navigationRef` and `navigateToConversation()` for navigating from outside the React tree (push notification tap handlers)
- `toast.ts` — thin wrapper around `react-native-toast-message`
- `imageCompression.ts` — wraps `expo-image-manipulator` for pre-upload compression
- `avatarUpload.ts` — handles avatar uploads to the `avatars` bucket

### UI Component Library (`src/components/ui/`)

Shared primitives exported via `src/components/ui/index.ts`: `Button`, `Input`, `Card`, `Badge`, `Chip`, `IconButton`, `Avatar`, `AvatarEditor`, `EmptyState`, `Section`, `StatusBadge`, `Skeleton`/`SaleCardSkeleton`, `DateTimeField`, `DateRangePresets`, `SettingsRow`/`SettingsGroup`, `CategoryPicker`.

### Environment Variables

Prefixed with `EXPO_PUBLIC_` (exposed to client). See `.env.example` for required values: Supabase URL, anon key, Mapbox token.

## Important Notes

- Maps use `react-native-maps` (Google Maps on Android via `app.json` → `android.config.googleMaps.apiKey`; Apple Maps on iOS — no key needed)
- `CreateSaleScreen` is a single-page scroll form (Photos → Where → When → About → Categories → Pricing) with a sticky Post CTA; photos are captured via `CaptureSaleScreen` (full-screen modal) and returned via `captureBus`
- `useInbox` must create a unique Supabase Realtime channel per hook instance (random suffix) because the hook is mounted in multiple places simultaneously; duplicate channel topics are rejected by Realtime
- Multi-category listing filter is partially client-side: `@>` (contains-all) is used for the first category as a DB hint, then JS filters the rest for OR semantics
- `invalidateProfile()` uses a plain JS listener set rather than Supabase Realtime because the profiles table realtime subscription was unreliable; call it after any profile `upsert`/`update`
- Adding a new native dependency requires rebuilding the dev client (`npm run build:dev:ios`) before Metro or OTA will work
