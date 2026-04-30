#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-data/nba/raw}"
DATASET="eoinamoore/historical-nba-data-and-player-box-scores"

mkdir -p "$OUT_DIR"

if ! command -v kaggle >/dev/null 2>&1; then
  echo "Missing kaggle CLI. Install with: python -m pip install kaggle" >&2
  exit 1
fi

if [ ! -f "$HOME/.kaggle/kaggle.json" ] && [ -z "${KAGGLE_USERNAME:-}" ]; then
  echo "Missing Kaggle credentials. Put kaggle.json in ~/.kaggle/ or set KAGGLE_USERNAME/KAGGLE_KEY." >&2
  exit 1
fi

kaggle datasets download -d "$DATASET" -p "$OUT_DIR" --unzip

echo "Downloaded $DATASET into $OUT_DIR"
find "$OUT_DIR" -maxdepth 2 -type f | sort
