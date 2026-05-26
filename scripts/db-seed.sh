#!/usr/bin/env bash
# Convenience: copy the seed SQL to the clipboard and open the Supabase
# SQL editor so the operator can paste + Run in one motion.
#
# We don't execute the SQL directly because (a) the seed inserts into
# auth.users which requires superuser, (b) running ad-hoc SQL through
# the supabase CLI isn't a first-class workflow, and (c) doing it via
# the dashboard keeps it visible / auditable.

set -eu

PROJECT_REF="dxahcamntwtuzftxbxgx"
SQL_FILE="supabase/scripts/seed_test_data.sql"

if [ ! -f "$SQL_FILE" ]; then
  echo "Seed file not found at $SQL_FILE"
  exit 1
fi

if command -v pbcopy >/dev/null 2>&1; then
  pbcopy < "$SQL_FILE"
  echo "📋  Seed SQL copied to your clipboard ($(wc -l < "$SQL_FILE") lines)."
else
  echo "ℹ️   Copy this file to your clipboard manually: $SQL_FILE"
fi

URL="https://supabase.com/dashboard/project/$PROJECT_REF/sql/new"
echo "🌐  Opening the Supabase SQL editor: $URL"

if command -v open >/dev/null 2>&1; then
  open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL"
fi

cat <<'EOF'

Steps:
  1. Click into the editor area (clears the default sample).
  2. Cmd+A to select all, Cmd+V to paste.
  3. Click the green Run button.

To clean up the seed data later, uncomment the DELETE block at the
bottom of supabase/scripts/seed_test_data.sql and run that.
EOF
