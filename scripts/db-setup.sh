#!/bin/sh
# Runs on every container start (first install and every restart/update).
#
# PRODUCTION SAFETY CONTRACT — do not change without re-reading this:
#   - Prisma migrations are the single source of truth for the schema.
#     Never apply prisma/migrations/*/migration.sql files manually here.
#   - Only `prisma migrate deploy` is allowed in this script. It applies
#     pending migrations in order and never touches existing data.
#   - NEVER call, script, or wrap any of the following in a production/
#     client-facing path: `prisma migrate reset`, `prisma db push`,
#     `DROP DATABASE`, or anything that drops/recreates the database or
#     the PostgreSQL volume (`docker compose down -v`). All of these
#     destroy the client's data. `prisma migrate dev` (schema authoring,
#     creates new migrations) is a developer-only, local command — it
#     must never run against a client's database.
#   - A schema change always means a new migration file (via
#     `npm run db:migrate` locally), added to prisma/migrations/. Existing
#     migration files must not be deleted, rewritten, or squashed unless
#     absolutely necessary.
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required"
  exit 1
fi

# Applies every migration under prisma/migrations in order and tracks
# which ones already ran, so this is safe to run on every container start.
npx prisma migrate deploy

# Idempotent: upserts the admin user and only creates demo data when the
# corresponding tables are empty (see prisma/seed.ts).
npx prisma db seed
