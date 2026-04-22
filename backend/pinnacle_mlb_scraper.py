from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from threading import Lock
from typing import Any

try:
    import requests
except Exception as error:  # pragma: no cover
    requests = None
    REQUESTS_IMPORT_ERROR = error
else:
    REQUESTS_IMPORT_ERROR = None


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


AN_MLB_URL = "https://api.actionnetwork.com/web/v1/games?sport=mlb&bookmakers=pinnacle"
AN_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Referer": "https://www.actionnetwork.com/mlb/odds",
}

PINNACLE_MLB_URL = "https://www.pinnacle.com/en/baseball/mlb/matchups/#all"
PINNACLE_FEED_URL = (
    "https://guest.api.arcadia.pinnacle.com/0.1/leagues/246/matchups"
    "?brandId=0&includeSingleGameParlays=true"
)
PINNACLE_ODDS_URL = (
    "https://guest.api.arcadia.pinnacle.com/0.1/leagues/246/markets/straight"
    "?brandId=0&primaryOnly=false"
)
PINNACLE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Referer": "https://www.pinnacle.com/",
    "Origin": "https://www.pinnacle.com",
}
_PINNACLE_API_KEY = os.getenv("PINNACLE_API_KEY", "").strip()
if _PINNACLE_API_KEY:
    PINNACLE_HEADERS["X-API-Key"] = _PINNACLE_API_KEY
REQUEST_TIMEOUT_SECONDS = int(os.getenv("PINNACLE_REQUEST_TIMEOUT_SECONDS", "10"))
PINNACLE_CACHE_SECONDS = int(os.getenv("PINNACLE_CACHE_SECONDS", "45"))

_CACHE_LOCK = Lock()
_SNAPSHOT_CACHE: dict[str, dict[str, Any]] = {}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None


