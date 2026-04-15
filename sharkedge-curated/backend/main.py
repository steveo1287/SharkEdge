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
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
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
SCRAPER_AUTO_REFRESH_SECONDS = int(os.getenv("SCRAPER_AUTO_REFRESH_SECONDS", "180"))
SCRAPER_AUTO_REFRESH_SOURCE = os.getenv("SCRAPER_AUTO_REFRESH_SOURCE", "auto").strip().lower() or "auto"

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
BOOK_FEED_PROVIDER_LABELS = {
    "draftkings": "DraftKings",
    "fanduel": "FanDuel",
}
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
BOARD_SNAPSHOT_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
BOOK_FEED_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
LAST_SCRAPER_REFRESH_ATTEMPT_AT = 0.0


def get_api_key() -> str:
    return os.getenv("ODDS_API_KEY", "").strip()


def get_book_feed_cache_seconds() -> int:
    raw_value = os.getenv("BOOK_FEED_CACHE_SECONDS", "90").strip()
    try:
        return max(30, min(300, int(raw_value)))
    except ValueError:
        return 90


def get_book_feed_max_age_seconds() -> int:
    raw_value = os.getenv("BOOK_FEED_MAX_AGE_SECONDS", "180").strip()
    try:
        return max(60, min(900, int(raw_value)))
    except ValueError:
        return 180


def get_book_feed_timeout_seconds() -> int:
    raw_value = os.getenv("BOOK_FEED_TIMEOUT_SECONDS", "20").strip()
    try:
        return max(5, min(60, int(raw_value)))
    except ValueError:
        return 20


def get_book_feed_source_url(provider: str) -> str:
    env_key = f"BOOK_FEED_{provider.upper()}_SOURCE_URL"
    return os.getenv(env_key, "").strip()


def get_book_feed_providers() -> list[str]:
    return [provider for provider in ("draftkings", "fanduel") if get_book_feed_source_url(provider)]


def has_internal_book_feed_fallback(api_key: str, scraper_cache_sports: list[dict[str, Any]] | None = None) -> bool:
    cached_sports = scraper_cache_sports if scraper_cache_sports is not None else get_scraper_cache_sports()
    cache_game_count = sum(int(sport.get("game_count", 0) or 0) for sport in cached_sports)
    return cache_game_count > 0 or is_oddsharvester_available() or bool(api_key)


def get_board_provider_mode() -> str:
    configured = os.getenv("ODDS_BOARD_PROVIDER", "auto").strip().lower()
    if configured in {"auto", "book_feeds", "odds_api", "scraper_cache", "oddsharvester"}:
        return configured
    return "auto"


def get_board_fallback_providers() -> list[str]:
    raw_value = os.getenv("ODDS_BOARD_FALLBACKS", "scraper_cache,oddsharvester").strip()
    if not raw_value:
        return []

    fallbacks: list[str] = []
    for token in raw_value.split(","):
        normalized = token.strip().lower()
        if normalized in {"book_feeds", "scraper_cache", "oddsharvester", "odds_api"} and normalized not in fallbacks:
            fallbacks.append(normalized)
    return fallbacks


def get_board_cache_seconds() -> int:
    raw_value = os.getenv("ODDS_BOARD_CACHE_SECONDS", "75").strip()
    try:
        return max(15, min(300, int(raw_value)))
    except ValueError:
        return 75


def get_odds_api_primary_sport_keys() -> set[str]:
    raw_value = os.getenv("ODDS_API_PRIMARY_SPORT_KEYS", "baseball_mlb").strip()
    if not raw_value:
        return {"baseball_mlb"}

    keys = {
        token.strip()
        for token in raw_value.split(",")
        if token.strip() in SPORT_ORDER
    }
    return keys or {"baseball_mlb"}


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


