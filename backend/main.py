from __future__ import annotations

import json
import os
import re
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
from fastapi import FastAPI, HTTPException

load_dotenv(Path(__file__).with_name(".env"))

app = FastAPI()

SPORTS = [
    {
        "key": "basketball_ncaab",
        "title": "NCAA Men's Basketball",
        "short_title": "NCAAB",
    },
    {
        "key": "basketball_nba",
        "title": "NBA",
        "short_title": "NBA",
    },
    {
        "key": "baseball_mlb",
        "title": "MLB",
        "short_title": "MLB",
    },
    {
        "key": "icehockey_nhl",
        "title": "NHL",
        "short_title": "NHL",
    },
]

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


def get_api_key() -> str:
    return os.getenv("ODDS_API_KEY", "").strip()


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
    raw_value = os.getenv("ODDS_API_PROPS_CACHE_SECONDS", "90").strip()
    try:
        return max(15, min(300, int(raw_value)))
    except ValueError:
        return 90


def get_props_workers() -> int:
    raw_value = os.getenv("ODDS_API_PROPS_WORKERS", "4").strip()
    try:
        return max(1, min(8, int(raw_value)))
    except ValueError:
        return 4


def format_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def request_json_with_base(
    base_url: str, path: str, params: dict[str, Any], title: str
) -> Any:
    query = urlencode({key: value for key, value in params.items() if value is not None})
    url = f"{base_url}/{path}"
    if query:
        url = f"{url}?{query}"

    request = Request(
        url,
        headers={"User-Agent": "Shark Odds/1.0"},
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


def normalize_game(game: dict[str, Any]) -> dict[str, Any]:
    normalized_bookmakers = [
        normalize_bookmaker(bookmaker)
        for bookmaker in sort_bookmakers(game.get("bookmakers", []))
    ]

    away_team = game.get("away_team")
    home_team = game.get("home_team")

    return {
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


def collect_unique_bookmakers(sports: list[dict[str, Any]]) -> int:
    bookmaker_keys = set()

    for sport in sports:
        for game in sport.get("games", []):
            for bookmaker in game.get("bookmakers", []):
                bookmaker_key = bookmaker.get("key")
                if bookmaker_key:
                    bookmaker_keys.add(bookmaker_key)

    return len(bookmaker_keys)


def fetch_sport_odds(sport: dict[str, str], api_key: str) -> dict[str, Any]:
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

    games = sorted(
        (normalize_game(game) for game in payload),
        key=lambda game: game.get("commence_time") or "",
    )

    return {
        "key": sport["key"],
        "title": sport["title"],
        "short_title": sport["short_title"],
        "game_count": len(games),
        "games": games,
    }


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
                "other leagues still need a team-scoped player stats feed so Shark Odds "
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
) -> dict[str, Any]:
    events = fetch_sport_events(sport["key"], api_key)
    prop_games: list[dict[str, Any]] = []
    props: list[dict[str, Any]] = []
    errors: list[str] = []

    if not events:
        return {
            "key": sport["key"],
            "title": sport["title"],
            "short_title": sport["short_title"],
            "event_count": 0,
            "game_count": 0,
            "prop_count": 0,
            "games": [],
            "errors": [],
        }

    max_workers = min(get_props_workers(), len(events))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_event = {
            executor.submit(fetch_game_props, sport["key"], str(event.get("id")), api_key): event
            for event in events
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

    return {
        "key": sport["key"],
        "title": sport["title"],
        "short_title": sport["short_title"],
        "event_count": len(events),
        "game_count": len(prop_games),
        "prop_count": len(props),
        "games": sorted(prop_games, key=lambda game: game.get("commence_time") or ""),
        "props": props,
        "errors": errors,
    }


def build_game_detail(
    sport_key: str,
    game: dict[str, Any],
    score_games: list[dict[str, Any]],
    props: list[dict[str, Any]],
) -> dict[str, Any]:
    away_team = game["away_team"]
    home_team = game["home_team"]
    bookmakers = game["bookmakers"]

    away_fallback = build_recent_results(score_games, away_team)
    home_fallback = build_recent_results(score_games, home_team)
    away_context = build_team_context(sport_key, away_team, away_fallback)
    home_context = build_team_context(sport_key, home_team, home_fallback)
    player_leaders = build_player_leader_block(
        sport_key, away_team, away_context, home_team, home_context
    )

    return {
        "game": game,
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
        "player_leaders": player_leaders,
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
            f"Recent form is sourced from {away_context['recent_source']} and {home_context['recent_source']} when available.",
            "Team betting stats are sourced from ESPN team statistics endpoints when Shark Odds can map the matchup cleanly.",
            "Public money percentages are not included in the current provider feed.",
        ],
    }


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "message": "Shark Odds API is live",
        "odds_board_endpoint": "/api/odds/board",
        "props_board_endpoint": "/api/props/board",
        "game_detail_endpoint_template": "/api/games/{sport_key}/{event_id}",
        "demo_endpoint": "/api/signals/demo",
    }


