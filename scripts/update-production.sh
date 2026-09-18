#!/bin/bash
# Production update procedure for an existing BoxPilot install.
#
# Run from an updated checkout of this repository, on the machine hosting
# the install (normally the client's Mac):
#
#   bash scripts/update-production.sh
#
# Fixed order, never reordered:
#   1.  verify Docker is installed and the daemon is running
#   2.  verify a BoxPilot install already exists
#   3.  back up PostgreSQL (abort if it fails — no update without a backup)
#   4.  stop only the `app` service (PostgreSQL keeps running throughout)
#   5.  tag the current app image as a rollback point, then build the new one
#   6.  make sure PostgreSQL is up and healthy
#   7.  run `prisma migrate deploy` against the new image, in its own
#       one-off container, before the new app ever starts
#   8.  start the new app
#   9.  wait for GET /api/health to report {"status":"ok"}
#   10. print a clear success message (with the rollback command, in case
#       it's needed later)
#
# On any critical failure: stop immediately (set -e + explicit checks),
# print a clear error, and exit non-zero. This script NEVER deletes the
# database and NEVER deletes/recreates the boxpilot_postgres volume — the
# only destructive-looking command it ever runs is `docker compose stop
# app` (stop, not down -v).
#
# Rollback: before building the new image, the current boxpilot-app:latest
# is retagged to boxpilot-app:rollback. If something goes wrong after that
# point, restore it with:
#   docker tag boxpilot-app:rollback boxpilot-app:latest
#   docker compose ... up -d app
# This only rolls back the application code. Prisma migrations are
# forward-only and are not undone — this is exactly why step 3's backup
# exists as the real safety net for schema-level problems.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="${BOXPILOT_PROJECT_DIR:-/Applications/BoxPilot.app/Contents/Resources/project}"

SUPPORT_DIR="$HOME/Library/Application Support/BoxPilot"
SUPPORT_ENV="$SUPPORT_DIR/.env"
SUPPORT_COMPOSE="$SUPPORT_DIR/docker-compose.yml"
SUPPORT_COMPOSE_PROD="$SUPPORT_DIR/docker-compose.prod.yml"

APP_IMAGE="boxpilot-app"
ROLLBACK_TAG="$APP_IMAGE:rollback"
HEALTH_URL="http://localhost:3000/api/health"

compose() {
  docker compose --env-file "$SUPPORT_ENV" -f "$SUPPORT_COMPOSE" -f "$SUPPORT_COMPOSE_PROD" --project-directory "$PROJECT_DIR" "$@"
}

fail() {
  echo "" >&2
  echo "❌ $1" >&2
  echo "   La base de données et le volume boxpilot_postgres n'ont pas été touchés." >&2
  exit 1
}

echo "==> BoxPilot — mise à jour de production"

# 1. Verify Docker.
echo "==> [1/10] Vérification de Docker"
command -v docker >/dev/null 2>&1 || fail "Docker n'est pas installé sur cette machine."
docker info >/dev/null 2>&1 || fail "Le démon Docker ne répond pas. Démarrez Docker Desktop et réessayez."
docker compose version >/dev/null 2>&1 || fail "Docker Compose est introuvable."

# 2. Verify an existing BoxPilot install.
echo "==> [2/10] Vérification de l'installation BoxPilot existante"
[ -f "$SUPPORT_ENV" ] || fail "Aucune installation trouvée ($SUPPORT_ENV manquant). Utilisez packaging/mac/install.sh pour une première installation."
{ [ -f "$SUPPORT_COMPOSE" ] && [ -f "$SUPPORT_COMPOSE_PROD" ]; } || fail "Fichiers docker-compose manquants dans $SUPPORT_DIR."
[ -d "$PROJECT_DIR" ] || fail "Code source introuvable : $PROJECT_DIR."

# 3. Backup PostgreSQL. Never proceed without a verified, non-empty backup.
echo "==> [3/10] Sauvegarde de PostgreSQL"
BOXPILOT_PROJECT_DIR="$PROJECT_DIR" bash "$SCRIPT_DIR/backup-production.sh" \
  || fail "La sauvegarde a échoué. Mise à jour annulée — rien n'a été modifié."

# 4. Stop only the app service; PostgreSQL keeps running throughout.
echo "==> [4/10] Arrêt du service application (PostgreSQL reste actif)"
if compose ps --status running --services 2>/dev/null | grep -q '^app$'; then
  compose stop app || fail "Impossible d'arrêter le service application."
