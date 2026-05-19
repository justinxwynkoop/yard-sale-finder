# Onboarding a new developer

This doc walks a new dev from "zero" to "running the app on their phone and
iterating with hot reload" in about 30 minutes.

The app is not Expo Go-compatible (it uses Apple Sign In, custom config
plugins, etc.), so devs need a **development build** on their device.
The fastest path is to install one **you already built** via EAS — no
need for every dev to do their own first build.

---

## 1. Prerequisites (one-time, on their machine)

- **Node.js** ≥ 20 (recommend v22 LTS — what we use)
- **Git**
- **A phone**: iPhone (iOS 15+) or Android device for testing
- **Expo Go app** is *not* required (and won't work for this app)

### Optional, only if they need to touch native code or build their own
- **Xcode** (for iOS local builds / simulator) — Mac only
- **Android Studio** (for Android emulator) — any OS
- **Watchman** on macOS (`brew install watchman`)

### Optional, only if they need to push DB migrations
- They'll authenticate the Supabase CLI later — no install needed
  (the project depends on `supabase` as a devDep).

---

## 2. Clone & install

```bash
git clone https://github.com/justinxwynkoop/yard-sale-finder.git
cd yard-sale-finder
npm install
```

---

## 3. Environment variables

The repo has `.env.example` checked in showing what's needed. The real
values are in `.env` (gitignored).

**Share `.env` securely** — 1Password, Bitwarden, encrypted message, etc.
Don't paste it into Slack or Discord. The Supabase anon key is
public-safe by design (RLS protects the data), but the Mapbox token
isn't — treat the whole file as secret.

```bash
cp .env.example .env
# then paste the real values into .env
```

The required variables:
- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
- `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` — Mapbox token (currently a placeholder; not used yet)

---

## 4. Get a development build on their device

Two paths. **Path A is the default** — only do Path B if they need to
add a new native module or change `app.json` plugin config.

### Path A — Install YOUR existing dev build (5 min, no Apple Dev needed)

1. Have them create a free **Expo account** at https://expo.dev.
2. Add them to your Expo project on https://expo.dev/accounts/jasonwynkoop1/projects/yard-sale-finder
   under **Members** → **Invite**.
3. They open the **EAS Builds** dashboard for the project, find the latest
   `development` profile build for their platform, and tap the install URL
   on their phone (Safari on iOS).
4. iOS: they'll need to **trust the developer profile** under
   *Settings → General → VPN & Device Management*.
5. The **Yard Sale Finder (dev)** icon appears on their home screen.

### Path B — Build their own (15 min + Apple Dev account for iOS)

This is needed if they want to:
- Add a new `expo-*` plugin (changes `app.json`)
- Test native code changes
- Use their own signing certs

```bash
# Log in to Expo
npx eas login

# Set up build credentials (interactive — for iOS this asks for Apple ID)
npx eas credentials

# iOS dev build (~15 min on EAS cloud)
npm run build:dev:ios

# Android dev build (~10 min)
npm run build:dev:android
```

Full setup details: see [docs/deployment.md](./deployment.md).

---

## 5. Run Metro & connect

Every day, they do this:

```bash
# Start Metro in dev-client mode
npx expo start --dev-client
```

They'll see a QR code in the terminal. On their phone:

- Open the **Yard Sale Finder (dev)** app
- It auto-detects Metro on the same Wi-Fi network and shows a "Recently
  in development" entry — tap to connect
- Or tap "Scan QR code" and scan the one from Metro

Fast Refresh works automatically. Save a file, see the change instantly.

Useful Metro commands once it's running:
- `r` — reload the app
- `m` — toggle dev menu in the app
- `j` — open the JS debugger
- `?` — show all commands

---

## 6. Database access (only if they push migrations)

Most devs don't need this. Only if they're adding tables / RLS policies.

```bash
# 1. Log in to Supabase
npx supabase login

# 2. Link this checkout to the remote project
npm run db:link
# (it'll prompt for the DB password — they need this too)

# 3. Try a no-op to confirm:
npm run db:status
```

To create + apply a new migration:

```bash
npm run db:new -- short_name_of_change
# edit the generated supabase/migrations/*.sql
npm run db:push
```

**Important:** they need to be invited to the Supabase project at
https://supabase.com/dashboard/project/dxahcamntwtuzftxbxgx/settings/team
with at least the **Developer** role.

Full DB workflow: see [supabase/README.md](../supabase/README.md).

---

## 7. Codebase orientation

- **`CLAUDE.md`** — architecture overview, navigation flow, conventions.
  Read this first.
- **`docs/auth-setup.md`** — what's set up for auth providers and what
  needs Apple Developer / Supabase dashboard config.
- **`docs/deployment.md`** — EAS Build + TestFlight + Play Store steps.
- **`supabase/README.md`** — migration workflow.

Source layout:
```
src/
├── components/    Shared UI (Button, Input, Card, etc.) + ErrorBoundary
├── hooks/         useAuth, useProfile, useSales, useUserLocation
├── lib/           Supabase client + auth deep-link handler
├── navigation/    Single index.tsx with all stacks + tabs + gates
├── screens/
│   ├── auth/      Auth, ForgotPassword, ResetPassword, CheckEmail, CompleteProfile
│   ├── map/       MapHome (Discover), SaleDetail
│   ├── profile/   ProfileScreen
│   └── sale/      MySales, CreateSale, EditSale, CaptureSale
├── types/         Shared TS types
└── utils/         Pure helpers (distance, format, saleStatus)
```

Styling: **NativeWind** (Tailwind for RN). Tokens defined in
`tailwind.config.js`. `MapHomeScreen.tsx` is the one exception — it uses
StyleSheet because of an upstream NativeWind ↔ react-native-screens
interaction bug (see comment in that file).

---

## 8. First thing to try

1. Sign up via email/password on the Auth screen
2. Fill in your display name on the Complete Profile screen
3. Tap the **+** in My Sales → create a test sale near you
4. Open Discover → see your pin in green; tap it → see the detail page
5. Toggle to list view → see your sale sorted by distance

If any step fails, check Metro for errors and tell the team.

---

## 9. Common issues

| Symptom | Fix |
|---|---|
| "Couldn't find a native module" on app launch | Path A install but `npm install` didn't run, OR the dev build is stale. Re-`npm install`, then ask for the latest dev build link. |
| Metro shows "No apps connected" | Phone and computer aren't on the same Wi-Fi, or the firewall blocks port 8081. Try `npx expo start --dev-client --tunnel`. |
| Apple Sign In says "provider not enabled" | The Supabase dashboard's Apple provider needs the bundle ID in Authorized Client IDs. Already configured for our project. |
| "violates FK constraint sales_user_id_fkey" when posting | Their auth user has no `profiles` row. The `CompleteProfile` screen should handle this — make sure they completed it. |
| Hot reload looks stuck | Press `r` in Metro to force reload, or `--clear` to wipe Metro cache. |

Anything else, ping in the team chat.
