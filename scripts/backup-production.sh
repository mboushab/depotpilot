#!/bin/bash
# Backs up the production PostgreSQL database for a BoxPilot install.
#
# Usage:
#   bash scripts/backup-production.sh
#
# Can be run any time by hand, and is also called by packaging/mac/install.sh
# before every update — if this script fails (non-zero exit), the caller
# MUST NOT proceed with the update. This script never deletes anything: old
# backups under backups/ are never pruned or overwritten automatically.
#
# Exit codes: 0 on a verified, non-empty backup file. Non-zero on any
# failure (config missing, PostgreSQL not reachable, pg_dump failing, or the
# resulting file missing/empty).

set -euo pipefail

SUPPORT_DIR="$HOME/Library/Application Support/BoxPilot"
SUPPORT_ENV="$SUPPORT_DIR/.env"
SUPPORT_COMPOSE="$SUPPORT_DIR/docker-compose.yml"
SUPPORT_COMPOSE_PROD="$SUPPORT_DIR/docker-compose.prod.yml"
BACKUPS_DIR="$SUPPORT_DIR/backups"

# The embedded project source docker-compose needs for --project-directory.
# Overridable (e.g. for testing against a dev checkout instead of the
# installed app bundle).
PROJECT_DIR="${BOXPILOT_PROJECT_DIR:-/Applications/BoxPilot.app/Contents/Resources/project}"

compose() {
  docker compose --env-file "$SUPPORT_ENV" -f "$SUPPORT_COMPOSE" -f "$SUPPORT_COMPOSE_PROD" --project-directory "$PROJECT_DIR" "$@"
}

echo "==> BoxPilot database backup"

if [ ! -f "$SUPPORT_ENV" ] || [ ! -f "$SUPPORT_COMPOSE" ] || [ ! -f "$SUPPORT_COMPOSE_PROD" ]; then
  echo "!! BoxPilot is not configured (missing $SUPPORT_ENV or compose files). Nothing to back up." >&2
  exit 1
fi

mkdir -p "$BACKUPS_DIR"

# 1. Verify PostgreSQL is actually up and accepting connections — not just
#    that the container exists, but that it answers queries.
if ! compose exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
  echo "!! PostgreSQL is not running/ready. Aborting backup." >&2
  exit 1
fi

TIMESTAMP="$(date '+%Y-%m-%d-%H%M%S')"
BACKUP_FILE="$BACKUPS_DIR/boxpilot-$TIMESTAMP.dump"
ERROR_LOG="$BACKUPS_DIR/.last-backup-error.log"

echo "    Writing $BACKUP_FILE"

# 3/4. pg_dump in custom format (-Fc): compressed, supports selective/
# parallel restore via pg_restore. Uses the db container's own
# POSTGRES_USER/POSTGRES_DB env vars — never needs to read secrets out of
# $SUPPORT_ENV into this shell.
if ! compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$BACKUP_FILE" 2>"$ERROR_LOG"; then
  echo "!! pg_dump failed. See $ERROR_LOG" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

# 5. A backup we can't trust is worse than no backup: verify it landed and
#    actually has content before calling this a success.
if [ ! -s "$BACKUP_FILE" ]; then
  echo "!! Backup file is missing or empty: $BACKUP_FILE" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

rm -f "$ERROR_LOG"
echo "✅ Backup complete: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
