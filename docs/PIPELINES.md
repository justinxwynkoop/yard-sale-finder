# Local Hauls — Build & Ship Pipelines

A short operational runbook so you stop guessing which command to run.
If anything here drifts from reality, fix this file first, then the code.

## TL;DR

| You want to… | Run | Time | What it does |
|---|---|---|---|
| See your latest JS edits on your phone | `npm run dev` | seconds | Metro hot-reload via the dev client |
| Push the latest JS to your phone without a Metro server | `npm run ota` | ~1 min | EAS Update to `production` branch |
| Verify "what real users will see" | `npm run ship:beta` | ~30 min | Production build + auto-submit to TestFlight |
| Submit to Apple Review | Manual click in App Store Connect | varies | After TestFlight build looks good |
| Confirm your environment is set up | `npm run doctor` | seconds | Pre-flight check |

## The four shippable artifacts

```
                ┌─ Source code (this repo, `main` branch)
                │
                ▼
        ┌───────┴────────┬─────────────────┬───────────────────┐
        │                │                 │                   │
   Metro server      EAS Update       Dev Client          Production
   (your laptop)    (u.expo.dev)     (TestFlight       (TestFlight +
        │                │           internal track)    App Store)
        │                │                 │                   │
        ▼                ▼                 ▼                   ▼
    Dev client     Any compatible       Your phone        Real users
    over Wi-Fi     binary, on launch
```

## How env vars flow

Three sources, in order of who-trumps-whom:

1. **Process env at bundle time.** EAS Build / Metro reads these.
2. **eas.json `env` block per profile.** Inline; committed.
3. **EAS environment variables (`eas env:create`).** Per environment
   (development / preview / production). Stored on EAS servers.

For *Local Hauls* we deliberately put the public Supabase keys in
**both** `.env` (for Metro) and `eas.json` (for EAS Build / Update),
so there's no resolution-ambiguity. The keys are publishable on
purpose — RLS, not key secrecy, is what protects data.

Anything actually secret (e.g. Sentry auth tokens used during builds)
goes in EAS secrets only and is never committed.

## The three pipelines, in detail

### 1. Local development (Metro) — your default

Fastest iteration. Use it for everything that doesn't need a fresh
binary.

```bash
npm run dev
# or, if your phone isn't on the same Wi-Fi:
npm run dev:tunnel
```

In the dev client on your phone, tap **Enter URL manually** (or scan
the QR Metro prints) → connect to your laptop. Every JS save
hot-reloads.

**What this loads:** the JS from your working tree. `.env` values are
baked in by Metro's babel plugin. The native shell is whatever dev
client you already have installed.

**When this breaks:** if you added a native dep that's not in the
installed dev client, the import fails. Solution: `npm run build:dev:ios`,
install the new dev client.

### 2. Over-the-air (OTA) update — fast path to your phone, no Metro

When you don't want to keep Metro running, OR when you want others
(e.g. a tester on TestFlight) to get your changes without a new
binary.

```bash
git commit -am "your change"
npm run ota
```

That publishes a JS bundle to the `production` channel on u.expo.dev,
tagged with your last commit message.

On your phone, in the dev client launcher: tap
**yard-sale-finder → production** branch. The new bundle downloads
on launch.

**Constraint:** the dev client must have all the native modules the
JS imports. Same constraint as before — if you added native deps,
rebuild the dev client.

**When the OTA bundle white-screens:** almost always either
  - the dev client is too old (missing native deps) → rebuild it
  - the dev client cached an old bundle → quit + reopen, OR delete
    and reinstall the dev client

### 3. Production build + TestFlight — final verification

When you want to test the *actual* binary that goes to the App Store,
not a dev-shell + OTA bundle. Slower (~30 min round trip) but is the
ground truth.

```bash
npm run ship:beta
```

That runs `eas build --profile production --platform ios --auto-submit`.
After ~10 min the build finishes; EAS automatically submits it to
App Store Connect; after ~10 more minutes of Apple processing it shows
up in TestFlight on your phone.

To then send it to App Review: go to App Store Connect → your app →
**App Store** tab → select the new build → **Submit for Review**.

## When things go sideways

### "Missing Supabase env vars" at app launch

Means the running bundle has `EXPO_PUBLIC_SUPABASE_URL=undefined`. Run
the doctor:

```bash
npm run doctor
```

It'll tell you whether `.env`, `eas.json`, or EAS env is the source
of the gap. Fix the missing one and:

- If Metro: bounce `npm run dev` (Metro reads `.env` on start).
- If OTA: republish via `npm run ota`.
- If production build: do a new `npm run ship:beta`.

### Dev client is white-screening on the production branch

Most common cause: the dev client is missing a native module the JS
imports. Quick test: switch to Metro (`npm run dev`) and connect to
that instead. If it loads, the issue is the dev shell. Solution:
`npm run build:dev:ios`, install the new dev client.

### Build numbers conflict on submit

App Store Connect requires each build number to be unique per
version. We have `appVersionSource: "remote"` in `eas.json` and
`autoIncrement: true` on the production profile, so EAS handles it.
But if a manual upload happened outside EAS (e.g. via Xcode
Organizer), the EAS counter can fall behind. Fix:

```bash
# bump the EAS-tracked build number to one past whatever's in
# App Store Connect
eas build:version:set --platform ios --build-version <N+1>
```

Then re-run `npm run ship:beta`.

## Database

```bash
npm run db:status        # see applied vs pending migrations
npm run db:push          # apply pending migrations to the remote DB
npm run db:new -- name   # create a new migration file
npm run db:seed          # copy seed SQL to clipboard, open SQL editor
```

Migrations live in `supabase/migrations/*.sql`. One-off scripts (like
the test-data seed) live in `supabase/scripts/` and are NOT
auto-applied — they're meant to be run manually via the dashboard.

## Adding a new native dependency

This is the only time you must rebuild every binary you care about:

1. `npx expo install <package>`
2. `git commit -am "add <package>"`
3. `npm run build:dev:ios` (so your dev client has the native side)
4. Install the new dev client on your phone
5. From now on, Metro / OTA work with the new package
6. Before the next App Store submission: `npm run ship:beta`
