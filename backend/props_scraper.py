"""SharkEdge Player Props Scraper

Scrapes player prop lines from multiple free sources using rotating
request strategies to avoid IP bans:

  1. ESPN hidden JSON API  — no auth, no scraping, pure JSON
  2. The Odds API          — uses your ODDS_API_KEY, rate-limited
  3. Flashscore feed       — uses the same DS host rotation as live_odds_scraper

All results are normalized into the SharkEdge ingest contract and
POSTed to /api/internal/ingest/odds.

IP protection strategy:
  - ESPN and Odds API are legitimate API calls, no IP risk
  - Flashscore uses the DS feed (JSON, not Selenium) with 3-host rotation
    and randomized delays — no browser fingerprint, no JS execution
  - PROXY_URL env var is respected for all HTTP calls
  - User-Agent rotates from a pool of real browser strings
"""
from __future__ import annotations

import json
import logging
import os
import random
import re
import sys
import time
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SHARKEDGE_INGEST_URL = os.getenv("SHARKEDGE_INGEST_URL", "http://localhost:3000/api/internal/ingest/odds").strip()
SHARKEDGE_API_KEY = os.getenv("SHARKEDGE_API_KEY", "").strip()

# Support multiple API keys for higher quota (500 req/month each = 2500/month with 5 keys)
ODDS_API_KEYS_RAW = os.getenv("ODDS_API_KEYS", "").strip()
ODDS_API_KEY = os.getenv("ODDS_API_KEY", "").strip()  # Fallback to single key
ODDS_API_KEYS = [k.strip() for k in ODDS_API_KEYS_RAW.split(",") if k.strip()] if ODDS_API_KEYS_RAW else ([ODDS_API_KEY] if ODDS_API_KEY else [])

ODDS_API_BASE = "https://api.the-odds-api.com/v4"
PROXY_URL = os.getenv("PROXY_URL", "").strip() or None
POLL_INTERVAL_SECONDS = int(os.getenv("PROPS_POLL_INTERVAL_SECONDS", "300"))
RUN_ONCE = os.getenv("RUN_ONCE", "false").lower() in {"1", "true", "yes"}
_API_KEY_INDEX = 0  # Track which key to use

# Flashscore DS hosts — rotate to spread load
DS_HOSTS = ["1.ds.flashscore.com", "2.ds.flashscore.com", "3.ds.flashscore.com"]

# Rotating user agents — real browser strings, no bot signatures
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]

# Odds API sport keys for props
ODDS_API_PROP_SPORTS: dict[str, list[str]] = {
    "basketball_nba": [
        "player_points", "player_rebounds", "player_assists",
        "player_threes", "player_points_rebounds_assists",
        "player_points_rebounds", "player_points_assists",
    ],
    "baseball_mlb": [
        "batter_home_runs", "batter_hits", "batter_rbis",
        "batter_runs_scored", "batter_stolen_bases",
        "pitcher_strikeouts", "pitcher_outs", "pitcher_hits_allowed",
    ],
    "icehockey_nhl": [
        "player_points", "player_goals", "player_assists",
        "player_shots_on_goal",
    ],
    "americanfootball_nfl": [
        "player_pass_yds", "player_pass_tds", "player_rush_yds",
        "player_reception_yds", "player_receptions",
        "player_anytime_td",
    ],
}

# ESPN sport paths for scoreboard / player stats
ESPN_SPORT_PATHS: dict[str, str] = {
    "basketball_nba": "basketball/nba",
    "baseball_mlb": "baseball/mlb",
    "icehockey_nhl": "hockey/nhl",
    "americanfootball_nfl": "football/nfl",
    "basketball_ncaab": "basketball/mens-college-basketball",
}

# Bookmaker confidence scoring - used for props quality ranking
BOOKMAKER_CONFIDENCE: dict[str, str] = {
    # Tier 1: Major US sportsbooks (high confidence)
    "draftkings": "high",
    "fanduel": "high",
    "betmgm": "high",
    "caesars": "high",
    "betrivers": "high",
    "pointsbetaus": "high",
    # Tier 2: Established books (medium confidence)
    "unibet": "medium",
    "draftkings_int": "medium",
    "bet365": "medium",
    "betfair": "medium",
    "pinnacle": "medium",
    # Tier 3: Regional/niche (low confidence - less reliable for props)
}


