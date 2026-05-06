#!/usr/bin/env bash
# Run prisma migrate deploy against the Render Postgres database.
#
# Requires .env.migrations with RENDER_DATABASE_URL filled in.
# Use the "External Database URL" from the Render dashboard (direct connection,
# not through pgBouncer) — it looks like:
#   postgres://user:pass@oregon-postgres.render.com/dbname
#
# Usage:
#   bash scripts/migrate-render.sh
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

if [[ -z "${RENDER_DATABASE_URL:-}" ]]; then
  echo "❌  RENDER_DATABASE_URL is not set in .env.migrations"
  echo "    Render dashboard → Postgres service → Connect tab → External Database URL"
  exit 1
fi

echo "🎨  Running prisma migrate deploy on Render..."

DATABASE_URL="$RENDER_DATABASE_URL" \
POSTGRES_PRISMA_URL="" \
POSTGRES_URL="" \
  npx prisma migrate deploy

echo "✅  Render migration complete."
