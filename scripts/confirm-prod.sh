#!/usr/bin/env bash
# Type-to-confirm gate for commands that hit PRODUCTION.
#
# We deliberately run a single Supabase project (no staging DB for now —
# see docs/PIPELINE.md), which means a couple of npm scripts point a
# loaded gun at live data / live users. This guard makes those commands
# impossible to run by reflex: you must type `prod` to proceed.
#
# Usage (in package.json):
#   bash scripts/confirm-prod.sh "what this will do" && <real command>

set -eu

MSG="${1:-This command affects PRODUCTION.}"

echo ""
echo "⚠️  PRODUCTION GUARD"
echo "   ${MSG}"
echo ""

# No TTY (CI / piped) → refuse rather than silently proceed.
if [ ! -t 0 ]; then
  echo "Refusing to run non-interactively. Run the underlying command"
  echo "by hand if you truly mean it."
  exit 1
fi

read -r -p "Type 'prod' to continue: " ANSWER
if [ "${ANSWER}" != "prod" ]; then
  echo "Aborted."
  exit 1
fi
