from __future__ import annotations

import json
import os
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
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


def format_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def request_json(path: str, params: dict[str, Any], title: str) -> Any:
    request = Request(
        f"{ODDS_API_BASE_URL}/{path}?{urlencode(params)}",
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


def build_game_detail(game: dict[str, Any], score_games: list[dict[str, Any]]) -> dict[str, Any]:
    away_team = game["away_team"]
    home_team = game["home_team"]
    bookmakers = game["bookmakers"]

    away_form = build_recent_results(score_games, away_team)
    home_form = build_recent_results(score_games, home_team)

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
                "recent_results": away_form,
                "summary": summarize_recent_results(away_form),
            },
            home_team: {
                "recent_results": home_form,
                "summary": summarize_recent_results(home_form),
            },
        },
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
            "Recent form uses the Odds API scores endpoint. The documented scores window covers up to 3 days back, so a full last-five sample may not always be available.",
            "Public money percentages are not included in the current provider feed.",
        ],
    }


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "message": "Shark Odds API is live",
        "odds_board_endpoint": "/api/odds/board",
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

    detail = build_game_detail(game, score_games)

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
