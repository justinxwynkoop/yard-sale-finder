# Development flow

This is the day-to-day playbook for making changes to Local Hauls and
getting them to your phone, your testers' phones, and eventually
the App Store / Play Store.

The single most important thing to understand: **most changes don't
require a rebuild.** Knowing when you can skip the 15-minute EAS
build is the difference between shipping a fix in 30 seconds vs
30 minutes.

---

## The default loop (95% of changes)

For JS / TS / styling / images-in-assets / new components / new
queries — anything that doesn't touch native code, `app.json` plugins,
or permissions.

```bash
# 1. Start Metro (dev client on your phone connects to it)
npx expo start --dev-client

# 2. Edit code. Save. Hot reload happens automatically on your phone.
#    If hot reload looks weird, press `r` in the Metro terminal.

# 3. When it works, commit + push
git add -A
git commit -m "feat: ..."
git push

# 4. Ship to testers via EAS Update — they get it on next app open
npx eas update --branch production -m "what changed in 1 sentence"
```

**That's it.** No 15-minute build. No App Store submission. Testers
have the fix in under a minute.

Use `--branch development` for dev builds (you), `--branch preview`
for internal previews, `--branch production` for TestFlight + future
App Store users.

---

## When you HAVE to rebuild (the 5%)

You need a fresh native binary (and therefore a new EAS build + new
TestFlight submission) when:

| Change | Why |
|---|---|
| Install a new `expo-*` or native module | Native code isn't in the existing binary |
| Edit `app.json` `plugins` array | Plugins run at native-build time |
| Edit `app.json` permissions / `infoPlist` / `android.permissions` | iOS / Android need them baked in |
| Edit `app.json` `bundleIdentifier` / `package` / `name` / icon paths | Identity-level changes |
| Edit `eas.json` | Affects the build itself |
| Bump `expo` SDK version | Whole framework reinstall |
| Update `runtimeVersion` in `app.json` | OTA updates target a specific runtime |

For these:

```bash
# For your own device — to keep developing
npm run build:dev:ios     # ~15 min EAS build
# (install via the URL on your phone in Safari)

# For TestFlight — so testers also get the change
npm run build:prod:ios    # ~15 min
npm run submit:ios        # ~5 min upload + ~10 min Apple processing
```

After this, future JS-only changes go back to the OTA flow (`eas
update`) — no more rebuilds.

---

## Database changes

```bash
# Create a new migration file
npm run db:new -- short_name_of_change
# e.g. npm run db:new -- add_email_column_to_profiles

# Edit the generated supabase/migrations/<timestamp>_short_name.sql

# Apply to the remote DB
npm run db:push
```

After `db:push`, the schema is live on the remote Supabase project
for everyone — no client rebuild needed. The JS client will pick up
the new columns / tables on the next query.

**Important**: write migrations as forward-only steps. Don't edit a
migration after it's been applied — write a new one.

---

## Shipping to testers (TestFlight)

Three flavors of "ship":

### A) JS-only fix → OTA update (default)
```bash
npx eas update --branch production -m "what changed"
```
- Reaches testers in ~60 seconds on next app open
- No Apple review, no waiting

### B) Native change → new build + resubmit
```bash
npm run build:prod:ios && npm run submit:ios
```
- ~30 min total (build + upload + processing)
- Then in App Store Connect: add the new build to your TestFlight
  External group → "What to Test" notes → Apple does a quick beta
  review (~24h first time, instant after) → invites go out

### C) Code AND schema change at the same time
1. `npm run db:push` first (migration is backwards-compatible)
2. Then ship the code change via A or B
3. Reverse order = clients try to use new code against old schema = errors

---

## Production releases (App Store)

For the public App Store launch (when you outgrow TestFlight):

1. Make sure you're at a stable JS state (no in-flight OTAs you wish
   you hadn't shipped). If you broke something, fix forward.
2. Bump `version` in `app.json` (semantic versioning).
3. `npm run build:prod:ios && npm run submit:ios` — same as TestFlight,
   but in App Store Connect select the build for **App Store** instead
   of TestFlight.
4. Fill out App Store metadata (screenshots, description, privacy
   labels). One-time.
5. Submit for App Review — usually 1-3 days.
6. Once approved, release to the App Store (you can hold off
   release if you want).