def normalize_sport_lookup(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def find_sport_by_alias(sport_key_or_alias: str) -> dict[str, str]:
    normalized_input = normalize_sport_lookup(sport_key_or_alias)
    for sport in SPORTS:
        if normalize_sport_lookup(sport["key"]) == normalized_input:
            return sport
        if normalize_sport_lookup(sport["short_title"]) == normalized_input:
            return sport
        if normalize_sport_lookup(sport["title"]) == normalized_input:
            return sport
    raise HTTPException(status_code=404, detail="Sport not supported.")


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


def get_scraper_auto_refresh_seconds() -> int:
    return max(30, SCRAPER_AUTO_REFRESH_SECONDS)


def normalize_scraper_refresh_source(source: str | None) -> str:
    normalized = (source or "auto").strip().lower()
    if normalized in {"auto", "actionnetwork", "pinnacle_direct"}:
        return normalized
    return "auto"


def build_scraper_event_from_pinnacle_game(game: dict[str, Any], source: str) -> dict[str, Any] | None:
    home_team = game.get("home_team")
    away_team = game.get("away_team")
    if not isinstance(home_team, str) or not isinstance(away_team, str):
        return None

    event_key = str(game.get("game_id") or "").strip() or slugify_key(f"{away_team}-{home_team}", "pinnacle_mlb")
    moneyline = game.get("moneyline") if isinstance(game.get("moneyline"), dict) else {}
    spread = game.get("spread") if isinstance(game.get("spread"), dict) else {}
    total = game.get("total") if isinstance(game.get("total"), dict) else {}

    return {
        "eventKey": f"pinnacle_mlb:{event_key}",
        "sportKey": "baseball_mlb",
        "sport": "baseball",
        "homeTeam": home_team,
        "awayTeam": away_team,
        "commenceTime": game.get("commence_time"),
        "scrapedAt": format_now(),
        "source": "pinnacle_mlb_scraper",
        "sourceMeta": {
            "league": "MLB",
            "origin": "pinnacle_mlb_scraper",
            "requested_source": source,
            "resolved_source": game.get("source"),
        },
        "homeMoneyline": moneyline.get("home"),
        "awayMoneyline": moneyline.get("away"),
        "homeSpread": spread.get("home"),
        "awaySpread": spread.get("away"),
        "homeSpreadOdds": spread.get("home_odds"),
        "awaySpreadOdds": spread.get("away_odds"),
        "total": total.get("line"),
        "overOdds": total.get("over"),
        "underOdds": total.get("under"),
        "lines": [
            {
                "book": "Pinnacle",
                "homeMoneyline": moneyline.get("home"),
                "awayMoneyline": moneyline.get("away"),
                "homeSpread": spread.get("home"),
                "awaySpread": spread.get("away"),
                "homeSpreadOdds": spread.get("home_odds"),
                "awaySpreadOdds": spread.get("away_odds"),
                "total": total.get("line"),
                "overOdds": total.get("over"),
                "underOdds": total.get("under"),
                "fetchedAt": format_now(),
            }
        ],
    }


def merge_scraper_events(
    sport_key: str,
    events: list[dict[str, Any]],
    *,
    source_origin: str | None = None,
) -> dict[str, Any]:
    cache = load_scraper_cache()
    sports_cache = cache.setdefault("sports", {})
    existing_events = sports_cache.setdefault(sport_key, [])
    retained_events: list[dict[str, Any]] = []
    removed_count = 0

    for existing in existing_events:
        if not isinstance(existing, dict):
            continue

        existing_source = existing.get("sourceMeta", {})
        existing_origin = (
            existing_source.get("origin")
            if isinstance(existing_source, dict)
            else None
        )
        if source_origin and existing_origin == source_origin:
            removed_count += 1
            continue
        retained_events.append(existing)

    merged = retained_events + [event for event in events if isinstance(event, dict)]
    merged.sort(key=lambda item: item.get("commenceTime") or "")
    sports_cache[sport_key] = merged
    cache["updated_at"] = format_now()
    save_scraper_cache(cache)

    return {
        "sport_key": sport_key,
        "inserted_events": len(events),
        "removed_events": removed_count,
        "total_events": len(merged),
        "updated_at": cache["updated_at"],
    }


def refresh_scraper_cache_from_pinnacle(
    source: str | None = None,
    *,
    force: bool = False,
) -> dict[str, Any]:
    global LAST_SCRAPER_REFRESH_ATTEMPT_AT

    normalized_source = normalize_scraper_refresh_source(source or SCRAPER_AUTO_REFRESH_SOURCE)
    now = monotonic()
    cooldown_seconds = get_scraper_auto_refresh_seconds()

    if not force and LAST_SCRAPER_REFRESH_ATTEMPT_AT and (now - LAST_SCRAPER_REFRESH_ATTEMPT_AT) < cooldown_seconds:
        return {
            "refreshed": False,
            "skipped": True,
            "reason": "cooldown_active",
            "cooldown_seconds": cooldown_seconds,
            "source": normalized_source,
        }

    LAST_SCRAPER_REFRESH_ATTEMPT_AT = now
    snapshot = get_pinnacle_mlb_snapshot(source=normalized_source)
    games = snapshot.get("games", [])
    if not isinstance(games, list) or not games:
        return {
            "refreshed": False,
            "skipped": True,
            "reason": "no_games_returned",
            "source": normalized_source,
            "snapshot": {
                "resolved_source": snapshot.get("resolved_source"),
                "game_count": snapshot.get("game_count", 0),
                "diagnostics": snapshot.get("diagnostics", {}),
                "message": snapshot.get("message"),
            },
        }

    events = [
        event
        for event in (
            build_scraper_event_from_pinnacle_game(game, normalized_source)
            for game in games
            if isinstance(game, dict)
        )
        if event
    ]

    merge_result = merge_scraper_events(
        "baseball_mlb",
        events,
        source_origin="pinnacle_mlb_scraper",
    )

    return {
        "refreshed": True,
        "skipped": False,
        "source": normalized_source,
        "snapshot": {
            "resolved_source": snapshot.get("resolved_source"),
            "game_count": snapshot.get("game_count", 0),
            "diagnostics": snapshot.get("diagnostics", {}),
            "cache": snapshot.get("cache"),
        },
        "merge": merge_result,
    }


def should_refresh_scraper_cache(
    selected_sports: list[dict[str, str]],
    scraper_cache_sports: list[dict[str, Any]],
) -> bool:
    selected_keys = {
        sport.get("key")
        for sport in selected_sports
        if isinstance(sport, dict) and isinstance(sport.get("key"), str)
    }
    if "baseball_mlb" not in selected_keys:
        return False

    if not scraper_cache_sports:
        return True

    mlb_cache = next(
        (
            sport
            for sport in scraper_cache_sports
            if isinstance(sport, dict) and sport.get("key") == "baseball_mlb"
        ),
        None,
    )
    if not mlb_cache:
        return True

    return int(mlb_cache.get("game_count") or 0) <= 0


def resolve_scraper_sport_key(sport: str | None, league: str | None) -> str | None:
    sport_token = normalize_scraper_token(sport)
    league_token = normalize_scraper_token(league)
    return SCRAPER_SPORT_KEY_MAP.get((sport_token, league_token))


def get_scraper_primary_line(event: dict[str, Any]) -> dict[str, Any]:
    lines = event.get("lines")
    if isinstance(lines, list):
        for line in lines:
            if isinstance(line, dict):
                return line
    return {}


def get_scraper_line_odds(event: dict[str, Any]) -> dict[str, Any]:
    primary_line = get_scraper_primary_line(event)
    odds = primary_line.get("odds")
    return odds if isinstance(odds, dict) else primary_line


def resolve_scraper_event_value(event: dict[str, Any], key: str) -> Any:
    if key in event:
        return event.get(key)
    return get_scraper_line_odds(event).get(key)


def build_scraper_bookmaker(
    event: dict[str, Any], away_team: str, home_team: str
) -> dict[str, Any]:
    title = (
        event.get("book")
        or get_scraper_primary_line(event).get("book")
        or event.get("sourceMeta", {}).get("moneylineHomeBook")
        or "Flashscore Best"
    )
    key = slugify_key(str(title), "flashscore")
    home_spread = resolve_scraper_event_value(event, "homeSpread")
    away_spread = -home_spread if isinstance(home_spread, (int, float)) else None
    total = resolve_scraper_event_value(event, "total")

    return {
        "key": key,
        "title": title,
        "last_update": get_scraper_primary_line(event).get("fetchedAt") or event.get("scrapedAt"),
        "markets": {
            "moneyline": [
                {
                    "name": away_team,
                    "price": resolve_scraper_event_value(event, "awayMoneyline"),
                    "point": None,
                },
                {
                    "name": home_team,
                    "price": resolve_scraper_event_value(event, "homeMoneyline"),
                    "point": None,
                },
            ],
            "spread": [
                {
                    "name": away_team,
                    "price": resolve_scraper_event_value(event, "awaySpreadOdds"),
                    "point": away_spread,
                },
                {
                    "name": home_team,
                    "price": resolve_scraper_event_value(event, "homeSpreadOdds"),
                    "point": home_spread,
                },
            ],
            "total": [
                {
                    "name": "Over",
                    "price": resolve_scraper_event_value(event, "overOdds"),
                    "point": total,
                },
                {
                    "name": "Under",
                    "price": resolve_scraper_event_value(event, "underOdds"),
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


def request_json_url(url: str, title: str) -> Any:
    request = Request(
        url,
        headers={"User-Agent": "SharkEdge/1.0", "Accept": "application/json"},
    )

    try:
        with urlopen(request, timeout=get_book_feed_timeout_seconds()) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(
            f"{title} request failed with {error.code}: {body}"
        ) from error
    except URLError as error:
        raise RuntimeError(f"{title} request failed: {error.reason}") from error


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


def normalize_feed_market_type(value: Any) -> str | None:
    normalized = re.sub(r"[^a-z0-9]+", "_", str(value or "").lower()).strip("_")
    if normalized in {"moneyline", "ml", "h2h", "home_away", "match_winner"}:
        return "moneyline"
    if normalized in {"spread", "spreads", "run_line", "runline", "handicap", "asian_handicap"}:
        return "spread"
    if normalized in {"total", "totals", "game_total", "over_under", "overunder"}:
        return "total"
    return None


def normalize_feed_period(value: Any) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", str(value or "full_game").lower()).strip("_")
    if normalized in {"", "0", "game", "full_game", "fullgame"}:
        return "full_game"
    if normalized in {"first_5", "first5", "f5", "first_five", "first_five_innings", "first_5_innings", "1"}:
        return "first_5"
    return normalized or "full_game"


def normalize_book_feed_token(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def resolve_feed_sport_from_values(*values: Any) -> dict[str, str] | None:
    aliases = [normalize_sport_lookup(str(value)) for value in values if value]
    for alias in aliases:
        for sport in SPORTS:
            if alias in {
                normalize_sport_lookup(sport["key"]),
                normalize_sport_lookup(sport["short_title"]),
                normalize_sport_lookup(sport["title"]),
            }:
                return sport
    return None


def resolve_feed_line_label(raw_line: dict[str, Any], provider: str) -> tuple[str, str]:
    title = str(
        raw_line.get("book")
        or raw_line.get("title")
        or raw_line.get("name")
        or BOOK_FEED_PROVIDER_LABELS.get(provider, provider.title())
    )
    key = slugify_key(str(raw_line.get("key") or raw_line.get("sportsbookKey") or title), provider)
    return key, title


def iter_book_feed_lines(raw_event: dict[str, Any], provider: str) -> list[dict[str, Any]]:
    candidate = raw_event.get("lines") or raw_event.get("books") or raw_event.get("bookmakers")
    lines: list[dict[str, Any]] = []

    if isinstance(candidate, list):
        lines.extend(item for item in candidate if isinstance(item, dict))
    elif isinstance(candidate, dict):
        for key, value in candidate.items():
            if isinstance(value, dict):
                lines.append({"key": key, **value})
    elif isinstance(raw_event.get("markets"), list):
        lines.append(
            {
                "key": provider,
                "book": BOOK_FEED_PROVIDER_LABELS.get(provider, provider.title()),
                "fetchedAt": raw_event.get("fetchedAt") or raw_event.get("updatedAt") or raw_event.get("lastUpdate"),
                "markets": raw_event.get("markets"),
            }
        )

    if not lines:
        return []

    provider_matches = []
    provider_tokens = {provider, provider.replace("_", " ")}
    provider_label_tokens = {
        normalize_book_feed_token(provider),
        normalize_book_feed_token(BOOK_FEED_PROVIDER_LABELS.get(provider, provider.title())),
    }
    for raw_line in lines:
        line_text = normalize_book_feed_token(
            raw_line.get("key")
            or raw_line.get("sportsbookKey")
            or raw_line.get("book")
            or raw_line.get("title")
            or raw_line.get("name")
        )
        if line_text in provider_label_tokens or any(token in line_text for token in provider_tokens):
            provider_matches.append(raw_line)

    return provider_matches or lines


def iter_book_feed_markets(raw_line: dict[str, Any]) -> list[dict[str, Any]]:
    candidate = raw_line.get("markets") or raw_line.get("odds") or raw_line.get("prices")
    markets: list[dict[str, Any]] = []

    if isinstance(candidate, list):
        markets.extend(item for item in candidate if isinstance(item, dict))
    elif isinstance(candidate, dict):
        for key, value in candidate.items():
            if isinstance(value, dict):
                markets.append({"key": key, **value})
            elif isinstance(value, list):
                markets.append({"key": key, "outcomes": value})

    return markets


def infer_feed_outcome_name(selection: str | None, side: str | None, home_team: str, away_team: str) -> str | None:
    normalized_selection = normalize_book_feed_token(selection)
    normalized_side = normalize_book_feed_token(side)
    normalized_home = normalize_book_feed_token(home_team)
    normalized_away = normalize_book_feed_token(away_team)

    if normalized_side in {"home", normalized_home} or normalized_selection in {"home", normalized_home}:
        return home_team
    if normalized_side in {"away", normalized_away} or normalized_selection in {"away", normalized_away}:
        return away_team
    if normalized_side in {"over", "o"} or normalized_selection in {"over", "o"}:
        return "Over"
    if normalized_side in {"under", "u"} or normalized_selection in {"under", "u"}:
        return "Under"
    return selection or side


def normalize_book_feed_bookmaker(
    raw_line: dict[str, Any],
    provider: str,
    home_team: str,
    away_team: str,
) -> dict[str, Any] | None:
    key, title = resolve_feed_line_label(raw_line, provider)
    normalized_markets = {
        "moneyline": [],
        "spread": [],
        "total": [],
    }

    for raw_market in iter_book_feed_markets(raw_line):
        market_type = normalize_feed_market_type(
            raw_market.get("marketType")
            or raw_market.get("type")
            or raw_market.get("key")
            or raw_market.get("name")
            or raw_market.get("label")
        )
        if market_type not in {"moneyline", "spread", "total"}:
            continue

        period = normalize_feed_period(raw_market.get("period") or raw_market.get("periodId") or raw_market.get("segment"))
        if period != "full_game":
            continue

        outcomes = raw_market.get("outcomes") or raw_market.get("selections") or raw_market.get("rows") or []
        if not isinstance(outcomes, list):
            continue

        for raw_outcome in outcomes:
            if not isinstance(raw_outcome, dict):
                continue

            name = infer_feed_outcome_name(
                str(raw_outcome.get("selection") or raw_outcome.get("name") or raw_outcome.get("label") or raw_outcome.get("outcome") or "") or None,
                str(raw_outcome.get("side") or raw_market.get("side") or "") or None,
                home_team,
                away_team,
            )
            if not name:
                continue

            price = normalize_price_value(
                raw_outcome.get("oddsAmerican")
                or raw_outcome.get("price")
                or raw_outcome.get("odds")
                or raw_outcome.get("americanOdds")
            )
            if price is None:
                continue

            point = parse_numeric(raw_outcome.get("line") or raw_outcome.get("point") or raw_market.get("line") or raw_market.get("point"))
            normalized_markets[market_type].append(
                {
                    "name": name,
                    "price": price,
                    "point": point,
                }
            )

    if not any(normalized_markets.values()):
        return None

    return {
        "key": key,
        "title": title,
        "last_update": raw_line.get("fetchedAt")
        or raw_line.get("lastUpdate")
        or raw_line.get("updatedAt")
        or raw_line.get("last_update"),
        "markets": normalized_markets,
    }


def build_book_feed_event_key(sport: dict[str, str], away_team: str, home_team: str, commence_time: str) -> str:
    timestamp = str(commence_time or "na")[:16]
    return ":".join(
        [
            "bookfeed",
            sport["short_title"].lower(),
            timestamp,
            slugify_key(away_team, "away"),
            slugify_key(home_team, "home"),
        ]
    )


def normalize_book_feed_event(raw_event: dict[str, Any], provider: str) -> dict[str, Any] | None:
    home_team = (
        raw_event.get("homeTeam")
        or raw_event.get("home_team")
        or raw_event.get("home")
    )
    away_team = (
        raw_event.get("awayTeam")
        or raw_event.get("away_team")
        or raw_event.get("away")
    )
    if not isinstance(home_team, str) or not home_team.strip() or not isinstance(away_team, str) or not away_team.strip():
        return None

    sport = resolve_feed_sport_from_values(
        raw_event.get("sportKey"),
        raw_event.get("sport"),
        raw_event.get("league"),
        raw_event.get("leagueKey"),
    )
    if not sport:
        return None

    commence_time = (
        raw_event.get("commenceTime")
        or raw_event.get("commence_time")
        or raw_event.get("startTime")
        or raw_event.get("start_time")
        or raw_event.get("scheduledAt")
    )
    if not isinstance(commence_time, str) or not commence_time.strip():
        return None

    bookmakers = [
        bookmaker
        for bookmaker in (
            normalize_book_feed_bookmaker(raw_line, provider, home_team.strip(), away_team.strip())
            for raw_line in iter_book_feed_lines(raw_event, provider)
        )
        if bookmaker
    ]
    if not bookmakers:
        return None

    bookmakers = sort_bookmakers(bookmakers)
    event_id = str(
        raw_event.get("id")
        or raw_event.get("eventKey")
        or raw_event.get("event_id")
        or build_book_feed_event_key(sport, away_team.strip(), home_team.strip(), commence_time)
    )

    return {
        "id": event_id,
        "commence_time": commence_time.strip(),
        "home_team": home_team.strip(),
        "away_team": away_team.strip(),
        "bookmakers_available": len(bookmakers),
        "bookmakers": bookmakers,
        "market_stats": {
            "moneyline": summarize_market(bookmakers, "moneyline", [away_team.strip(), home_team.strip()]),
            "spread": summarize_market(bookmakers, "spread", [away_team.strip(), home_team.strip()]),
            "total": summarize_market(bookmakers, "total", ["Over", "Under"]),
        },
        "sport_key": sport["key"],
        "sport_title": sport["title"],
        "sport_short_title": sport["short_title"],
    }


def build_book_feed_endpoint_event(raw_event: dict[str, Any], provider: str) -> dict[str, Any] | None:
    normalized = normalize_book_feed_event(raw_event, provider)
    if not normalized:
        return None

    lines = []
    for bookmaker in normalized["bookmakers"]:
        line_markets = []
        for market_type in ("moneyline", "spread", "total"):
            outcomes = bookmaker.get("markets", {}).get(market_type, [])
            if not outcomes:
                continue
            line_markets.append(
                {
                    "marketType": market_type,
                    "period": "full_game",
                    "outcomes": [
                        {
                            "selection": outcome.get("name"),
                            "side": "home" if outcome.get("name") == normalized["home_team"] else "away" if outcome.get("name") == normalized["away_team"] else "over" if outcome.get("name") == "Over" else "under" if outcome.get("name") == "Under" else outcome.get("name"),
                            "line": outcome.get("point"),
                            "oddsAmerican": outcome.get("price"),
                        }
                        for outcome in outcomes
                    ],
                }
            )
        lines.append(
            {
                "book": bookmaker.get("title"),
                "key": bookmaker.get("key"),
                "fetchedAt": bookmaker.get("last_update") or format_now(),
                "markets": line_markets,
            }
        )

    return {
        "id": normalized["id"],
        "eventKey": normalized["id"],
        "league": normalized["sport_short_title"],
        "sport": normalized["sport_short_title"],
        "sportKey": normalized["sport_key"],
        "homeTeam": normalized["home_team"],
        "awayTeam": normalized["away_team"],
        "commenceTime": normalized["commence_time"],
        "lines": lines,
    }


def merge_book_feed_games(games: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[tuple[str, str, str], dict[str, Any]] = {}

    for game in games:
        key = (
            normalize_match_key(game.get("away_team")),
            normalize_match_key(game.get("home_team")),
            str(game.get("commence_time") or "")[:16],
        )
        existing = merged.get(key)
        if not existing:
            merged[key] = dict(game)
            merged[key]["bookmakers"] = list(game.get("bookmakers", []))
            merged[key]["bookmakers_available"] = len(merged[key]["bookmakers"])
            continue

        by_book = {
            bookmaker.get("key"): bookmaker
            for bookmaker in existing.get("bookmakers", [])
            if isinstance(bookmaker, dict)
        }
        for bookmaker in game.get("bookmakers", []):
            if not isinstance(bookmaker, dict):
                continue
            by_book[str(bookmaker.get("key") or bookmaker.get("title") or len(by_book))] = bookmaker
        merged_bookmakers = sort_bookmakers(list(by_book.values()))
        existing["bookmakers"] = merged_bookmakers
        existing["bookmakers_available"] = len(merged_bookmakers)
        existing["market_stats"] = {
            "moneyline": summarize_market(merged_bookmakers, "moneyline", [existing["away_team"], existing["home_team"]]),
            "spread": summarize_market(merged_bookmakers, "spread", [existing["away_team"], existing["home_team"]]),
            "total": summarize_market(merged_bookmakers, "total", ["Over", "Under"]),
        }

    return sorted(merged.values(), key=lambda game: game.get("commence_time") or "")


def normalize_book_feed_provider_match(value: Any) -> str:
    return normalize_book_feed_token(str(value or "")).replace("_", " ")


def filter_bookmakers_for_requested_provider(bookmakers: list[dict[str, Any]], provider: str) -> list[dict[str, Any]]:
    if not bookmakers:
        return []

    provider_tokens = {
        normalize_book_feed_provider_match(provider),
        normalize_book_feed_provider_match(BOOK_FEED_PROVIDER_LABELS.get(provider, provider.title())),
    }
    filtered = []
    for bookmaker in bookmakers:
        candidate = normalize_book_feed_provider_match(
            bookmaker.get("key") or bookmaker.get("title") or bookmaker.get("book")
        )
        if candidate in provider_tokens:
            filtered.append(bookmaker)
    return filtered or bookmakers


def build_book_feed_payload_from_snapshot(
    provider: str,
    selected_sports: list[dict[str, str]],
    snapshot: dict[str, Any],
    *,
    source_provider: str,
    reason: str | None = None,
) -> dict[str, Any]:
    selected_keys = {sport["key"] for sport in selected_sports}
    generated_at = snapshot.get("generated_at") or format_now()
    errors = [error for error in snapshot.get("errors", []) if isinstance(error, str)]
    warnings: list[str] = []
    if reason:
        warnings.append(reason)

    events: list[dict[str, Any]] = []
    for sport in snapshot.get("sports", []):
        if not isinstance(sport, dict) or sport.get("key") not in selected_keys:
            continue
        for game in sport.get("games", []):
            if not isinstance(game, dict):
                continue
            home_team = game.get("home_team")
            away_team = game.get("away_team")
            commence_time = game.get("commence_time")
            if not isinstance(home_team, str) or not isinstance(away_team, str) or not isinstance(commence_time, str):
                continue

            bookmakers = [
                bookmaker
                for bookmaker in filter_bookmakers_for_requested_provider(
                    [item for item in game.get("bookmakers", []) if isinstance(item, dict)],
                    provider,
                )
                if isinstance(bookmaker, dict)
            ]
            if not bookmakers:
                continue

            lines = []
            for bookmaker in bookmakers:
                markets = []
                for market_type in ("moneyline", "spread", "total"):
                    outcomes = []
                    for outcome in bookmaker.get("markets", {}).get(market_type, []):
                        if not isinstance(outcome, dict):
                            continue
                        name = outcome.get("name")
                        if not isinstance(name, str) or not name.strip():
                            continue
                        if name == home_team:
                            side = "home"
                        elif name == away_team:
                            side = "away"
                        elif normalize_book_feed_token(name) == "over":
                            side = "over"
                        elif normalize_book_feed_token(name) == "under":
                            side = "under"
                        else:
                            side = name
                        outcomes.append(
                            {
                                "selection": name,
                                "side": side,
                                "line": outcome.get("point"),
                                "oddsAmerican": outcome.get("price"),
                            }
                        )
                    if outcomes:
                        markets.append(
                            {
                                "marketType": market_type,
                                "period": "full_game",
                                "outcomes": outcomes,
                            }
                        )
                if not markets:
                    continue
                lines.append(
                    {
                        "book": bookmaker.get("title") or bookmaker.get("book") or BOOK_FEED_PROVIDER_LABELS.get(provider, provider.title()),
                        "key": bookmaker.get("key") or slugify_key(str(bookmaker.get("title") or provider), provider),
                        "fetchedAt": bookmaker.get("last_update") or generated_at,
                        "markets": markets,
                    }
                )

            if not lines:
                continue

            event_id = str(game.get("id") or build_book_feed_event_key(
                next((candidate for candidate in selected_sports if candidate["key"] == sport.get("key")), selected_sports[0]),
                away_team,
                home_team,
                commence_time,
            ))
            events.append(
                {
                    "id": event_id,
                    "eventKey": event_id,
                    "league": sport.get("short_title") or sport.get("title"),
                    "sport": sport.get("short_title") or sport.get("title"),
                    "sportKey": sport.get("key"),
                    "homeTeam": home_team,
                    "awayTeam": away_team,
                    "commenceTime": commence_time,
                    "lines": lines,
                }
            )

    payload = {
        "provider": provider,
        "configured": True,
        "generatedAt": generated_at,
        "selectedSports": [sport["key"] for sport in selected_sports],
        "sourceUrl": None,
        "sourceMode": "board_snapshot_fallback",
        "sourceProvider": source_provider,
        "events": events,
        "errors": errors,
    }
    if warnings:
        payload["warnings"] = warnings
    return payload


def resolve_internal_book_feed_fallback(provider: str, selected_sports: list[dict[str, str]], reason: str | None = None) -> dict[str, Any]:
    scraper_cache_sports = get_scraper_cache_sports()
    if should_refresh_scraper_cache(selected_sports, scraper_cache_sports):
        refresh_scraper_cache_from_pinnacle(source=SCRAPER_AUTO_REFRESH_SOURCE, force=False)
        scraper_cache_sports = get_scraper_cache_sports()

    fallback_order = ["scraper_cache", "oddsharvester", "odds_api"]
    api_key = get_api_key()
    status_map = get_available_board_provider_status(api_key, scraper_cache_sports)
    attempted_errors: list[str] = []

    for source_provider in fallback_order:
        status = status_map.get(source_provider, {})
        if not status.get("available"):
            detail = status.get("reason")
            if detail:
                attempted_errors.append(f"{source_provider}: {detail}")
            continue

        snapshot = fetch_board_snapshot_for_provider(
            selected_sports,
            api_key,
            source_provider,
            scraper_cache_sports=scraper_cache_sports,
        )
        if snapshot.get("status") in {"SUCCESS", "PARTIAL"} and int(snapshot.get("game_count", 0) or 0) > 0:
            return build_book_feed_payload_from_snapshot(
                provider,
                selected_sports,
                snapshot,
                source_provider=source_provider,
                reason=reason,
            )

        attempted_errors.extend(
            error for error in snapshot.get("errors", []) if isinstance(error, str)
        )

    payload = {
        "provider": provider,
        "configured": False,
        "generatedAt": format_now(),
        "selectedSports": [sport["key"] for sport in selected_sports],
        "sourceUrl": None,
        "sourceMode": "board_snapshot_fallback",
        "events": [],
        "errors": attempted_errors or [reason or "No live fallback provider returned usable feed events."],
    }
    if reason:
        payload["warnings"] = [reason]
    return payload


def parse_requested_book_feed_sports(
    leagues: str | None = None,
    sport_key: str | None = None,
    league: str | None = None,
) -> list[dict[str, str]]:
    requested = leagues or sport_key or league
    if not requested:
        return [sport for sport in SPORTS if sport["key"] in {"basketball_nba", "baseball_mlb"}]

    tokens = [token.strip() for token in str(requested).split(",") if token.strip()]
    selected: list[dict[str, str]] = []
    for token in tokens:
        try:
            sport = find_sport_by_alias(token)
        except HTTPException:
            continue
        if sport not in selected:
            selected.append(sport)
    return selected or [sport for sport in SPORTS if sport["key"] in {"basketball_nba", "baseball_mlb"}]


def build_book_feed_request_url(provider: str, selected_sports: list[dict[str, str]]) -> str:
    source_url = get_book_feed_source_url(provider)
    if not source_url:
        return ""

    parsed = urlparse(source_url)
    if parsed.scheme == "file":
        return source_url

    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    leagues = ",".join(sport["short_title"] for sport in selected_sports if sport.get("short_title"))
    if leagues:
        query["leagues"] = leagues
    return urlunparse(parsed._replace(query=urlencode(query)))


def build_book_feed_cache_key(provider: str, selected_sports: list[dict[str, str]]) -> str:
    return f"{provider}|{','.join(sorted(sport['key'] for sport in selected_sports))}"


def get_cached_book_feed(provider: str, selected_sports: list[dict[str, str]]) -> dict[str, Any] | None:
    cached = BOOK_FEED_CACHE.get(build_book_feed_cache_key(provider, selected_sports))
    if not cached:
        return None

    expires_at, payload = cached
    if expires_at <= monotonic():
        BOOK_FEED_CACHE.pop(build_book_feed_cache_key(provider, selected_sports), None)
        return None

    cached_payload = dict(payload)
    cached_payload["cache"] = {
        "hit": True,
        "ttl_seconds": get_book_feed_cache_seconds(),
        "max_age_seconds": get_book_feed_max_age_seconds(),
    }
    return cached_payload


def set_cached_book_feed(provider: str, selected_sports: list[dict[str, str]], payload: dict[str, Any]) -> dict[str, Any]:
    ttl_seconds = get_book_feed_cache_seconds()
    stored = dict(payload)
    stored["cache"] = {
        "hit": False,
        "ttl_seconds": ttl_seconds,
        "max_age_seconds": get_book_feed_max_age_seconds(),
    }
    BOOK_FEED_CACHE[build_book_feed_cache_key(provider, selected_sports)] = (monotonic() + ttl_seconds, stored)
    return stored


def resolve_book_feed_payload(provider: str, selected_sports: list[dict[str, str]]) -> dict[str, Any]:
    cached = get_cached_book_feed(provider, selected_sports)
    if cached:
        return cached

    source_url = get_book_feed_source_url(provider)
    if not source_url:
        fallback_payload = resolve_internal_book_feed_fallback(
            provider,
            selected_sports,
            reason=f"BOOK_FEED_{provider.upper()}_SOURCE_URL is not configured. Using the best available backend board provider instead.",
        )
        return set_cached_book_feed(provider, selected_sports, fallback_payload)

    request_url = build_book_feed_request_url(provider, selected_sports)
    try:
        raw_payload = request_json_url(request_url, f"{BOOK_FEED_PROVIDER_LABELS.get(provider, provider.title())} book feed")
    except Exception as error:
        fallback_payload = resolve_internal_book_feed_fallback(
            provider,
            selected_sports,
            reason=f"Direct {BOOK_FEED_PROVIDER_LABELS.get(provider, provider.title())} feed failed. Falling back to backend board data: {error}",
        )
        if fallback_payload.get("events"):
            return set_cached_book_feed(provider, selected_sports, fallback_payload)
        error_payload = dict(fallback_payload)
        error_payload["configured"] = True
        error_payload["sourceUrl"] = request_url
        error_payload["errors"] = [str(error), *[msg for msg in fallback_payload.get("errors", []) if isinstance(msg, str)]]
        return set_cached_book_feed(provider, selected_sports, error_payload)

    events = [
        event
        for event in (
            build_book_feed_endpoint_event(raw_event, provider)
            for raw_event in extract_event_collection(raw_payload)
        )
        if event and event.get("sportKey") in {sport["key"] for sport in selected_sports}
    ]

    generated_at = (
        raw_payload.get("generatedAt") if isinstance(raw_payload, dict) else None
    ) or (
        raw_payload.get("generated_at") if isinstance(raw_payload, dict) else None
    ) or format_now()
    payload = {
        "provider": provider,
        "configured": True,
        "generatedAt": generated_at,
        "selectedSports": [sport["key"] for sport in selected_sports],
        "sourceUrl": request_url,
        "sourceMode": "direct",
        "events": events,
        "errors": [],
    }
    if events:
        return set_cached_book_feed(provider, selected_sports, payload)

    fallback_payload = resolve_internal_book_feed_fallback(
        provider,
        selected_sports,
        reason=f"Direct {BOOK_FEED_PROVIDER_LABELS.get(provider, provider.title())} feed returned no usable pregame ML/spread/total events. Using backend board data instead.",
    )
    if fallback_payload.get("events"):
        fallback_payload["sourceUrl"] = request_url
        return set_cached_book_feed(provider, selected_sports, fallback_payload)

    payload["errors"] = [f"Direct {provider} feed returned no usable events."]
    return set_cached_book_feed(provider, selected_sports, payload)


def fetch_book_feed_board_snapshot(selected_sports: list[dict[str, str]]) -> dict[str, Any]:
    providers = get_book_feed_providers() or ["draftkings"]
    responses = [resolve_book_feed_payload(provider, selected_sports) for provider in providers]
    errors = [error for response in responses for error in response.get("errors", [])]
    games_by_sport: dict[str, list[dict[str, Any]]] = {sport["key"]: [] for sport in selected_sports}
    generated_at_values = []

    for provider, response in zip(providers, responses):
        generated_at = response.get("generatedAt")
        if isinstance(generated_at, str) and generated_at:
            generated_at_values.append(generated_at)

        for raw_event in response.get("events", []):
            if not isinstance(raw_event, dict):
                continue
            normalized = normalize_book_feed_event(raw_event, provider)
            if not normalized:
                continue
            sport_key = normalized.pop("sport_key")
            normalized.pop("sport_title", None)
            normalized.pop("sport_short_title", None)
            games_by_sport.setdefault(sport_key, []).append(normalized)

    sports = []
    total_games = 0
    for sport in selected_sports:
        merged_games = merge_book_feed_games(games_by_sport.get(sport["key"], []))
        total_games += len(merged_games)
        sports.append(
            {
                "key": sport["key"],
                "title": sport["title"],
                "short_title": sport["short_title"],
                "game_count": len(merged_games),
                "games": merged_games,
            }
        )

    status = "SUCCESS" if total_games > 0 else "FAILED"
    if errors and total_games > 0:
        status = "PARTIAL"

    return {
        "provider": "book_feeds",
        "status": status,
        "game_count": total_games,
        "sport_count": len(sports),
        "errors": errors,
        "quota_exhausted": False,
        "sports": sports,
        "bookmakers": "draftkings,fanduel",
        "generated_at": generated_at_values[-1] if generated_at_values else format_now(),
        "provider_meta": {
            provider: {
                "configured": bool(response.get("configured")),
                "sourceUrl": response.get("sourceUrl") or build_book_feed_request_url(provider, selected_sports),
                "sourceMode": response.get("sourceMode"),
                "sourceProvider": response.get("sourceProvider"),
                "cache": response.get("cache"),
                "errors": response.get("errors", []),
                "warnings": response.get("warnings", []),
            }
            for provider, response in zip(providers, responses)
        },
    }


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


def build_empty_sport_payload(sport: dict[str, str], error: str | None = None) -> dict[str, Any]:
    payload = {
        "key": sport["key"],
        "title": sport["title"],
        "short_title": sport["short_title"],
        "game_count": 0,
        "games": [],
    }
    if error:
        payload["error"] = error
    return payload


def is_odds_api_quota_error(detail: str | Exception | None) -> bool:
    text = str(detail or "").upper()
    return "OUT_OF_USAGE_CREDITS" in text or "USAGE QUOTA HAS BEEN REACHED" in text


def get_available_board_provider_status(
    api_key: str,
    scraper_cache_sports: list[dict[str, Any]] | None = None,
) -> dict[str, dict[str, Any]]:
    cached_sports = scraper_cache_sports if scraper_cache_sports is not None else get_scraper_cache_sports()
    cache_game_count = sum(int(sport.get("game_count", 0) or 0) for sport in cached_sports)

    return {
        "book_feeds": {
            "available": bool(get_book_feed_providers()) or has_internal_book_feed_fallback(api_key, cached_sports),
            "reason": None
            if (bool(get_book_feed_providers()) or has_internal_book_feed_fallback(api_key, cached_sports))
            else "Retail book feed source URLs are not configured and no live fallback provider is available.",
            "providers": get_book_feed_providers(),
            "fallback_enabled": has_internal_book_feed_fallback(api_key, cached_sports),
        },
        "odds_api": {
            "available": bool(api_key),
            "reason": None if api_key else "ODDS_API_KEY is not configured.",
        },
        "scraper_cache": {
            "available": cache_game_count > 0,
            "reason": None if cache_game_count > 0 else "Scraper cache has no fresh live games.",
            "game_count": cache_game_count,
        },
        "oddsharvester": {
            "available": is_oddsharvester_available(),
            "reason": None if is_oddsharvester_available() else "OddsHarvester is not available in this runtime.",
        },
    }


def build_board_provider_candidates(
    api_key: str,
    scraper_cache_sports: list[dict[str, Any]] | None = None,
) -> tuple[list[str], str | None, dict[str, dict[str, Any]]]:
    mode = get_board_provider_mode()
    status_map = get_available_board_provider_status(api_key, scraper_cache_sports)

    requested: list[str]
    if mode == "book_feeds":
        requested = ["book_feeds"]
    elif mode == "scraper_cache":
        requested = ["scraper_cache"]
    elif mode == "oddsharvester":
        requested = ["oddsharvester"]
    elif mode == "odds_api":
        requested = ["odds_api"]
    else:
        requested = ["book_feeds", "odds_api", *get_board_fallback_providers()]

    candidates: list[str] = []
    unavailable: list[str] = []
    for provider in requested:
        provider_status = status_map.get(provider, {})
        if provider_status.get("available"):
            if provider not in candidates:
                candidates.append(provider)
        else:
            reason = provider_status.get("reason")
            unavailable.append(f"{provider}: {reason}" if reason else provider)

    if candidates:
        return candidates, None, status_map

    if unavailable:
        return [], " | ".join(unavailable), status_map

    return [], "No live board providers are available in this runtime.", status_map


def fetch_sport_odds(
    sport: dict[str, str],
    api_key: str,
    provider: str,
    scraper_cache_sports: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if provider == "scraper_cache":
        cached_sports = scraper_cache_sports if scraper_cache_sports is not None else get_scraper_cache_sports()
        for cached_sport in cached_sports:
            if cached_sport.get("key") == sport["key"]:
                return cached_sport
        return build_empty_sport_payload(sport)

    if provider == "oddsharvester":
        return fetch_sport_odds_from_oddsharvester(sport)

    return fetch_sport_odds_from_api(sport, api_key)


def fetch_board_snapshot_for_provider(
    selected_sports: list[dict[str, str]],
    api_key: str,
    provider: str,
    scraper_cache_sports: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if provider == "book_feeds":
        return fetch_book_feed_board_snapshot(selected_sports)

    sports: list[dict[str, Any]] = []
    errors: list[str] = []
    quota_exhausted = False

    with ThreadPoolExecutor(max_workers=max(1, len(selected_sports))) as executor:
        future_to_sport = {
            executor.submit(fetch_sport_odds, sport, api_key, provider, scraper_cache_sports): sport
            for sport in selected_sports
        }

        for future, sport in future_to_sport.items():
            try:
                sports.append(future.result())
            except Exception as error:
                detail = str(error)
                errors.append(f"{sport['key']}: {detail}")
                sports.append(build_empty_sport_payload(sport, detail))
                quota_exhausted = quota_exhausted or (provider == "odds_api" and is_odds_api_quota_error(detail))

    sports.sort(key=lambda item: SPORT_ORDER.get(item["key"], 999))
    game_count = sum(int(sport.get("game_count", 0) or 0) for sport in sports)
    sport_count = len(sports)

    if quota_exhausted:
        status = "QUOTA_EXHAUSTED"
    elif errors and game_count == 0:
        status = "FAILED"
    elif errors:
        status = "PARTIAL"
    else:
        status = "SUCCESS"

    return {
        "provider": provider,
        "status": status,
        "sports": sports,
        "errors": errors,
        "game_count": game_count,
        "sport_count": sport_count,
        "quota_exhausted": quota_exhausted,
    }


def merge_snapshot_sports(
    requested_sports: list[dict[str, str]],
    partial_snapshots: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_key: dict[str, dict[str, Any]] = {}
    for snapshot in partial_snapshots:
        for sport in snapshot.get("sports", []):
            if isinstance(sport, dict) and isinstance(sport.get("key"), str):
                by_key[sport["key"]] = sport

    merged: list[dict[str, Any]] = []
    for sport in requested_sports:
        merged.append(by_key.get(sport["key"]) or build_empty_sport_payload(sport))

    merged.sort(key=lambda item: SPORT_ORDER.get(item["key"], 999))
    return merged


def build_board_snapshot_cache_key(
    selected_sports: list[dict[str, str]],
    api_key: str,
) -> str:
    sport_keys = ",".join(sorted(sport["key"] for sport in selected_sports))
    return "|".join(
        [
            f"sports={sport_keys}",
            f"provider_mode={get_board_provider_mode()}",
            f"fallbacks={','.join(get_board_fallback_providers())}",
            f"regions={get_regions()}",
            f"bookmakers={get_bookmakers()}",
            f"markets={ODDS_API_MARKETS}",
            f"odds_api_primary={','.join(sorted(get_odds_api_primary_sport_keys()))}",
            f"api_key={'1' if api_key else '0'}",
            f"book_feeds={','.join(get_book_feed_providers())}",
        ]
    )


def get_cached_board_snapshot(cache_key: str) -> dict[str, Any] | None:
    cached = BOARD_SNAPSHOT_CACHE.get(cache_key)
    if not cached:
        return None

    expires_at, payload = cached
    if expires_at <= monotonic():
        BOARD_SNAPSHOT_CACHE.pop(cache_key, None)
        return None

    cached_payload = dict(payload)
    cached_payload["cache"] = {
        "hit": True,
        "ttl_seconds": get_board_cache_seconds(),
    }
    return cached_payload


def set_cached_board_snapshot(cache_key: str, payload: dict[str, Any]) -> dict[str, Any]:
    ttl_seconds = get_board_cache_seconds()
    stored_payload = dict(payload)
    stored_payload["cache"] = {
        "hit": False,
        "ttl_seconds": ttl_seconds,
    }
    BOARD_SNAPSHOT_CACHE[cache_key] = (monotonic() + ttl_seconds, stored_payload)
    return stored_payload


def resolve_board_snapshot(
    api_key: str,
    selected_sports: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    sports_to_fetch = selected_sports or SPORTS
    cache_key = build_board_snapshot_cache_key(sports_to_fetch, api_key)
    cached_snapshot = get_cached_board_snapshot(cache_key)
    if cached_snapshot:
        return cached_snapshot

    scraper_cache_sports = get_scraper_cache_sports()
    scraper_refresh: dict[str, Any] | None = None
    if should_refresh_scraper_cache(sports_to_fetch, scraper_cache_sports):
        scraper_refresh = refresh_scraper_cache_from_pinnacle(
            source=SCRAPER_AUTO_REFRESH_SOURCE,
            force=False,
        )
        scraper_cache_sports = get_scraper_cache_sports()

    candidates, provider_error, status_map = build_board_provider_candidates(
        api_key,
        scraper_cache_sports,
    )

    attempts: list[dict[str, Any]] = []
    if not candidates:
        return set_cached_board_snapshot(
            cache_key,
            {
            "provider_mode": get_board_provider_mode(),
            "resolved_provider": None,
            "message": provider_error
            or "Current odds board is not configured with a usable live provider.",
            "provider_error": provider_error,
            "provider_trace": attempts,
            "scraper_refresh": scraper_refresh,
            "sports": [build_empty_sport_payload(sport) for sport in sports_to_fetch],
            "errors": [provider_error] if provider_error else [],
            "provider_status": status_map,
            "bookmakers": "draftkings,fanduel" if get_book_feed_providers() else get_bookmakers(),
            "generated_at": format_now(),
            },
        )

    mode = get_board_provider_mode()
    primary_sport_keys = get_odds_api_primary_sport_keys()
    if (
        mode == "auto"
        and candidates
        and candidates[0] == "odds_api"
        and len(sports_to_fetch) > 1
    ):
        primary_sports = [sport for sport in sports_to_fetch if sport["key"] in primary_sport_keys]
        secondary_sports = [sport for sport in sports_to_fetch if sport["key"] not in primary_sport_keys]

        if primary_sports and secondary_sports and len(candidates) > 1:
            mixed_attempts: list[dict[str, Any]] = []
            partial_snapshots: list[dict[str, Any]] = []
            mixed_errors: list[str] = []

            primary_attempt = fetch_board_snapshot_for_provider(
                primary_sports,
                api_key,
                "odds_api",
                scraper_cache_sports=scraper_cache_sports,
            )
            mixed_attempts.append(
                {
                    "provider": "odds_api",
                    "status": primary_attempt["status"],
                    "game_count": primary_attempt["game_count"],
                    "sport_count": primary_attempt["sport_count"],
                    "errors": primary_attempt["errors"],
                    "quota_exhausted": primary_attempt["quota_exhausted"],
                    "scope": [sport["key"] for sport in primary_sports],
                }
            )
            if primary_attempt["status"] in {"SUCCESS", "PARTIAL"}:
                partial_snapshots.append(primary_attempt)
            mixed_errors.extend(primary_attempt["errors"])

            fallback_provider: str | None = None
            for provider in candidates[1:]:
                attempt = fetch_board_snapshot_for_provider(
                    secondary_sports,
                    api_key,
                    provider,
                    scraper_cache_sports=scraper_cache_sports,
                )
                mixed_attempts.append(
                    {
                        "provider": provider,
                        "status": attempt["status"],
                        "game_count": attempt["game_count"],
                        "sport_count": attempt["sport_count"],
                        "errors": attempt["errors"],
                        "quota_exhausted": attempt["quota_exhausted"],
                        "scope": [sport["key"] for sport in secondary_sports],
                    }
                )
                mixed_errors.extend(attempt["errors"])
                if attempt["status"] in {"SUCCESS", "PARTIAL"}:
                    fallback_provider = provider
                    partial_snapshots.append(attempt)
                    break

            attempts.extend(mixed_attempts)
            merged_sports = merge_snapshot_sports(sports_to_fetch, partial_snapshots)
            merged_game_count = sum(int(sport.get("game_count", 0) or 0) for sport in merged_sports)
            fallback_triggered = fallback_provider is not None

            if merged_game_count > 0:
                message = (
                    "Odds API is running in narrow primary scope; fallback provider filled remaining sports."
                    if fallback_triggered
                    else "Odds API is running in narrow primary scope."
                )
                return set_cached_board_snapshot(
                    cache_key,
                    {
                    "provider_mode": mode,
                    "resolved_provider": "mixed" if fallback_triggered else "odds_api",
                    "message": message,
                    "provider_error": provider_error,
                    "provider_trace": attempts,
                    "scraper_refresh": scraper_refresh,
                    "sports": merged_sports,
                    "errors": mixed_errors,
                    "provider_status": status_map,
                    "fallback_triggered": fallback_triggered,
                    "bookmakers": get_bookmakers(),
                    "generated_at": format_now(),
                    },
                )

    winning_snapshot: dict[str, Any] | None = None
    for provider in candidates:
        attempt = fetch_board_snapshot_for_provider(
            sports_to_fetch,
            api_key,
            provider,
            scraper_cache_sports=scraper_cache_sports,
        )
        attempts.append(
            {
                "provider": provider,
                "status": attempt["status"],
                "game_count": attempt["game_count"],
                "sport_count": attempt["sport_count"],
                "errors": attempt["errors"],
                "quota_exhausted": attempt["quota_exhausted"],
            }
        )

        if attempt["status"] in {"SUCCESS", "PARTIAL"}:
            winning_snapshot = attempt
            break

    if winning_snapshot:
        fallback_triggered = winning_snapshot["provider"] != candidates[0]
        message = None
        if fallback_triggered:
            first_attempt = attempts[0]
            reason = (
                "Odds API credits were exhausted."
                if first_attempt.get("quota_exhausted")
                else "Primary provider failed."
            )
            message = f"{reason} Live board fell back to {winning_snapshot['provider']}."
        return set_cached_board_snapshot(
            cache_key,
            {
            "provider_mode": get_board_provider_mode(),
            "resolved_provider": winning_snapshot["provider"],
            "message": message,
            "provider_error": provider_error,
            "provider_trace": attempts,
            "scraper_refresh": scraper_refresh,
            "sports": winning_snapshot["sports"],
            "errors": winning_snapshot["errors"],
            "provider_status": status_map,
            "fallback_triggered": fallback_triggered,
            "bookmakers": winning_snapshot.get("bookmakers") or get_bookmakers(),
            "generated_at": winning_snapshot.get("generated_at") or format_now(),
            "provider_meta": winning_snapshot.get("provider_meta"),
            },
        )

    return set_cached_board_snapshot(
        cache_key,
        {
        "provider_mode": get_board_provider_mode(),
        "resolved_provider": None,
        "message": provider_error
        or "No live board provider returned a usable board payload.",
        "provider_error": provider_error,
        "provider_trace": attempts,
        "scraper_refresh": scraper_refresh,
        "sports": [build_empty_sport_payload(sport) for sport in sports_to_fetch],
        "errors": [error for attempt in attempts for error in attempt["errors"]],
        "provider_status": status_map,
        "bookmakers": "draftkings,fanduel" if get_book_feed_providers() else get_bookmakers(),
        "generated_at": format_now(),
        },
    )


def resolve_board_provider(api_key: str) -> tuple[str | None, str | None]:
    scraper_cache_sports = get_scraper_cache_sports()
    if should_refresh_scraper_cache(SPORTS, scraper_cache_sports):
        refresh_scraper_cache_from_pinnacle(
            source=SCRAPER_AUTO_REFRESH_SOURCE,
            force=False,
        )
        scraper_cache_sports = get_scraper_cache_sports()

    candidates, provider_error, _ = build_board_provider_candidates(
        api_key,
        scraper_cache_sports,
    )
    return (candidates[0], None) if candidates else (None, provider_error)


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
        "scraper_refresh_endpoint": "/api/ingest/odds/refresh",
        "mlb_sharp_reference_debug_endpoint": "/api/debug/mlb/sharp-reference",
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
        "auto_refresh_seconds": get_scraper_auto_refresh_seconds(),
        "auto_refresh_source": normalize_scraper_refresh_source(SCRAPER_AUTO_REFRESH_SOURCE),
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


@app.post("/api/ingest/odds/refresh")
def ingest_odds_refresh(
    source: str = "auto",
    force: bool = False,
    x_api_key: str | None = Header(default=None),
) -> dict[str, Any]:
    if not SCRAPER_INGEST_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="SHARKEDGE_API_KEY is not configured on the backend service.",
        )

    if x_api_key != SCRAPER_INGEST_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid scraper API key.")

    refresh_result = refresh_scraper_cache_from_pinnacle(source=source, force=force)
    sports = get_scraper_cache_sports()
    return {
        "ok": True,
        "provider": "scraper_cache",
        "refresh": refresh_result,
        "sport_count": len(sports),
        "game_count": sum(sport.get("game_count", 0) for sport in sports),
        "updated_at": load_scraper_cache().get("updated_at"),
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

    primary_line = payload.get("lines") or []
    primary_line = primary_line[0] if isinstance(primary_line, list) and primary_line else {}
    primary_line = primary_line if isinstance(primary_line, dict) else {}
    primary_odds = primary_line.get("odds") if isinstance(primary_line.get("odds"), dict) else primary_line

    normalized_payload = {
        "eventKey": event_key,
        "sport": payload.get("sport"),
        "league": source_meta.get("league"),
        "homeTeam": home_team,
        "awayTeam": away_team,
        "commenceTime": payload.get("commenceTime"),
        "scrapedAt": payload.get("scrapedAt") or format_now(),
        "book": primary_line.get("book") or payload.get("source") or "scraper",
        "homeMoneyline": primary_odds.get("homeMoneyline"),
        "awayMoneyline": primary_odds.get("awayMoneyline"),
        "homeSpread": primary_odds.get("homeSpread"),
        "awaySpread": primary_odds.get("awaySpread"),
        "homeSpreadOdds": primary_odds.get("homeSpreadOdds"),
        "awaySpreadOdds": primary_odds.get("awaySpreadOdds"),
        "total": primary_odds.get("total"),
        "overOdds": primary_odds.get("overOdds"),
        "underOdds": primary_odds.get("underOdds"),
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


@app.get("/api/book-feeds/draftkings")
def draftkings_book_feed(
    leagues: str | None = None,
    sport_key: str | None = None,
    league: str | None = None,
) -> dict[str, Any]:
    selected_sports = parse_requested_book_feed_sports(leagues=leagues, sport_key=sport_key, league=league)
    payload = resolve_book_feed_payload("draftkings", selected_sports)
    if not payload.get("configured"):
        raise HTTPException(status_code=503, detail="BOOK_FEED_DRAFTKINGS_SOURCE_URL is not configured.")
    if payload.get("errors"):
        raise HTTPException(status_code=502, detail="; ".join(payload.get("errors", [])))
    return payload


@app.get("/api/book-feeds/fanduel")
def fanduel_book_feed(
    leagues: str | None = None,
    sport_key: str | None = None,
    league: str | None = None,
) -> dict[str, Any]:
    selected_sports = parse_requested_book_feed_sports(leagues=leagues, sport_key=sport_key, league=league)
    payload = resolve_book_feed_payload("fanduel", selected_sports)
    if not payload.get("configured"):
        raise HTTPException(status_code=503, detail="BOOK_FEED_FANDUEL_SOURCE_URL is not configured.")
    if payload.get("errors"):
        raise HTTPException(status_code=502, detail="; ".join(payload.get("errors", [])))
    return payload


@app.get("/api/odds/board")
def odds_board(sport_key: str | None = None, league: str | None = None) -> dict[str, Any]:
    api_key = get_api_key()
    regions = get_regions()
    bookmakers = get_bookmakers()
    requested_scope = (sport_key or league or "").strip()
    selected_sports = (
        [find_sport_by_alias(requested_scope)]
        if requested_scope
        else SPORTS
    )
    selected_scope_keys = [sport["key"] for sport in selected_sports]
    split_stats_note = (
        "Consensus stats in SharkEdge are derived from sportsbook lines and best "
        "prices. Public ticket and money percentages require an additional data feed."
    )
    snapshot = resolve_board_snapshot(api_key, selected_sports=selected_sports)
    provider = snapshot.get("resolved_provider")
    provider_trace = snapshot.get("provider_trace", [])
    provider_error = snapshot.get("provider_error")

    if not provider:
        return {
            "configured": False,
            "generated_at": snapshot.get("generated_at", format_now()),
            "provider_mode": get_board_provider_mode(),
            "provider": None,
            "provider_resolution": {
                "requested_mode": get_board_provider_mode(),
                "resolved_provider": None,
                "winner": None,
                "fallback_triggered": False,
                "odds_api_primary_sport_keys": sorted(get_odds_api_primary_sport_keys()),
                "attempts": provider_trace,
                "provider_status": snapshot.get("provider_status"),
                "provider_meta": snapshot.get("provider_meta"),
            },
            "regions": regions,
            "bookmakers": snapshot.get("bookmakers") or bookmakers,
            "requested_scope": requested_scope or "all",
            "selected_sports": selected_scope_keys,
            "split_stats_supported": False,
            "split_stats_note": split_stats_note,
            "message": provider_error
            or snapshot.get("message")
            or "Configure ODDS_API_KEY to load live current odds.",
            "errors": snapshot.get("errors", []),
            "scraper_refresh": snapshot.get("scraper_refresh"),
            "sports": snapshot.get("sports", [build_empty_sport_payload(sport) for sport in selected_sports]),
            "cache": snapshot.get("cache"),
        }
    sports = snapshot.get("sports", [])
    errors = snapshot.get("errors", [])

    return {
        "configured": True,
        "generated_at": snapshot.get("generated_at", format_now()),
        "provider_mode": get_board_provider_mode(),
        "provider": provider,
        "provider_resolution": {
            "requested_mode": get_board_provider_mode(),
            "resolved_provider": provider,
            "winner": provider,
            "fallback_triggered": bool(snapshot.get("fallback_triggered")),
            "odds_api_primary_sport_keys": sorted(get_odds_api_primary_sport_keys()),
            "attempts": provider_trace,
            "provider_status": snapshot.get("provider_status"),
            "provider_meta": snapshot.get("provider_meta"),
        },
        "regions": regions,
        "bookmakers": snapshot.get("bookmakers") or bookmakers,
        "requested_scope": requested_scope or "all",
        "selected_sports": selected_scope_keys,
        "sport_count": len(sports),
        "game_count": sum(sport["game_count"] for sport in sports),
        "bookmaker_count": collect_unique_bookmakers(sports),
        "split_stats_supported": False,
        "split_stats_note": split_stats_note,
        "message": snapshot.get("message"),
        "errors": errors,
        "scraper_refresh": snapshot.get("scraper_refresh"),
        "cache": snapshot.get("cache"),
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


@app.get("/api/debug/mlb/sharp-reference")
def mlb_sharp_reference_debug(
    event_id: str | None = None,
    source: str = "auto",
) -> dict[str, Any]:
    normalized_source = (source or "auto").strip().lower()
    if normalized_source not in {"auto", "actionnetwork", "pinnacle_direct"}:
        raise HTTPException(
            status_code=400,
            detail="source must be one of: auto, actionnetwork, pinnacle_direct",
        )

    api_key = get_api_key()
    sport = find_sport("baseball_mlb")
    pinnacle_snapshot = get_pinnacle_mlb_snapshot(source=normalized_source)
    pinnacle_lookup = build_pinnacle_reference_lookup(pinnacle_snapshot)

    board_snapshot = resolve_board_snapshot(api_key, selected_sports=[sport])
    response: dict[str, Any] = {
        "configured": bool(api_key),
        "generated_at": format_now(),
        "sport": {
            "key": sport["key"],
            "title": sport["title"],
            "short_title": sport["short_title"],
        },
        "provider_mode": get_board_provider_mode(),
        "bookmakers": get_bookmakers(),
        "regions": get_regions(),
        "requested_source": normalized_source,
        "board_provider_resolution": {
            "requested_mode": board_snapshot.get("provider_mode"),
            "resolved_provider": board_snapshot.get("resolved_provider"),
            "winner": board_snapshot.get("resolved_provider"),
            "fallback_triggered": bool(board_snapshot.get("fallback_triggered")),
            "attempts": board_snapshot.get("provider_trace", []),
            "provider_status": board_snapshot.get("provider_status"),
        },
        "pinnacle_snapshot": {
            "resolved_source": pinnacle_snapshot.get("resolved_source"),
            "game_count": pinnacle_snapshot.get("game_count"),
            "cache": pinnacle_snapshot.get("cache"),
            "diagnostics": pinnacle_snapshot.get("diagnostics"),
            "message": pinnacle_snapshot.get("message"),
        },
        "sample_game": None,
        "message": None,
    }

    if not api_key:
        response["message"] = (
            "ODDS_API_KEY is not set on the backend service, so SharkEdge cannot build a live MLB board sample yet. "
            "Pinnacle diagnostics are still included above."
        )
        return response

    if not board_snapshot.get("resolved_provider"):
        response["message"] = (
            "MLB board fetch failed before a sample game could be built. "
            f"Provider error: {board_snapshot.get('message') or 'No provider won.'}"
        )
        return response

    sport_odds = next(
        (item for item in board_snapshot.get("sports", []) if item.get("key") == sport["key"]),
        None,
    )
    if not sport_odds:
        response["message"] = (
            "MLB board provider resolved, but no MLB payload was returned for inspection."
        )
        return response

    games = sport_odds.get("games", [])
    if event_id:
        sample_game = next((game for game in games if str(game.get("id")) == str(event_id)), None)
    else:
        sample_game = games[0] if games else None

    if not sample_game:
        response["message"] = (
            "MLB board is configured, but there was no live MLB game available to inspect in the current board payload."
        )
        response["sharp_reference_diagnostics"] = sport_odds.get("sharp_reference_diagnostics")
        response["board_errors"] = board_snapshot.get("errors", [])
        return response

    away_team = sample_game.get("away_team")
    home_team = sample_game.get("home_team")
    matched_pinnacle = pinnacle_lookup.get((normalize_match_key(away_team), normalize_match_key(home_team)))

    response["sharp_reference_diagnostics"] = sample_game.get("sharp_reference_diagnostics")
    response["sample_game"] = sample_game
    response["matched_pinnacle_game"] = matched_pinnacle
    response["board_errors"] = board_snapshot.get("errors", [])
    response["message"] = (
        "Sample MLB game with merged sharp-reference context. "
        "Use event_id to inspect a different live MLB matchup."
    )
    return response


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
    score_games: list[dict[str, Any]] = []
    try:
        board_snapshot = resolve_board_snapshot(api_key, selected_sports=[sport])
        provider = board_snapshot.get("resolved_provider")
        if not provider:
            raise RuntimeError(
                board_snapshot.get("message")
                or "Current odds board could not resolve a live provider for this game."
            )
        sport_odds = next(
            (item for item in board_snapshot.get("sports", []) if item.get("key") == sport["key"]),
            build_empty_sport_payload(sport),
        )
        if api_key:
            try:
                score_games = fetch_sport_scores(sport_key, api_key)
            except RuntimeError as error:
                odds_error = str(error)
                score_games = []
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
