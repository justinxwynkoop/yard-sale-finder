#!/usr/bin/env bash
# Pre-flight check: verifies the local + remote pieces a developer
# needs before building, OTA-publishing, or shipping. Exits non-zero
# if anything important is missing so it can be wired into CI later.
#
# Run via `npm run doctor`.

set -u
fail=0

ok()    { echo "  ✅  $1"; }
warn()  { echo "  ⚠️   $1"; }
err()   { echo "  ❌  $1"; fail=$((fail+1)); }

section() { echo; echo "── $1 ──"; }

section "Node + tooling"

if command -v node >/dev/null 2>&1; then
  ok "node $(node --version)"
else
  err "node not found — install Node.js"
fi

if [ -d node_modules ]; then
  ok "node_modules present"
else
  err "node_modules missing — run \`npm install\`"
fi

if [ -x node_modules/.bin/eas ]; then
  ok "eas-cli installed (project dep)"
else
  err "eas-cli missing — run \`npm install\`"
fi

if [ -x node_modules/.bin/supabase ]; then
  ok "supabase CLI installed (project dep)"
else
  warn "supabase CLI missing — \`npm install\` or migrations won't work"
fi

if command -v git >/dev/null 2>&1; then
  ok "git $(git --version | awk '{print $3}')"
else
  err "git not found"
fi

section "Local env (Metro)"

if [ -f .env ]; then
  ok ".env exists"
  if grep -q "^EXPO_PUBLIC_SUPABASE_URL=" .env; then
    ok "EXPO_PUBLIC_SUPABASE_URL set in .env"
  else
    err "EXPO_PUBLIC_SUPABASE_URL missing in .env"
  fi
  if grep -q "^EXPO_PUBLIC_SUPABASE_ANON_KEY=" .env; then
    ok "EXPO_PUBLIC_SUPABASE_ANON_KEY set in .env"
  else
    err "EXPO_PUBLIC_SUPABASE_ANON_KEY missing in .env"
  fi
else
  err ".env missing — copy from .env.example or recreate from PIPELINES.md"
fi

section "eas.json env vars (build-time)"

# Quick visual grep so the operator can confirm at a glance.
for profile in development preview production; do
  if grep -A 20 "\"$profile\":" eas.json | grep -q "EXPO_PUBLIC_SUPABASE_URL"; then
    ok "$profile profile has EXPO_PUBLIC_SUPABASE_URL"
  else
    err "$profile profile in eas.json missing EXPO_PUBLIC_SUPABASE_URL"
  fi
done

section "EAS auth"

if npx --no-install eas whoami >/dev/null 2>&1; then
  who=$(npx --no-install eas whoami 2>/dev/null | tail -1)
  ok "signed in to EAS as $who"
else
  err "not signed in to EAS — run \`npx eas login\`"
fi

section "Supabase link"

if [ -f supabase/.temp/project-ref ]; then
  pr=$(cat supabase/.temp/project-ref)
  ok "linked to Supabase project $pr"
else
  warn "Supabase not linked yet — run \`npm run db:link\` for migration work"
fi

section "Git working tree"

if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  warn "uncommitted changes present — EAS Build uploads only committed code by default"
  git status --short | sed 's/^/      /'
else
  ok "working tree clean"
fi

upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo "")
if [ -n "$upstream" ]; then
  ahead=$(git rev-list --count "$upstream"..HEAD 2>/dev/null || echo "0")
  if [ "$ahead" != "0" ]; then
    warn "$ahead local commit(s) not pushed to $upstream"
  else
    ok "up to date with $upstream"
  fi
fi

section "Result"

if [ "$fail" -eq 0 ]; then
  echo "  All checks passed. You're clear to build / OTA / ship."
  exit 0
else
  echo "  $fail check(s) failed. Fix the items above before building."
  exit 1
fi
