#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required"
  exit 1
fi

if ! psql "$DATABASE_URL" -tAc "select to_regclass('public.\"AdminUser\"')" | grep -q '"AdminUser"'; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/migrations/20260910090000_init/migration.sql
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/migrations/20260910133000_parking_planned_end/migration.sql
