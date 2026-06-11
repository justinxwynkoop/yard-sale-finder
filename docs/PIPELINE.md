# Team development pipeline

How Trove is developed, tested, and shipped by a small team (2–3 devs).
This is the target-state plan; adopt it in the phases at the bottom.

> Companion docs: `PIPELINES.md` (build/ship command runbook),
> `onboarding.md` (new-dev setup). This doc is the *why* and the
> environment/branch/CI design those runbooks plug into.

---

## 1. The core problem we're fixing

Today **one Supabase project (`dxahcamntwtuzftxbxgx`) is dev, staging, AND
prod at once.** Local Metro (`.env`), every `eas.json` profile, and
`db:link` all point at it. That means:

- A dev seeding data, testing a migration, or running `db:reset` mutates
  the **same database real TestFlight users see**.
- `npm run db:push` applies schema changes **straight to the live DB**
  with no review, dry-run, or rollback.
- Two devs can't develop conflicting migrations in parallel.
- `npm run ota` publishes your local HEAD **directly to the production
  channel** that users auto-pull.

The fix is **three environments backed by two Supabase projects**, a
**trunk-based git flow with CI gates**, and **migrations that flow
staging → prod under review** instead of straight to live.

---

> **STATUS (June 2026): the staging Supabase project is DEFERRED** — the
> free-tier project limit makes it more friction than it's worth
> pre-launch, so all environments currently share the one prod project.
> Mitigations in place until the split happens: `npm run db:reset` and
> `npm run ota` are gated behind a type-`prod`-to-confirm guard
> (scripts/confirm-prod.sh), migrations only land via reviewed PRs, and
> seed data is `[seed]`/`[seed2]`-tagged with cleanup blocks. Revisit
> the split (§2 below) before launch or once a free slot / Pro org
> exists.

## 2. Environments

| Environment | Supabase project | EAS profile | EAS channel | Who runs it | Data |
|---|---|---|---|---|---|
| **local** | `trove-staging` *(new, free tier)* | — (Metro) | — | each dev's machine | throwaway/seeded |
| **dev client** | `trove-staging` | `development` | `development` | each dev's registered device | throwaway/seeded |
| **internal QA** | `trove-staging` | `preview` | `preview` | testers (TestFlight internal / APK) | seeded |
| **production** | `trove-prod` = `dxahcamntwtuzftxbxgx` *(existing)* | `production` | `production` | real users | real |

**Rule of thumb:** nothing but the `production` profile ever touches the
prod project. Everything a developer or tester does lands on
`trove-staging`, which is disposable.

### Creating the staging project (one-time, ~5 min, $0)

1. supabase.com → **New project** → name `trove-staging`, **Free** plan,
   same region as prod. Save the DB password in your password manager.
2. Grab **Project URL** + **anon (publishable) key** from
   Settings → API.
3. Apply the full schema to it (see §4).
4. Seed it (see §4) — fake data lives here, never in prod.
5. Add both maintainers as members of the staging *and* prod projects
   (Supabase → Organization → Members) so onboarding doesn't depend on a
   single person sharing a DB password.

---

## 3. Config changes (env wiring)

The Supabase URL + **publishable anon key are safe to commit** (they ship
in the client; RLS, not secrecy, protects data — this is already
documented in `.env` and stays true per-project).

**`.env`** (local Metro) → point at **staging**:

```dotenv
EXPO_PUBLIC_ENV=development
EXPO_PUBLIC_SUPABASE_URL=https://<staging-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<staging anon key>
```

**`eas.json`** → `development` + `preview` env blocks use the **staging**
URL/key; only `production` keeps the **prod** URL/key:

```jsonc
"development": { "env": { "EXPO_PUBLIC_ENV": "development",
  "EXPO_PUBLIC_SUPABASE_URL": "https://<staging-ref>.supabase.co",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY": "<staging anon key>" } },
"preview":     { "env": { "EXPO_PUBLIC_ENV": "preview", /* staging */ } },
"production":  { "env": { "EXPO_PUBLIC_ENV": "production",
  "EXPO_PUBLIC_SUPABASE_URL": "https://dxahcamntwtuzftxbxgx.supabase.co",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY": "<prod anon key>" } }
```

