#!/usr/bin/env bash
# Run prisma migrate deploy against both Railway and Render.
# See .env.migrations.example for required variables.
#
# Usage:
#   bash scripts/migrate-all.sh
#   bash scripts/migrate-all.sh railway   # Railway only
#   bash scripts/migrate-all.sh render    # Render only
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-all}"

run_railway() { bash "$SCRIPT_DIR/migrate-railway.sh"; }
run_render()  { bash "$SCRIPT_DIR/migrate-render.sh";  }

case "$TARGET" in
  railway) run_railway ;;
  render)  run_render  ;;
  all)
    run_railway
    echo ""
    run_render
    ;;
  *)
    echo "Usage: migrate-all.sh [railway|render|all]"
    exit 1
    ;;
esac
