#!/usr/bin/env bash
# Run prisma migrate deploy against the Railway Postgres database.
#
# Requires .env.migrations with RAILWAY_TOKEN, RAILWAY_PROJECT_ID,
# and RAILWAY_SERVICE_ID filled in (see .env.migrations.example).
#
# Usage:
#   bash scripts/migrate-railway.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT/.env.migrations"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌  $ENV_FILE not found."
  echo "    Copy .env.migrations.example → .env.migrations and fill in the values."
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

if [[ -z "${RAILWAY_TOKEN:-}" ]]; then
  echo "❌  RAILWAY_TOKEN is not set in .env.migrations"
  exit 1
fi

if [[ -z "${RAILWAY_PROJECT_ID:-}" || -z "${RAILWAY_SERVICE_ID:-}" ]]; then
  echo "❌  RAILWAY_PROJECT_ID and RAILWAY_SERVICE_ID must be set in .env.migrations"
  echo "    Find them: Railway dashboard → project → service → Settings → IDs"
  exit 1
fi

export RAILWAY_TOKEN

echo "🚆  Running prisma migrate deploy on Railway..."
echo "    Project: $RAILWAY_PROJECT_ID  Service: $RAILWAY_SERVICE_ID"

railway run \
  --project-id "$RAILWAY_PROJECT_ID" \
  --service-id "$RAILWAY_SERVICE_ID" \
  npx prisma migrate deploy

echo "✅  Railway migration complete."