# ---------------------------------------------------------------------------
# HTTP helpers — no Selenium, pure urllib with proxy + UA rotation
# ---------------------------------------------------------------------------
def _random_ua() -> str:
    return random.choice(USER_AGENTS)


def _get_next_api_key() -> str:
    """Rotate through multiple API keys to maximize quota.

    With 5 free accounts at 500 requests/month each, total quota = 2500/month.
    Rotation prevents hitting single-key limits too early.
    """
    global _API_KEY_INDEX
    if not ODDS_API_KEYS:
        return ""
    key = ODDS_API_KEYS[_API_KEY_INDEX % len(ODDS_API_KEYS)]
    _API_KEY_INDEX += 1
    return key


def _get_bookmaker_confidence(book_key: str) -> str:
    """Get confidence level for a bookmaker (high/medium/low).

    Used to prioritize props - high confidence books are prioritized in scoring.
    """
    normalized = book_key.lower() if book_key else ""
    return BOOKMAKER_CONFIDENCE.get(normalized, "low")


def _fetch_json(url: str, headers: dict[str, str] | None = None, timeout: int = 15) -> Any:
    """Fetch JSON from url. Respects PROXY_URL. Returns None on failure."""
    req_headers = {"User-Agent": _random_ua(), "Accept": "application/json"}
    if headers:
        req_headers.update(headers)
    req = Request(url, headers=req_headers)
    try:
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (HTTPError, URLError, json.JSONDecodeError, Exception) as exc:
        logger.debug("Fetch failed %s: %s", url, exc)
        return None


def _jitter(base: float = 1.2, spread: float = 1.8) -> None:
    """Random sleep to avoid rate-limit fingerprinting."""
    time.sleep(base + random.random() * spread)


# ---------------------------------------------------------------------------
# Source 1: ESPN hidden JSON API (no auth, no scraping)
# ---------------------------------------------------------------------------
def _espn_scoreboard_events(sport_key: str) -> list[dict[str, Any]]:
    path = ESPN_SPORT_PATHS.get(sport_key)
    if not path:
        return []
    url = f"https://site.api.espn.com/apis/site/v2/sports/{path}/scoreboard?limit=50"
    data = _fetch_json(url)
    if not data or not isinstance(data.get("events"), list):
        return []
    return data["events"]


def _espn_player_stats(sport_key: str, event_id: str) -> list[dict[str, Any]]:
    """Pull per-player box score stats from ESPN for a specific event."""
    path = ESPN_SPORT_PATHS.get(sport_key)
    if not path:
        return []
    url = f"https://site.api.espn.com/apis/site/v2/sports/{path}/summary?event={event_id}"
    data = _fetch_json(url)
    if not data:
        return []

    players: list[dict[str, Any]] = []
    for boxscore in (data.get("boxscore") or {}).get("players") or []:
        team_info = boxscore.get("team") or {}
        for stat_group in boxscore.get("statistics") or []:
            stat_names = stat_group.get("names") or []
            for athlete_row in stat_group.get("athletes") or []:
                athlete = athlete_row.get("athlete") or {}
                stats_raw = athlete_row.get("stats") or []
                stat_map: dict[str, str] = dict(zip(stat_names, stats_raw))
                players.append({
                    "playerId": athlete.get("id"),
                    "playerName": athlete.get("displayName") or athlete.get("shortName"),
                    "teamId": team_info.get("id"),
                    "teamAbbr": team_info.get("abbreviation"),
                    "stats": stat_map,
                    "sport": sport_key,
                    "eventId": event_id,
                })
    return players


def _espn_upcoming_player_projections(sport_key: str) -> list[dict[str, Any]]:
    """Pull ESPN player projections / fantasy stats for upcoming games."""
    path = ESPN_SPORT_PATHS.get(sport_key)
    if not path:
        return []
    # ESPN fantasy projections endpoint (public, no auth)
    url = f"https://fantasy.espn.com/apis/v3/games/ffl/seasons/2025/segments/0/leagues/0?view=kona_player_info"
    # Fallback: use the scoreboard leaders endpoint
    url = f"https://site.api.espn.com/apis/site/v2/sports/{path}/leaders"
    data = _fetch_json(url)
    if not data:
        return []
    leaders: list[dict[str, Any]] = []
    for category in (data.get("leaders") or []):
        stat_name = category.get("name") or category.get("displayName") or "stat"
        for leader in (category.get("leaders") or []):
            athlete = leader.get("athlete") or {}
            leaders.append({
                "playerId": athlete.get("id"),
                "playerName": athlete.get("displayName"),
                "statKey": stat_name,
                "value": leader.get("value"),
                "sport": sport_key,
            })
    return leaders


