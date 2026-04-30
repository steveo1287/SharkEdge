"""Optional free NBA possession/lineup enrichment template using pbpstats.

Run outside Vercel on your local machine/worker.

Install:
  python -m pip install pbpstats pandas

This template intentionally does not hard-code a huge backfill loop because pbpstats
can be slow and endpoint-sensitive. Use it to export possessions for selected games
or seasons into `data/nba/raw/pbpstats_possessions.json` / `.csv`, then run the
warehouse builder.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> None:
    out_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "data/nba/raw")
    out_dir.mkdir(parents=True, exist_ok=True)
    template = {
        "ok": True,
        "source": "pbpstats",
        "note": "Use pbpstats client exports here. SharkEdge reads pbpstats_possessions.json/csv when present.",
        "expected_output": str(out_dir / "pbpstats_possessions.json"),
        "row_shape_example": {
            "gameId": "0022300001",
            "period": 1,
            "possessionNumber": 1,
            "teamName": "Boston Celtics",
            "playersOnFloor": ["player1", "player2", "player3", "player4", "player5"],
            "startTime": "12:00",
            "endTime": "11:38",
            "points": 2,
            "scoreMargin": 2,
            "previousPossessionResult": "missed_shot",
            "shotQuality": 0.54
        }
    }
    print(json.dumps(template, indent=2))


if __name__ == "__main__":
    main()
