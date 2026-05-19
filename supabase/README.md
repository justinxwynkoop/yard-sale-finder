# Supabase

## First-time setup

```bash
# 1. Log in to Supabase (opens browser, one-time)
npx supabase login

# 2. Link this project to the remote Supabase project
npm run db:link
# (you'll be prompted for the database password — find it in
#  https://supabase.com/dashboard/project/dxahcamntwtuzftxbxgx/settings/database)
```

## Daily workflow

```bash
# Create a new migration
npm run db:new -- name_of_your_change

# Edit the generated supabase/migrations/*.sql file, then push:
npm run db:push

# Pull schema changes made via the dashboard back into a migration:
npm run db:pull
```

## Layout

- `supabase/config.toml` — project config consumed by the CLI.
- `supabase/migrations/*.sql` — timestamped, ordered migrations. Each one
  runs exactly once on a given database (tracked in
  `supabase_migrations.schema_migrations`).
- Storage buckets and RLS policies live in the migrations alongside the
  tables they relate to.

## Notes

- The initial migration is idempotent (uses `if not exists`, `drop
  policy if exists`, etc.) so it can safely run against a database
  that already has partial state. Future migrations should NOT be
  idempotent — they should describe a single forward step.
- For local-first development with a Dockerized Postgres, run
  `npx supabase start` (requires Docker Desktop). You can ignore this
  if you only push to the remote project.
