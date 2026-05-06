#!/usr/bin/env bash
# Run prisma migrate deploy against the Railway Postgres database.
#
# Requires .env.migrations with either:
#   RAILWAY_DATABASE_URL  — direct postgres URL (preferred, no CLI auth needed)
#   RAILWAY_TOKEN + RAILWAY_PROJECT_ID + RAILWAY_SERVICE_ID  — use railway run
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

# Path A: direct DATABASE_URL (works without CLI auth)
if [[ -n "${RAILWAY_DATABASE_URL:-}" ]]; then
  echo "🚆  Running prisma migrate deploy on Railway (direct URL)..."
  DATABASE_URL="$RAILWAY_DATABASE_URL" \
  POSTGRES_PRISMA_URL="" \
  POSTGRES_URL="" \
    npx prisma migrate deploy
  echo "✅  Railway migration complete."
  exit 0
fi

# Path B: railway run (requires RAILWAY_TOKEN + project/service IDs)
if [[ -z "${RAILWAY_TOKEN:-}" ]]; then
  echo "❌  Set RAILWAY_DATABASE_URL or RAILWAY_TOKEN in .env.migrations"
  exit 1
fi
if [[ -z "${RAILWAY_PROJECT_ID:-}" || -z "${RAILWAY_SERVICE_ID:-}" ]]; then
  echo "❌  RAILWAY_PROJECT_ID and RAILWAY_SERVICE_ID must be set in .env.migrations"
  exit 1
fi

export RAILWAY_TOKEN
echo "🚆  Running prisma migrate deploy on Railway (CLI)..."
echo "    Project: $RAILWAY_PROJECT_ID  Service: $RAILWAY_SERVICE_ID"
railway run \
  --project "$RAILWAY_PROJECT_ID" \
  --service "$RAILWAY_SERVICE_ID" \
  npx prisma migrate deploy
echo "✅  Railway migration complete."
