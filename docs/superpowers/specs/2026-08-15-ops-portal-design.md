# Ops Portal & Deployment Feed — Design

**Date:** 2026-08-15
**Status:** Approved for implementation planning
**Ships as:** Site-only (`site/`, `scripts/`) + a change to the `ota` npm script.
No app code, no database changes, no native changes, no new secrets.

## Problem

`site/ops.html` is a single flat column of stat cards. Two things are wrong
with it:

1. **It doesn't scale.** Every new metric makes the column longer. There is no
   grouping, no navigation, no sense of "which part of the system am I
   looking at".
2. **It has no deployment history.** Nothing on the page answers "what shipped,
   and when?" That history exists — in git and in EAS — but it is not visible
   anywhere the operator actually looks.

## Decisions

| Decision | Choice |
|---|---|
| Release data source | A committed `site/releases.json`, generated from `git log` and stamped on each real deploy. Not a live EAS API call — no new secret, and the per-change detail is far richer than an OTA's one-line message |
| What is a "deploy" | **Production OTA updates only** (`npm run ota`). TestFlight/App Store builds, DB migrations, and site deploys do NOT get feed rows |
| App Store version | Stays a live status tile (existing iTunes API call), not a feed row |
| Line items shown | **User-facing only**: `feat*` → Feature, `fix*` → Bug fix. Everything else is filtered but *counted* |
| Hotfixes | **Not modeled.** Two types only: Feature, Bug fix |
| Visual direction | True Azure dark portal — dark slate canvas, blue accents, left rail, breadcrumb command bar, dense tile grid. Departs from Trove's bone/green branding by design |
| Passcode gate | Kept, restyled dark. `/api/ops-stats` is untouched |
| History before today | Backfilled from `eas update:list` + git, flagged `source: "backfill"` and labeled *approximate* on the page |

## Data shape — `site/releases.json`

A JSON array, **newest first**. One object per production OTA deploy:

```json
{
  "deployedAt": "2026-08-13T22:41:07Z",
  "channel": "production",
  "appVersion": "1.0.0",
  "headSha": "2bdeb1b",
  "sinceSha": "e7026b3",
  "changes": [
    { "type": "feature", "text": "Address and pin editing in Edit Sale, photo-cap toast", "sha": "f681ca2" },
    { "type": "fix", "text": "Count listing views only on successful load", "sha": "458ba9e" }
  ],
  "otherCount": 6,
  "source": "stamped"
}
```

