"""TheRundown free odds ingestion - no auth required

Fetches live odds for all major sports from TheRundown's public API.
Sports covered: NFL, NBA, MLB, NHL, NCAAB, NCAAF

All results are normalized into the SharkEdge ingest contract and
POSTed to /api/internal/ingest/odds.

TheRundown advantages:
  - Free, unlimited requests (no rate limits)
  - Covers 6 major sports
  - Moneyline, spread, total odds
  - Established affiliate network (stable)
  - No auth required
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any, Optional
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
THERUNDOWN_API = "https://therundown.io/api/v2"
SHARKEDGE_INGEST_URL = os.getenv(
    "SHARKEDGE_INGEST_URL",
    "http://localhost:3000/api/internal/ingest/odds"
).strip()
SHARKEDGE_API_KEY = os.getenv("SHARKEDGE_API_KEY", "").strip()
POLL_INTERVAL_SECONDS = int(os.getenv("THERUNDOWN_POLL_INTERVAL_SECONDS", "60"))
RUN_ONCE = os.getenv("RUN_ONCE", "false").lower() in {"1", "true", "yes"}

# Sports supported by TheRundown
SPORTS = ["nfl", "nba", "mlb", "nhl", "ncaab", "ncaaf"]

# Map TheRundown sport names to SharkEdge sport keys
SPORT_KEY_MAP = {
    "nfl": "americanfootball_nfl",
    "nba": "basketball_nba",
    "mlb": "baseball_mlb",
    "nhl": "icehockey_nhl",
    "ncaab": "basketball_ncaab",
    "ncaaf": "americanfootball_ncaaf",
}


def _fetch_json(url: str, timeout: int = 15) -> Any:
    """Fetch JSON from URL. Returns None on failure."""
    headers = {"Accept": "application/json"}
    req = Request(url, headers=headers)
    try:
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (HTTPError, URLError, json.JSONDecodeError, Exception) as exc:
        logger.debug("Fetch failed %s: %s", url, exc)
        return None


def fetch_therundown_events(sport: str) -> list[dict[str, Any]]:
    """Fetch upcoming events from TheRundown for a specific sport"""
    url = f"{THERUNDOWN_API}/events?sport={sport}"
    data = _fetch_json(url)
    if not data or not isinstance(data.get("events"), list):
        return []
    return data["events"]


def normalize_to_ingest(event: dict[str, Any], sport: str) -> dict[str, Any]:
    """Convert TheRundown format to SharkEdge ingest schema"""
    sport_key = SPORT_KEY_MAP.get(sport)
    home_team = event.get("home_team", "")
    away_team = event.get("away_team", "")

    return {
        "sport": sport.upper(),
        "eventKey": f"{sport}:{away_team}@{home_team}",
        "homeTeam": home_team,
        "awayTeam": away_team,
        "commenceTime": event.get("start_time") or datetime.now(timezone.utc).isoformat(),
        "source": "therundown",
        "lines": [
            {
                "book": "TheRundown",
                "fetchedAt": datetime.now(timezone.utc).isoformat(),
                "odds": {
                    "homeMoneyline": event.get("moneyline", {}).get("home") if isinstance(event.get("moneyline"), dict) else None,
                    "awayMoneyline": event.get("moneyline", {}).get("away") if isinstance(event.get("moneyline"), dict) else None,
                    "homeSpread": event.get("spread", {}).get("home") if isinstance(event.get("spread"), dict) else None,
                    "homeSpreadOdds": event.get("spread", {}).get("home_odds") if isinstance(event.get("spread"), dict) else None,
                    "awaySpreadOdds": event.get("spread", {}).get("away_odds") if isinstance(event.get("spread"), dict) else None,
                    "total": event.get("total", {}).get("line") if isinstance(event.get("total"), dict) else None,
                    "overOdds": event.get("total", {}).get("over") if isinstance(event.get("total"), dict) else None,
                    "underOdds": event.get("total", {}).get("under") if isinstance(event.get("total"), dict) else None,
                },
            }
        ],
        "sourceMeta": {
            "provider": "therundown",
            "sportKey": sport_key,
        },
    }


def post_to_sharkedge(payload: dict[str, Any]) -> bool:
    """Post payload to SharkEdge ingest endpoint"""
    if not SHARKEDGE_API_KEY:
        logger.warning("SHARKEDGE_API_KEY not set; skipping ingest")
        return False

    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "x-api-key": SHARKEDGE_API_KEY,
    }
    req = Request(SHARKEDGE_INGEST_URL, data=body, headers=headers, method="POST")

    try:
        with urlopen(req, timeout=12) as resp:
            return resp.status == 200
    except Exception as exc:
        logger.debug("Ingest POST failed: %s", exc)
        return False


def run_cycle() -> None:
    """Fetch all sports and post to SharkEdge"""
    total_events = 0
    total_posted = 0

    for sport in SPORTS:
        try:
            events = fetch_therundown_events(sport)
            if not events:
                logger.debug("%s: no events", sport)
                continue

            posted = 0
            for event in events:
                payload = normalize_to_ingest(event, sport)
                if post_to_sharkedge(payload):
                    posted += 1

            total_events += len(events)
            total_posted += posted
            logger.info("%s: %d events, posted %d", sport.upper(), len(events), posted)

        except Exception as exc:
            logger.exception("Error processing %s: %s", sport, exc)

    logger.info("TheRundown cycle complete: %d events, %d posted", total_events, total_posted)


def main() -> None:
    """Main loop"""
    logger.info("TheRundown ingester starting")

    while True:
        started = time.time()
        try:
            run_cycle()
        except Exception as exc:
            logger.exception("Cycle failed: %s", exc)

        if RUN_ONCE:
            logger.info("RUN_ONCE enabled - exiting")
            break

        elapsed = time.time() - started
        sleep_for = max(0, POLL_INTERVAL_SECONDS - elapsed)
        if sleep_for > 0:
            logger.info("Sleeping %.0fs until next cycle", sleep_for)
            time.sleep(sleep_for)


if __name__ == "__main__":
    main()