@app.get("/api/signals/demo")
def demo() -> dict[str, Any]:
    return {"selection": "Bulls +4.5", "edge_pct": 4.12, "ev": 0.078}


@app.get("/api/odds/board")
def odds_board() -> dict[str, Any]:
    api_key = get_api_key()
    regions = get_regions()
    bookmakers = get_bookmakers()
    split_stats_note = (
        "Consensus stats in Shark Odds are derived from sportsbook lines and best "
        "prices. Public ticket and money percentages require an additional data feed."
    )

    if not api_key:
        return {
            "configured": False,
            "generated_at": format_now(),
            "regions": regions,
            "bookmakers": bookmakers,
            "split_stats_supported": False,
            "split_stats_note": split_stats_note,
            "message": "Set ODDS_API_KEY on the backend service to load live odds.",
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

    with ThreadPoolExecutor(max_workers=len(SPORTS)) as executor:
        future_to_sport = {
            executor.submit(fetch_sport_odds, sport, api_key): sport for sport in SPORTS
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


@app.get("/api/props/board")
def props_board(sport_key: str | None = None) -> dict[str, Any]:
    api_key = get_api_key()
    bookmakers = get_bookmakers()
    regions = get_regions()

    if not api_key:
        return {
            "configured": False,
            "generated_at": format_now(),
            "regions": regions,
            "bookmakers": bookmakers,
            "markets": get_props_markets(),
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

    responses: list[dict[str, Any]] = []
    errors: list[str] = []

    with ThreadPoolExecutor(max_workers=len(sports)) as executor:
        future_to_sport = {
            executor.submit(fetch_sport_prop_board, sport, api_key): sport
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
                        "games": [],
                        "props": [],
                        "errors": [str(error)],
                    }
                )

    responses.sort(key=lambda item: SPORT_ORDER.get(item["key"], 999))

    return {
        "configured": True,
        "generated_at": format_now(),
        "regions": regions,
        "bookmakers": bookmakers,
        "markets": get_props_markets(),
        "sport_count": len(responses),
        "game_count": sum(item["game_count"] for item in responses),
        "prop_count": sum(item["prop_count"] for item in responses),
        "resolution_note": (
            "Player-to-team mapping is resolved from ESPN rosters when Shark Odds can map both teams cleanly."
        ),
        "errors": errors,
        "sports": responses,
    }


@app.get("/api/games/{sport_key}/{event_id}")
def game_detail(sport_key: str, event_id: str) -> dict[str, Any]:
    api_key = get_api_key()
    if not api_key:
        return {
            "configured": False,
            "generated_at": format_now(),
            "message": "Set ODDS_API_KEY on the backend service to load game details.",
        }

    sport = find_sport(sport_key)

    try:
        sport_odds = fetch_sport_odds(sport, api_key)
        score_games = fetch_sport_scores(sport_key, api_key)
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    game = next((item for item in sport_odds["games"] if item["id"] == event_id), None)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found.")

    try:
        game_props = fetch_game_props(sport_key, event_id, api_key)
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    detail = build_game_detail(sport_key, game, score_games, game_props)

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