else
  echo "    (déjà arrêté)"
fi

# 5. Refresh the source, keep the current image as a rollback point, build
#    the new one.
echo "==> [5/10] Préparation de la nouvelle image"
if docker image inspect "$APP_IMAGE:latest" >/dev/null 2>&1; then
  docker tag "$APP_IMAGE:latest" "$ROLLBACK_TAG"
  echo "    Image précédente conservée sous $ROLLBACK_TAG (rollback possible)."
fi

if [ "$REPO_ROOT" != "$PROJECT_DIR" ]; then
  echo "    Copie du nouveau code source vers $PROJECT_DIR"
  rsync -a \
    --exclude ".git" \
    --exclude ".env" \
    --exclude "node_modules" \
    --exclude ".next" \
    --exclude "coverage" \
    --exclude "playwright-report" \
    --exclude "test-results" \
    --exclude "packaging" \
    "$REPO_ROOT/" "$PROJECT_DIR/"
fi

compose build app || fail "La construction de la nouvelle image a échoué. L'ancienne image reste disponible sous $ROLLBACK_TAG."

# 6. Make sure PostgreSQL is up and healthy before migrating.
echo "==> [6/10] Vérification de PostgreSQL"
compose up -d db || fail "Impossible de démarrer PostgreSQL."
WAITED=0
until [ "$(docker inspect boxpilot-db --format '{{.State.Health.Status}}' 2>/dev/null)" = "healthy" ]; do
  sleep 2
  WAITED=$((WAITED + 2))
  if [ "$WAITED" -ge 60 ]; then
    fail "PostgreSQL n'est pas devenu sain à temps."
  fi
done

# 7. Apply pending Prisma migrations using the NEW image, in a throwaway
#    container, against the already-running PostgreSQL — before the new
#    app is ever started. If this fails, the old app is still stopped but
#    its image is untouched and available for rollback.
echo "==> [7/10] Application des migrations Prisma (prisma migrate deploy)"
compose run --rm --no-deps app npx prisma migrate deploy \
  || fail "Les migrations ont échoué. L'ancienne image reste disponible sous $ROLLBACK_TAG. La base n'a pas été modifiée au-delà des migrations déjà tentées par Prisma (qui applique chaque migration dans sa propre transaction)."

# 8. Start the new app.
echo "==> [8/10] Démarrage de la nouvelle version"
compose up -d app || fail "Le démarrage de la nouvelle version a échoué. Rollback : voir les instructions ci-dessous.
   docker tag $ROLLBACK_TAG $APP_IMAGE:latest
   docker compose --env-file \"$SUPPORT_ENV\" -f \"$SUPPORT_COMPOSE\" -f \"$SUPPORT_COMPOSE_PROD\" --project-directory \"$PROJECT_DIR\" up -d app"

# 9. Wait for /api/health to report ok.
echo "==> [9/10] Attente de $HEALTH_URL"
WAITED=0
until curl -sf "$HEALTH_URL" 2>/dev/null | grep -q '"status":"ok"'; do
  sleep 2
  WAITED=$((WAITED + 2))
  if [ "$WAITED" -ge 90 ]; then
    fail "L'application ne répond pas 'ok' sur /api/health après ${WAITED}s. Rollback possible :
   docker tag $ROLLBACK_TAG $APP_IMAGE:latest
   docker compose --env-file \"$SUPPORT_ENV\" -f \"$SUPPORT_COMPOSE\" -f \"$SUPPORT_COMPOSE_PROD\" --project-directory \"$PROJECT_DIR\" up -d app"
  fi
done

NEW_VERSION="$(curl -sf "$HEALTH_URL" 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4)"

# 10. Success.
echo ""
echo "✅ [10/10] Mise à jour terminée. BoxPilot version ${NEW_VERSION:-inconnue} est en ligne."
echo ""
echo "   En cas de souci découvert plus tard, rollback du code applicatif tant que $ROLLBACK_TAG existe :"
echo "     docker tag $ROLLBACK_TAG $APP_IMAGE:latest"
echo "     docker compose --env-file \"$SUPPORT_ENV\" -f \"$SUPPORT_COMPOSE\" -f \"$SUPPORT_COMPOSE_PROD\" --project-directory \"$PROJECT_DIR\" up -d app"
echo "   ⚠️  Ce rollback ne concerne que le code : les migrations Prisma déjà appliquées ne sont pas annulées."
