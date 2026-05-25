# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Trove (repo name `trove`) is a mobile-first community marketplace app for discovering and posting yard sales. Built with React Native + Expo SDK 54, TypeScript (strict mode), and Supabase backend.

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
- **`eas.json`** `env` block per build profile → EAS Build / Update
  reads these.

Both currently carry the same public Supabase publishable values. If
you add a new EXPO_PUBLIC_ var, add it to BOTH files. `npm run doctor`
sanity-checks the second one.

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

- Maps use `react-native-maps` (Google Maps on Android via the API key in `app.json` → `android.config.googleMaps.apiKey`; Apple Maps on iOS — no key needed)
- CreateSaleScreen is a single-page form (Photos → Where → When → About → Categories → Pricing) with a sticky Post CTA
- The `sale_media.order` field controls photo display sequence
- The initial migration includes an auto-created profile trigger on signup and auto-updated `updated_at` trigger on sales
