from __future__ import annotations

import json
import os
import re
import shlex
import shutil
import subprocess
import tempfile
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from difflib import get_close_matches
from functools import lru_cache
from pathlib import Path
from time import monotonic
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from pinnacle_mlb_scraper import get_pinnacle_mlb_snapshot
from sharkedge_analytics import (
    build_game_edge_block,
    build_sharp_signals,
    enrich_props_with_ev,
)

load_dotenv(Path(__file__).with_name(".env"))

app = FastAPI()
SCRAPER_CACHE_PATH = Path(__file__).with_name("data").joinpath("scraper_live_odds.json")
SCRAPER_CACHE_MAX_AGE_SECONDS = int(os.getenv("SCRAPER_CACHE_MAX_AGE_SECONDS", "180"))
SCRAPER_INGEST_API_KEY = os.getenv("SHARKEDGE_API_KEY", "").strip()

SPORTS = [
    {
        "key": "basketball_ncaab",
        "title": "NCAA Men's Basketball",
        "short_title": "NCAAB",
        "odds_harvester_sport": "basketball",
        "odds_harvester_leagues": "usa-ncaa",
        "odds_harvester_markets": "moneyline,asian_handicap,over/under",
    },
    {
        "key": "basketball_nba",
        "title": "NBA",
        "short_title": "NBA",
        "odds_harvester_sport": "basketball",
        "odds_harvester_leagues": "usa-nba",
        "odds_harvester_markets": "moneyline,asian_handicap,over/under",
    },
    {
        "key": "baseball_mlb",
        "title": "MLB",
        "short_title": "MLB",
        "odds_harvester_sport": "baseball",
        "odds_harvester_leagues": "mlb",
        "odds_harvester_markets": "home_away",
    },
    {
        "key": "icehockey_nhl",
        "title": "NHL",
        "short_title": "NHL",
        "odds_harvester_sport": "ice-hockey",
        "odds_harvester_leagues": "usa-nhl",
        "odds_harvester_markets": "home_away,over/under",
    },
    {
        "key": "americanfootball_nfl",
        "title": "NFL",
        "short_title": "NFL",
        "odds_harvester_sport": "american-football",
        "odds_harvester_leagues": "usa-nfl",
        "odds_harvester_markets": "moneyline,asian_handicap,over/under",
    },
    {
        "key": "americanfootball_ncaaf",
        "title": "College Football",
        "short_title": "NCAAF",
        "odds_harvester_sport": "american-football",
        "odds_harvester_leagues": "usa-ncaa",
        "odds_harvester_markets": "moneyline,asian_handicap,over/under",
    },
]
SCRAPER_SPORT_KEY_MAP = {
    ("basketball", "nba"): "basketball_nba",
    ("basketball", "ncaab"): "basketball_ncaab",
    ("basketball", "ncaa men s basketball"): "basketball_ncaab",
    ("basketball", "mens college basketball"): "basketball_ncaab",
    ("baseball", "mlb"): "baseball_mlb",
    ("hockey", "nhl"): "icehockey_nhl",
    ("american-football", "nfl"): "americanfootball_nfl",
    ("american-football", "ncaaf"): "americanfootball_ncaaf",
    ("american-football", "college football"): "americanfootball_ncaaf",
}

BOOKMAKER_PRIORITY = [
    "draftkings",
    "fanduel",
    "betmgm",
    "williamhill_us",
    "betrivers",
    "espnbet",
    "fanatics",
]
DEFAULT_BOOKMAKERS = [
    "draftkings",
    "fanduel",
    "betmgm",
    "williamhill_us",
    "betrivers",
    "espnbet",
    "fanatics",
]
SHARP_REFERENCE_BOOK_KEYS = {
    "pinnacle",
    "circa",
    "bookmaker",
    "cris",
    "lowvig",
    "betonline",
    "heritage",
}
SPORT_ORDER = {sport["key"]: index for index, sport in enumerate(SPORTS)}
ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4/sports"
ODDS_API_MARKETS = "h2h,spreads,totals"
ESPN_SITE_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports"
ESPN_COMMON_BASE_URL = "https://site.web.api.espn.com/apis/common/v3/sports"
ESPN_SPORT_PATHS = {
    "basketball_ncaab": {
        "site": "basketball/mens-college-basketball",
        "common": None,
        "player_leaders": False,
    },
    "basketball_nba": {
        "site": "basketball/nba",
        "common": "basketball/nba",
        "player_leaders": True,
    },
    "baseball_mlb": {
        "site": "baseball/mlb",
        "common": None,
        "player_leaders": False,
    },
    "icehockey_nhl": {
        "site": "hockey/nhl",
        "common": None,
        "player_leaders": False,
    },
    "americanfootball_nfl": {
        "site": "football/nfl",
        "common": None,
        "player_leaders": False,
    },
    "americanfootball_ncaaf": {
        "site": "football/college-football",
        "common": None,
        "player_leaders": False,
    },
}
TEAM_STAT_BLUEPRINTS = {
    "basketball_ncaab": [
        {"key": "avgPoints", "label": "Points/G", "terms": ["avgPoints", "points per game"]},
        {"key": "avgAssists", "label": "Assists/G", "terms": ["avgAssists", "assists per game"]},
        {"key": "avgRebounds", "label": "Rebounds/G", "terms": ["avgRebounds", "rebounds per game"]},
        {"key": "avgSteals", "label": "Steals/G", "terms": ["avgSteals", "steals per game"]},
        {"key": "avgBlocks", "label": "Blocks/G", "terms": ["avgBlocks", "blocks per game"]},
        {"key": "avgTurnovers", "label": "Turnovers/G", "terms": ["avgTurnovers", "turnovers per game"]},
    ],
    "basketball_nba": [
        {"key": "avgPoints", "label": "Points/G", "terms": ["avgPoints", "points per game"]},
        {"key": "avgAssists", "label": "Assists/G", "terms": ["avgAssists", "assists per game"]},
        {"key": "avgRebounds", "label": "Rebounds/G", "terms": ["avgRebounds", "rebounds per game"]},
        {"key": "avgSteals", "label": "Steals/G", "terms": ["avgSteals", "steals per game"]},
        {"key": "avgBlocks", "label": "Blocks/G", "terms": ["avgBlocks", "blocks per game"]},
        {"key": "avgTurnovers", "label": "Turnovers/G", "terms": ["avgTurnovers", "turnovers per game"]},
    ],
    "baseball_mlb": [
        {"key": "avgRuns", "label": "Runs/G", "terms": ["runs per game", "avgRuns"]},
        {"key": "battingAverage", "label": "Bat Avg", "terms": ["batting average", "avg"]},
        {"key": "homeRuns", "label": "Home Runs", "terms": ["home runs"]},
        {"key": "stolenBases", "label": "Steals", "terms": ["stolen bases"]},
        {"key": "earnedRunAverage", "label": "ERA", "terms": ["earned run average", "era"]},
        {"key": "whip", "label": "WHIP", "terms": ["whip"]},
    ],
    "icehockey_nhl": [
        {"key": "goalsPerGame", "label": "Goals/G", "terms": ["goals per game"]},
        {"key": "shotsPerGame", "label": "Shots/G", "terms": ["shots per game"]},
        {"key": "powerPlayPct", "label": "Power Play", "terms": ["power play percentage", "power play %"]},
        {"key": "penaltyKillPct", "label": "Penalty Kill", "terms": ["penalty kill percentage", "penalty kill %"]},
        {"key": "goalsAgainstAverage", "label": "GA/G", "terms": ["goals against average"]},
        {"key": "savePct", "label": "Save %", "terms": ["save percentage", "save %"]},
    ],
}
PLAYER_LEADER_BLUEPRINTS = [
    {"key": "avgPoints", "label": "PPG"},
    {"key": "avgAssists", "label": "APG"},
    {"key": "avgSteals", "label": "SPG"},
    {"key": "avgBlocks", "label": "BPG"},
    {"key": "avgRebounds", "label": "RPG"},
]
LIVE_TEAM_STAT_BLUEPRINTS = {
    "basketball_ncaab": [
        {"label": "FG%", "terms": ["fieldgoalpct", "field goal %", "fg%"]},
        {"label": "3P%", "terms": ["threepointfieldgoalpct", "three point %", "3p%"]},
        {"label": "REB", "terms": ["totalrebounds", "rebounds", "reb"]},
        {"label": "AST", "terms": ["assists", "ast"]},
    ],
    "basketball_nba": [
        {"label": "FG%", "terms": ["fieldgoalpct", "field goal %", "fg%"]},
        {"label": "3P%", "terms": ["threepointfieldgoalpct", "three point %", "3p%"]},
        {"label": "REB", "terms": ["totalrebounds", "rebounds", "reb"]},
        {"label": "AST", "terms": ["assists", "ast"]},
    ],
    "baseball_mlb": [
        {"label": "R", "terms": ["runs", "r"]},
        {"label": "H", "terms": ["hits", "h"]},
        {"label": "E", "terms": ["errors", "e"]},
        {"label": "AVG", "terms": ["avg", "batting average"]},
    ],
    "icehockey_nhl": [
        {"label": "Shots", "terms": ["shotstotal", "shots"]},
        {"label": "Hits", "terms": ["hits", "ht"]},
        {"label": "Blocks", "terms": ["blockedshots", "bs"]},
        {"label": "PP%", "terms": ["powerplaypct", "power play percentage"]},
    ],
    "americanfootball_nfl": [
        {"label": "Yards", "terms": ["totalyards", "total yards"]},
        {"label": "Pass", "terms": ["netpassingyards", "passing"]},
        {"label": "Rush", "terms": ["rushingyards", "rushing"]},
        {"label": "3D", "terms": ["thirddowneff", "3rd down efficiency"]},
    ],
    "americanfootball_ncaaf": [
        {"label": "Yards", "terms": ["totalyards", "total yards"]},
        {"label": "Pass", "terms": ["netpassingyards", "passing"]},
        {"label": "Rush", "terms": ["rushingyards", "rushing"]},
        {"label": "3D", "terms": ["thirddowneff", "3rd down efficiency"]},
    ],
}
PLAYER_PROP_MARKETS = [
    ("player_points", "Points"),
    ("player_rebounds", "Rebounds"),
    ("player_assists", "Assists"),
    ("player_threes", "3PM"),
]
PLAYER_PROP_MARKET_KEYS = [market_key for market_key, _ in PLAYER_PROP_MARKETS]
PLAYER_PROP_MARKET_SET = set(PLAYER_PROP_MARKET_KEYS)
BASKETBALL_PROP_SPORT_KEYS = {"basketball_nba", "basketball_ncaab"}
REQUEST_CACHE: dict[str, tuple[float, Any]] = {}
PROPS_BOARD_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}


def get_api_key() -> str:
    return os.getenv("ODDS_API_KEY", "").strip()


def get_board_provider_mode() -> str:
    configured = os.getenv("ODDS_BOARD_PROVIDER", "odds_api").strip().lower()
    if configured == "oddsharvester":
        return "odds_api"
    if configured in {"auto", "odds_api"}:
        return "odds_api"
    return "odds_api"


def get_oddsharvester_command() -> str:
    return os.getenv("ODDSHARVESTER_COMMAND", "oddsharvester").strip() or "oddsharvester"


def get_oddsharvester_timeout_seconds() -> int:
    raw_value = os.getenv("ODDSHARVESTER_TIMEOUT_SECONDS", "120").strip()
    try:
        return max(30, min(300, int(raw_value)))
    except ValueError:
        return 120