Also: fix `.env.example` (it lists `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`,
which isn't actually used) and add a short "which project does this point
at?" comment.

---

## 4. Database & migration workflow

**Migrations stay forward-only and flow staging → prod under review.**

```
write migration on a feature branch
        │   npm run db:new -- short_name   (edit the SQL)
        ▼
apply to STAGING + test          supabase link --project-ref <staging>; supabase db push
        │
open PR  ──►  CI checks pass  ──►  squash-merge to main
        │
RELEASE (gated, a maintainer):    supabase link --project-ref dxahcamntwtuzftxbxgx; supabase db push
```

- **Devs link to staging by default.** Add `db:link:staging` /
  `db:link:prod` scripts so nobody pushes to prod by muscle memory.
- **Prod migrations are a deliberate release step**, run by a maintainer
  after the PR is merged — never automatically and never mid-feature.
- A new dev who needs fresh data resets **their** staging or a local
  Supabase stack (`supabase start` is already configured in
  `config.toml`), never prod.

### Seed data must leave the migration stream

`supabase/migrations/20260609170000_dev_seed_v2.sql` currently inserts
fake users/sales/listings and **will replay into any project you
`db:push` to, including prod.** Target state:

- Seed SQL lives only in `supabase/scripts/` (it already does:
  `seed_test_data.sql`, `seed_test_data_v2.sql`).
- Apply seed to **staging only**, on demand (a CI job or
  `supabase db push` of the script file against staging).
- Remove the seed-as-migration: delete the file and
  `supabase migration repair --status reverted 20260609170000` on each
  project so history stays consistent. *(I can do this when you're
  ready — it touches prod migration history, so it's a gated step.)*

### Migration-history cleanup backlog (low priority, non-blocking)

- `20260523180000_wipe_sale_listing_data.sql` — a destructive `TRUNCATE …
  RESTART IDENTITY CASCADE` permanently in history. Harmless now (already
  ran) but it means a fresh `db:reset` wipes content mid-replay. Document
  it loudly; consider squashing pre-launch.
- Diagnostic/superseded migrations (`*_storage_uploads_diagnostic`,
  `*_log_storage_policies`, repeated storage-policy attempts) — fine to
  leave; squash into a clean baseline before public launch if desired.

---

## 5. Git & PR workflow (trunk-based)

```
main  ── always releasable, == production
  └── feat/<thing>   short-lived (hours–days) → PR → CI → squash-merge
```

- **First move: land `redesign/open-house` into `main`.** It's 21 commits
  ahead and the de-facto trunk right now; merge it via a PR so `main`
  becomes current, then everyone branches off `main` again. Long-lived
  divergent branches are the thing this flow exists to prevent.
- **Branch protection on `main`** (GitHub → Settings → Branches):
  require a PR, require the CI checks below to pass, require 1 review,
  no direct pushes. With 2–3 devs, 1 approval is the right weight.
- **Squash-merge** so `main` history is one commit per feature.
- Branch naming: `feat/…`, `fix/…`, `chore/…`. Keep PRs small.

---

## 6. CI/CD (GitHub Actions)

Two workflows. CI auths to EAS via an `EXPO_TOKEN` repo secret
(Expo → Account → Access Tokens).

### `.github/workflows/ci.yml` — on every PR (blocking)

Gates merges on the quality scripts that already exist but are
manual-only today:

```yaml
name: CI
on: { pull_request: { branches: [main] } }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: '.nvmrc', cache: 'npm' }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint            # see "flip ESLint to error" below
      - run: npm test -- --ci
```

### `.github/workflows/deploy.yml` — on merge to `main`

Publishes an OTA update to the **preview** channel so internal testers
(on staging data) get every merge instantly. **Production is NOT
auto-shipped** — it's a manual release (see below).

```yaml
name: Deploy preview OTA
on: { push: { branches: [main] } }
jobs:
  ota-preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: '.nvmrc', cache: 'npm' }
      - run: npm ci
      - run: npx eas update --branch preview --message "${{ github.event.head_commit.message }}"
        env: { EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }} }
```

### Releasing to production (manual, gated)

A maintainer cuts a release (tag or `workflow_dispatch`):
1. `supabase db push` pending migrations to **prod** (§4).
2. `npm run ota` → `eas update --branch production` for JS-only changes,
   **or** `npm run ship:beta` for native changes (new TestFlight build).

> Keeping prod a manual, human-pressed step is intentional at this size:
> the blast radius of an auto-deploy to live users isn't worth saving one
> command. Revisit once you have real users + smoke tests.

### Make lint actually gate

ESLint rules are currently `warn`, so `npm run lint` never fails CI. Flip
the important rules to `error` (or run `eslint . --max-warnings=0`) so the
CI step is real.

---

## 7. Onboarding a new developer

Target: clone → productive in ~15 min. Fix the blockers first — the
**README is stale and actively misleading** (says use Expo Go, which is
impossible here, and references a nonexistent `supabase/schema.sql`).

1. Pin the toolchain: add **`.nvmrc`** (`20`) and an `engines.node` field
   so everyone (and CI) uses one Node.
2. Rewrite README setup to the real path:
   `nvm use` → `npm install` → copy `.env` (staging values) →
   `npx eas login` → register device (`eas device:create`) →
   `npm run build:dev:ios` (one-time dev client) → `npm run dev`.
3. `npm run doctor` already verifies env + EAS auth + Supabase link —
   keep it as the green-light check.
4. Document the **external** prerequisites a repo can't provide: an
   Expo/EAS account on the `jasonwynkoop1` org, Supabase membership on
   **staging** (and prod for maintainers), and an Apple Developer team
   invite for device builds.

---

## 8. Secrets matrix

| Value | Where it lives | Committed? |
|---|---|---|
| Supabase URL + **anon/publishable** key (staging & prod) | `.env`, `eas.json` env blocks | ✅ yes (public by design) |
| Android Google Maps key | `app.json` | ✅ already (restrict it in Google Cloud) |
| `EXPO_TOKEN` (CI → EAS) | GitHub repo secret | ❌ never |
| Supabase **service_role** key | injected by Supabase into the Edge Function at runtime | ❌ never (not in repo) |
| Supabase **DB passwords** (staging/prod) | password manager / GitHub secret if CI runs migrations | ❌ never |
| Android Play service account JSON | `./secrets/` (gitignored) / EAS | ❌ never |

Nothing sensitive is committed today — keep it that way; the only thing
in `.env` is the publishable key, which is meant to ship in clients.

---

## 9. Phased rollout

Adopt in order; each phase stands alone.

- **Phase 1 — quality gate (no infra, do now):** add `.nvmrc` + `engines`,
  flip ESLint to error, add `.github/workflows/ci.yml`, turn on branch
  protection, merge `redesign/open-house` → `main`. *Catches breakage on
  every PR immediately.*
- **Phase 2 — environment split:** create `trove-staging`, repoint `.env`
  + `eas.json` dev/preview at it, apply schema + seed to staging. *Now
  nobody's testing touches prod.*
- **Phase 3 — migration hygiene:** seed out of migrations, add
  `db:link:staging`/`db:link:prod`, document the staging→prod promotion.
- **Phase 4 — deploy automation:** `deploy.yml` (preview OTA on merge),
  formalize the manual prod-release step, fix the README/onboarding.

---

## 10. What I need from you to wire it

I can scaffold Phase 1 entirely from here. Phases 2–4 need two things
only you can produce:

1. The **`trove-staging`** project's **URL + anon key** (after you create
   it) — to repoint `.env`/`eas.json`.
2. An **`EXPO_TOKEN`** added as a GitHub repo secret — for the CI/deploy
   workflows to auth to EAS.
