"""Export NBA possession and lineup enrichment from pbpstats.

Run outside Vercel on your local machine, worker, or GitHub Action.

Install:
  python -m pip install pbpstats pandas

Examples:
  python scripts/fetch-pbpstats-nba.py data/nba/raw --games=0022300001,0022300002
  python scripts/fetch-pbpstats-nba.py data/nba/raw --games-file=data/nba/raw/game_ids.txt --limit=100 --skip-existing

Output:
  data/nba/raw/pbpstats_possessions.json
  data/nba/raw/pbpstats_team_enrichment.json
  data/nba/raw/pbpstats_errors.json
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export pbpstats NBA possessions into SharkEdge raw warehouse files.")
    parser.add_argument("out_dir", nargs="?", default="data/nba/raw")
    parser.add_argument("--games", default="", help="Comma-separated NBA game IDs, e.g. 0022300001,0022300002")
    parser.add_argument("--games-file", default="", help="Text file with one NBA game ID per line")
    parser.add_argument("--source", choices=["web", "file"], default="web")
    parser.add_argument("--data-dir", default="data/nba/pbpstats", help="pbpstats cache/source directory")
    parser.add_argument("--limit", default="0", help="Max games to process. 0 means no limit.")
    parser.add_argument("--skip-existing", action="store_true", help="Skip game IDs already present in pbpstats_possessions.json")
    return parser.parse_args()


def game_ids_from_args(args: argparse.Namespace) -> list[str]:
    ids: list[str] = []
    if args.games:
        ids.extend([item.strip() for item in args.games.split(",") if item.strip()])
    if args.games_file:
        ids.extend([line.strip() for line in Path(args.games_file).read_text().splitlines() if line.strip() and not line.startswith("#")])
    unique = list(dict.fromkeys(ids))
    limit = int(args.limit or "0")
    return unique[:limit] if limit > 0 else unique


def load_json_rows(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        body = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    if isinstance(body, list):
        return body
    if isinstance(body, dict) and isinstance(body.get("rows"), list):
        return body["rows"]
    return []


def load_json_errors(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    try:
        body = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    if isinstance(body, list):
        return body
    if isinstance(body, dict) and isinstance(body.get("errors"), list):
        return body["errors"]
    return []


def load_possessions(game_id: str, source: str, data_dir: str) -> list[Any]:
    try:
        from pbpstats.data_loader import StatsNbaPossessionLoader
    except Exception as exc:  # pragma: no cover - runtime dependency
        raise RuntimeError("Missing pbpstats. Install with: python -m pip install pbpstats") from exc

    loader = StatsNbaPossessionLoader(game_id, source, data_dir)
    return list(getattr(loader, "items", []) or [])


def possession_data(item: Any) -> dict[str, Any]:
    data = getattr(item, "data", None)
    if isinstance(data, dict):
        return data
    if callable(data):
        value = data()
        if isinstance(value, dict):
            return value
    if isinstance(item, dict):
        return item
    return {key: value for key, value in getattr(item, "__dict__", {}).items() if not key.startswith("_")}


def first(data: dict[str, Any], *keys: str, default: Any = None) -> Any:
    lowered = {key.lower().replace("_", ""): value for key, value in data.items()}
    for key in keys:
        if key in data and data[key] not in (None, ""):
            return data[key]
        normalized = key.lower().replace("_", "")
        if normalized in lowered and lowered[normalized] not in (None, ""):
            return lowered[normalized]
    return default


def as_number(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except Exception:
        return default


def normalize_possession(game_id: str, index: int, item: Any) -> dict[str, Any]:
    data = possession_data(item)
    events = first(data, "events", "possession_events", default=[]) or []
    team_name = first(data, "teamName", "offense_team", "offenseTeamName", "team_name", "offense_team_name", default="")
    team_id = first(data, "teamId", "offense_team_id", "offenseTeamId", default="")
    players = first(data, "playersOnFloor", "players_on_floor", "lineup", "offense_players", default=[])
    if not isinstance(players, list):
        players = [players] if players else []

    points = as_number(first(data, "points", "possessionPoints", "pts", default=0))
    start_score_margin = as_number(first(data, "startScoreMargin", "start_score_margin", "score_margin", default=0))
    end_score_margin = as_number(first(data, "endScoreMargin", "end_score_margin", default=start_score_margin))
    second_chance = as_number(first(data, "secondChanceTime", "second_chance_time", default=0))
    offensive_rebounds = as_number(first(data, "offensiveRebounds", "offensive_rebounds", default=0))

    return {
        "gameId": game_id,
        "period": first(data, "period", "quarter", default=None),
        "possessionNumber": first(data, "possessionNumber", "possession_number", default=index + 1),
        "teamId": team_id,
        "teamName": team_name,
        "playersOnFloor": players,
        "startTime": first(data, "startTime", "start_time", default=None),
        "endTime": first(data, "endTime", "end_time", default=None),
        "points": points,
        "scoreMargin": end_score_margin,
        "startScoreMargin": start_score_margin,
        "endScoreMargin": end_score_margin,
        "previousPossessionResult": first(data, "previousPossessionResult", "previous_possession_result", default=None),
        "secondChanceTime": second_chance,
        "offensiveRebounds": offensive_rebounds,
        "eventCount": len(events) if isinstance(events, list) else 0,
        "raw": data,
    }


def team_enrichment(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    names: dict[str, str] = {}
    for row in rows:
        team_key = str(row.get("teamName") or row.get("teamId") or "").strip()
        if not team_key:
            continue
        names[team_key] = str(row.get("teamName") or team_key)
        grouped[team_key]["possessions"] += 1
        grouped[team_key]["points"] += as_number(row.get("points"))
        grouped[team_key]["secondChanceTime"] += as_number(row.get("secondChanceTime"))
        grouped[team_key]["offensiveRebounds"] += as_number(row.get("offensiveRebounds"))
        grouped[team_key]["scoreMargin"] += as_number(row.get("endScoreMargin", row.get("scoreMargin")))
        grouped[team_key]["eventCount"] += as_number(row.get("eventCount"))

    output: list[dict[str, Any]] = []
    for key, stats in grouped.items():
        possessions = max(1.0, stats["possessions"])
        output.append({
            "teamName": names[key],
            "pbpPossessions": int(stats["possessions"]),
            "pbpPointsPerPossession": round(stats["points"] / possessions, 4),
            "pbpPointsPer100": round(stats["points"] * 100 / possessions, 2),
            "pbpSecondChanceTimePerPossession": round(stats["secondChanceTime"] / possessions, 4),
            "pbpOffensiveReboundsPerPossession": round(stats["offensiveRebounds"] / possessions, 4),
            "pbpAvgScoreMargin": round(stats["scoreMargin"] / possessions, 3),
            "pbpEventsPerPossession": round(stats["eventCount"] / possessions, 3),
            "__source": "pbpstats-possession-export",
            "__sourceLabel": "PBP Stats possession/lineup enrichment",
            "__sourceTier": "advanced",
            "__sourcePriority": 4,
            "__sourceWeight": 1.06,
            "__license": "public-or-self-hosted",
        })
    return output


def main() -> None:
    args = parse_args()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    possessions_file = out_dir / "pbpstats_possessions.json"
    enrichment_file = out_dir / "pbpstats_team_enrichment.json"
    errors_file = out_dir / "pbpstats_errors.json"

    existing_rows = load_json_rows(possessions_file)
    existing_errors = load_json_errors(errors_file)
    existing_game_ids = {str(row.get("gameId")) for row in existing_rows if row.get("gameId")}
    game_ids = game_ids_from_args(args)
    if args.skip_existing:
        game_ids = [game_id for game_id in game_ids if game_id not in existing_game_ids]
    if not game_ids and not existing_rows:
        raise SystemExit("No game IDs supplied. Use --games=0022300001 or --games-file=path/to/game_ids.txt")

    rows: list[dict[str, Any]] = list(existing_rows)
    errors: list[dict[str, str]] = list(existing_errors)
    for game_id in game_ids:
        try:
            possessions = load_possessions(game_id, args.source, args.data_dir)
            rows.extend(normalize_possession(game_id, index, item) for index, item in enumerate(possessions))
        except Exception as exc:
            errors.append({"gameId": game_id, "error": str(exc)})

    possessions_file.write_text(json.dumps({"source": "pbpstats", "rows": rows, "errors": errors}, indent=2), encoding="utf-8")
    enrichment_file.write_text(json.dumps({"source": "pbpstats", "rows": team_enrichment(rows)}, indent=2), encoding="utf-8")
    errors_file.write_text(json.dumps({"source": "pbpstats", "errors": errors}, indent=2), encoding="utf-8")

    print(json.dumps({
        "ok": len(errors) == 0,
        "source": "pbpstats",
        "gamesRequested": len(game_ids),
        "possessionRows": len(rows),
        "errors": errors[-10:],
        "written": {
            "possessions": str(possessions_file),
            "teamEnrichment": str(enrichment_file),
            "errors": str(errors_file),
        },
    }, indent=2))


if __name__ == "__main__":
    main()