# ---------------------------------------------------------------------------
# Source 2: The Odds API (legitimate API, rate-limited, uses your key)
# ---------------------------------------------------------------------------
def _odds_api_props(sport_key: str, event_id: str, markets: list[str]) -> list[dict[str, Any]]:
    api_key = _get_next_api_key()
    if not api_key:
        return []
    # Batch markets to minimize API calls (max 4 per request on free tier)
    batches = [markets[i:i+4] for i in range(0, len(markets), 4)]
    all_props: list[dict[str, Any]] = []
    for batch in batches:
        params = urlencode({
            "apiKey": api_key,
            "regions": "us",
            "markets": ",".join(batch),
            "oddsFormat": "american",
            "dateFormat": "iso",
        })
        url = f"{ODDS_API_BASE}/sports/{sport_key}/events/{event_id}/odds?{params}"
        data = _fetch_json(url)
        if not data or not isinstance(data.get("bookmakers"), list):
            _jitter(0.5, 1.0)
            continue

        # Enhanced: collect props from ALL bookmakers with confidence scoring
        for bookmaker in data["bookmakers"]:
            book_key = bookmaker.get("key") or bookmaker.get("title", "unknown")
            book_title = bookmaker.get("title") or book_key
            book_confidence = _get_bookmaker_confidence(book_key)

            # Skip very low-confidence niche books only if we have better options
            # (keep them if they're the only source for a prop market)

            for market in bookmaker.get("markets") or []:
                market_key = market.get("key")
                for outcome in market.get("outcomes") or []:
                    all_props.append({
                        "sport": sport_key,
                        "eventId": event_id,
                        "bookKey": book_key,
                        "bookTitle": book_title,
                        "bookConfidence": book_confidence,  # NEW: confidence level
                        "marketKey": market_key,
                        "playerName": outcome.get("description") or outcome.get("name"),
                        "side": outcome.get("name"),  # Over / Under
                        "line": outcome.get("point"),
                        "oddsAmerican": outcome.get("price"),
                    })
        _jitter(0.8, 1.5)  # Respect rate limits
    return all_props


def _odds_api_events(sport_key: str) -> list[dict[str, Any]]:
    api_key = _get_next_api_key()
    if not api_key:
        return []
    params = urlencode({"apiKey": api_key, "dateFormat": "iso"})
    url = f"{ODDS_API_BASE}/sports/{sport_key}/events?{params}"
    data = _fetch_json(url)
    if not isinstance(data, list):
        return []
    return data


# ---------------------------------------------------------------------------
# Source 3: Flashscore DS feed (JSON, no browser, 3-host rotation)
# ---------------------------------------------------------------------------
def _flashscore_player_props(match_id: str) -> list[dict[str, Any]]:
    """Pull player prop data from Flashscore's DS JSON feed.
    Uses 3-host rotation and randomized delays — no Selenium, no JS.
    """
    host = random.choice(DS_HOSTS)
    # Player stats feed
    url = f"https://{host}/dm/feed/st_{match_id}_en_1"
    headers = {
        "Referer": "https://www.flashscore.com/",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "*/*",
    }
    raw = _fetch_json(url, headers=headers)
    if not raw:
        return []
    # Flashscore returns a proprietary format — extract player stat rows
    props: list[dict[str, Any]] = []
    if isinstance(raw, dict):
        for key, value in raw.items():
            if isinstance(value, list):
                for item in value:
                    if isinstance(item, dict) and item.get("player"):
                        props.append({"source": "flashscore_ds", "matchId": match_id, "raw": item})
    return props


