from __future__ import annotations

import json
import os
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import FastAPI

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
SPORT_ORDER = {sport["key"]: index for index, sport in enumerate(SPORTS)}
ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4/sports"
ODDS_API_MARKETS = "h2h,spreads,totals"


def get_api_key() -> str:
    return os.getenv("ODDS_API_KEY", "").strip()


def get_regions() -> str:
    return os.getenv("ODDS_API_REGIONS", "us,us2").strip()


def format_now() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    params = urlencode(
        {
            "apiKey": api_key,
            "regions": get_regions(),
            "markets": ODDS_API_MARKETS,
            "oddsFormat": "american",
            "dateFormat": "iso",
        }
    )
    request = Request(
        f"{ODDS_API_BASE_URL}/{sport['key']}/odds?{params}",
        headers={"User-Agent": "Shark Odds/1.0"},
    )

    try:
        with urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(
            f"{sport['title']} odds request failed with {error.code}: {body}"
        ) from error
    except URLError as error:
        raise RuntimeError(
            f"{sport['title']} odds request failed: {error.reason}"
        ) from error

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


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "message": "Shark Odds API is live",
        "odds_board_endpoint": "/api/odds/board",
        "demo_endpoint": "/api/signals/demo",
    }


@app.get("/api/signals/demo")
def demo() -> dict[str, Any]:
    return {"selection": "Bulls +4.5", "edge_pct": 4.12, "ev": 0.078}


@app.get("/api/odds/board")
def odds_board() -> dict[str, Any]:
    api_key = get_api_key()
    regions = get_regions()
    split_stats_note = (
        "Consensus stats in Shark Odds are derived from sportsbook lines and best "
        "prices. Public ticket and money percentages require an additional data feed."
    )

    if not api_key:
        return {
            "configured": False,
            "generated_at": format_now(),
            "regions": regions,
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
        "sport_count": len(sports),
        "game_count": sum(sport["game_count"] for sport in sports),
        "bookmaker_count": collect_unique_bookmakers(sports),
        "split_stats_supported": False,
        "split_stats_note": split_stats_note,
        "errors": errors,
        "sports": sports,
    }
