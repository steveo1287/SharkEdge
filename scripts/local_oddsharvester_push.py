#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shlex
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests

SPORTS = [
    {
        "key": "basketball_nba",
        "sport": "basketball",
        "league": "usa-nba",
        "markets": "moneyline,asian_handicap,over/under",
        "title": "NBA",
    },
    {
        "key": "basketball_ncaab",
        "sport": "basketball",
        "league": "usa-ncaa",
        "markets": "moneyline,asian_handicap,over/under",
        "title": "NCAAB",
    },
    {
        "key": "baseball_mlb",
        "sport": "baseball",
        "league": "mlb",
        "markets": "home_away",
        "title": "MLB",
    },
    {
        "key": "icehockey_nhl",
        "sport": "ice-hockey",
        "league": "usa-nhl",
        "markets": "home_away,over/under",
        "title": "NHL",
    },
    {
        "key": "americanfootball_nfl",
        "sport": "american-football",
        "league": "usa-nfl",
        "markets": "moneyline,asian_handicap,over/under",
        "title": "NFL",
    },
    {
        "key": "americanfootball_ncaaf",
        "sport": "american-football",
        "league": "usa-ncaa",
        "markets": "moneyline,asian_handicap,over/under",
        "title": "NCAAF",
    },
]

BACKEND_URL = os.getenv("SHARKEDGE_BACKEND_URL", "https://shark-odds-1.onrender.com").rstrip("/")
INGEST_URL = f"{BACKEND_URL}/api/ingest/odds"
API_KEY = os.getenv("SHARKEDGE_API_KEY", "").strip()
ODDSHARVESTER_COMMAND = os.getenv("ODDSHARVESTER_COMMAND", "python -m oddsharvester").strip()
ODDSHARVESTER_TIMEOUT_SECONDS = int(os.getenv("ODDSHARVESTER_TIMEOUT_SECONDS", "120"))
ODDSHARVESTER_HEADLESS = os.getenv("ODDSHARVESTER_HEADLESS", "true").strip().lower() not in {"0", "false", "no", "off"}
ODDSHARVESTER_PROXY_URL = os.getenv("ODDSHARVESTER_PROXY_URL", "").strip()
OUTPUT_DIR = Path(os.getenv("ODDSHARVESTER_OUTPUT_DIR", "./tmp/oddsharvester-output"))
POST_TO_BACKEND = os.getenv("POST_TO_BACKEND", "true").strip().lower() not in {"0", "false", "no", "off"}
BEST_EFFORT_CONTINUE = os.getenv("BEST_EFFORT_CONTINUE", "true").strip().lower() not in {"0", "false", "no", "off"}
ENABLED_SPORT_KEYS = {
    token.strip()
    for token in os.getenv("ENABLED_SPORT_KEYS", "").split(",")
    if token.strip()
}


@dataclass
class GamePayload:
    payload: dict[str, Any]
    lines_added: int


def command_parts() -> list[str]:
    return shlex.split(ODDSHARVESTER_COMMAND)


def build_subprocess_env() -> dict[str, str]:
    env = os.environ.copy()
    if ODDSHARVESTER_PROXY_URL:
        env["HTTP_PROXY"] = ODDSHARVESTER_PROXY_URL
        env["HTTPS_PROXY"] = ODDSHARVESTER_PROXY_URL
        env["ALL_PROXY"] = ODDSHARVESTER_PROXY_URL
    return env


def env_override_name(prefix: str, sport_key: str) -> str:
    return f"{prefix}_{sport_key.upper()}"


def get_sport_league(sport: dict[str, str]) -> str:
    return os.getenv(env_override_name("ODDSHARVESTER_LEAGUES", sport["key"]), sport["league"]).strip()


def get_sport_markets(sport: dict[str, str]) -> str:
    return os.getenv(env_override_name("ODDSHARVESTER_MARKETS", sport["key"]), sport["markets"]).strip()


def get_enabled_sports() -> list[dict[str, str]]:
    if not ENABLED_SPORT_KEYS:
        return SPORTS
    return [sport for sport in SPORTS if sport["key"] in ENABLED_SPORT_KEYS]


