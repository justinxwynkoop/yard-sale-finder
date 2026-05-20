# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Local Hauls (repo name `yard-sale-finder`) is a mobile-first community marketplace app for discovering and posting yard sales. Built with React Native + Expo SDK 54, TypeScript (strict mode), and Supabase backend.

## Development Commands

```bash
npm install                    # Install dependencies
npx expo start --clear         # Start dev server (scan QR with Expo Go)
npx expo start --android       # Start on Android
npx expo start --ios           # Start on iOS
npx expo start --web           # Start on web
```

### Database migrations (Supabase CLI)

```bash
npm run db:link                # One-time: link to remote project (prompts for DB password)
npm run db:push                # Apply pending migrations to the remote DB
npm run db:new -- short_name   # Create a new migration file
npm run db:pull                # Pull dashboard-only changes into a migration
npm run db:status              # See applied vs pending migrations
```

Migrations live in `supabase/migrations/*.sql` and are tracked via
`supabase_migrations.schema_migrations` on the remote DB. Edit the
generated SQL file by hand, then `db:push`.

No test runner or linter is configured yet.

## Architecture

### Navigation Flow (src/navigation/index.tsx)

Root navigator switches between Auth and Main based on session state. The DEV_BYPASS_AUTH flag was removed — users go through real email+password (or social) auth, and the Supabase session is persisted via AsyncStorage.

- **Main Tabs**: Map (Discover) | My Sales (Manage) | Profile
- **Map Stack**: MapHomeScreen → SaleDetailScreen
- **Sale Stack**: MySalesScreen → CreateSaleScreen / EditSaleScreen

### State Management

No external state library — state lives in custom hooks:
- `useAuth()` — session, user, loading, signOut (real-time auth listener)
- `useSales()` — fetch sales with geo-bounds filtering, real-time Supabase subscriptions
- `useMySales()` — fetch current user's sales

### Backend (Supabase)

- **Client**: `src/lib/supabase.ts` — configured with AsyncStorage for session persistence
- **Schema**: `supabase/migrations/*.sql` — managed via the Supabase CLI (`npm run db:push`). Three tables: `profiles`, `sales`, `sale_media`.
- **Auth**: Supabase Auth — email+password primary, Google/Apple/Facebook OAuth available
- **Storage**: `sale-media` bucket for photos/videos
- **RLS**: Row-level security on all tables — anyone can read, only owners can write
- **API pattern**: Joins via `select('*, profile:profiles(*), media:sale_media(*)')`, geo-bounds filtering with `gte/lte` on lat/lng, real-time via Postgres changes channel

### Key Types (src/types/index.ts)

`Sale` is the central data type with location (lat/lng), date/time range, status enum (`active`/`winding_down`/`ended`), categories array, and nested `Profile` and `SaleMedia`.

### Environment Variables

Prefixed with `EXPO_PUBLIC_` (exposed to client). See `.env.example` for required values: Supabase URL, anon key, Mapbox token.

## Important Notes

- Maps use `react-native-maps`; `@rnmapbox/maps` is installed but not actively used yet
- CreateSaleScreen is a single-page form (Photos → Where → When → About → Categories → Pricing) with a sticky Post CTA
- The `sale_media.order` field controls photo display sequence
- The initial migration includes an auto-created profile trigger on signup and auto-updated `updated_at` trigger on sales
