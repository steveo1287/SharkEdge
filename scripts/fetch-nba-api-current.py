"""Free NBA current-data fetch template using nba_api.

Run outside Vercel on your local machine/worker, then copy generated JSON files to
`data/nba/raw` before running `npm run nba:warehouse:features`.

Install:
  python -m pip install nba_api pandas

Run:
  python scripts/fetch-nba-api-current.py data/nba/raw
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd
from nba_api.stats.endpoints import leaguedashplayerstats, leaguedashteamstats, leaguegamefinder


def write_json(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(df.to_json(orient="records"), encoding="utf-8")


def main() -> None:
    out_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "data/nba/raw")
    out_dir.mkdir(parents=True, exist_ok=True)

    team = leaguedashteamstats.LeagueDashTeamStats(
        per_mode_detailed="Per100Possessions",
        measure_type_detailed_defense="Advanced",
        season_type_all_star="Regular Season",
    ).get_data_frames()[0]
    write_json(team, out_dir / "nba_api_team_advanced.json")

    player = leaguedashplayerstats.LeagueDashPlayerStats(
        per_mode_detailed="PerGame",
        measure_type_detailed_defense="Advanced",
        season_type_all_star="Regular Season",
    ).get_data_frames()[0]
    write_json(player, out_dir / "nba_api_player_advanced.json")

    games = leaguegamefinder.LeagueGameFinder(league_id_nullable="00").get_data_frames()[0]
    write_json(games, out_dir / "nba_api_games.json")

    summary = {
        "ok": True,
        "source": "nba_api",
        "out_dir": str(out_dir),
        "rows": {
            "team_advanced": len(team),
            "player_advanced": len(player),
            "games": len(games),
        },
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