| Field | Meaning |
|---|---|
| `deployedAt` | ISO 8601 UTC. For `stamped` records this is the real wall-clock time the deploy script ran. For `backfill` records it is reconstructed |
| `channel` | EAS branch. Always `"production"` for now; the field exists so a future `preview` feed costs no migration |
| `appVersion` | `expo.version` read from `app.json` at stamp time |
| `headSha` | Short SHA of `HEAD` at deploy. **This is the cursor** — the next stamp diffs from here |
| `sinceSha` | Short SHA the range started from (previous record's `headSha`). `null` for the oldest record |
| `changes[].type` | `"feature"` or `"fix"` only |
| `changes[].text` | Commit subject with the conventional prefix stripped and first letter capitalized |
| `otherCount` | Count of commits in the range that were filtered out (docs/test/chore/refactor/style/build/ci). Surfaced on the page as "+N internal" so nothing is silently hidden |
| `source` | `"stamped"` (recorded by the deploy script) or `"backfill"` (reconstructed) |

Unknown fields are ignored by the page; a missing optional field falls back to
a neutral display. This keeps the file forward-compatible.

## Component 1 — `scripts/lib/releases.js` (pure, tested)

CommonJS so it runs under the existing jest config without ESM gymnastics.
Owns all parsing and classification, and touches neither the filesystem nor
git. Exports:

- `classify(subject)` → `{ type, text }` where `type` is `'feature' | 'fix' | 'other'`.
  - `feat:` / `feat(db):` / `feat(scope):` → `feature`
  - `fix:` / `fix(scope):` → `fix`
  - anything else, including a subject with no conventional prefix → `other`
  - `text` is the subject minus the `type(scope):` prefix, first letter
    capitalized, trailing period stripped
- `buildRecord({ commits, headSha, sinceSha, appVersion, deployedAt, source })`
  → the release object above. `commits` is `[{ sha, subject }]`.
  Feature/fix commits become `changes` (input order preserved — newest first);
  everything else increments `otherCount`.

Keeping this layer pure is what makes the pipeline testable: the script around
it only shells out to git and writes a file.

## Component 2 — `scripts/build-releases.mjs` (the stamper)

1. Read `site/releases.json` (missing or empty → treat as `[]`).
2. `sinceSha` = newest record's `headSha`, or `null`.
3. Run `git log <sinceSha>..HEAD --pretty=format:%h|%s` (full history when
   `sinceSha` is null).
4. **No new commits → print `No new commits since <sha> — nothing to stamp.`
   and exit 0.** Re-running after a no-op deploy must not create a duplicate
   empty record.
5. Read `expo.version` from `app.json`.
6. Call `buildRecord` with `deployedAt = new Date().toISOString()` and
   `source: 'stamped'`, prepend it, write the file back with a trailing newline
   (Prettier-compatible).
7. Print a summary and the push reminder (see below).

## Component 3 — deploy wiring

`npm run ota` becomes:

```
confirm-prod.sh  →  eas update --branch production  →  build-releases.mjs
```

Chained with `&&` so a **failed OTA never stamps a record**. The feed only
ever contains deploys that actually happened.

**Explicit non-coupling:** stamping writes a local file; the ops page won't
show the new deploy until `site/` is redeployed to Vercel. The script prints a
reminder rather than triggering a site deploy itself — an app deploy silently
firing a website deploy would be a surprising side effect.

```
Stamped release: 2 features, 1 fix (+6 internal)
→ commit site/releases.json and redeploy the site for /ops to show it
```

`ota:dev` and `ota:preview` are left alone — the feed is production-only.

## Component 4 — backfill (one-time)

A single reconstruction pass over existing history:

1. `eas update:list --branch production --json --non-interactive` → the ordered
   list of production update groups with their messages.
2. Collapse the iOS/Android pair for each deploy into one record (they share a
   message and ship together).
3. For each message, find the commit whose subject matches → that commit's SHA
   anchors the range, and its author date becomes `deployedAt`.
4. Where the message was custom rather than a commit subject (the most recent
   deploy is), fall back to the CLI's relative age (`"21 hours ago"`) resolved
   against the run time.
5. Every record produced this way is written with `source: "backfill"`.

The page renders backfilled rows with an *approximate* marker. Reconstructed
timestamps must never be presented as measured ones.

## Component 5 — `site/ops.html`

Rebuilt as an Azure portal shell. Static HTML/CSS/vanilla JS, no build step and
no external requests — matching the rest of `site/`.

**Palette:** canvas `#1b1a19`, blade surface `#252423`, hairline `#3b3a39`,
text `#f3f2f1`, muted `#a19f9d`, accent `#0078d4`, success `#54b054`,
warning `#c19c00`, error `#d13438`. Segoe UI stack.

**Layout**

- **Left rail** — Overview · Community · Messaging · Deployments · App Store ·
  Resources. Anchors into the blades, with the active section highlighted via
  scroll-spy (IntersectionObserver).
- **Command bar** — `Home › Trove › Ops` breadcrumb, overall health pill,
  Refresh button, last-updated stamp. Sticky.
- **Metric tiles** — the existing public + private counts, regrouped under
  Community and Messaging blades. Tabular numerals, 48h deltas retained.
- **Deployments blade** — the release feed. One row per deploy:
  status dot · `OTA · production` · relative + absolute time · version ·
  `2 features · 1 fix · +6 internal`. Rows expand to the itemized change lines
  with FEATURE / FIX pills. The newest row is expanded on load.
- **App Store blade** — existing iTunes lookup rows, restyled.
- **Resources blade** — the five console links as Azure resource rows.

**Data flow.** The page `fetch`es `/releases.json` (served straight off the
filesystem by Vercel — `vercel.json` already has a `filesystem` handle before
its rewrites, so no new route is needed). Metrics keep their existing two
paths: public counts direct from Supabase with the publishable key, private
counts via the passcode-checked `/api/ops-stats`.

**Failure behavior.** Each blade degrades independently, which is already the
page's pattern. `releases.json` missing, non-array, or unparseable → the
Deployments blade shows an empty state and every other blade still renders. A
record missing `changes` renders its summary row with no expansion rather than
throwing.

**Responsive.** Below 900px the rail collapses to an icon strip and tiles go
single-column — the page is checked from a phone.

## Testing

`scripts/__tests__/releases.test.js`, running under the existing `npm test`
(`testMatch` is repo-wide, so no jest config change):

- `classify` maps `feat:`, `feat(db):`, `fix:`, `fix(scope):` correctly
- `classify` returns `other` for `docs:`, `test:`, `chore:`, and for a subject
  with no conventional prefix
- prefix stripping and capitalization produce the expected display text
- `buildRecord` splits changes vs `otherCount` accurately over a mixed range
- `buildRecord` on an all-`other` range yields `changes: []` with a correct
  `otherCount`
- `buildRecord` preserves input (newest-first) order and carries `sinceSha`,
  `headSha`, `appVersion`, `source` through untouched

The page itself is verified by opening it against a fixture `releases.json`
(populated, empty array, and missing file).

## Out of scope

- Live EAS or App Store Connect API integration (rejected: needs a new secret,
  and yields only one-line deploy messages)
- Build / DB-migration / site-deploy rows
- Hotfix classification
- Light theme or theme toggle
- Any change to `/api/ops-stats` or the passcode mechanism