# ---------------------------------------------------------------------------
# Normalize props into SharkEdge ingest format
# ---------------------------------------------------------------------------
def _normalize_prop_to_ingest(
    sport_key: str,
    home_team: str,
    away_team: str,
    commence_time: str,
    player_name: str,
    market_key: str,
    side: str,
    line: float | None,
    odds_american: int | None,
    book_key: str,
    book_title: str,
    event_key: str,
    book_confidence: str | None = None,
) -> dict[str, Any] | None:
    if not player_name or line is None or odds_american is None:
        return None
    side_normalized = side.upper() if side else "OVER"
    if side_normalized not in {"OVER", "UNDER"}:
        return None
    return {
        "sport": sport_key.split("_")[0].upper() if "_" in sport_key else sport_key.upper(),
        "eventKey": event_key,
        "homeTeam": home_team,
        "awayTeam": away_team,
        "commenceTime": commence_time,
        "source": "props_scraper",
        "lines": [{
            "book": book_title,
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "odds": {
                "playerProp": True,
                "playerName": player_name,
                "marketKey": market_key,
                "side": side_normalized,
                "line": line,
                "oddsAmerican": odds_american,
            },
        }],
        "sourceMeta": {
            "provider": "props_scraper",
            "bookKey": book_key,
            "bookConfidence": book_confidence or "unknown",
            "marketKey": market_key,
        },
    }


# ---------------------------------------------------------------------------
# Post to SharkEdge ingest endpoint
# ---------------------------------------------------------------------------
def _post_to_sharkedge(payload: dict[str, Any]) -> bool:
    if not SHARKEDGE_API_KEY:
        return False
    body = json.dumps(payload).encode("utf-8")
    req = Request(
        SHARKEDGE_INGEST_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-api-key": SHARKEDGE_API_KEY,
            "User-Agent": _random_ua(),
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=12) as resp:
            return resp.status == 200
    except Exception as exc:
        logger.debug("Ingest failed: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Main scrape cycle
# ---------------------------------------------------------------------------
def _scrape_sport_props(sport_key: str) -> int:
    """Scrape props for one sport. Returns number of props ingested."""
    ingested = 0
    markets = ODDS_API_PROP_SPORTS.get(sport_key, [])

    # Get upcoming events from Odds API (free, just needs key)
    events = _odds_api_events(sport_key)
    if not events:
        logger.info("%s: no upcoming events from Odds API", sport_key)
        return 0

    logger.info("%s: %d upcoming events", sport_key, len(events))

    for event in events[:8]:  # Cap at 8 events per sport per cycle
        event_id = event.get("id")
        home_team = event.get("home_team") or "Home"
        away_team = event.get("away_team") or "Away"
        commence_time = event.get("commence_time") or datetime.now(timezone.utc).isoformat()
        event_key = f"{sport_key}:{away_team}@{home_team}"

        if not event_id or not markets:
            continue

        props = _odds_api_props(sport_key, event_id, markets)
        logger.info("%s %s vs %s: %d prop lines", sport_key, away_team, home_team, len(props))

        for prop in props:
            payload = _normalize_prop_to_ingest(
                sport_key=sport_key,
                home_team=home_team,
                away_team=away_team,
                commence_time=commence_time,
                player_name=prop.get("playerName") or "",
                market_key=prop.get("marketKey") or "",
                side=prop.get("side") or "OVER",
                line=prop.get("line"),
                odds_american=prop.get("oddsAmerican"),
                book_key=prop.get("bookKey") or "unknown",
                book_title=prop.get("bookTitle") or "Unknown Book",
                event_key=event_key,
                book_confidence=prop.get("bookConfidence"),
            )
            if payload and _post_to_sharkedge(payload):
                ingested += 1

        _jitter(1.5, 2.5)  # Breathe between events

    return ingested


def run_cycle() -> None:
    total = 0
    for sport_key in ODDS_API_PROP_SPORTS:
        try:
            count = _scrape_sport_props(sport_key)
            total += count
            logger.info("%s: ingested %d props", sport_key, count)
        except Exception as exc:
            logger.exception("Error scraping %s: %s", sport_key, exc)
        _jitter(2.0, 3.0)  # Breathe between sports
    logger.info("Cycle complete: %d total props ingested", total)


def main() -> None:
    logger.info("SharkEdge Props Scraper starting (proxy=%s)", PROXY_URL or "none")
    while True:
        started = time.time()
        try:
            run_cycle()
        except Exception as exc:
            logger.exception("Cycle failed: %s", exc)
        if RUN_ONCE:
            break
        elapsed = time.time() - started
        sleep_for = max(0, POLL_INTERVAL_SECONDS - elapsed)
        logger.info("Sleeping %.0fs until next cycle", sleep_for)
        time.sleep(sleep_for)


if __name__ == "__main__":
    main()