def _safe_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_iso_timestamp(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()


def _empty_source_diagnostic(source: str) -> dict[str, Any]:
    return {
        "source": source,
        "attempted": False,
        "ok": False,
        "game_count": 0,
        "duration_ms": None,
        "error": None,
        "fetched_at": None,
    }


def _requests_unavailable_error() -> RuntimeError:
    detail = str(REQUESTS_IMPORT_ERROR) if REQUESTS_IMPORT_ERROR else "requests is unavailable"
    return RuntimeError(f"Python requests dependency is unavailable for Pinnacle fetches: {detail}")


def _iter_actionnetwork_odds_entries(odds_map: Any) -> list[tuple[str, dict[str, Any]]]:
    if isinstance(odds_map, dict):
        return [
            (str(key), value)
            for key, value in odds_map.items()
            if isinstance(value, dict)
        ]
    if isinstance(odds_map, list):
        return [
            (str(item.get("book_id") or item.get("bookmaker") or index), item)
            for index, item in enumerate(odds_map)
            if isinstance(item, dict)
        ]
    return []


def _find_actionnetwork_pinnacle_odds(odds_map: Any) -> dict[str, Any] | None:
    entries = _iter_actionnetwork_odds_entries(odds_map)
    for key, value in entries:
        book_id = value.get("book_id")
        book_key = str(value.get("bookmaker") or value.get("book_key") or key).lower()
        if book_id in (15, "15") or "pinnacle" in book_key:
            return value

    if len(entries) == 1:
        return entries[0][1]

    return None


def _has_any_market(game: dict[str, Any]) -> bool:
    return any(game.get(key) is not None for key in ("moneyline", "spread", "total"))


def _parse_an_odds(game: dict[str, Any]) -> dict[str, Any] | None:
    try:
        teams = game.get("teams", [])
        if not isinstance(teams, list) or len(teams) < 2:
            return None

        home = next((team for team in teams if team.get("is_home")), teams[1])
        away = next((team for team in teams if not team.get("is_home")), teams[0])

        result: dict[str, Any] = {
            "game_id": str(game.get("id", "")),
            "commence_time": game.get("start_time") or game.get("start_time_utc") or "",
            "home_team": home.get("full_name") or home.get("name") or "",
            "away_team": away.get("full_name") or away.get("name") or "",
            "source": "actionnetwork",
            "moneyline": None,
            "spread": None,
            "total": None,
        }

        pinnacle_odds = _find_actionnetwork_pinnacle_odds(game.get("odds"))
        if not pinnacle_odds:
            return result

        ml_home = _safe_int(pinnacle_odds.get("ml_home"))
        ml_away = _safe_int(pinnacle_odds.get("ml_away"))
        if ml_home is not None and ml_away is not None:
            result["moneyline"] = {"home": ml_home, "away": ml_away}

        spread_home = _safe_float(pinnacle_odds.get("spread_home"))
        spread_away = _safe_float(pinnacle_odds.get("spread_away"))
        spread_home_line = _safe_int(pinnacle_odds.get("spread_home_line"))
        spread_away_line = _safe_int(pinnacle_odds.get("spread_away_line"))
        if spread_home is not None or spread_away is not None:
            result["spread"] = {
                "home": spread_home,
                "home_odds": spread_home_line,
                "away": spread_away,
                "away_odds": spread_away_line,
            }

        total_line = _safe_float(pinnacle_odds.get("total"))
        over = _safe_int(pinnacle_odds.get("over"))
        under = _safe_int(pinnacle_odds.get("under"))
        if total_line is not None:
            result["total"] = {
                "line": total_line,
                "over": over,
                "under": under,
            }

        return result
    except Exception as error:  # pragma: no cover
        log.warning("ActionNetwork parse error: %s", error)
        return None


def _extract_json_array(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("items", "data", "matchups", "markets"):
            candidate = payload.get(key)
            if isinstance(candidate, list):
                return [item for item in candidate if isinstance(item, dict)]
    return []


def _decimal_to_american(decimal_odds: float | None) -> int | None:
    if decimal_odds is None or decimal_odds <= 1:
        return None
    if decimal_odds >= 2:
        return int(round((decimal_odds - 1) * 100))
    return int(round(-100 / (decimal_odds - 1)))


def _parse_pinnacle_feed(
    matchups_payload: Any,
    markets_payload: Any,
) -> list[dict[str, Any]]:
    matchups = _extract_json_array(matchups_payload)
    markets = _extract_json_array(markets_payload)
    odds_by_matchup: dict[int, dict[str, Any]] = {}

    for market in markets:
        matchup_id = market.get("matchupId")
        if not isinstance(matchup_id, int):
            continue

        market_type = str(market.get("type") or "").lower()
        period = market.get("period")
        if period != 0:
            continue

        prices = market.get("prices", [])
        if not isinstance(prices, list):
            continue

        bucket = odds_by_matchup.setdefault(matchup_id, {})
        if market_type == "moneyline":
            home_price = next((price for price in prices if price.get("designation") == "home"), None)
            away_price = next((price for price in prices if price.get("designation") == "away"), None)
            if home_price and away_price:
                bucket["moneyline"] = {
                    "home": _decimal_to_american(_safe_float(home_price.get("price"))),
                    "away": _decimal_to_american(_safe_float(away_price.get("price"))),
                }
        elif market_type == "spread":
            home_price = next((price for price in prices if price.get("designation") == "home"), None)
            away_price = next((price for price in prices if price.get("designation") == "away"), None)
            if home_price and away_price:
                bucket["spread"] = {
                    "home": _safe_float(home_price.get("points")),
                    "home_odds": _decimal_to_american(_safe_float(home_price.get("price"))),
                    "away": _safe_float(away_price.get("points")),
                    "away_odds": _decimal_to_american(_safe_float(away_price.get("price"))),
                }
        elif market_type == "total":
            over_price = next((price for price in prices if price.get("designation") == "over"), None)
            under_price = next((price for price in prices if price.get("designation") == "under"), None)
            if over_price and under_price:
                bucket["total"] = {
                    "line": _safe_float(over_price.get("points")),
                    "over": _decimal_to_american(_safe_float(over_price.get("price"))),
                    "under": _decimal_to_american(_safe_float(under_price.get("price"))),
                }

    games: list[dict[str, Any]] = []
    for matchup in matchups:
        if matchup.get("type") != "matchup":
            continue

        matchup_id = matchup.get("id")
        if not isinstance(matchup_id, int):
            continue

        participants = matchup.get("participants", [])
        if not isinstance(participants, list) or len(participants) < 2:
            continue

        home = next(
            (participant for participant in participants if participant.get("alignment") == "home"),
            participants[1],
        )
        away = next(
            (participant for participant in participants if participant.get("alignment") == "away"),
            participants[0],
        )

        game = {
            "game_id": f"pinnacle_{matchup_id}",
            "commence_time": matchup.get("startTime") or "",
            "home_team": home.get("name", ""),
            "away_team": away.get("name", ""),
            "source": "pinnacle_direct",
            "moneyline": odds_by_matchup.get(matchup_id, {}).get("moneyline"),
            "spread": odds_by_matchup.get(matchup_id, {}).get("spread"),
            "total": odds_by_matchup.get(matchup_id, {}).get("total"),
        }
        if _has_any_market(game):
            games.append(game)

    log.info("Pinnacle direct parsed %s MLB games", len(games))
    return games


def _fetch_pinnacle_selenium() -> list[dict[str, Any]]:
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
    except ImportError:
        log.error("Selenium is not installed for Pinnacle fallback")
        return []

    try:
        log.info("Launching Selenium fallback for Pinnacle MLB odds...")
        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1920,1080")
        options.add_argument(
            "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
        options.set_capability("goog:loggingPrefs", {"performance": "ALL"})

        driver = webdriver.Chrome(options=options)
        matchups_payload: Any = None
        markets_payload: Any = None

        try:
            driver.execute_cdp_cmd("Network.enable", {})
            driver.get(PINNACLE_MLB_URL)
            time.sleep(5)

            for entry in driver.get_log("performance"):
                message = json.loads(entry["message"]).get("message", {})
                if message.get("method") != "Network.responseReceived":
                    continue

                params = message.get("params", {})
                response = params.get("response", {})
                request_id = params.get("requestId")
                url = str(response.get("url") or "")
                if not request_id or not url:
                    continue

                if "matchups" in url and "leagues/246" in url and matchups_payload is None:
                    try:
                        body = driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": request_id})
                        matchups_payload = json.loads(body["body"])
                    except Exception:
                        pass

                if "markets/straight" in url and "leagues/246" in url and markets_payload is None:
                    try:
                        body = driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": request_id})
                        markets_payload = json.loads(body["body"])
                    except Exception:
                        pass

            if matchups_payload and markets_payload:
                return _parse_pinnacle_feed(matchups_payload, markets_payload)

            log.warning("Selenium fallback could not capture Pinnacle MLB XHR responses")
            return []
        finally:
            driver.quit()
    except Exception as error:  # pragma: no cover
        log.error("Selenium Pinnacle fallback failed: %s", error)
        return []


def _run_source_fetch(
    source: str,
    fetcher: Any,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    diagnostic = _empty_source_diagnostic(source)
    started = time.monotonic()
    diagnostic["attempted"] = True
    diagnostic["fetched_at"] = _utc_now()
    try:
        games = fetcher()
        diagnostic["ok"] = True
        diagnostic["game_count"] = len(games)
        return games, diagnostic
    except Exception as error:  # pragma: no cover
        diagnostic["error"] = str(error)
        log.warning("%s failed: %s", source, error)
        return [], diagnostic
    finally:
        diagnostic["duration_ms"] = int(round((time.monotonic() - started) * 1000))


def fetch_from_actionnetwork() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    def _fetch() -> list[dict[str, Any]]:
        if requests is None:
            raise _requests_unavailable_error()
        log.info("Trying ActionNetwork for Pinnacle MLB odds...")
        response = requests.get(AN_MLB_URL, headers=AN_HEADERS, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        data = response.json()

        games_raw = data.get("games", data) if isinstance(data, dict) else data
        if not isinstance(games_raw, list):
            raise RuntimeError("ActionNetwork returned an unexpected response shape")

        games = [
            parsed
            for parsed in (_parse_an_odds(game) for game in games_raw)
            if parsed and _has_any_market(parsed)
        ]
        log.info("ActionNetwork parsed %s Pinnacle MLB games", len(games))
        return games

    try:
        return _run_source_fetch("actionnetwork", _fetch)
    except json.JSONDecodeError as error:  # pragma: no cover
        diagnostic = _empty_source_diagnostic("actionnetwork")
        diagnostic["attempted"] = True
        diagnostic["fetched_at"] = _utc_now()
        diagnostic["error"] = f"JSON decode error: {error}"
        diagnostic["duration_ms"] = 0
        return [], diagnostic


def fetch_from_pinnacle_direct() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    def _fetch() -> list[dict[str, Any]]:
        if requests is None:
            raise _requests_unavailable_error()
        log.info("Trying Pinnacle guest API for MLB odds...")
        try:
            matchups_response = requests.get(
                PINNACLE_FEED_URL,
                headers=PINNACLE_HEADERS,
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            matchups_response.raise_for_status()
            matchups_payload = matchups_response.json()

            markets_response = requests.get(
                PINNACLE_ODDS_URL,
                headers=PINNACLE_HEADERS,
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            markets_response.raise_for_status()
            markets_payload = markets_response.json()

            return _parse_pinnacle_feed(matchups_payload, markets_payload)
        except Exception as error:
            log.warning("Pinnacle guest API failed (%s); trying Selenium fallback...", error)
            return _fetch_pinnacle_selenium()

    return _run_source_fetch("pinnacle_direct", _fetch)


def _get_cached_snapshot(source: str) -> dict[str, Any] | None:
    with _CACHE_LOCK:
        cached = _SNAPSHOT_CACHE.get(source)
        if not cached:
            return None
        if cached["expires_at_epoch"] <= time.time():
            _SNAPSHOT_CACHE.pop(source, None)
            return None
        snapshot = dict(cached["snapshot"])
        snapshot["cache"] = {
            "hit": True,
            "ttl_seconds": PINNACLE_CACHE_SECONDS,
            "expires_at": _safe_iso_timestamp(cached["expires_at_epoch"]),
        }
        return snapshot


def _set_cached_snapshot(source: str, snapshot: dict[str, Any]) -> dict[str, Any]:
    expires_at_epoch = time.time() + PINNACLE_CACHE_SECONDS
    stored = dict(snapshot)
    stored["cache"] = {
        "hit": False,
        "ttl_seconds": PINNACLE_CACHE_SECONDS,
        "expires_at": _safe_iso_timestamp(expires_at_epoch),
    }
    with _CACHE_LOCK:
        _SNAPSHOT_CACHE[source] = {
            "expires_at_epoch": expires_at_epoch,
            "snapshot": stored,
        }
    return stored


def get_pinnacle_mlb_snapshot(source: str = "auto") -> dict[str, Any]:
    normalized_source = (source or "auto").strip().lower()
    if normalized_source not in {"auto", "actionnetwork", "pinnacle_direct"}:
        raise ValueError("source must be one of: auto, actionnetwork, pinnacle_direct")

    cached = _get_cached_snapshot(normalized_source)
    if cached:
        return cached

    diagnostics = {
        "actionnetwork": _empty_source_diagnostic("actionnetwork"),
        "pinnacle_direct": _empty_source_diagnostic("pinnacle_direct"),
    }
    resolved_source: str | None = None
    games: list[dict[str, Any]] = []

    if normalized_source in {"auto", "actionnetwork"}:
        games, actionnetwork_diagnostic = fetch_from_actionnetwork()
        diagnostics["actionnetwork"] = actionnetwork_diagnostic
        if games or normalized_source == "actionnetwork":
            resolved_source = "actionnetwork" if games else None

    if not games and normalized_source in {"auto", "pinnacle_direct"}:
        games, pinnacle_diagnostic = fetch_from_pinnacle_direct()
        diagnostics["pinnacle_direct"] = pinnacle_diagnostic
        if games:
            resolved_source = "pinnacle_direct"

    snapshot = {
        "configured": True,
        "generated_at": _utc_now(),
        "requested_source": normalized_source,
        "resolved_source": resolved_source,
        "game_count": len(games),
        "games": games,
        "diagnostics": diagnostics,
        "message": None
        if games
        else "No Pinnacle MLB games were returned from ActionNetwork or the direct Pinnacle fallback.",
    }
    return _set_cached_snapshot(normalized_source, snapshot)


def american_to_implied(american: int) -> float:
    if american > 0:
        return 100 / (american + 100)
    return abs(american) / (abs(american) + 100)


def strip_vig(prob_home: float, prob_away: float) -> tuple[float, float]:
    total = prob_home + prob_away
    if total <= 0:
        return prob_home, prob_away
    return prob_home / total, prob_away / total


def calculate_ev(true_prob: float, your_odds: int) -> float:
    if your_odds > 0:
        profit = your_odds / 100
    else:
        profit = 100 / abs(your_odds)
    return round((true_prob * profit - (1 - true_prob)) * 100, 2)


def get_ev_vs_pinnacle(
    pinnacle_home_ml: int,
    pinnacle_away_ml: int,
    your_home_ml: int | None = None,
    your_away_ml: int | None = None,
) -> dict[str, float]:
    pin_home_prob = american_to_implied(pinnacle_home_ml)
    pin_away_prob = american_to_implied(pinnacle_away_ml)
    true_home, true_away = strip_vig(pin_home_prob, pin_away_prob)

    result: dict[str, float] = {
        "true_home_prob": round(true_home, 4),
        "true_away_prob": round(true_away, 4),
    }
    if your_home_ml is not None:
        result["home_ev_pct"] = calculate_ev(true_home, your_home_ml)
    if your_away_ml is not None:
        result["away_ev_pct"] = calculate_ev(true_away, your_away_ml)
    return result


def get_pinnacle_mlb_odds(source: str = "auto") -> list[dict[str, Any]]:
    return list(get_pinnacle_mlb_snapshot(source=source).get("games") or [])


if __name__ == "__main__":
    snapshot = get_pinnacle_mlb_snapshot()
    games = snapshot["games"]
    if not games:
        print("No games found.")
        print(snapshot["message"])
    else:
        print("=" * 60)
        print(
            "  Pinnacle MLB Lines - "
            f"{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
        )
        print(f"  Source: {snapshot['resolved_source']}  |  Games: {len(games)}")
        print("=" * 60)
        print()

        for game in games:
            print(f"{game['away_team']} @ {game['home_team']}")
            print(f"  Start:     {game['commence_time']}")

            if game["moneyline"]:
                moneyline = game["moneyline"]
                print(
                    "  ML:        "
                    f"{game['away_team']} {moneyline['away']:+d}  |  "
                    f"{game['home_team']} {moneyline['home']:+d}"
                )
                ev = get_ev_vs_pinnacle(moneyline["home"], moneyline["away"])
                print(
                    "  True prob: "
                    f"Home {ev['true_home_prob']:.1%}  Away {ev['true_away_prob']:.1%}"
                )

            if game["spread"]:
                spread = game["spread"]
                home_points = spread.get("home")
                home_odds = spread.get("home_odds")
                if home_points is not None and home_odds is not None:
                    print(
                        "  Spread:    "
                        f"{game['home_team']} {home_points:+.1f} ({home_odds:+d})"
                    )

            if game["total"]:
                total = game["total"]
                line = total.get("line")
                over = total.get("over")
                under = total.get("under")
                if line is not None and over is not None and under is not None:
                    print(f"  Total:     O/U {line}  Over {over:+d}  Under {under:+d}")

            print()