After the first public release, the same workflow applies — JS-only
fixes go out via OTA (yes, OTA works on App Store builds too), native
changes need a new build + review.

---

## Version bumps

Don't change `version` in `app.json` casually — it determines the
runtimeVersion bucket. OTA updates only target builds with the same
runtime version.

- Patch (`1.0.0` → `1.0.1`) — small fixes. New native build needed
  for the version to change; OTA still works between builds of the
  same version.
- Minor (`1.0.0` → `1.1.0`) — new feature, may include schema or
  plugin changes.
- Major (`1.0.0` → `2.0.0`) — big break.

Build numbers (`ios.buildNumber`, `android.versionCode`) auto-increment
via EAS `autoIncrement: true` in production. You don't manage these
manually.

---

## Decision tree

```
What did you change?

├─ Only JS/TS/styles/queries
│  └─ git push → `eas update --branch production -m "..."`
│     (testers updated in ~60s)
│
├─ Database schema
│  └─ `npm run db:push` first
│     then code change via the JS-only path
│
├─ Added a native module / changed app.json / changed eas.json
│  └─ `npm run build:dev:ios` (for you)
│     `npm run build:prod:ios && npm run submit:ios` (for testers)
│     ~30 min, then back to JS-only flow
│
├─ App icon / splash / assets
│  └─ Regenerate via `npm run icons:generate`
│     Then rebuild + resubmit (icons are baked into the binary)
│
└─ Bumped Expo SDK
   └─ `npm install` updated everything
      `npx expo install --check` to verify versions
      Rebuild dev + prod
      Test thoroughly before pushing OTA — runtime versions changed
```

---

## Branching (optional, when you have a team)

For solo dev, just commit to `main` and ship. When others join:

```bash
# Feature work
git checkout -b feat/add-search-bar
# ... commits ...
git push -u origin feat/add-search-bar

# Open PR on GitHub → review → merge to main

# After merge, ship via OTA from main
git checkout main && git pull
npx eas update --branch production -m "..."
```

EAS Update only ships what's locally on disk, so always update on a
clean main checkout — never from a feature branch.

---

## Common pitfalls

| Pitfall | Why it bites | Fix |
|---|---|---|
| OTA-shipping code that needs a schema change you haven't pushed yet | Clients query missing columns → errors | Push migrations first, code second |
| Updating native module versions and shipping via OTA | OTA can't change native code; runtime mismatch | Rebuild + resubmit |
| Editing a past migration to "fix" it | Already-applied migrations are immutable on the remote | Write a new migration |
| Forgetting `runtimeVersion` ties OTA to native build | OTA push goes to wrong builds or none | Treat any `app.json.version` bump as needing a full rebuild |
| Submitting the same build number to App Store Connect twice | "Build number already used" error | EAS's `autoIncrement: true` handles this — make sure it's on in `eas.json` |
| Pasting `.env` into chat | Anon keys & Mapbox tokens leak | Use 1Password / Bitwarden / signed link |

---

## What "shipping a change" looks like in practice

You found a typo in the My Sales screen header. Walking through:

```bash
# 1. Edit src/screens/sale/MySalesScreen.tsx — change "My sales" to "My Sales"
# 2. Hot reload picks it up on your phone → looks right
# 3. Commit
git add src/screens/sale/MySalesScreen.tsx
git commit -m "fix: capitalize My Sales header"
git push
# 4. Ship to testers
npx eas update --branch production -m "Capitalize My Sales header"
```

~30 seconds. They see it next time they open the app.

You added a new screen that uses `expo-haptics`. Walking through:

```bash
# 1. Install (this changes package.json + node_modules — native side)
npx expo install expo-haptics
# 2. Add the import + code → save → ... hot reload errors with
#    "Cannot find native module ExpoHaptics" — expected
# 3. New dev build needed
npm run build:dev:ios
# (wait ~15 min, install new build URL on phone, reconnect to Metro)
# 4. Test → works → commit
git add -A
git commit -m "feat: haptic feedback on heart toggle"
git push
# 5. Ship native + JS to TestFlight (single build covers both)
npm run build:prod:ios && npm run submit:ios
# (wait ~25 min, then add to TestFlight group in App Store Connect)
```

~45 min total, but only because you crossed the native boundary.
The next 10 typos / styling tweaks ride the OTA flow.