def get_oddsharvester_preview_only() -> bool:
    return os.getenv("ODDSHARVESTER_PREVIEW_ONLY", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def get_oddsharvester_headless() -> bool:
    value = os.getenv("ODDSHARVESTER_HEADLESS", "true").strip().lower()
    return value not in {"0", "false", "no", "off"}


def get_oddsharvester_command_parts() -> list[str]:
    return shlex.split(get_oddsharvester_command())


def get_oddsharvester_executable() -> str | None:
    command_parts = get_oddsharvester_command_parts()
    if not command_parts:
        return None

    return shutil.which(command_parts[0]) or command_parts[0]


def is_oddsharvester_available() -> bool:
    executable = get_oddsharvester_executable()
    if not executable:
        return False

    return shutil.which(executable) is not None or Path(executable).exists()


def get_oddsharvester_leagues(sport: dict[str, str]) -> str:
    env_key = f"ODDSHARVESTER_LEAGUES_{sport['key'].upper()}"
    return (
        os.getenv(env_key, "").strip()
        or sport.get("odds_harvester_leagues", "").strip()
    )


def get_oddsharvester_markets(sport: dict[str, str]) -> str:
    env_key = f"ODDSHARVESTER_MARKETS_{sport['key'].upper()}"
    return (
        os.getenv(env_key, "").strip()
        or sport.get("odds_harvester_markets", "").strip()
    )


def get_regions() -> str:
    return os.getenv("ODDS_API_REGIONS", "us").strip()


def get_bookmakers() -> str:
    configured = os.getenv("ODDS_API_BOOKMAKERS", "").strip()
    if configured:
        return configured

    return ",".join(DEFAULT_BOOKMAKERS)


def get_scores_days() -> int:
    raw_value = os.getenv("ODDS_API_SCORES_DAYS", "3").strip()
    try:
        return max(1, min(3, int(raw_value)))
    except ValueError:
        return 3


def get_props_markets() -> str:
    configured = os.getenv("ODDS_API_PROP_MARKETS", "").strip()
    if configured:
        return configured

    return ",".join(PLAYER_PROP_MARKET_KEYS)


def get_props_cache_seconds() -> int:
    raw_value = os.getenv("ODDS_API_PROPS_CACHE_SECONDS", "300").strip()
    try:
        return max(60, min(900, int(raw_value)))
    except ValueError:
        return 300


def get_props_workers() -> int:
    raw_value = os.getenv("ODDS_API_PROPS_WORKERS", "1").strip()
    try:
        return max(1, min(4, int(raw_value)))
    except ValueError:
        return 1


def get_props_event_limit() -> int:
    raw_value = os.getenv("ODDS_API_PROP_EVENT_LIMIT", "3").strip()
    try:
        return max(1, min(8, int(raw_value)))
    except ValueError:
        return 3


def format_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_scraper_token(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def ensure_scraper_cache_dir() -> None:
    SCRAPER_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)


def load_scraper_cache() -> dict[str, Any]:
    try:
        if SCRAPER_CACHE_PATH.exists():
            return json.loads(SCRAPER_CACHE_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {"updated_at": None, "sports": {}}


def save_scraper_cache(cache: dict[str, Any]) -> None:
    ensure_scraper_cache_dir()
    temp_path = SCRAPER_CACHE_PATH.with_suffix(".tmp")
    temp_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_path.replace(SCRAPER_CACHE_PATH)


def resolve_scraper_sport_key(sport: str | None, league: str | None) -> str | None:
    sport_token = normalize_scraper_token(sport)
    league_token = normalize_scraper_token(league)
    return SCRAPER_SPORT_KEY_MAP.get((sport_token, league_token))


def build_scraper_bookmaker(
    event: dict[str, Any], away_team: str, home_team: str
) -> dict[str, Any]:
    title = (
        event.get("book")
        or event.get("sourceMeta", {}).get("moneylineHomeBook")
        or "Flashscore Best"
    )
    key = slugify_key(str(title), "flashscore")
    home_spread = event.get("homeSpread")
    away_spread = -home_spread if isinstance(home_spread, (int, float)) else None
    total = event.get("total")

    return {
        "key": key,
        "title": title,
        "last_update": event.get("lines", [{}])[0].get("fetchedAt") or event.get("scrapedAt"),
        "markets": {
            "moneyline": [
                {
                    "name": away_team,
                    "price": event.get("awayMoneyline"),
                    "point": None,
                },
                {
                    "name": home_team,
                    "price": event.get("homeMoneyline"),
                    "point": None,
                },
            ],
            "spread": [
                {
                    "name": away_team,
                    "price": event.get("awaySpreadOdds"),
                    "point": away_spread,
                },
                {
                    "name": home_team,
                    "price": event.get("homeSpreadOdds"),
                    "point": home_spread,
                },
            ],
            "total": [
                {
                    "name": "Over",
                    "price": event.get("overOdds"),
                    "point": total,
                },
                {
                    "name": "Under",
                    "price": event.get("underOdds"),
                    "point": total,
                },
            ],
        },
    }


def normalize_scraper_game(event: dict[str, Any]) -> dict[str, Any] | None:
    away_team = event.get("awayTeam")
    home_team = event.get("homeTeam")
    if not away_team or not home_team:
        return None

    bookmaker = build_scraper_bookmaker(event, away_team, home_team)
    normalized = {
        "id": event.get("eventKey"),
        "commence_time": event.get("commenceTime"),
        "home_team": home_team,
        "away_team": away_team,
        "bookmakers_available": 1,
        "bookmakers": [bookmaker],
        "market_stats": {
            "moneyline": summarize_market([bookmaker], "moneyline", [away_team, home_team]),
            "spread": summarize_market([bookmaker], "spread", [away_team, home_team]),
            "total": summarize_market([bookmaker], "total", ["Over", "Under"]),
        },
    }

    normalized["edge_analytics"] = build_game_edge_block(normalized)
    normalized["sharp_signals"] = build_sharp_signals(
        [bookmaker],
        str(away_team),
        str(home_team),
    )

    return normalized

 


def get_scraper_cache_sports() -> list[dict[str, Any]]:
    cache = load_scraper_cache()
    updated_at = cache.get("updated_at")
    if not isinstance(updated_at, str):
        return []

    try:
        updated_at_dt = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
    except ValueError:
        return []

    if (datetime.now(timezone.utc) - updated_at_dt).total_seconds() > SCRAPER_CACHE_MAX_AGE_SECONDS:
        return []

    sports_cache = cache.get("sports")
    if not isinstance(sports_cache, dict):
        return []

    cached_sports: list[dict[str, Any]] = []
    for sport in SPORTS:
        events = sports_cache.get(sport["key"], [])
        games = [
            normalized
            for normalized in (
                normalize_scraper_game(event) for event in events if isinstance(event, dict)
            )
            if normalized
        ]
        cached_sports.append(
            {
                "key": sport["key"],
                "title": sport["title"],
                "short_title": sport["short_title"],
                "game_count": len(games),
                "games": sorted(games, key=lambda game: game.get("commence_time") or ""),
            }
        )

    return cached_sports


def request_json_with_base(
    base_url: str, path: str, params: dict[str, Any], title: str
) -> Any:
    query = urlencode({key: value for key, value in params.items() if value is not None})
    url = f"{base_url}/{path}"
    if query:
        url = f"{url}?{query}"

    request = Request(
        url,
        headers={"User-Agent": "SharkEdge/1.0"},
    )

    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(
            f"{title} request failed with {error.code}: {body}"
        ) from error
    except URLError as error:
        raise RuntimeError(f"{title} request failed: {error.reason}") from error


def request_json(path: str, params: dict[str, Any], title: str) -> Any:
    return request_json_with_base(ODDS_API_BASE_URL, path, params, title)


def build_request_cache_key(
    base_url: str, path: str, params: dict[str, Any]
) -> str:
    query = urlencode(
        sorted(
            (key, value)
            for key, value in params.items()
            if value is not None
        )
    )
    return f"{base_url}/{path}?{query}"


def request_json_cached(
    base_url: str, path: str, params: dict[str, Any], title: str
) -> Any:
    cache_key = build_request_cache_key(base_url, path, params)
    now = monotonic()
    cached = REQUEST_CACHE.get(cache_key)
    if cached and cached[0] > now:
        return cached[1]

    payload = request_json_with_base(base_url, path, params, title)
    REQUEST_CACHE[cache_key] = (now + get_props_cache_seconds(), payload)
    return payload


def parse_numeric(value: Any) -> float | None:
    if isinstance(value, bool):
        return None

    if isinstance(value, (int, float)):
        return float(value)

    if isinstance(value, str):
        cleaned = value.strip().replace(",", "")
        if not cleaned:
            return None

        cleaned = cleaned.replace("−", "-").replace("½", ".5")
        match = re.search(r"[-+]?\d+(?:\.\d+)?", cleaned)
        if match:
            try:
                return float(match.group(0))
            except ValueError:
                return None

    return None


def decimal_to_american(decimal_odds: float) -> int | None:
    if decimal_odds <= 1:
        return None

    if decimal_odds >= 2:
        return int(round((decimal_odds - 1) * 100))

    return int(round(-100 / (decimal_odds - 1)))


def normalize_price_value(value: Any) -> int | None:
    numeric = parse_numeric(value)
    if numeric is None:
        return None

    if abs(numeric) >= 100:
        return int(round(numeric))

    return decimal_to_american(numeric)


def slugify_key(value: str | None, fallback: str) -> str:
    if not value:
        return fallback

    normalized = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return normalized or fallback


def normalize_match_key(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def normalize_harvester_market_key(value: Any) -> str | None:
    normalized = re.sub(r"[^a-z0-9]+", "", str(value or "").lower())

    if any(token in normalized for token in ["moneyline", "matchwinner", "homeaway", "1x2"]):
        return "h2h"

    if any(token in normalized for token in ["asianhandicap", "spread", "spreads", "handicap"]):
        return "spreads"

    if any(token in normalized for token in ["overunder", "totals", "total"]):
        return "totals"

    return None


def extract_point_from_text(value: str | None) -> float | None:
    if not value:
        return None

    match = re.search(r"[-+]?\d+(?:\.\d+)?", value.replace("½", ".5"))
    if not match:
        return None

    try:
        return float(match.group(0))
    except ValueError:
        return None


def extract_event_collection(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if not isinstance(payload, dict):
        return []

    for key in ("events", "matches", "items", "results", "data"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        if isinstance(value, dict):
            nested = extract_event_collection(value)
            if nested:
                return nested

    return []


def extract_participant_name(value: Any) -> str | None:
    if isinstance(value, str):
        return value.strip() or None

    if isinstance(value, dict):
        for key in (
            "name",
            "display_name",
            "displayName",
            "team",
            "participant",
            "competitor",
        ):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()

    return None


def extract_harvester_teams(event: dict[str, Any]) -> tuple[str | None, str | None]:
    home_team = extract_participant_name(
        event.get("home_team")
        or event.get("home")
        or event.get("homeTeam")
        or event.get("participant_home")
    )
    away_team = extract_participant_name(
        event.get("away_team")
        or event.get("away")
        or event.get("awayTeam")
        or event.get("participant_away")
    )

    if home_team and away_team:
        return away_team, home_team

    participants = (
        event.get("participants")
        or event.get("competitors")
        or event.get("teams")
        or event.get("contestants")
    )
    if not isinstance(participants, list):
        return away_team, home_team

    home_candidate = None
    away_candidate = None
    ordered: list[str] = []

    for participant in participants:
        name = extract_participant_name(participant)
        if not name:
            continue

        ordered.append(name)
        role = str(
            participant.get("role")
            or participant.get("homeAway")
            or participant.get("side")
            or ""
        ).lower()
        if role in {"home", "h"}:
            home_candidate = name
        elif role in {"away", "a"}:
            away_candidate = name

    if not away_candidate and len(ordered) >= 1:
        away_candidate = ordered[0]
    if not home_candidate and len(ordered) >= 2:
        home_candidate = ordered[1]

    return away_candidate or away_team, home_candidate or home_team


def iter_harvester_markets(raw_bookmaker: dict[str, Any]) -> list[dict[str, Any]]:
    candidate = (
        raw_bookmaker.get("markets")
        or raw_bookmaker.get("odds")
        or raw_bookmaker.get("submarkets")
        or raw_bookmaker.get("market_groups")
    )
    markets: list[dict[str, Any]] = []

    if isinstance(candidate, list):
        markets.extend(item for item in candidate if isinstance(item, dict))
    elif isinstance(candidate, dict):
        for key, value in candidate.items():
            if isinstance(value, dict):
                markets.append({"key": key, **value})
            elif isinstance(value, list):
                markets.append({"key": key, "outcomes": value})

    if markets:
        return markets

    ignored_keys = {
        "key",
        "title",
        "name",
        "bookmaker",
        "bookmaker_key",
        "bookmaker_title",
        "last_update",
        "updated_at",
        "updatedAt",
    }
    for key, value in raw_bookmaker.items():
        if key in ignored_keys:
            continue
        if isinstance(value, dict):
            markets.append({"key": key, **value})
        elif isinstance(value, list):
            markets.append({"key": key, "outcomes": value})

    return markets


def iter_harvester_outcomes(raw_market: dict[str, Any]) -> list[dict[str, Any]]:
    outcomes = raw_market.get("outcomes") or raw_market.get("selections") or raw_market.get("rows")
    normalized: list[dict[str, Any]] = []

    if isinstance(outcomes, list):
        normalized.extend(item for item in outcomes if isinstance(item, dict))
    elif isinstance(outcomes, dict):
        for key, value in outcomes.items():
            if isinstance(value, dict):
                normalized.append({"name": key, **value})
            else:
                normalized.append({"name": key, "price": value})

    if normalized:
        return normalized

    direct_pairs = [
        ("home", raw_market.get("home_odds")),
        ("away", raw_market.get("away_odds")),
        ("draw", raw_market.get("draw_odds")),
        ("over", raw_market.get("over_odds")),
        ("under", raw_market.get("under_odds")),
    ]
    for name, price in direct_pairs:
        if price is not None:
            normalized.append(
                {
                    "name": name,
                    "price": price,
                    "point": raw_market.get("point") or raw_market.get("line"),
                }
            )

    return normalized


def normalize_harvester_outcome_name(
    raw_name: str | None,
    market_key: str,
    away_team: str,
    home_team: str,
) -> str | None:
    if not raw_name:
        return None

    normalized = raw_name.strip()
    lowered = normalized.lower()

    if market_key == "totals":
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

    return normalized


def normalize_harvester_bookmaker(
    raw_bookmaker: dict[str, Any],
    away_team: str,
    home_team: str,
) -> dict[str, Any]:
    title = (
        raw_bookmaker.get("title")
        or raw_bookmaker.get("name")
        or raw_bookmaker.get("bookmaker")
        or raw_bookmaker.get("bookmaker_title")
        or "OddsHarvester"
    )
    normalized_markets = {
        "moneyline": [],
        "spread": [],
        "total": [],
    }

    for raw_market in iter_harvester_markets(raw_bookmaker):
        market_key = normalize_harvester_market_key(
            raw_market.get("key") or raw_market.get("name") or raw_market.get("market")
        )
        if not market_key:
            continue

        for raw_outcome in iter_harvester_outcomes(raw_market):
            raw_name = (
                raw_outcome.get("name")
                or raw_outcome.get("label")
                or raw_outcome.get("selection")
                or raw_outcome.get("outcome")
            )
            outcome_name = normalize_harvester_outcome_name(
                str(raw_name) if raw_name is not None else None,
                market_key,
                away_team,
                home_team,
            )
            if not outcome_name:
                continue

            price = normalize_price_value(
                raw_outcome.get("price")
                or raw_outcome.get("odds")
                or raw_outcome.get("value")
                or raw_outcome.get("american")
                or raw_outcome.get("decimal")
            )
            if price is None:
                continue

            point = parse_numeric(
                raw_outcome.get("point")
                or raw_outcome.get("line")
                or raw_market.get("point")
                or raw_market.get("line")
            )
            if point is None:
                point = extract_point_from_text(str(raw_name) if raw_name is not None else None)

            target_market = (
                "moneyline" if market_key == "h2h" else "spread" if market_key == "spreads" else "total"
            )
            normalized_markets[target_market].append(
                {
                    "name": outcome_name,
                    "price": price,
                    "point": point,
                }
            )

    return {
        "key": slugify_key(str(raw_bookmaker.get("key") or title), "oddsharvester"),
        "title": str(title),
        "last_update": raw_bookmaker.get("last_update")
        or raw_bookmaker.get("updated_at")
        or raw_bookmaker.get("updatedAt"),
        "markets": normalized_markets,
    }


def normalize_oddsharvester_event(event: dict[str, Any]) -> dict[str, Any] | None:
    away_team, home_team = extract_harvester_teams(event)
    if not away_team or not home_team:
        return None

    bookmakers = event.get("bookmakers") or event.get("odds") or []
    if isinstance(bookmakers, dict):
        raw_bookmakers = []
        for key, value in bookmakers.items():
            if isinstance(value, dict):
                raw_bookmakers.append({"key": key, **value})
    elif isinstance(bookmakers, list):
        raw_bookmakers = [bookmaker for bookmaker in bookmakers if isinstance(bookmaker, dict)]
    else:
        raw_bookmakers = []

    normalized_bookmakers = [
        normalize_harvester_bookmaker(bookmaker, away_team, home_team)
        for bookmaker in sort_bookmakers(raw_bookmakers)
    ]

    event_id = (
        event.get("id")
        or event.get("event_id")
        or event.get("eventId")
        or event.get("match_id")
        or event.get("matchId")
        or f"{slugify_key(away_team, 'away')}-{slugify_key(home_team, 'home')}-{slugify_key(str(event.get('start_time') or event.get('date') or event.get('commence_time') or 'na'), 'time')}"
    )

    commence_time = (
        event.get("commence_time")
        or event.get("start_time")
        or event.get("startTime")
        or event.get("date")
        or event.get("event_time")
        or event.get("match_time")
        or event.get("datetime")
    )

    return {
        "id": str(event_id),
        "commence_time": str(commence_time) if commence_time else None,
        "home_team": home_team,
        "away_team": away_team,
        "bookmakers_available": len(normalized_bookmakers),
        "bookmakers": normalized_bookmakers,
        "market_stats": {
            "moneyline": summarize_market(
                normalized_bookmakers,
                "moneyline",
                [away_team, home_team],
            ),
            "spread": summarize_market(
                normalized_bookmakers,
                "spread",
                [away_team, home_team],
            ),
            "total": summarize_market(
                normalized_bookmakers,
                "total",
                ["Over", "Under"],
            ),
        },
    }

def serialize_market(market: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not market:
        return []

    outcomes = []
    for outcome in market.get("outcomes", []):
        outcomes.append(
            {
                "name": outcome.get("name"),
                "price": outcome.get("price"),
                "point": outcome.get("point"),
            }
        )
    return outcomes


def sort_bookmakers(bookmakers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    priority_map = {
        bookmaker_key: index for index, bookmaker_key in enumerate(BOOKMAKER_PRIORITY)
    }

    return sorted(
        bookmakers,
        key=lambda bookmaker: (
            priority_map.get(bookmaker.get("key", ""), len(priority_map)),
            bookmaker.get("title", ""),
        ),
    )


def normalize_bookmaker(bookmaker: dict[str, Any]) -> dict[str, Any]:
    markets_by_key = {
        market.get("key"): market for market in bookmaker.get("markets", [])
    }

    return {
        "key": bookmaker.get("key"),
        "title": bookmaker.get("title"),
        "last_update": bookmaker.get("last_update"),
        "markets": {
            "moneyline": serialize_market(markets_by_key.get("h2h")),
            "spread": serialize_market(markets_by_key.get("spreads")),
            "total": serialize_market(markets_by_key.get("totals")),
        },
    }


def summarize_market(
    bookmakers: list[dict[str, Any]],
    market_name: str,
    outcome_order: list[str],
) -> list[dict[str, Any]]:
    summary: dict[str, dict[str, Any]] = {}

    for bookmaker in bookmakers:
        for outcome in bookmaker.get("markets", {}).get(market_name, []):
            outcome_name = outcome.get("name")
            if not outcome_name:
                continue

            entry = summary.setdefault(
                outcome_name,
                {
                    "prices": [],
                    "points": [],
                    "best_price": None,
                    "best_bookmakers": [],
                    "book_count": 0,
                },
            )

            entry["book_count"] += 1

            price = outcome.get("price")
            if isinstance(price, (int, float)):
                entry["prices"].append(price)
                if entry["best_price"] is None or price > entry["best_price"]:
                    entry["best_price"] = price
                    entry["best_bookmakers"] = [bookmaker.get("title")]
                elif price == entry["best_price"]:
                    entry["best_bookmakers"].append(bookmaker.get("title"))

            point = outcome.get("point")
            if isinstance(point, (int, float)):
                entry["points"].append(point)

    order_index = {name: index for index, name in enumerate(outcome_order)}
    offers = []

    for outcome_name, entry in summary.items():
        consensus_point = None
        point_frequency = 0

        if entry["points"]:
            point_counts = Counter(entry["points"])
            consensus_point, point_frequency = sorted(
                point_counts.items(),
                key=lambda item: (-item[1], item[0]),
            )[0]

        average_price = None
        if entry["prices"]:
            average_price = round(sum(entry["prices"]) / len(entry["prices"]), 2)

        offers.append(
            {
                "name": outcome_name,
                "best_price": entry["best_price"],
                "best_bookmakers": entry["best_bookmakers"],
                "average_price": average_price,
                "book_count": entry["book_count"],
                "consensus_point": consensus_point,
                "point_frequency": point_frequency,
            }
        )

    offers.sort(key=lambda offer: (order_index.get(offer["name"], 999), offer["name"]))
    return offers


def collect_points(
    bookmakers: list[dict[str, Any]], market_name: str, outcome_name: str
) -> list[float]:
    points = []

    for bookmaker in bookmakers:
        for outcome in bookmaker.get("markets", {}).get(market_name, []):
            if outcome.get("name") != outcome_name:
                continue

            point = outcome.get("point")
            if isinstance(point, (int, float)):
                points.append(float(point))

    return points


def build_point_range(points: list[float]) -> dict[str, Any] | None:
    if not points:
        return None

    return {
        "min": min(points),
        "max": max(points),
        "span": round(max(points) - min(points), 2),
    }


def build_pinnacle_reference_lookup(
    snapshot: dict[str, Any] | None,
) -> dict[tuple[str, str], dict[str, Any]]:
    if not snapshot:
        return {}

    lookup: dict[tuple[str, str], dict[str, Any]] = {}
    for game in snapshot.get("games", []):
        if not isinstance(game, dict):
            continue
        away_key = normalize_match_key(game.get("away_team"))
        home_key = normalize_match_key(game.get("home_team"))
        if not away_key or not home_key:
            continue
        lookup[(away_key, home_key)] = game
    return lookup


def build_external_sharp_reference(
    away_team: str | None,
    home_team: str | None,
    lookup: dict[tuple[str, str], dict[str, Any]],
    snapshot: dict[str, Any] | None,
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    diagnostics = {
        "selected_source": None,
        "matched_external": False,
        "external_game_id": None,
        "external_requested_source": snapshot.get("requested_source") if snapshot else None,
        "external_resolved_source": snapshot.get("resolved_source") if snapshot else None,
        "external_cache": snapshot.get("cache") if snapshot else None,
        "source_health": snapshot.get("diagnostics") if snapshot else None,
    }

    if not away_team or not home_team or not lookup:
        return None, diagnostics

    matched = lookup.get((normalize_match_key(away_team), normalize_match_key(home_team)))
    if not matched:
        return None, diagnostics

    source = matched.get("source")
    diagnostics["selected_source"] = source
    diagnostics["matched_external"] = True
    diagnostics["external_game_id"] = matched.get("game_id")

    return (
        {
            "source": source,
            "book_key": "pinnacle",
            "book_name": "Pinnacle",
            "moneyline": matched.get("moneyline"),
            "spread": matched.get("spread"),
            "total": matched.get("total"),
        },
        diagnostics,
    )


def build_market_sharp_fallback(
    bookmakers: list[dict[str, Any]],
    away_team: str | None,
    home_team: str | None,
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    sharp_bookmakers = [
        bookmaker
        for bookmaker in bookmakers
        if bookmaker.get("key") in SHARP_REFERENCE_BOOK_KEYS
    ]
    fallback_books = [bookmaker.get("title") for bookmaker in sharp_bookmakers if bookmaker.get("title")]
    diagnostics = {
        "fallback_books": fallback_books,
        "fallback_book_count": len(fallback_books),
    }

    if not sharp_bookmakers:
        return None, diagnostics

    def _find_market(bookmaker: dict[str, Any], market_name: str) -> list[dict[str, Any]]:
        return list(bookmaker.get("markets", {}).get(market_name, []) or [])

    reference = {
        "source": "market_sharp_fallback",
        "book_key": "sharp_fallback",
        "book_name": ", ".join(fallback_books[:3]) if fallback_books else "Sharp fallback",
        "moneyline": None,
        "spread": None,
        "total": None,
    }

    moneyline_book = next((bookmaker for bookmaker in sharp_bookmakers if len(_find_market(bookmaker, "moneyline")) >= 2), None)
    if moneyline_book:
        outcomes = _find_market(moneyline_book, "moneyline")
        away_outcome = next((outcome for outcome in outcomes if outcome.get("name") == away_team), outcomes[0])
        home_outcome = next((outcome for outcome in outcomes if outcome.get("name") == home_team), outcomes[-1])
        reference["moneyline"] = {
            "away": away_outcome.get("price"),
            "home": home_outcome.get("price"),
        }

    spread_book = next((bookmaker for bookmaker in sharp_bookmakers if len(_find_market(bookmaker, "spread")) >= 2), None)
    if spread_book:
        outcomes = _find_market(spread_book, "spread")
        away_outcome = next((outcome for outcome in outcomes if outcome.get("name") == away_team), outcomes[0])
        home_outcome = next((outcome for outcome in outcomes if outcome.get("name") == home_team), outcomes[-1])
        reference["spread"] = {
            "away": away_outcome.get("point"),
            "away_odds": away_outcome.get("price"),
            "home": home_outcome.get("point"),
            "home_odds": home_outcome.get("price"),
        }

    total_book = next((bookmaker for bookmaker in sharp_bookmakers if len(_find_market(bookmaker, "total")) >= 2), None)
    if total_book:
        outcomes = _find_market(total_book, "total")
        over_outcome = next((outcome for outcome in outcomes if outcome.get("name") == "Over"), outcomes[0])
        under_outcome = next((outcome for outcome in outcomes if outcome.get("name") == "Under"), outcomes[-1])
        reference["total"] = {
            "line": over_outcome.get("point"),
            "over": over_outcome.get("price"),
            "under": under_outcome.get("price"),
        }

    if not any(reference.get(key) for key in ("moneyline", "spread", "total")):
        return None, diagnostics

    return reference, diagnostics


def build_sharp_reference_context(
    sport_key: str,
    away_team: str | None,
    home_team: str | None,
    normalized_bookmakers: list[dict[str, Any]],
    pinnacle_lookup: dict[tuple[str, str], dict[str, Any]] | None = None,
    pinnacle_snapshot: dict[str, Any] | None = None,
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    diagnostics: dict[str, Any] = {
        "selected_source": None,
        "source_health": pinnacle_snapshot.get("diagnostics") if pinnacle_snapshot else None,
        "fallback_books": [],
        "fallback_book_count": 0,
    }

    if sport_key == "baseball_mlb":
        external_reference, external_diagnostics = build_external_sharp_reference(
            away_team,
            home_team,
            pinnacle_lookup or {},
            pinnacle_snapshot,
        )
        diagnostics.update(external_diagnostics)
        if external_reference:
            return external_reference, diagnostics

    fallback_reference, fallback_diagnostics = build_market_sharp_fallback(
        normalized_bookmakers,
        away_team,
        home_team,
    )
    diagnostics.update(fallback_diagnostics)
    if fallback_reference:
        diagnostics["selected_source"] = fallback_reference.get("source")
        return fallback_reference, diagnostics

    return None, diagnostics


def normalize_game(
    game: dict[str, Any],
    sport_key: str | None = None,
    pinnacle_lookup: dict[tuple[str, str], dict[str, Any]] | None = None,
    pinnacle_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_bookmakers = [
        normalize_bookmaker(bookmaker)
        for bookmaker in sort_bookmakers(game.get("bookmakers", []))
    ]

    away_team = game.get("away_team")
    home_team = game.get("home_team")

    normalized = {
        "id": game.get("id"),
        "commence_time": game.get("commence_time"),
        "home_team": home_team,
        "away_team": away_team,
        "bookmakers_available": len(normalized_bookmakers),
        "bookmakers": normalized_bookmakers,
        "market_stats": {
            "moneyline": summarize_market(
                normalized_bookmakers,
                "moneyline",
                [away_team, home_team],
            ),
            "spread": summarize_market(
                normalized_bookmakers,
                "spread",
                [away_team, home_team],
            ),
            "total": summarize_market(
                normalized_bookmakers,
                "total",
                ["Over", "Under"],
            ),
        },
    }

    sharp_reference, sharp_reference_diagnostics = build_sharp_reference_context(
        sport_key or "",
        away_team,
        home_team,
        normalized_bookmakers,
        pinnacle_lookup=pinnacle_lookup,
        pinnacle_snapshot=pinnacle_snapshot,
    )
    normalized["sharp_reference"] = sharp_reference
    normalized["sharp_reference_diagnostics"] = sharp_reference_diagnostics

    normalized["edge_analytics"] = build_game_edge_block(normalized)
    normalized["sharp_signals"] = build_sharp_signals(
        normalized_bookmakers,
        str(away_team or "Away"),
        str(home_team or "Home"),
        sharp_reference=sharp_reference,
        source_diagnostics=sharp_reference_diagnostics,
    )

    return normalized


def collect_unique_bookmakers(sports: list[dict[str, Any]]) -> int:
    bookmaker_keys = set()

    for sport in sports:
        for game in sport.get("games", []):
            for bookmaker in game.get("bookmakers", []):
                bookmaker_key = bookmaker.get("key")
                if bookmaker_key:
                    bookmaker_keys.add(bookmaker_key)

    return len(bookmaker_keys)


def fetch_sport_odds_from_api(sport: dict[str, str], api_key: str) -> dict[str, Any]:
    payload = request_json(
        f"{sport['key']}/odds/",
        {
            "apiKey": api_key,
            "regions": get_regions(),
            "bookmakers": get_bookmakers(),
            "markets": ODDS_API_MARKETS,
            "oddsFormat": "american",
            "dateFormat": "iso",
        },
        f"{sport['title']} odds",
    )

    if not isinstance(payload, list):
        raise RuntimeError(f"{sport['title']} returned an unexpected response.")

    pinnacle_snapshot = None
    pinnacle_lookup: dict[tuple[str, str], dict[str, Any]] = {}
    if sport["key"] == "baseball_mlb":
        pinnacle_snapshot = get_pinnacle_mlb_snapshot(source="auto")
        pinnacle_lookup = build_pinnacle_reference_lookup(pinnacle_snapshot)

    games = sorted(
        (
            normalize_game(
                game,
                sport_key=sport["key"],
                pinnacle_lookup=pinnacle_lookup,
                pinnacle_snapshot=pinnacle_snapshot,
            )
            for game in payload
        ),
        key=lambda game: game.get("commence_time") or "",
    )

    response = {
        "key": sport["key"],
        "title": sport["title"],
        "short_title": sport["short_title"],
        "game_count": len(games),
        "games": games,
    }
    if pinnacle_snapshot:
        response["sharp_reference_diagnostics"] = {
            "provider": "pinnacle_mlb_scraper",
            "requested_source": pinnacle_snapshot.get("requested_source"),
            "resolved_source": pinnacle_snapshot.get("resolved_source"),
            "game_count": pinnacle_snapshot.get("game_count"),
            "cache": pinnacle_snapshot.get("cache"),
            "source_health": pinnacle_snapshot.get("diagnostics"),
        }
    return response


def fetch_sport_odds_from_oddsharvester(sport: dict[str, str]) -> dict[str, Any]:
    leagues = get_oddsharvester_leagues(sport)
    markets = get_oddsharvester_markets(sport)
    if not leagues or not markets:
        raise RuntimeError(
            f"{sport['title']} is missing OddsHarvester league or market configuration."
        )

    command = get_oddsharvester_command_parts()
    if not command:
        raise RuntimeError("OddsHarvester command is empty.")

    with tempfile.TemporaryDirectory(prefix="oddsharvester-") as temp_dir:
        output_base = Path(temp_dir) / sport["key"]
        command.extend(
            [
                "upcoming",
                "-s",
                str(sport["odds_harvester_sport"]),
                "-l",
                leagues,
                "-m",
                markets,
                "-f",
                "json",
                "-o",
                str(output_base),
            ]
        )
        if get_oddsharvester_headless():
            command.append("--headless")
        if get_oddsharvester_preview_only():
            command.append("--preview-only")

        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=get_oddsharvester_timeout_seconds(),
            check=False,
        )

        stdout = completed.stdout.strip()
        stderr = completed.stderr.strip()

        payload = None
        candidate_paths = [
            output_base,
            output_base.with_suffix(".json"),
            Path(temp_dir) / "output.json",
        ]
        for candidate in candidate_paths:
            if candidate.exists():
                payload = json.loads(candidate.read_text(encoding="utf-8"))
                break

        if payload is None and (stdout.startswith("{") or stdout.startswith("[")):
            payload = json.loads(stdout)

        if payload is None:
            detail = stderr or stdout or "No JSON output was produced."
            raise RuntimeError(
                f"OddsHarvester returned no parsable payload for {sport['title']}: {detail}"
            )

        events = extract_event_collection(payload)
        games = []
        skipped = 0
        for event in events:
            normalized = normalize_oddsharvester_event(event)
            if normalized:
                games.append(normalized)
            else:
                skipped += 1

        if completed.returncode != 0:
            detail = stderr or stdout or f"exit code {completed.returncode}"
            raise RuntimeError(
                f"OddsHarvester failed for {sport['title']}: {detail}"
            )

        games.sort(key=lambda game: game.get("commence_time") or "")

        response: dict[str, Any] = {
            "key": sport["key"],
            "title": sport["title"],
            "short_title": sport["short_title"],
            "game_count": len(games),
            "games": games,
        }
        if skipped:
            response["note"] = f"Skipped {skipped} unparseable OddsHarvester events."

        return response


def resolve_board_provider(api_key: str) -> tuple[str | None, str | None]:
    if api_key:
        return "odds_api", None

    if any(sport.get("game_count") for sport in get_scraper_cache_sports()):
        return "scraper_cache", None

    return (
        None,
        "Current odds board requires ODDS_API_KEY. OddsHarvester is reserved for historical ingestion and is not used in the live board request path.",
    )


def fetch_sport_odds(
    sport: dict[str, str], api_key: str, provider: str
) -> dict[str, Any]:
    if provider == "scraper_cache":
        for cached_sport in get_scraper_cache_sports():
            if cached_sport.get("key") == sport["key"]:
                return cached_sport
        return {
            "key": sport["key"],
            "title": sport["title"],
            "short_title": sport["short_title"],
            "game_count": 0,
            "games": [],
        }
    return fetch_sport_odds_from_api(sport, api_key)


def fetch_sport_events(sport_key: str, api_key: str) -> list[dict[str, Any]]:
    payload = request_json_cached(
        ODDS_API_BASE_URL,
        f"{sport_key}/events/",
        {
            "apiKey": api_key,
            "dateFormat": "iso",
        },
        f"{sport_key} events",
    )

    if not isinstance(payload, list):
        raise RuntimeError(f"{sport_key} events returned an unexpected response.")

    return sorted(payload, key=lambda event: event.get("commence_time") or "")


def fetch_sport_scores(sport_key: str, api_key: str) -> list[dict[str, Any]]:
    payload = request_json(
        f"{sport_key}/scores/",
        {
            "apiKey": api_key,
            "daysFrom": get_scores_days(),
            "dateFormat": "iso",
        },
        f"{sport_key} scores",
    )

    if not isinstance(payload, list):
        raise RuntimeError(f"{sport_key} scores returned an unexpected response.")

    return payload


def find_sport(sport_key: str) -> dict[str, str]:
    for sport in SPORTS:
        if sport["key"] == sport_key:
            return sport

    raise HTTPException(status_code=404, detail="Sport not supported.")


def normalize_team_name(team_name: str | None) -> str:
    if not team_name:
        return ""

    normalized = team_name.lower().replace("&", " and ")
    normalized = re.sub(r"\bst[.]?\b", "saint", normalized)
    return re.sub(r"[^a-z0-9]+", "", normalized)


def build_team_aliases(team: dict[str, Any]) -> set[str]:
    location = team.get("location")
    name = team.get("name")
    candidates = {
        team.get("displayName"),
        team.get("shortDisplayName"),
        team.get("name"),
        team.get("nickname"),
        location,
        f"{location} {name}" if location and name else None,
    }

    return {candidate for candidate in candidates if candidate}


def normalize_person_name(name: str | None) -> str:
    if not name:
        return ""

    normalized = str(name).lower()
    normalized = normalized.replace("&", " and ")
    normalized = normalized.replace(".", "")
    normalized = normalized.replace("'", "")
    normalized = re.sub(r"[^a-z0-9]+", "", normalized)
    return normalized


def strip_name_suffix(normalized_name: str) -> str:
    return re.sub(r"(jr|sr|ii|iii|iv|v)$", "", normalized_name)


def get_espn_sport_config(sport_key: str) -> dict[str, Any] | None:
    return ESPN_SPORT_PATHS.get(sport_key)


@lru_cache(maxsize=8)
def fetch_espn_team_index(sport_key: str) -> dict[str, dict[str, Any]]:
    config = get_espn_sport_config(sport_key)
    if not config:
        return {}

    payload = request_json_with_base(
        ESPN_SITE_BASE_URL,
        f"{config['site']}/teams",
        {},
        f"{sport_key} ESPN teams",
    )

    sports = payload.get("sports", [])
    leagues = sports[0].get("leagues", []) if sports else []
    raw_teams = leagues[0].get("teams", []) if leagues else []

    index: dict[str, dict[str, Any]] = {}
    for item in raw_teams:
        team = item.get("team", {})
        if not team.get("id"):
            continue

        entry = {
            "id": str(team.get("id")),
            "display_name": team.get("displayName"),
            "abbreviation": team.get("abbreviation"),
        }

        for alias in build_team_aliases(team):
            index[normalize_team_name(alias)] = entry

    return index


def find_espn_team(sport_key: str, team_name: str) -> dict[str, Any] | None:
    index = fetch_espn_team_index(sport_key)
    if not index:
        return None

    normalized = normalize_team_name(team_name)
    exact = index.get(normalized)
    if exact:
        return exact

    close = get_close_matches(normalized, list(index.keys()), n=1, cutoff=0.88)
    if close:
        return index.get(close[0])

    return None


def fetch_espn_event_summary(sport_key: str, event_id: str) -> dict[str, Any]:
    config = get_espn_sport_config(sport_key)
    if not config:
        raise RuntimeError("ESPN summary is not configured for this sport.")

    payload = request_json_cached(
        ESPN_SITE_BASE_URL,
        f"{config['site']}/summary",
        {"event": event_id},
        f"{sport_key} ESPN event summary",
    )

    if not isinstance(payload, dict):
        raise RuntimeError(f"{sport_key} ESPN event summary returned an unexpected response.")

    return payload


def fetch_espn_team_statistics(sport_key: str, team_id: str) -> dict[str, Any]:
    config = get_espn_sport_config(sport_key)
    if not config:
        raise RuntimeError("ESPN team stats are not configured for this sport.")

    payload = request_json_with_base(
        ESPN_SITE_BASE_URL,
        f"{config['site']}/teams/{team_id}/statistics",
        {},
        f"{sport_key} ESPN team stats",
    )

    if not isinstance(payload, dict):
        raise RuntimeError(f"{sport_key} ESPN team stats returned an unexpected response.")

    return payload


def fetch_espn_team_schedule(sport_key: str, team_id: str) -> dict[str, Any]:
    config = get_espn_sport_config(sport_key)
    if not config:
        raise RuntimeError("ESPN team schedules are not configured for this sport.")

    payload = request_json_with_base(
        ESPN_SITE_BASE_URL,
        f"{config['site']}/teams/{team_id}/schedule",
        {},
        f"{sport_key} ESPN team schedule",
    )

    if not isinstance(payload, dict):
        raise RuntimeError(
            f"{sport_key} ESPN team schedule returned an unexpected response."
        )

    return payload


@lru_cache(maxsize=256)
def fetch_espn_team_roster(sport_key: str, team_id: str) -> dict[str, Any]:
    config = get_espn_sport_config(sport_key)
    if not config:
        raise RuntimeError("ESPN team rosters are not configured for this sport.")

    payload = request_json_cached(
        ESPN_SITE_BASE_URL,
        f"{config['site']}/teams/{team_id}/roster",
        {},
        f"{sport_key} ESPN team roster",
    )

    if not isinstance(payload, dict):
        raise RuntimeError(f"{sport_key} ESPN team roster returned an unexpected response.")

    return payload


def build_player_aliases(athlete: dict[str, Any]) -> set[str]:
    first_name = athlete.get("firstName")
    last_name = athlete.get("lastName")
    candidates = {
        athlete.get("fullName"),
        athlete.get("displayName"),
        athlete.get("shortName"),
        f"{first_name} {last_name}" if first_name and last_name else None,
    }

    return {candidate for candidate in candidates if candidate}


def build_team_roster_index(
    sport_key: str, team_name: str
) -> dict[str, dict[str, Any] | None]:
    matched_team = find_espn_team(sport_key, team_name)
    if not matched_team:
        return {}

    try:
        roster_payload = fetch_espn_team_roster(sport_key, matched_team["id"])
    except RuntimeError:
        return {}

    athletes = roster_payload.get("athletes", [])
    if not isinstance(athletes, list):
        return {}

    lookup: dict[str, dict[str, Any] | None] = {}
    for athlete in athletes:
        entry = {
            "team_name": team_name,
            "team_id": matched_team["id"],
            "player_id": str(athlete.get("id")) if athlete.get("id") else None,
            "position": athlete.get("position", {}).get("abbreviation"),
        }

        for alias in build_player_aliases(athlete):
            normalized = normalize_person_name(alias)
            if not normalized:
                continue

            for key in {normalized, strip_name_suffix(normalized)}:
                if not key:
                    continue

                existing = lookup.get(key)
                if existing and existing.get("team_id") != entry["team_id"]:
                    lookup[key] = None
                elif existing is None and key in lookup:
                    continue
                else:
                    lookup[key] = entry

    return lookup


def build_event_player_index(
    sport_key: str,
    away_team: str,
    home_team: str,
) -> dict[str, dict[str, Any] | None]:
    away_index = build_team_roster_index(sport_key, away_team)
    home_index = build_team_roster_index(sport_key, home_team)

    player_index: dict[str, dict[str, Any] | None] = {}
    for source in (away_index, home_index):
        for alias, entry in source.items():
            existing = player_index.get(alias)
            if existing and entry and existing.get("team_id") != entry.get("team_id"):
                player_index[alias] = None
            elif alias not in player_index:
                player_index[alias] = entry

    return player_index


def resolve_prop_player_context(
    player_index: dict[str, dict[str, Any] | None],
    player_name: str,
    away_team: str,
    home_team: str,
) -> dict[str, Any]:
    normalized = normalize_person_name(player_name)
    candidates = [normalized, strip_name_suffix(normalized)]

    entry = None
    for candidate in candidates:
        if candidate and player_index.get(candidate):
            entry = player_index[candidate]
            break

    if entry is None:
        searchable_keys = [
            key for key, value in player_index.items() if value is not None
        ]
        close = get_close_matches(normalized, searchable_keys, n=1, cutoff=0.92)
        if close:
            entry = player_index.get(close[0])

    if not entry:
        return {
            "team_name": None,
            "opponent_name": None,
            "player_id": None,
            "position": None,
            "resolved": False,
        }

    team_name = entry.get("team_name")
    opponent_name = home_team if team_name == away_team else away_team

    return {
        "team_name": team_name,
        "opponent_name": opponent_name,
        "player_id": entry.get("player_id"),
        "position": entry.get("position"),
        "resolved": True,
    }


def flatten_espn_stat_entries(payload: dict[str, Any]) -> list[dict[str, Any]]:
    categories = payload.get("results", {}).get("stats", {}).get("categories", [])
    entries = []

    for category in categories:
        for stat in category.get("stats", []):
            entries.append(
                {
                    "category": category.get("name"),
                    "name": stat.get("name"),
                    "display_name": stat.get("displayName"),
                    "short_display_name": stat.get("shortDisplayName"),
                    "description": stat.get("description"),
                    "value": stat.get("value"),
                    "display_value": stat.get("displayValue"),
                }
            )

    return entries


def find_stat_entry(
    flattened_stats: list[dict[str, Any]], terms: list[str]
) -> dict[str, Any] | None:
    normalized_terms = [term.lower() for term in terms]

    for stat in flattened_stats:
        corpus = " ".join(
            str(part or "")
            for part in (
                stat.get("name"),
                stat.get("display_name"),
                stat.get("short_display_name"),
                stat.get("description"),
            )
        ).lower()

        if any(term in corpus for term in normalized_terms):
            return stat

    return None


def select_team_stats(sport_key: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
    flattened_stats = flatten_espn_stat_entries(payload)
    selected = []

    for blueprint in TEAM_STAT_BLUEPRINTS.get(sport_key, []):
        stat = find_stat_entry(flattened_stats, blueprint["terms"])
        if not stat:
            continue

        selected.append(
            {
                "key": blueprint["key"],
                "label": blueprint["label"],
                "display_value": stat.get("display_value")
                or str(stat.get("value"))
                or "--",
                "description": stat.get("description"),
                "rank": None,
            }
        )

    return selected


def normalize_stat_token(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def find_live_team_boxscore(
    summary_payload: dict[str, Any], team_id: str
) -> dict[str, Any] | None:
    teams = summary_payload.get("boxscore", {}).get("teams", [])
    if not isinstance(teams, list):
        return None

    for team_box in teams:
        if str(team_box.get("team", {}).get("id")) == str(team_id):
            return team_box

    return None


def build_live_team_stat_strip(
    sport_key: str,
    competition: dict[str, Any] | None,
    summary_payload: dict[str, Any],
    team_id: str | None,
) -> list[dict[str, Any]]:
    if not team_id:
        return []

    competitor = None
    competitors = competition.get("competitors", []) if competition else []
    for item in competitors:
        if str(item.get("team", {}).get("id")) == str(team_id):
            competitor = item
            break

    competitor_stats = (
        competitor.get("statistics", [])
        if isinstance(competitor, dict)
        else []
    )
    team_box = find_live_team_boxscore(summary_payload, team_id) or {}
    box_stats = team_box.get("statistics", []) if isinstance(team_box, dict) else []

    stat_strip = []
    for blueprint in LIVE_TEAM_STAT_BLUEPRINTS.get(sport_key, []):
        match = None
        for stat in [*competitor_stats, *box_stats]:
            fields = [
                normalize_stat_token(stat.get("name")),
                normalize_stat_token(stat.get("label")),
                normalize_stat_token(stat.get("abbreviation")),
                normalize_stat_token(stat.get("displayName")),
            ]
            if any(
                any(term in field for field in fields)
                for term in [normalize_stat_token(term) for term in blueprint["terms"]]
            ):
                match = stat
                break

        if not match:
            continue

        display_value = match.get("displayValue")
        if display_value is None and match.get("value") is not None:
            display_value = str(match.get("value"))
        if display_value is None:
            continue

        stat_strip.append(
            {
                "label": blueprint["label"],
                "display_value": str(display_value),
                "source": "ESPN summary boxscore",
            }
        )

    return stat_strip


def find_summary_player_team_block(
    summary_payload: dict[str, Any], team_id: str
) -> dict[str, Any] | None:
    players = summary_payload.get("boxscore", {}).get("players", [])
    if not isinstance(players, list):
        return None

    for team_block in players:
        if str(team_block.get("team", {}).get("id")) == str(team_id):
            return team_block

    return None


def find_stat_index(keys: list[Any], terms: list[str]) -> int:
    normalized_terms = [normalize_stat_token(term) for term in terms]
    for index, key in enumerate(keys):
        normalized_key = normalize_stat_token(key)
        if any(term in normalized_key for term in normalized_terms):
            return index

    return -1


def read_stat_number(stats: list[Any], index: int) -> float:
    if index < 0 or index >= len(stats):
        return 0

    return parse_numeric(stats[index]) or 0


def build_spotlight_entry(
    athlete_entry: dict[str, Any],
    keys: list[Any],
    items: list[dict[str, Any]],
) -> dict[str, Any] | None:
    stats = athlete_entry.get("stats", [])
    if not isinstance(stats, list):
        return None

    parts = []
    for item in items:
        index = find_stat_index(keys, item["terms"])
        if index < 0 or index >= len(stats):
            continue

        value = stats[index]
        if value in (None, ""):
            continue

        parts.append(f"{value} {item['label']}")

    if not parts:
        return None

    athlete = athlete_entry.get("athlete", {})
    return {
        "athlete_id": athlete.get("id"),
        "athlete_name": athlete.get("displayName") or athlete.get("shortName") or "Player",
        "position": athlete.get("position", {}).get("abbreviation"),
        "headshot": athlete.get("headshot", {}).get("href"),
        "display_value": " | ".join(parts),
        "source": "ESPN summary boxscore",
    }


def build_nba_summary_spotlights(summary_payload: dict[str, Any], team_id: str) -> list[dict[str, Any]]:
    team_block = find_summary_player_team_block(summary_payload, team_id)
    if not team_block:
        return []

    stat_block = None
    for block in team_block.get("statistics", []):
        if isinstance(block, dict) and block.get("athletes"):
            stat_block = block
            break

    if not stat_block:
        return []

    keys = stat_block.get("keys", [])
    athletes = stat_block.get("athletes", [])
    if not isinstance(keys, list) or not isinstance(athletes, list):
        return []

    points_index = find_stat_index(keys, ["points"])
    rebounds_index = find_stat_index(keys, ["rebounds"])
    assists_index = find_stat_index(keys, ["assists"])

    ranked = []
    for athlete_entry in athletes:
        stats = athlete_entry.get("stats", [])
        if not isinstance(stats, list):
            continue

        points = parse_numeric(stats[points_index]) if points_index >= 0 and points_index < len(stats) else 0
        rebounds = parse_numeric(stats[rebounds_index]) if rebounds_index >= 0 and rebounds_index < len(stats) else 0
        assists = parse_numeric(stats[assists_index]) if assists_index >= 0 and assists_index < len(stats) else 0
        ranked.append(
            {
                "entry": athlete_entry,
                "score": points or 0,
                "line": [
                    f"{int(points or 0)} PTS",
                    f"{int(rebounds or 0)} REB",
                    f"{int(assists or 0)} AST",
                ],
            }
        )

    ranked.sort(key=lambda item: item["score"], reverse=True)
    results = []
    for item in ranked[:3]:
        athlete = item["entry"].get("athlete", {})
        results.append(
            {
                "athlete_id": athlete.get("id"),
                "athlete_name": athlete.get("displayName") or athlete.get("shortName") or "Player",
                "position": athlete.get("position", {}).get("abbreviation"),
                "headshot": athlete.get("headshot", {}).get("href"),
                "display_value": " | ".join(item["line"]),
                "source": "ESPN summary boxscore",
            }
        )

    return results


def build_mlb_summary_spotlights(summary_payload: dict[str, Any], team_id: str) -> list[dict[str, Any]]:
    team_block = find_summary_player_team_block(summary_payload, team_id)
    if not team_block:
        return []

    blocks = team_block.get("statistics", [])
    if not isinstance(blocks, list):
        return []

    batting = next(
        (block for block in blocks if normalize_stat_token(block.get("type")) == "batting"),
        None,
    )
    pitching = next(
        (block for block in blocks if normalize_stat_token(block.get("type")) == "pitching"),
        None,
    )

    results = []

    if isinstance(batting, dict):
        athletes = batting.get("athletes", [])
        keys = batting.get("keys", [])
        if isinstance(athletes, list) and isinstance(keys, list) and athletes:
            hitter_ranked = []
            hits_index = find_stat_index(keys, ["hits"])
            rbi_index = find_stat_index(keys, ["rbis", "rbi"])
            hr_index = find_stat_index(keys, ["homeruns", "hr"])
            for athlete_entry in athletes:
                stats = athlete_entry.get("stats", [])
                if not isinstance(stats, list):
                    continue
                hitter_ranked.append(
                    {
                        "entry": athlete_entry,
                        "rbi": read_stat_number(stats, rbi_index),
                        "hits": read_stat_number(stats, hits_index),
                        "hr": read_stat_number(stats, hr_index),
                    }
                )
            hitter_ranked.sort(
                key=lambda item: (item["rbi"], item["hr"], item["hits"]),
                reverse=True,
            )
            if hitter_ranked:
                spotlight = build_spotlight_entry(
                    hitter_ranked[0]["entry"],
                    keys,
                    [
                        {"label": "H", "terms": ["hits"]},
                        {"label": "RBI", "terms": ["rbis", "rbi"]},
                        {"label": "R", "terms": ["runs"]},
                        {"label": "HR", "terms": ["homeruns", "hr"]},
                    ],
                )
                if spotlight:
                    spotlight["category"] = "Top hitter"
                    results.append(spotlight)

    if isinstance(pitching, dict):
        athletes = pitching.get("athletes", [])
        keys = pitching.get("keys", [])
        if isinstance(athletes, list) and isinstance(keys, list) and athletes:
            pitcher_ranked = []
            strikeouts_index = find_stat_index(keys, ["strikeouts", "k"])
            for athlete_entry in athletes:
                stats = athlete_entry.get("stats", [])
                if not isinstance(stats, list):
                    continue
                pitcher_ranked.append(
                    {
                        "entry": athlete_entry,
                        "strikeouts": read_stat_number(stats, strikeouts_index),
                    }
                )
            pitcher_ranked.sort(key=lambda item: item["strikeouts"], reverse=True)
            if pitcher_ranked:
                spotlight = build_spotlight_entry(
                    pitcher_ranked[0]["entry"],
                    keys,
                    [
                        {"label": "IP", "terms": ["fullinningspartinnings", "inningspitched", "ip"]},
                        {"label": "K", "terms": ["strikeouts", "k"]},
                        {"label": "ER", "terms": ["earnedruns", "er"]},
                        {"label": "BB", "terms": ["walks", "bb"]},
                    ],
                )
                if spotlight:
                    spotlight["category"] = "Top pitcher"
                    results.append(spotlight)

    return results


def build_hockey_summary_spotlights(summary_payload: dict[str, Any], team_id: str) -> list[dict[str, Any]]:
    team_block = find_summary_player_team_block(summary_payload, team_id)
    if not team_block:
        return []

    blocks = team_block.get("statistics", [])
    if not isinstance(blocks, list):
        return []

    skaters = next(
        (
            block
            for block in blocks
            if normalize_stat_token(block.get("name")) in {"skaters", "forwards"}
        ),
        None,
    )
    goalies = next(
        (block for block in blocks if normalize_stat_token(block.get("name")) == "goalies"),
        None,
    )

    results = []
    if isinstance(skaters, dict):
        athletes = skaters.get("athletes", [])
        keys = skaters.get("keys", [])
        if isinstance(athletes, list) and isinstance(keys, list) and athletes:
            ranked = []
            goals_index = find_stat_index(keys, ["goals", "g"])
            assists_index = find_stat_index(keys, ["assists", "a"])
            shots_index = find_stat_index(keys, ["shotstotal", "s"])
            for athlete_entry in athletes:
                stats = athlete_entry.get("stats", [])
                if not isinstance(stats, list):
                    continue
                ranked.append(
                    {
                        "entry": athlete_entry,
                        "points": read_stat_number(stats, goals_index)
                        + read_stat_number(stats, assists_index),
                        "shots": read_stat_number(stats, shots_index),
                    }
                )
            ranked.sort(key=lambda item: (item["points"], item["shots"]), reverse=True)
            if ranked:
                spotlight = build_spotlight_entry(
                    ranked[0]["entry"],
                    keys,
                    [
                        {"label": "G", "terms": ["goals", "g"]},
                        {"label": "A", "terms": ["assists", "a"]},
                        {"label": "S", "terms": ["shotstotal", "s"]},
                    ],
                )
                if spotlight:
                    spotlight["category"] = "Top skater"
                    results.append(spotlight)

    if isinstance(goalies, dict):
        athletes = goalies.get("athletes", [])
        keys = goalies.get("keys", [])
        if isinstance(athletes, list) and isinstance(keys, list) and athletes:
            spotlight = build_spotlight_entry(
                athletes[0],
                keys,
                [
                    {"label": "SV", "terms": ["saves", "sv"]},
                    {"label": "SV%", "terms": ["savepct", "sv%"]},
                    {"label": "GA", "terms": ["goalsagainst", "ga"]},
                ],
            )
            if spotlight:
                spotlight["category"] = "Goalie"
                results.append(spotlight)

    return results


def build_football_summary_spotlights(summary_payload: dict[str, Any], team_id: str) -> list[dict[str, Any]]:
    team_block = find_summary_player_team_block(summary_payload, team_id)
    if not team_block:
        return []

    blocks = team_block.get("statistics", [])
    if not isinstance(blocks, list):
        return []

    results = []
    for block_name, label, items in [
        (
            "passing",
            "Passer",
            [
                {"label": "YDS", "terms": ["passingyards", "yds"]},
                {"label": "TD", "terms": ["passingtouchdowns", "td"]},
                {"label": "INT", "terms": ["interceptions", "int"]},
            ],
        ),
        (
            "rushing",
            "Rusher",
            [
                {"label": "YDS", "terms": ["rushingyards", "yds"]},
                {"label": "CAR", "terms": ["rushingattempts", "car"]},
                {"label": "TD", "terms": ["rushingtouchdowns", "td"]},
            ],
        ),
        (
            "receiving",
            "Receiver",
            [
                {"label": "REC", "terms": ["receptions", "rec"]},
                {"label": "YDS", "terms": ["receivingyards", "yds"]},
                {"label": "TD", "terms": ["receivingtouchdowns", "td"]},
            ],
        ),
    ]:
        block = next(
            (item for item in blocks if normalize_stat_token(item.get("name")) == block_name),
            None,
        )
        if not isinstance(block, dict):
            continue
        athletes = block.get("athletes", [])
        keys = block.get("keys", [])
        if not isinstance(athletes, list) or not athletes or not isinstance(keys, list):
            continue

        spotlight = build_spotlight_entry(athletes[0], keys, items)
        if spotlight:
            spotlight["category"] = label
            results.append(spotlight)

    return results


def build_summary_player_spotlights(
    sport_key: str, summary_payload: dict[str, Any], team_id: str | None
) -> list[dict[str, Any]]:
    if not team_id:
        return []

    if sport_key == "basketball_nba":
        return build_nba_summary_spotlights(summary_payload, team_id)
    if sport_key == "baseball_mlb":
        return build_mlb_summary_spotlights(summary_payload, team_id)
    if sport_key == "icehockey_nhl":
        return build_hockey_summary_spotlights(summary_payload, team_id)
    if sport_key in {"americanfootball_nfl", "americanfootball_ncaaf"}:
        return build_football_summary_spotlights(summary_payload, team_id)

    return []


def parse_competitor_score(competitor: dict[str, Any]) -> int | None:
    score = competitor.get("score")

    if isinstance(score, dict):
        score = score.get("value") or score.get("displayValue")

    try:
        return int(score)
    except (TypeError, ValueError):
        return None


def build_recent_schedule_results(
    schedule_events: list[dict[str, Any]], team_id: str
) -> list[dict[str, Any]]:
    completed_events = []

    for event in schedule_events:
        competitions = event.get("competitions", [])
        competition = competitions[0] if competitions else None
        if not competition:
            continue

        if not competition.get("status", {}).get("type", {}).get("completed"):
            continue

        completed_events.append(competition)

    completed_events.sort(key=lambda event: event.get("date") or "", reverse=True)

    results = []
    for competition in completed_events:
        competitors = competition.get("competitors", [])
        team_competitor = next(
            (
                competitor
                for competitor in competitors
                if str(competitor.get("team", {}).get("id")) == str(team_id)
            ),
            None,
        )
        opponent = next(
            (
                competitor
                for competitor in competitors
                if str(competitor.get("team", {}).get("id")) != str(team_id)
            ),
            None,
        )

        if not team_competitor or not opponent:
            continue

        team_score = parse_competitor_score(team_competitor)
        opponent_score = parse_competitor_score(opponent)
        if team_score is None or opponent_score is None:
            continue

        if team_score > opponent_score:
            result = "W"
        elif team_score < opponent_score:
            result = "L"
        else:
            result = "T"

        results.append(
            {
                "id": competition.get("id"),
                "commence_time": competition.get("date"),
                "opponent": opponent.get("team", {}).get("displayName")
                or opponent.get("team", {}).get("shortDisplayName")
                or "Opponent",
                "location": "Home"
                if team_competitor.get("homeAway") == "home"
                else "Away",
                "result": result,
                "team_score": team_score,
                "opponent_score": opponent_score,
                "margin": team_score - opponent_score,
                "game_total": team_score + opponent_score,
            }
        )

        if len(results) == 5:
            break

    return results


def get_athlete_stat_value(athlete_entry: dict[str, Any], stat_name: str) -> float | None:
    for category in athlete_entry.get("categories", []):
        names = category.get("names", [])
        values = category.get("values", [])

        if stat_name not in names:
            continue

        index = names.index(stat_name)
        if index >= len(values):
            return None

        value = values[index]
        if isinstance(value, (int, float)):
            return float(value)

    return None


def fetch_nba_player_stat_pool() -> list[dict[str, Any]]:
    payload = request_json_with_base(
        ESPN_COMMON_BASE_URL,
        "basketball/nba/statistics/byathlete",
        {
            "lang": "en",
            "region": "us",
            "limit": 500,
        },
        "NBA ESPN player stats",
    )

    athletes = payload.get("athletes", [])
    if not isinstance(athletes, list):
        raise RuntimeError("NBA ESPN player stats returned an unexpected response.")

    return athletes


def build_team_player_leaders(
    athletes: list[dict[str, Any]], team_id: str
) -> list[dict[str, Any]]:
    team_athletes = [
        athlete
        for athlete in athletes
        if str(athlete.get("athlete", {}).get("teamId")) == str(team_id)
    ]

    eligible = [
        athlete
        for athlete in team_athletes
        if (get_athlete_stat_value(athlete, "gamesPlayed") or 0) >= 5
    ]
    if not eligible:
        eligible = team_athletes

    leaders = []
    for blueprint in PLAYER_LEADER_BLUEPRINTS:
        stat_key = blueprint["key"]
        ranked = [
            athlete
            for athlete in eligible
            if get_athlete_stat_value(athlete, stat_key) is not None
        ]
        if not ranked:
            continue

        best = max(
            ranked,
            key=lambda athlete: get_athlete_stat_value(athlete, stat_key) or 0,
        )
        athlete = best.get("athlete", {})
        stat_value = get_athlete_stat_value(best, stat_key)

        leaders.append(
            {
                "category_key": stat_key,
                "label": blueprint["label"],
                "athlete_id": athlete.get("id"),
                "athlete_name": athlete.get("displayName") or athlete.get("shortName"),
                "position": athlete.get("position", {}).get("abbreviation"),
                "headshot": athlete.get("headshot", {}).get("href"),
                "games_played": get_athlete_stat_value(best, "gamesPlayed"),
                "value": round(stat_value, 1) if stat_value is not None else None,
                "display_value": f"{stat_value:.1f}" if stat_value is not None else "--",
            }
        )

    return leaders


def find_score_value(scores: list[dict[str, Any]] | None, team_name: str) -> int | None:
    if not scores:
        return None

    for score in scores:
        if score.get("name") == team_name:
            try:
                return int(score.get("score"))
            except (TypeError, ValueError):
                return None

    return None


def build_recent_results(
    score_games: list[dict[str, Any]], team_name: str
) -> list[dict[str, Any]]:
    relevant_games = [
        game
        for game in score_games
        if game.get("completed")
        and team_name in {game.get("home_team"), game.get("away_team")}
    ]

    relevant_games.sort(key=lambda game: game.get("commence_time") or "", reverse=True)

    results = []

    for game in relevant_games:
        home_team = game.get("home_team")
        away_team = game.get("away_team")
        home_score = find_score_value(game.get("scores"), home_team)
        away_score = find_score_value(game.get("scores"), away_team)

        if home_score is None or away_score is None:
            continue

        is_home = team_name == home_team
        opponent = away_team if is_home else home_team
        team_score = home_score if is_home else away_score
        opponent_score = away_score if is_home else home_score

        if team_score > opponent_score:
            result = "W"
        elif team_score < opponent_score:
            result = "L"
        else:
            result = "T"

        results.append(
            {
                "id": game.get("id"),
                "commence_time": game.get("commence_time"),
                "opponent": opponent,
                "location": "Home" if is_home else "Away",
                "result": result,
                "team_score": team_score,
                "opponent_score": opponent_score,
                "margin": team_score - opponent_score,
                "game_total": team_score + opponent_score,
            }
        )

        if len(results) == 5:
            break

    return results


def summarize_recent_results(results: list[dict[str, Any]]) -> dict[str, Any]:
    if not results:
        return {
            "games": 0,
            "record": "0-0",
            "avg_points_for": None,
            "avg_points_against": None,
            "avg_margin": None,
            "avg_total": None,
        }

    wins = sum(1 for result in results if result["result"] == "W")
    losses = sum(1 for result in results if result["result"] == "L")

    return {
        "games": len(results),
        "record": f"{wins}-{losses}",
        "avg_points_for": round(
            sum(result["team_score"] for result in results) / len(results), 1
        ),
        "avg_points_against": round(
            sum(result["opponent_score"] for result in results) / len(results), 1
        ),
        "avg_margin": round(sum(result["margin"] for result in results) / len(results), 1),
        "avg_total": round(
            sum(result["game_total"] for result in results) / len(results), 1
        ),
    }


def build_team_context(
    sport_key: str,
    team_name: str,
    fallback_results: list[dict[str, Any]],
) -> dict[str, Any]:
    matched_team = find_espn_team(sport_key, team_name)
    team_stats: list[dict[str, Any]] = []
    recent_results = fallback_results
    recent_source = "Odds API scores fallback"
    team_id = matched_team.get("id") if matched_team else None

    if matched_team:
        try:
            schedule_payload = fetch_espn_team_schedule(sport_key, team_id)
            schedule_results = build_recent_schedule_results(
                schedule_payload.get("events", []), team_id
            )
            if schedule_results:
                recent_results = schedule_results
                recent_source = "ESPN team schedule"
        except RuntimeError:
            pass

        try:
            stats_payload = fetch_espn_team_statistics(sport_key, team_id)
            team_stats = select_team_stats(sport_key, stats_payload)
        except RuntimeError:
            pass

    return {
        "team_id": team_id,
        "recent_results": recent_results,
        "summary": summarize_recent_results(recent_results),
        "stats": team_stats,
        "recent_source": recent_source,
        "matched_team": matched_team,
    }


def build_player_leader_block(
    sport_key: str,
    away_team: str,
    away_context: dict[str, Any],
    home_team: str,
    home_context: dict[str, Any],
) -> dict[str, Any]:
    teams = {
        away_team: [],
        home_team: [],
    }

    config = get_espn_sport_config(sport_key)
    if not config or not config.get("player_leaders"):
        return {
            "available": False,
            "source": "ESPN",
            "message": (
                "Player per-game leader cards are live for NBA matchups. College and "
                "other leagues still need a team-scoped player stats feed so SharkEdge "
                "doesn't download an entire league table on every click."
            ),
            "teams": teams,
        }

    try:
        athlete_pool = fetch_nba_player_stat_pool()
    except RuntimeError as error:
        return {
            "available": False,
            "source": "ESPN",
            "message": str(error),
            "teams": teams,
        }

    if away_context.get("team_id"):
        teams[away_team] = build_team_player_leaders(
            athlete_pool, away_context["team_id"]
        )

    if home_context.get("team_id"):
        teams[home_team] = build_team_player_leaders(
            athlete_pool, home_context["team_id"]
        )

    return {
        "available": any(teams[team] for team in teams),
        "source": "ESPN",
        "message": (
            "Season per-game leader cards are sourced from ESPN for NBA matchups."
        ),
        "teams": teams,
    }


def build_provider_contract(
    sport_key: str,
    summary_available: bool,
    current_odds_available: bool,
    props_count: int,
) -> dict[str, Any]:
    mainstream_live = sport_key in {
        "basketball_nba",
        "basketball_ncaab",
        "baseball_mlb",
        "icehockey_nhl",
        "americanfootball_nfl",
        "americanfootball_ncaaf",
    }

    return {
        "version": "2026-03-26",
        "sport_key": sport_key,
        "scores_state": {
            "provider": "The Odds API scores",
            "status": "LIVE" if mainstream_live else "PARTIAL",
        },
        "current_odds": {
            "provider": "The Odds API odds",
            "status": "LIVE" if current_odds_available else "PARTIAL",
        },
        "team_stats": {
            "provider": "ESPN team statistics",
            "status": "LIVE" if mainstream_live else "PARTIAL",
        },
        "live_boxscore": {
            "provider": "ESPN summary boxscore",
            "status": "LIVE" if summary_available else "PARTIAL",
        },
        "season_player_leaders": {
            "provider": "ESPN league athlete stats",
            "status": "LIVE" if sport_key == "basketball_nba" else "PARTIAL",
        },
        "player_spotlights": {
            "provider": "ESPN summary player blocks",
            "status": "LIVE" if summary_available else "PARTIAL",
        },
        "props": {
            "provider": "The Odds API player props",
            "status": "LIVE" if props_count else ("PARTIAL" if sport_key in BASKETBALL_PROP_SPORT_KEYS else "PARTIAL"),
        },
        "historical_odds": {
            "provider": "OddsHarvester",
            "status": "HISTORICAL_ONLY",
        },
    }


def build_live_prop_id(
    sport_key: str,
    event_id: str,
    bookmaker_key: str,
    market_key: str,
    player_name: str,
    side: str,
    point: float | int | None,
) -> str:
    point_key = "na" if point is None else str(point).replace("+", "")
    return "|".join(
        [
            sport_key,
            event_id,
            bookmaker_key,
            market_key,
            normalize_person_name(player_name),
            normalize_person_name(side),
            point_key,
        ]
    )


def normalize_prop_outcome(
    sport_key: str,
    event_payload: dict[str, Any],
    bookmaker: dict[str, Any],
    market: dict[str, Any],
    outcome: dict[str, Any],
    player_index: dict[str, dict[str, Any] | None],
) -> dict[str, Any] | None:
    player_name = outcome.get("description")
    side = outcome.get("name")
    point = outcome.get("point")
    price = outcome.get("price")

    if (
        not player_name
        or not side
        or not isinstance(point, (int, float))
        or not isinstance(price, (int, float))
    ):
        return None

    away_team = event_payload.get("away_team")
    home_team = event_payload.get("home_team")
    if not away_team or not home_team:
        return None

    player_context = resolve_prop_player_context(
        player_index,
        str(player_name),
        str(away_team),
        str(home_team),
    )
    bookmaker_key = bookmaker.get("key")
    market_key = market.get("key")
    if not bookmaker_key or not market_key:
        return None

    return {
        "id": build_live_prop_id(
            sport_key,
            str(event_payload.get("id")),
            str(bookmaker_key),
            str(market_key),
            str(player_name),
            str(side),
            point,
        ),
        "event_id": event_payload.get("id"),
        "sport_key": sport_key,
        "commence_time": event_payload.get("commence_time"),
        "home_team": home_team,
        "away_team": away_team,
        "bookmaker_key": bookmaker_key,
        "bookmaker_title": bookmaker.get("title"),
        "market_key": market_key,
        "player_name": player_name,
        "player_external_id": player_context["player_id"],
        "player_position": player_context["position"],
        "team_name": player_context["team_name"],
        "opponent_name": player_context["opponent_name"],
        "team_resolved": player_context["resolved"],
        "side": str(side).upper(),
        "line": float(point),
        "price": int(price),
        "last_update": market.get("last_update"),
    }


def build_props_from_event_payload(
    sport_key: str, event_payload: dict[str, Any]
) -> list[dict[str, Any]]:
    away_team = event_payload.get("away_team")
    home_team = event_payload.get("home_team")
    if not away_team or not home_team:
        return []

    player_index = build_event_player_index(
        sport_key,
        str(away_team),
        str(home_team),
    )
    props = []

    for bookmaker in sort_bookmakers(event_payload.get("bookmakers", [])):
        markets = bookmaker.get("markets", [])
        for market in markets:
            if market.get("key") not in PLAYER_PROP_MARKET_SET:
                continue

            for outcome in market.get("outcomes", []):
                normalized = normalize_prop_outcome(
                    sport_key,
                    event_payload,
                    bookmaker,
                    market,
                    outcome,
                    player_index,
                )
                if normalized:
                    props.append(normalized)

    market_order = {
        market_key: index for index, market_key in enumerate(PLAYER_PROP_MARKET_KEYS)
    }

    props.sort(
        key=lambda prop: (
            prop.get("commence_time") or "",
            prop.get("player_name") or "",
            market_order.get(prop.get("market_key"), 999),
            prop.get("bookmaker_title") or "",
            0 if prop.get("side") == "OVER" else 1,
            prop.get("line") or 0,
        )
    )
    return props


def fetch_game_props(
    sport_key: str,
    event_id: str,
    api_key: str,
) -> list[dict[str, Any]]:
    if sport_key not in BASKETBALL_PROP_SPORT_KEYS:
        return []

    payload = request_json_cached(
        ODDS_API_BASE_URL,
        f"{sport_key}/events/{event_id}/odds/",
        {
            "apiKey": api_key,
            "regions": get_regions(),
            "bookmakers": get_bookmakers(),
            "markets": get_props_markets(),
            "oddsFormat": "american",
            "dateFormat": "iso",
        },
        f"{sport_key} props",
    )

    if not isinstance(payload, dict):
        raise RuntimeError(f"{sport_key} props returned an unexpected response.")

    return build_props_from_event_payload(sport_key, payload)


def fetch_sport_prop_board(
    sport: dict[str, str],
    api_key: str,
    max_events: int,
) -> dict[str, Any]:
    events = fetch_sport_events(sport["key"], api_key)
    selected_events = events[:max_events]
    prop_games: list[dict[str, Any]] = []
    props: list[dict[str, Any]] = []
    errors: list[str] = []

    if not selected_events:
        return {
            "key": sport["key"],
            "title": sport["title"],
            "short_title": sport["short_title"],
            "event_count": len(events),
            "game_count": 0,
            "prop_count": 0,
            "event_limit": max_events,
            "events_scanned": 0,
            "partial": len(events) > 0,
            "games": [],
            "props": [],
            "errors": [],
        }

    max_workers = min(get_props_workers(), len(selected_events))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_event = {
            executor.submit(fetch_game_props, sport["key"], str(event.get("id")), api_key): event
            for event in selected_events
            if event.get("id")
        }

        for future, event in future_to_event.items():
            try:
                game_props = future.result()
            except Exception as error:
                message = f"{sport['short_title']} {event.get('away_team')} @ {event.get('home_team')}: {error}"
                errors.append(message)
                continue

            if not game_props:
                continue

            prop_games.append(
                {
                    "event_id": event.get("id"),
                    "commence_time": event.get("commence_time"),
                    "home_team": event.get("home_team"),
                    "away_team": event.get("away_team"),
                    "prop_count": len(game_props),
                }
            )
            props.extend(game_props)

    enriched_props = enrich_props_with_ev(props)
    return {
        "key": sport["key"],
        "title": sport["title"],
        "short_title": sport["short_title"],
        "event_count": len(events),
        "game_count": len(prop_games),
        "prop_count": len(enriched_props),
        "event_limit": max_events,
        "events_scanned": len(selected_events),
        "partial": len(events) > len(selected_events),
        "games": sorted(prop_games, key=lambda game: game.get("commence_time") or ""),
        "props": enriched_props,
        "errors": errors,
    }


def build_game_detail(
    sport_key: str,
    game: dict[str, Any],
    score_games: list[dict[str, Any]],
    props: list[dict[str, Any]],
    *,
    current_odds_available: bool = True,
    props_error: str | None = None,
) -> dict[str, Any]:
    away_team = str(game.get("away_team") or "Away")
    home_team = str(game.get("home_team") or "Home")
    bookmakers = game.get("bookmakers", [])
    if not isinstance(bookmakers, list):
        bookmakers = []

    away_fallback = build_recent_results(score_games, away_team)
    home_fallback = build_recent_results(score_games, home_team)
    away_context = build_team_context(sport_key, away_team, away_fallback)
    home_context = build_team_context(sport_key, home_team, home_fallback)
    player_leaders = build_player_leader_block(
        sport_key, away_team, away_context, home_team, home_context
    )
    summary_payload = None
    competition = None
    summary_error = None

    try:
        summary_payload = fetch_espn_event_summary(sport_key, str(game.get("id")))
        competitions = summary_payload.get("header", {}).get("competitions", [])
        if isinstance(competitions, list) and competitions:
            competition = competitions[0]
        elif isinstance(summary_payload.get("competitions"), list) and summary_payload.get("competitions"):
            competition = summary_payload["competitions"][0]
    except RuntimeError as error:
        summary_error = str(error)

    live_team_stats = {
        away_team: build_live_team_stat_strip(
            sport_key,
            competition,
            summary_payload or {},
            away_context.get("team_id"),
        ),
        home_team: build_live_team_stat_strip(
            sport_key,
            competition,
            summary_payload or {},
            home_context.get("team_id"),
        ),
    }
    away_spotlights = build_summary_player_spotlights(
        sport_key, summary_payload or {}, away_context.get("team_id")
    )
    home_spotlights = build_summary_player_spotlights(
        sport_key, summary_payload or {}, home_context.get("team_id")
    )
    player_spotlights = {
        "available": bool(
            live_team_stats[away_team]
            or live_team_stats[home_team]
            or away_spotlights
            or home_spotlights
        ),
        "source": "ESPN summary boxscore",
        "message": (
            "Live player spotlights are derived from the ESPN event summary for this matchup."
            if summary_payload
            else (
                summary_error
                or "Live player spotlights were not available from ESPN for this matchup."
            )
        ),
        "teams": {
            away_team: away_spotlights,
            home_team: home_spotlights,
        },
    }

    return {
        "game": game,
        "provider_contract": build_provider_contract(
            sport_key,
            summary_payload is not None,
            current_odds_available,
            len(props),
        ),
        "line_analytics": {
            "spread_range": {
                away_team: build_point_range(collect_points(bookmakers, "spread", away_team)),
                home_team: build_point_range(collect_points(bookmakers, "spread", home_team)),
            },
            "total_range": {
                "over": build_point_range(collect_points(bookmakers, "total", "Over")),
                "under": build_point_range(collect_points(bookmakers, "total", "Under")),
            },
        },
        "team_form": {
            away_team: {
                "recent_results": away_context["recent_results"],
                "summary": away_context["summary"],
            },
            home_team: {
                "recent_results": home_context["recent_results"],
                "summary": home_context["summary"],
            },
        },
        "team_stats": {
            away_team: away_context["stats"],
            home_team: home_context["stats"],
        },
        "team_live_stats": live_team_stats,
        "player_leaders": player_leaders,
        "player_spotlights": player_spotlights,
        "props": props,
        "verified_user_stats": {
            "available": False,
            "message": "Verified bettor handle, tickets, bet history, and connected sportsbook tracking require auth, linked accounts, and persistent storage.",
            "features": [
                "Bet handle",
                "Total bets",
                "History tracking",
                "Connected sportsbook syncing",
            ],
        },
        "notes": [
            note
            for note in [
                f"Recent form is sourced from {away_context['recent_source']} and {home_context['recent_source']} when available.",
                "Team betting stats are sourced from ESPN team statistics endpoints when SharkEdge can map the matchup cleanly.",
                "Live team stat strips and player spotlights are sourced from ESPN event summary payloads when available.",
                (
                    props_error
                    or (
                        "Current odds and props are temporarily unavailable, so this matchup is running in ESPN-backed detail mode."
                        if not current_odds_available
                        else None
                    )
                ),
                "Public money percentages are not included in the current provider feed.",
            ]
            if note
        ],
    }


def extract_summary_competition(summary_payload: dict[str, Any]) -> dict[str, Any] | None:
    competitions = summary_payload.get("header", {}).get("competitions", [])
    if isinstance(competitions, list) and competitions:
        first = competitions[0]
        return first if isinstance(first, dict) else None

    competitions = summary_payload.get("competitions")
    if isinstance(competitions, list) and competitions:
        first = competitions[0]
        return first if isinstance(first, dict) else None

    return None


def build_synthetic_game_from_summary(
    sport_key: str, event_id: str, summary_payload: dict[str, Any]
) -> dict[str, Any] | None:
    competition = extract_summary_competition(summary_payload)
    if not competition:
        return None

    competitors = competition.get("competitors", [])
    if not isinstance(competitors, list) or len(competitors) < 2:
        return None

    home = next(
        (
            item
            for item in competitors
            if isinstance(item, dict) and str(item.get("homeAway", "")).lower() == "home"
        ),
        None,
    )
    away = next(
        (
            item
            for item in competitors
            if isinstance(item, dict) and str(item.get("homeAway", "")).lower() == "away"
        ),
        None,
    )
    if not isinstance(home, dict) or not isinstance(away, dict):
        return None

    home_team = (
        home.get("team", {}).get("displayName")
        or home.get("team", {}).get("shortDisplayName")
        or home.get("team", {}).get("name")
    )
    away_team = (
        away.get("team", {}).get("displayName")
        or away.get("team", {}).get("shortDisplayName")
        or away.get("team", {}).get("name")
    )
    if not home_team or not away_team:
        return None

    return {
        "id": event_id,
        "sport_key": sport_key,
        "commence_time": competition.get("date")
        or summary_payload.get("header", {}).get("competitions", [{}])[0].get("date"),
        "home_team": home_team,
        "away_team": away_team,
        "bookmakers": [],
        "bookmakers_available": 0,
        "market_stats": {
            "moneyline": [],
            "spread": [],
            "total": [],
        },
    }


def build_espn_only_game_detail(
    sport_key: str, event_id: str, props_error: str | None = None
) -> dict[str, Any] | None:
    try:
        summary_payload = fetch_espn_event_summary(sport_key, event_id)
    except RuntimeError:
        return None

    synthetic_game = build_synthetic_game_from_summary(sport_key, event_id, summary_payload)
    if not synthetic_game:
        return None

    detail = build_game_detail(
        sport_key,
        synthetic_game,
        [],
        [],
        current_odds_available=False,
        props_error=props_error,
    )
    detail["game"]["detail_mode"] = "espn_summary_only"
    return detail


def build_historical_provider_status() -> dict[str, Any]:
    supported_sports = []
    for sport in SPORTS:
        supported_sports.append(
            {
                "key": sport["key"],
                "title": sport["title"],
                "short_title": sport["short_title"],
                "harvest_supported": bool(
                    sport.get("odds_harvester_sport")
                    and sport.get("odds_harvester_leagues")
                ),
                "leagues": get_oddsharvester_leagues(sport),
                "markets": get_oddsharvester_markets(sport),
            }
        )

    return {
        "provider": "oddsharvester",
        "mode": "historical_ingestion_only",
        "available": is_oddsharvester_available(),
        "command": Path(get_oddsharvester_executable() or "oddsharvester").name,
        "note": (
            "OddsHarvester is reserved for harvested historical/opening/closing odds "
            "snapshots. It is not used for live scoreboards or the live board request path."
        ),
        "capabilities": {
            "opening": True,
            "closing": True,
            "snapshots": True,
        },
        "sports": supported_sports,
    }


def build_historical_harvest_response(
    sport_key: str | None = None,
) -> dict[str, Any]:
    if not is_oddsharvester_available():
        return {
            "configured": False,
            "provider": "oddsharvester",
            "source_type": "HARVESTED_HISTORICAL",
            "generated_at": format_now(),
            "message": (
                "OddsHarvester is not available in this runtime. Historical harvesting is "
                "separated from the live board and must be installed on the backend worker."
            ),
            "sports": [],
        }

    selected_sports = [find_sport(sport_key)] if sport_key else SPORTS
    sports: list[dict[str, Any]] = []
    errors: list[str] = []

    with ThreadPoolExecutor(max_workers=max(1, len(selected_sports))) as executor:
        future_to_sport = {
            executor.submit(fetch_sport_odds_from_oddsharvester, sport): sport
            for sport in selected_sports
        }

        for future, sport in future_to_sport.items():
            try:
                sports.append(future.result())
            except Exception as error:
                errors.append(str(error))
                sports.append(
                    {
                        "key": sport["key"],
                        "title": sport["title"],
                        "short_title": sport["short_title"],
                        "game_count": 0,
                        "games": [],
                        "error": str(error),
                    }
                )

    sports.sort(key=lambda item: SPORT_ORDER.get(item["key"], 999))

    return {
        "configured": True,
        "provider": "oddsharvester",
        "source_type": "HARVESTED_HISTORICAL",
        "generated_at": format_now(),
        "sport_count": len(sports),
        "game_count": sum(sport.get("game_count", 0) for sport in sports),
        "errors": errors,
        "note": (
            "This payload is for harvested historical odds ingestion only. It is not used "
            "for live scoreboards or the live board request path."
        ),
        "sports": sports,
    }


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "message": "SharkEdge API is live",
        "odds_board_endpoint": "/api/odds/board",
        "pinnacle_mlb_endpoint": "/api/odds/pinnacle/mlb",
        "props_board_endpoint": "/api/props/board",
        "game_detail_endpoint_template": "/api/games/{sport_key}/{event_id}",
        "historical_provider_status_endpoint": "/api/historical/odds/provider-status",
        "historical_harvest_endpoint": "/api/historical/odds/harvest?sport_key={sport_key}",
        "demo_endpoint": "/api/signals/demo",
    }


@app.get("/api/signals/demo")
def demo() -> dict[str, Any]:
    return {"selection": "Bulls +4.5", "edge_pct": 4.12, "ev": 0.078}


@app.get("/api/historical/odds/provider-status")
def historical_provider_status() -> dict[str, Any]:
    return build_historical_provider_status()


@app.get("/api/historical/odds/harvest")
def historical_odds_harvest(sport_key: str | None = None) -> dict[str, Any]:
    return build_historical_harvest_response(sport_key)


@app.get("/api/ingest/odds/status")
def ingest_odds_status() -> dict[str, Any]:
    cache = load_scraper_cache()
    sports = get_scraper_cache_sports()
    return {
        "configured": bool(SCRAPER_INGEST_API_KEY),
        "provider": "scraper_cache",
        "updated_at": cache.get("updated_at"),
        "cache_max_age_seconds": SCRAPER_CACHE_MAX_AGE_SECONDS,
        "sport_count": len(sports),
        "game_count": sum(sport.get("game_count", 0) for sport in sports),
        "sports": [
            {
                "key": sport["key"],
                "title": sport["title"],
                "short_title": sport["short_title"],
                "game_count": sport.get("game_count", 0),
            }
            for sport in sports
        ],
    }


@app.post("/api/ingest/odds")
def ingest_odds(
    payload: dict[str, Any],
    x_api_key: str | None = Header(default=None),
) -> dict[str, Any]:
    if not SCRAPER_INGEST_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="SHARKEDGE_API_KEY is not configured on the backend service.",
        )

    if x_api_key != SCRAPER_INGEST_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid scraper API key.")

    event_key = payload.get("eventKey")
    home_team = payload.get("homeTeam")
    away_team = payload.get("awayTeam")
    if not event_key or not home_team or not away_team:
        raise HTTPException(
            status_code=400,
            detail="eventKey, homeTeam, and awayTeam are required.",
        )

    source_meta = payload.get("sourceMeta", {})
    sport_key = payload.get("sportKey")
    if sport_key not in SPORT_ORDER:
        sport_key = resolve_scraper_sport_key(
            payload.get("sport"),
            source_meta.get("league"),
        )
    if sport_key not in SPORT_ORDER:
        raise HTTPException(
            status_code=400,
            detail="Could not resolve a supported SharkEdge sport key for this event.",
        )

    normalized_payload = {
        "eventKey": event_key,
        "sport": payload.get("sport"),
        "league": source_meta.get("league"),
        "homeTeam": home_team,
        "awayTeam": away_team,
        "commenceTime": payload.get("commenceTime"),
        "scrapedAt": payload.get("scrapedAt") or format_now(),
        "book": (payload.get("lines") or [{}])[0].get("book") or payload.get("source") or "scraper",
        "lines": payload.get("lines") or [],
        "sourceMeta": source_meta if isinstance(source_meta, dict) else {},
    }

    cache = load_scraper_cache()
    sports_cache = cache.setdefault("sports", {})
    existing_events = sports_cache.setdefault(sport_key, [])

    replaced = False
    filtered_events: list[dict[str, Any]] = []
    for existing in existing_events:
        if not isinstance(existing, dict):
            continue
        if existing.get("eventKey") == event_key:
            replaced = True
            continue
        filtered_events.append(existing)

    filtered_events.append(normalized_payload)
    filtered_events.sort(key=lambda item: item.get("commenceTime") or "")
    sports_cache[sport_key] = filtered_events
    cache["updated_at"] = format_now()
    save_scraper_cache(cache)

    return {
        "ok": True,
        "provider": "scraper_cache",
        "sport_key": sport_key,
        "event_key": event_key,
        "replaced": replaced,
        "sport_event_count": len(filtered_events),
        "updated_at": cache["updated_at"],
    }


@app.get("/api/odds/board")
def odds_board() -> dict[str, Any]:
    api_key = get_api_key()
    provider, provider_error = resolve_board_provider(api_key)
    regions = get_regions()
    bookmakers = get_bookmakers()
    split_stats_note = (
        "Consensus stats in SharkEdge are derived from sportsbook lines and best "
        "prices. Public ticket and money percentages require an additional data feed."
    )

    if not provider:
        return {
            "configured": False,
            "generated_at": format_now(),
            "provider_mode": get_board_provider_mode(),
            "provider": None,
            "regions": regions,
            "bookmakers": bookmakers,
            "split_stats_supported": False,
            "split_stats_note": split_stats_note,
            "message": provider_error
            or "Configure ODDS_API_KEY to load live current odds.",
            "sports": [
                {
                    "key": sport["key"],
                    "title": sport["title"],
                    "short_title": sport["short_title"],
                    "game_count": 0,
                    "games": [],
                }
                for sport in SPORTS
            ],
        }

    sports: list[dict[str, Any]] = []
    errors: list[str] = []
    print(f"[odds-board] provider={provider} sports={len(SPORTS)}")

    with ThreadPoolExecutor(max_workers=len(SPORTS)) as executor:
        future_to_sport = {
            executor.submit(fetch_sport_odds, sport, api_key, provider): sport
            for sport in SPORTS
        }

        for future, sport in future_to_sport.items():
            try:
                sports.append(future.result())
            except Exception as error:
                errors.append(str(error))
                sports.append(
                    {
                        "key": sport["key"],
                        "title": sport["title"],
                        "short_title": sport["short_title"],
                        "game_count": 0,
                        "games": [],
                        "error": str(error),
                    }
                )

    sports.sort(key=lambda item: SPORT_ORDER.get(item["key"], 999))

    return {
        "configured": True,
        "generated_at": format_now(),
        "provider_mode": get_board_provider_mode(),
        "provider": provider,
        "regions": regions,
        "bookmakers": bookmakers,
        "sport_count": len(sports),
        "game_count": sum(sport["game_count"] for sport in sports),
        "bookmaker_count": collect_unique_bookmakers(sports),
        "split_stats_supported": False,
        "split_stats_note": split_stats_note,
        "errors": errors,
        "sports": sports,
    }


@app.get("/api/odds/pinnacle/mlb")
def pinnacle_mlb_odds(source: str = "auto") -> dict[str, Any]:
    normalized_source = (source or "auto").strip().lower()
    if normalized_source not in {"auto", "actionnetwork", "pinnacle_direct"}:
        raise HTTPException(
            status_code=400,
            detail="source must be one of: auto, actionnetwork, pinnacle_direct",
        )

    try:
        snapshot = get_pinnacle_mlb_snapshot(source=normalized_source)
    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch Pinnacle MLB odds: {error}",
        ) from error

    return {
        "configured": snapshot.get("configured", True),
        "generated_at": snapshot.get("generated_at", format_now()),
        "sport": {
            "key": "baseball_mlb",
            "title": "MLB",
            "short_title": "MLB",
        },
        "provider": "pinnacle_mlb_scraper",
        "requested_source": normalized_source,
        "resolved_source": snapshot.get("resolved_source"),
        "game_count": snapshot.get("game_count", 0),
        "games": snapshot.get("games", []),
        "cache": snapshot.get("cache"),
        "diagnostics": snapshot.get("diagnostics"),
        "message": snapshot.get("message"),
    }


@app.get("/api/props/board")
def props_board(
    sport_key: str | None = None,
    max_events: int | None = None,
) -> dict[str, Any]:
    api_key = get_api_key()
    bookmakers = get_bookmakers()
    regions = get_regions()
    requested_max_events = max_events or get_props_event_limit()

    if not api_key:
        return {
            "configured": False,
            "generated_at": format_now(),
            "regions": regions,
            "bookmakers": bookmakers,
            "markets": get_props_markets(),
            "event_limit": requested_max_events,
            "message": "Set ODDS_API_KEY on the backend service to load live props.",
            "prop_count": 0,
            "sports": [],
        }

    sports = [
        sport
        for sport in SPORTS
        if sport["key"] in BASKETBALL_PROP_SPORT_KEYS
        and (sport_key is None or sport["key"] == sport_key)
    ]

    if not sports:
        raise HTTPException(status_code=404, detail="Props are only supported for NBA and NCAAB.")

    cache_key = f"{sport_key or 'all'}:{requested_max_events}:{bookmakers}:{regions}:{get_props_markets()}"
    cached = PROPS_BOARD_CACHE.get(cache_key)
    now = monotonic()
    if cached and cached[0] > now:
        return cached[1]

    responses: list[dict[str, Any]] = []
    errors: list[str] = []

    with ThreadPoolExecutor(max_workers=len(sports)) as executor:
        future_to_sport = {
            executor.submit(fetch_sport_prop_board, sport, api_key, requested_max_events): sport
            for sport in sports
        }

        for future, sport in future_to_sport.items():
            try:
                response = future.result()
                responses.append(response)
                errors.extend(response.get("errors", []))
            except Exception as error:
                errors.append(str(error))
                responses.append(
                    {
                        "key": sport["key"],
                        "title": sport["title"],
                        "short_title": sport["short_title"],
                        "event_count": 0,
                        "game_count": 0,
                        "prop_count": 0,
                        "event_limit": requested_max_events,
                        "events_scanned": 0,
                        "partial": False,
                        "games": [],
                        "props": [],
                        "errors": [str(error)],
                    }
                )

    responses.sort(key=lambda item: SPORT_ORDER.get(item["key"], 999))

    response = {
        "configured": True,
        "generated_at": format_now(),
        "regions": regions,
        "bookmakers": bookmakers,
        "markets": get_props_markets(),
        "event_limit": requested_max_events,
        "sport_count": len(responses),
        "game_count": sum(item["game_count"] for item in responses),
        "prop_count": sum(item["prop_count"] for item in responses),
        "partial": any(item.get("partial") for item in responses),
        "resolution_note": (
            "Player-to-team mapping is resolved from ESPN rosters when SharkEdge can map both teams cleanly."
        ),
        "quota_note": (
            "The props explorer is intentionally limited to a small set of upcoming games per league to protect API credits. Open a specific game for deeper prop coverage."
        ),
        "errors": errors,
        "sports": responses,
    }
    PROPS_BOARD_CACHE[cache_key] = (now + get_props_cache_seconds(), response)
    return response


@app.get("/api/games/{sport_key}/{event_id}")
def game_detail(sport_key: str, event_id: str) -> dict[str, Any]:
    api_key = get_api_key()
    sport = find_sport(sport_key)

    if not api_key:
        fallback_detail = build_espn_only_game_detail(
            sport_key,
            event_id,
            "Set ODDS_API_KEY on the backend service to restore current odds and props. ESPN-backed matchup detail is still available.",
        )
        if fallback_detail:
            return {
                "configured": False,
                "generated_at": format_now(),
                "sport": {
                    "key": sport["key"],
                    "title": sport["title"],
                    "short_title": sport["short_title"],
                },
                **fallback_detail,
            }

        return {
            "configured": False,
            "generated_at": format_now(),
            "message": "Set ODDS_API_KEY on the backend service to load game details.",
        }

    odds_error: str | None = None
    try:
        provider, _ = resolve_board_provider(api_key)
        if not provider:
            raise RuntimeError(
                "Current odds board requires ODDS_API_KEY. OddsHarvester is reserved for historical ingestion and is not used in the live board request path."
            )
        sport_odds = fetch_sport_odds(sport, api_key, provider)
        score_games = fetch_sport_scores(sport_key, api_key)
    except RuntimeError as error:
        odds_error = str(error)
        fallback_detail = build_espn_only_game_detail(sport_key, event_id, odds_error)
        if fallback_detail:
            return {
                "configured": True,
                "generated_at": format_now(),
                "sport": {
                    "key": sport["key"],
                    "title": sport["title"],
                    "short_title": sport["short_title"],
                },
                **fallback_detail,
            }
        raise HTTPException(status_code=502, detail=str(error)) from error

    game = next((item for item in sport_odds["games"] if item["id"] == event_id), None)
    if not game:
        fallback_detail = build_espn_only_game_detail(
            sport_key,
            event_id,
            odds_error
            or "Current odds event lookup missed this matchup, so SharkEdge fell back to ESPN-backed matchup detail.",
        )
        if fallback_detail:
            return {
                "configured": True,
                "generated_at": format_now(),
                "sport": {
                    "key": sport["key"],
                    "title": sport["title"],
                    "short_title": sport["short_title"],
                },
                **fallback_detail,
            }
        raise HTTPException(status_code=404, detail="Game not found.")

    props_error: str | None = None
    try:
        game_props = enrich_props_with_ev(fetch_game_props(sport_key, event_id, api_key))
    except RuntimeError as error:
        props_error = str(error)
        game_props = []

    try:
        detail = build_game_detail(
            sport_key,
            game,
            score_games,
            game_props,
            current_odds_available=True,
            props_error=props_error,
        )
    except Exception as error:
        fallback_detail = build_espn_only_game_detail(
            sport_key,
            event_id,
            f"Current odds detail degraded after a backend parsing failure: {error}",
        )
        if fallback_detail:
            return {
                "configured": True,
                "generated_at": format_now(),
                "sport": {
                    "key": sport["key"],
                    "title": sport["title"],
                    "short_title": sport["short_title"],
                },
                **fallback_detail,
            }
        raise HTTPException(status_code=502, detail=f"Failed to build game detail: {error}") from error

    return {
        "configured": True,
        "generated_at": format_now(),
        "sport": {
            "key": sport["key"],
            "title": sport["title"],
            "short_title": sport["short_title"],
        },
        **detail,
    }