def extract_events(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if not isinstance(payload, dict):
        return []

    for key in ("events", "matches", "items", "results", "data"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        if isinstance(value, dict):
            nested = extract_events(value)
            if nested:
                return nested

    return []


def extract_name(value: Any) -> str | None:
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, dict):
        for key in ("name", "display_name", "displayName", "team", "participant", "competitor"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
    return None


def extract_teams(event: dict[str, Any]) -> tuple[str | None, str | None]:
    home_team = extract_name(event.get("home_team") or event.get("home") or event.get("homeTeam"))
    away_team = extract_name(event.get("away_team") or event.get("away") or event.get("awayTeam"))
    if home_team and away_team:
        return away_team, home_team

    participants = event.get("participants") or event.get("competitors") or event.get("teams")
    if not isinstance(participants, list):
        return away_team, home_team

    ordered: list[str] = []
    home_candidate = None
    away_candidate = None
    for participant in participants:
        if not isinstance(participant, dict):
            continue
        name = extract_name(participant)
        if not name:
            continue
        ordered.append(name)
        role = str(participant.get("role") or participant.get("homeAway") or participant.get("side") or "").lower()
        if role in {"home", "h"}:
            home_candidate = name
        elif role in {"away", "a"}:
            away_candidate = name

    if not away_candidate and ordered:
        away_candidate = ordered[0]
    if not home_candidate and len(ordered) > 1:
        home_candidate = ordered[1]
    return away_candidate or away_team, home_candidate or home_team


def normalize_market_key(value: Any) -> str | None:
    normalized = "".join(ch for ch in str(value or "").lower() if ch.isalnum())
    if any(token in normalized for token in ["moneyline", "matchwinner", "homeaway", "1x2"]):
        return "moneyline"
    if any(token in normalized for token in ["asianhandicap", "spread", "spreads", "handicap"]):
        return "spread"
    if any(token in normalized for token in ["overunder", "totals", "total"]):
        return "total"
    return None


def parse_numeric(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.strip().replace(",", "").replace("−", "-").replace("½", ".5")
        if not cleaned:
            return None
        number = []
        found_digit = False
        for ch in cleaned:
            if ch.isdigit() or ch in {"-", "+", "."}:
                number.append(ch)
                if ch.isdigit():
                    found_digit = True
            elif found_digit:
                break
        if number and found_digit:
            try:
                return float("".join(number))
            except ValueError:
                return None
    return None


def normalize_price(value: Any) -> int | None:
    numeric = parse_numeric(value)
    if numeric is None:
        return None
    if abs(numeric) >= 100:
        return int(round(numeric))
    if numeric <= 1:
        return None
    if numeric >= 2:
        return int(round((numeric - 1) * 100))
    return int(round(-100 / (numeric - 1)))


def iter_markets(bookmaker: dict[str, Any]) -> list[dict[str, Any]]:
    candidate = bookmaker.get("markets") or bookmaker.get("odds") or bookmaker.get("submarkets")
    if isinstance(candidate, list):
        return [item for item in candidate if isinstance(item, dict)]
    if isinstance(candidate, dict):
        markets: list[dict[str, Any]] = []
        for key, value in candidate.items():
            if isinstance(value, dict):
                markets.append({"key": key, **value})
            elif isinstance(value, list):
                markets.append({"key": key, "outcomes": value})
        return markets
    return []


def iter_outcomes(raw_market: dict[str, Any]) -> list[dict[str, Any]]:
    outcomes = raw_market.get("outcomes") or raw_market.get("selections") or raw_market.get("rows")
    if isinstance(outcomes, list):
        return [item for item in outcomes if isinstance(item, dict)]
    if isinstance(outcomes, dict):
        normalized: list[dict[str, Any]] = []
        for key, value in outcomes.items():
            if isinstance(value, dict):
                normalized.append({"name": key, **value})
            else:
                normalized.append({"name": key, "price": value})
        return normalized
    return []


def normalize_outcome_name(raw_name: str | None, market_type: str, away_team: str, home_team: str) -> str | None:
    if not raw_name:
        return None
    lowered = raw_name.strip().lower()
    if market_type == "total":
        if lowered.startswith("over"):
            return "Over"
        if lowered.startswith("under"):
            return "Under"
        return None
    if lowered in {"home", "1"}:
        return home_team
    if lowered in {"away", "2"}:
        return away_team
    if lowered in {"draw", "x"}:
        return "Draw"
    return raw_name.strip()


def build_payload_for_event(sport: dict[str, str], event: dict[str, Any]) -> GamePayload | None:
    away_team, home_team = extract_teams(event)
    if not away_team or not home_team:
        return None

    bookmakers = event.get("bookmakers") or event.get("odds") or []
    if isinstance(bookmakers, dict):
        bookmaker_list = [{"key": key, **value} for key, value in bookmakers.items() if isinstance(value, dict)]
    elif isinstance(bookmakers, list):
        bookmaker_list = [bookmaker for bookmaker in bookmakers if isinstance(bookmaker, dict)]
    else:
        bookmaker_list = []

    lines: list[dict[str, Any]] = []
    best = {
        "homeMoneyline": None,
        "awayMoneyline": None,
        "homeSpread": None,
        "awaySpread": None,
        "homeSpreadOdds": None,
        "awaySpreadOdds": None,
        "total": None,
        "overOdds": None,
        "underOdds": None,
    }

    for bookmaker in bookmaker_list:
        title = str(bookmaker.get("title") or bookmaker.get("name") or bookmaker.get("bookmaker") or "OddsHarvester")
        line = {
            "book": title,
            "fetchedAt": bookmaker.get("last_update") or bookmaker.get("updated_at") or bookmaker.get("updatedAt"),
        }

        moneyline_map: dict[str, int] = {}
        spread_map: dict[str, tuple[float | None, int | None]] = {}
        total_map: dict[str, tuple[float | None, int | None]] = {}

        for raw_market in iter_markets(bookmaker):
            market_type = normalize_market_key(raw_market.get("key") or raw_market.get("name") or raw_market.get("market"))
            if not market_type:
                continue
            for outcome in iter_outcomes(raw_market):
                raw_name = outcome.get("name") or outcome.get("label") or outcome.get("selection") or outcome.get("outcome")
                normalized_name = normalize_outcome_name(str(raw_name) if raw_name is not None else None, market_type, away_team, home_team)
                if not normalized_name:
                    continue
                price = normalize_price(outcome.get("price") or outcome.get("odds") or outcome.get("value") or outcome.get("american") or outcome.get("decimal"))
                point = parse_numeric(outcome.get("point") or outcome.get("line") or raw_market.get("point") or raw_market.get("line"))
                if market_type == "moneyline" and price is not None:
                    moneyline_map[normalized_name] = price
                elif market_type == "spread":
                    spread_map[normalized_name] = (point, price)
                elif market_type == "total":
                    total_map[normalized_name] = (point, price)

        if away_team in moneyline_map:
            line["awayMoneyline"] = moneyline_map[away_team]
        if home_team in moneyline_map:
            line["homeMoneyline"] = moneyline_map[home_team]
        if away_team in spread_map:
            line["awaySpread"], line["awaySpreadOdds"] = spread_map[away_team]
        if home_team in spread_map:
            line["homeSpread"], line["homeSpreadOdds"] = spread_map[home_team]
        if "Over" in total_map:
            line["total"], line["overOdds"] = total_map["Over"]
        if "Under" in total_map and line.get("total") is None:
            line["total"], _ = total_map["Under"]
        if "Under" in total_map:
            _, line["underOdds"] = total_map["Under"]

        has_any = any(
            line.get(key) is not None
            for key in (
                "homeMoneyline",
                "awayMoneyline",
                "homeSpread",
                "awaySpread",
                "total",
                "overOdds",
                "underOdds",
            )
        )
        if not has_any:
            continue
        lines.append(line)

        for key in (
            "homeMoneyline",
            "awayMoneyline",
            "homeSpread",
            "awaySpread",
            "homeSpreadOdds",
            "awaySpreadOdds",
            "total",
            "overOdds",
            "underOdds",
        ):
            if best[key] is None and line.get(key) is not None:
                best[key] = line.get(key)

    if not lines:
        return None

    event_id = str(
        event.get("id")
        or event.get("event_id")
        or event.get("eventId")
        or event.get("match_id")
        or event.get("matchId")
        or f"{sport['key']}:{away_team}:{home_team}"
    )
    payload = {
        "sport": sport["sport"],
        "sportKey": sport["key"],
        "eventKey": f"oddsharvester:{sport['key']}:{event_id}",
        "homeTeam": home_team,
        "awayTeam": away_team,
        "commenceTime": event.get("commence_time")
        or event.get("start_time")
        or event.get("startTime")
        or event.get("date")
        or event.get("event_time")
        or event.get("match_time")
        or event.get("datetime"),
        "scrapedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "oddsharvester",
        "sourceMeta": {
            "origin": "oddsharvester",
            "league": sport["title"],
            "provider": "oddsharvester",
        },
        **best,
        "lines": lines,
    }
    return GamePayload(payload=payload, lines_added=len(lines))


def run_harvest_for_sport(sport: dict[str, str]) -> list[GamePayload]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    league = get_sport_league(sport)
    markets = get_sport_markets(sport)
    if not league or not markets:
        raise RuntimeError(f"Missing league or market config for {sport['key']}")

    command = command_parts()
    with tempfile.TemporaryDirectory(prefix=f"oddsharvester-{sport['key']}-") as temp_dir:
        output_base = Path(temp_dir) / sport["key"]
        command.extend([
            "upcoming",
            "-s", sport["sport"],
            "-l", league,
            "-m", markets,
            "-f", "json",
            "-o", str(output_base),
        ])
        if ODDSHARVESTER_HEADLESS:
            command.append("--headless")

        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=ODDSHARVESTER_TIMEOUT_SECONDS,
            check=False,
            env=build_subprocess_env(),
        )

        if completed.returncode != 0:
            detail = completed.stderr.strip() or completed.stdout.strip() or f"exit code {completed.returncode}"
            raise RuntimeError(f"OddsHarvester failed for {sport['title']}: {detail}")

        payload = None
        for candidate in [output_base, output_base.with_suffix('.json'), Path(temp_dir) / 'output.json']:
            if candidate.exists():
                payload = json.loads(candidate.read_text(encoding='utf-8'))
                break
        if payload is None and completed.stdout.strip().startswith(("{", "[")):
            payload = json.loads(completed.stdout)
        if payload is None:
            raise RuntimeError(f"OddsHarvester returned no JSON for {sport['title']}")

        events = extract_events(payload)
        results: list[GamePayload] = []
        for event in events:
            mapped = build_payload_for_event(sport, event)
            if mapped:
                results.append(mapped)

        dump_path = OUTPUT_DIR / f"{sport['key']}.json"
        dump_path.write_text(json.dumps([item.payload for item in results], indent=2), encoding='utf-8')
        return results


def post_payload(payload: dict[str, Any]) -> bool:
    if not POST_TO_BACKEND:
        return True
    if not API_KEY:
        raise RuntimeError("SHARKEDGE_API_KEY is required when POST_TO_BACKEND=true")

    response = requests.post(
        INGEST_URL,
        json=payload,
        headers={"Content-Type": "application/json", "x-api-key": API_KEY},
        timeout=20,
    )
    return response.ok


def main() -> None:
    total_games = 0
    total_posts = 0
    print(f"Local OddsHarvester push -> {BACKEND_URL}")
    if ODDSHARVESTER_PROXY_URL:
        print("Proxy mode enabled for OddsHarvester subprocesses")

    for sport in get_enabled_sports():
        print(f"\n[{sport['title']}] harvesting...")
        try:
            harvested = run_harvest_for_sport(sport)
        except Exception as error:
            print(f"  ✗ harvest failed: {error}")
            if BEST_EFFORT_CONTINUE:
                continue
            raise

        total_games += len(harvested)
        print(f"  harvested {len(harvested)} games")
        for game in harvested:
            ok = post_payload(game.payload)
            if ok:
                total_posts += 1
                print(f"  ✓ posted {game.payload['awayTeam']} @ {game.payload['homeTeam']} ({game.lines_added} books)")
            else:
                print(f"  ✗ failed {game.payload['awayTeam']} @ {game.payload['homeTeam']}")

    print(f"\nDone. harvested={total_games} posted={total_posts}")


if __name__ == "__main__":
    main()
