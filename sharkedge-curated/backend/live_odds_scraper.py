from __future__ import annotations

import csv
import json
import logging
import os
import random
import re
import signal
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import requests
from requests.adapters import HTTPAdapter
from selenium import webdriver
from selenium.common.exceptions import NoSuchElementException, TimeoutException, WebDriverException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from urllib3.util.retry import Retry

SPORT_CONFIG = {
    "basketball": "https://www.flashscore.com/basketball/",
    "baseball": "https://www.flashscore.com/baseball/",
    "hockey": "https://www.flashscore.com/hockey/",
    "american-football": "https://www.flashscore.com/american-football/",
    "ufc": "https://www.flashscore.com/ufc/",
    "boxing": "https://www.flashscore.com/boxing/",
}
SPORT_KEY_HINTS = {
    ("basketball", "nba"): "basketball_nba",
    ("basketball", "ncaab"): "basketball_ncaab",
    ("basketball", "ncaa men s basketball"): "basketball_ncaab",
    ("baseball", "mlb"): "baseball_mlb",
    ("hockey", "nhl"): "icehockey_nhl",
    ("american football", "nfl"): "americanfootball_nfl",
    ("american football", "ncaaf"): "americanfootball_ncaaf",
    ("american football", "college football"): "americanfootball_ncaaf",
}
SELECTORS = {
    "event_cards": "div.event__match, div[class*='event__match']",
    "event_stage": "div.event__stage--block, div.event__time, div[class*='event__stage']",
    "home_team": "div.event__participant--home, .event__participant--home",
    "away_team": "div.event__participant--away, .event__participant--away",
    "tournament_headers": "div.event__title, div.leagueHeader__title, div.sportName, div[class*='tournament']",
    "bookmaker_rows": "div.ui-table__row, div.oddsRow, div[class*='oddsRow']",
    "book_name": "img[alt], div.ui-table__cell img[alt], div[class*='bookmaker'] img[alt]",
    "odds_cells": "a.oddsCell__odd, div.oddsCell__odd, a[class*='oddsCell__odd'], div[class*='oddsCell__odd']",
    "line_cell": "span.oddsCell__noOddsCell, div.oddsCell__noOddsCell, span[class*='noOddsCell']",
    "cookie_accept": "button#onetrust-accept-btn-handler, button[id*='accept'], button[class*='accept']",
}
DS_HOSTS = ["1.ds.flashscore.com", "2.ds.flashscore.com", "3.ds.flashscore.com"]
SCRAPER_BOOK_NAME = "flashscore_best"
LIVE_JSON_PATH = "live_odds.json"
LINE_MOVEMENT_CSV_PATH = "line_movement.csv"

SPORTS_TO_SCRAPE = [
    sport.strip().lower()
    for sport in os.getenv(
        "SPORTS_TO_SCRAPE",
        "basketball,baseball,hockey,american-football,ufc,boxing",
    ).split(",")
    if sport.strip()
]
HEADLESS = os.getenv("HEADLESS", "true").lower() == "true"
POLL_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL_SECONDS", "60"))
MAX_EVENTS_PER_SPORT = max(1, int(os.getenv("MAX_EVENTS_PER_SPORT", "20")))
RUN_ONCE = os.getenv("RUN_ONCE", "false").lower() == "true"
PROXY_URL = os.getenv("PROXY_URL", "").strip() or None
SHARKEDGE_INGEST_URL = os.getenv(
    "SHARKEDGE_INGEST_URL",
    "https://sharkedge.vercel.app/api/ingest-odds",
)
SHARKEDGE_API_KEY = os.getenv("SHARKEDGE_API_KEY", "").strip()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    handlers=[logging.FileHandler("live_odds_scraper.log"), logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


def normalize_text_token(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text.lower().strip())).strip()


def parse_sport_filters() -> dict[str, list[str]]:
    raw_filters = os.getenv("SPORTS_FILTERS", "").strip()
    filters: dict[str, list[str]] = {}
    for part in raw_filters.split(","):
        if ":" not in part:
            continue
        sport_key, filter_str = part.split(":", 1)
        tokens = [
            normalize_text_token(item)
            for item in filter_str.replace("|", ",").split(",")
            if item.strip()
        ]
        if tokens and sport_key.strip().lower() in SPORT_CONFIG:
            filters[sport_key.strip().lower()] = tokens
    return filters


SPORT_FILTERS = parse_sport_filters()


def build_http_session() -> requests.Session:
    session = requests.Session()
    if PROXY_URL:
        session.proxies.update({"http": PROXY_URL, "https": PROXY_URL})
    retries = Retry(total=3, backoff_factor=0.5, status_forcelist=[429, 500, 502, 503, 504])
    adapter = HTTPAdapter(max_retries=retries)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_feed_url(match_id: str) -> str:
    return f"https://{random.choice(DS_HOSTS)}/dm/feed/st_{match_id}_en_1"


def fast_scrape_odds(session: requests.Session, match_id: str) -> Optional[str]:
    url = build_feed_url(match_id)
    headers = {"Referer": "https://www.flashscore.com/", "X-Requested-With": "XMLHttpRequest"}
    for attempt in range(3):
        try:
            response = session.get(url, headers=headers, timeout=10)
            if response.status_code == 200 and response.text:
                return response.text
        except Exception:
            pass
        time.sleep(1.5 * (attempt + 1))
    return None


def sync_selenium_to_requests(driver: WebDriver) -> requests.Session:
    session = build_http_session()
    session.headers.update(
        {
            "User-Agent": driver.execute_script("return navigator.userAgent"),
            "Accept": "*/*",
            "Connection": "keep-alive",
        }
    )
    for cookie in driver.get_cookies():
        session.cookies.set(cookie["name"], cookie["value"], domain=cookie.get("domain"), path=cookie.get("path", "/"))
    return session


def should_keep_league(sport: str, league: str) -> bool:
    filters = SPORT_FILTERS.get(sport)
    if not filters:
        return True
    league_token = normalize_text_token(league or "")
    return any(token in league_token for token in filters)


def normalize_backend_sport_key(sport: str, league: str) -> Optional[str]:
    return SPORT_KEY_HINTS.get((normalize_text_token(sport).replace("-", " "), normalize_text_token(league)))


def parse_decimal(raw: Optional[str]) -> Optional[float]:
    cleaned = re.sub(r"[^\d+.\-]", "", raw or "").strip()
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def try_accept_cookies(driver: WebDriver) -> None:
    try:
        WebDriverWait(driver, 8).until(EC.element_to_be_clickable((By.CSS_SELECTOR, SELECTORS["cookie_accept"]))).click()
    except Exception:
        pass


def parse_commence_time(stage_text: Optional[str]) -> Optional[str]:
    if not stage_text:
        return None
    lowered = stage_text.lower()
    if any(token in lowered for token in ("finished", "final", "postponed", "cancelled", "live", "quarter", "period", "set", "round")):
        return None
    match = re.search(r"\b(\d{1,2}):(\d{2})\b", stage_text)
    if not match:
        return None
    hour, minute = map(int, match.groups())
    now = datetime.now(timezone.utc)
    candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if candidate < now - timedelta(minutes=5):
        candidate += timedelta(days=1)
    return candidate.isoformat()


def first_text(parent: Any, selectors: str) -> Optional[str]:
    for selector in [item.strip() for item in selectors.split(",") if item.strip()]:
        try:
            text = parent.find_element(By.CSS_SELECTOR, selector).text.strip()
            if text:
                return text
        except NoSuchElementException:
            continue
    return None


def extract_match_id(card: Any) -> Optional[str]:
    raw_id = card.get_attribute("id") or ""
    return raw_id.split("_")[-1] if "_" in raw_id else None


def parse_market(driver: WebDriver, url: str, market_type: str) -> dict[str, Any]:
    try:
        driver.get(url)
        WebDriverWait(driver, 12).until(EC.presence_of_all_elements_located((By.CSS_SELECTOR, SELECTORS["bookmaker_rows"])))
    except TimeoutException:
        return {"line": None, "left": None, "right": None, "left_book": None, "right_book": None}

    rows = driver.find_elements(By.CSS_SELECTOR, SELECTORS["bookmaker_rows"])
    parsed_rows: list[dict[str, Any]] = []
    for row in rows:
        try:
            odds_cells = row.find_elements(By.CSS_SELECTOR, SELECTORS["odds_cells"])
            values = [parse_decimal(cell.text) for cell in odds_cells if cell.text.strip()]
            values = [value for value in values if value is not None]
            if len(values) < 2:
                continue
            line = parse_decimal(first_text(row, SELECTORS["line_cell"]))
            if market_type in {"spread", "total"} and line is None:
                continue
            book = None
            try:
                book = row.find_element(By.CSS_SELECTOR, SELECTORS["book_name"]).get_attribute("alt")
            except NoSuchElementException:
                pass
            parsed_rows.append({"book": book, "line": line, "values": values})
        except Exception:
            continue

    if market_type == "moneyline":
        best = {"line": None, "left": None, "right": None, "left_book": None, "right_book": None, "draw": None, "draw_book": None}
        for row in parsed_rows:
            values = row["values"]
            if values[0] and (best["left"] is None or values[0] > best["left"]):
                best["left"], best["left_book"] = values[0], row["book"]
            if len(values) >= 3:
                if best["draw"] is None or values[1] > best["draw"]:
                    best["draw"], best["draw_book"] = values[1], row["book"]
                away_index = 2
            else:
                away_index = 1
            if values[away_index] and (best["right"] is None or values[away_index] > best["right"]):
                best["right"], best["right_book"] = values[away_index], row["book"]
        return best

    consensus_counts: dict[float, int] = {}
    for row in parsed_rows:
        consensus_counts[row["line"]] = consensus_counts.get(row["line"], 0) + 1
    if not consensus_counts:
        return {"line": None, "left": None, "right": None, "left_book": None, "right_book": None}
    consensus_line = max(consensus_counts.items(), key=lambda item: item[1])[0]
    best = {"line": consensus_line, "left": None, "right": None, "left_book": None, "right_book": None}
    for row in parsed_rows:
        if row["line"] != consensus_line:
            continue
        if best["left"] is None or row["values"][0] > best["left"]:
            best["left"], best["left_book"] = row["values"][0], row["book"]
        if best["right"] is None or row["values"][1] > best["right"]:
            best["right"], best["right_book"] = row["values"][1], row["book"]
    return best


def build_payload(event: dict[str, Any], include_source_meta: bool = True) -> dict[str, Any]:
    payload = {
        "sport": event["sport"],
        "sportKey": event.get("sport_key"),
        "eventKey": event["event_key"],
        "homeTeam": event["home_team"],
        "awayTeam": event["away_team"],
        "commenceTime": event.get("commence_time") or event["scraped_at"],
        "scrapedAt": event["last_seen_utc"],
        "source": "scraper",
        "lines": [
            {
                "book": SCRAPER_BOOK_NAME,
                "fetchedAt": event["last_seen_utc"],
                "odds": {
                    "homeMoneyline": event.get("moneyline_home"),
                    "awayMoneyline": event.get("moneyline_away"),
                    "homeSpread": event.get("spread"),
                    "homeSpreadOdds": event.get("spread_odds_home"),
                    "awaySpreadOdds": event.get("spread_odds_away"),
                    "total": event.get("total"),
                    "overOdds": event.get("over_odds"),
                    "underOdds": event.get("under_odds"),
                },
            }
        ],
    }
    if include_source_meta:
        payload["sourceMeta"] = {
            "league": event["league"],
            "moneylineHomeBook": event.get("moneyline_home_book"),
            "moneylineAwayBook": event.get("moneyline_away_book"),
            "spreadHomeBook": event.get("spread_home_book"),
            "spreadAwayBook": event.get("spread_away_book"),
            "overBook": event.get("over_book"),
            "underBook": event.get("under_book"),
        }
    return payload


def post_to_sharkedge(session: requests.Session, event: dict[str, Any]) -> bool:
    if not SHARKEDGE_API_KEY:
        logger.warning("SHARKEDGE_API_KEY not set; skipping ingest")
        return False

    payloads = [build_payload(event, include_source_meta=True), build_payload(event, include_source_meta=False)]
    for payload in payloads:
        try:
            response = session.post(
                SHARKEDGE_INGEST_URL,
                json=payload,
                headers={"Content-Type": "application/json", "x-api-key": SHARKEDGE_API_KEY},
                timeout=12,
            )
            if response.status_code == 200:
                return True
            if response.status_code not in {400, 401, 404, 422}:
                logger.warning("Ingest failed for %s: HTTP %d", event["event_key"], response.status_code)
                return False
        except requests.RequestException as error:
            logger.warning("Ingest exception for %s: %s", event["event_key"], error)
            return False
    return False


def load_snapshot() -> dict[str, dict[str, Any]]:
    if not os.path.exists(LIVE_JSON_PATH):
        return {}
    try:
        with open(LIVE_JSON_PATH, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return {}


def save_snapshot(snapshot: dict[str, dict[str, Any]]) -> None:
    with open(LIVE_JSON_PATH, "w", encoding="utf-8") as handle:
        json.dump(snapshot, handle, indent=2, ensure_ascii=False)


def ensure_csv_header() -> None:
    if os.path.exists(LINE_MOVEMENT_CSV_PATH):
        return
    with open(LINE_MOVEMENT_CSV_PATH, "w", newline="", encoding="utf-8") as handle:
        csv.writer(handle).writerow(["timestamp_utc", "event_key", "field_changed", "old_value", "new_value"])


def log_snapshot_changes(previous: dict[str, dict[str, Any]], current: dict[str, dict[str, Any]]) -> None:
    fields = [
        "moneyline_home",
        "moneyline_away",
        "spread",
        "spread_odds_home",
        "spread_odds_away",
        "total",
        "over_odds",
        "under_odds",
    ]
    with open(LINE_MOVEMENT_CSV_PATH, "a", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        for event_key, event in current.items():
            previous_event = previous.get(event_key, {})
            for field in fields:
                old_value = previous_event.get(field)
                new_value = event.get(field)
                if old_value != new_value:
                    writer.writerow([utc_now_iso(), event_key, field, old_value, new_value])


def scrape_match_list(driver: WebDriver, sport: str, url: str) -> dict[str, dict[str, Any]]:
    driver.get(url)
    try_accept_cookies(driver)
    WebDriverWait(driver, 20).until(EC.presence_of_all_elements_located((By.CSS_SELECTOR, SELECTORS["event_cards"])))

    headers = []
    for header in driver.find_elements(By.CSS_SELECTOR, SELECTORS["tournament_headers"]):
        text = header.text.strip()
        if text:
            headers.append((header.location.get("y", 0), text))
    headers.sort(key=lambda item: item[0])

    results: dict[str, dict[str, Any]] = {}
    dropped = 0
    for card in driver.find_elements(By.CSS_SELECTOR, SELECTORS["event_cards"]):
        match_id = extract_match_id(card)
        home_team = first_text(card, SELECTORS["home_team"])
        away_team = first_text(card, SELECTORS["away_team"])
        if not match_id or not home_team or not away_team:
            continue

        card_y = card.location.get("y", 0)
        league = "Unknown"
        for header_y, label in headers:
            if header_y <= card_y:
                league = label
            else:
                break

        if not should_keep_league(sport, league):
            dropped += 1
            logger.debug("Filtered out %s | sport=%s | league=%s", f"{away_team} @ {home_team}", sport, league)
            continue

        now = utc_now_iso()
        event_key = f"{sport}:{league}:{away_team} @ {home_team}"
        results[event_key] = {
            "event_key": event_key,
            "match_id": match_id,
            "sport": sport,
            "sport_key": normalize_backend_sport_key(sport, league),
            "league": league,
            "home_team": home_team,
            "away_team": away_team,
            "scraped_at": now,
            "last_seen_utc": now,
            "commence_time": parse_commence_time(first_text(card, SELECTORS["event_stage"])),
        }

        if len(results) >= MAX_EVENTS_PER_SPORT:
            break

    logger.info("Scraped %d %s matches (filtered out %d)", len(results), sport.upper(), dropped)
    return results


def enrich_matches_with_odds(driver: WebDriver, browser_session: requests.Session, snapshot: dict[str, dict[str, Any]]) -> None:
    for event in snapshot.values():
        match_id = event["match_id"]
        feed_payload = fast_scrape_odds(browser_session, match_id)
        if not feed_payload:
            logger.debug("Direct feed unavailable for %s", event["event_key"])

        base = f"https://www.flashscore.com/match/{match_id}/#/odds-comparison"
        moneyline = parse_market(driver, f"{base}/1x2/full-time", "moneyline")
        spread = parse_market(driver, f"{base}/asian-handicap/full-time", "spread")
        total = parse_market(driver, f"{base}/over-under/full-time", "total")

        event.update(
            {
                "moneyline_home": moneyline.get("left"),
                "moneyline_away": moneyline.get("right"),
                "moneyline_home_book": moneyline.get("left_book"),
                "moneyline_away_book": moneyline.get("right_book"),
                "moneyline_draw": moneyline.get("draw"),
                "moneyline_draw_book": moneyline.get("draw_book"),
                "spread": spread.get("line"),
                "spread_odds_home": spread.get("left"),
                "spread_odds_away": spread.get("right"),
                "spread_home_book": spread.get("left_book"),
                "spread_away_book": spread.get("right_book"),
                "total": total.get("line"),
                "over_odds": total.get("left"),
                "under_odds": total.get("right"),
                "over_book": total.get("left_book"),
                "under_book": total.get("right_book"),
                "last_seen_utc": utc_now_iso(),
            }
        )


def build_driver() -> WebDriver:
    options = Options()
    if HEADLESS:
        options.add_argument("--headless=new")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1600,1200")
    if PROXY_URL:
        options.add_argument(f"--proxy-server={PROXY_URL}")
    return webdriver.Chrome(options=options)


def run_cycle(driver: WebDriver, ingest_session: requests.Session) -> dict[str, dict[str, Any]]:
    snapshot: dict[str, dict[str, Any]] = {}
    for sport in SPORTS_TO_SCRAPE:
        if sport not in SPORT_CONFIG:
            logger.warning("Unknown sport '%s' - skipping", sport)
            continue
        snapshot.update(scrape_match_list(driver, sport, SPORT_CONFIG[sport]))
    if snapshot:
        enrich_matches_with_odds(driver, sync_selenium_to_requests(driver), snapshot)
        success = sum(1 for event in snapshot.values() if post_to_sharkedge(ingest_session, event))
        logger.info("Posted %d/%d events to SharkEdge", success, len(snapshot))
    return snapshot


def shutdown_handler(signum: int, frame: Any) -> None:
    logger.info("Received shutdown signal. Exiting cleanly.")
    sys.exit(0)


def main() -> None:
    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)
    ensure_csv_header()
    previous_snapshot = load_snapshot()
    ingest_session = build_http_session()
    driver: Optional[WebDriver] = None

    try:
        driver = build_driver()
        while True:
            started_at = time.time()
            try:
                current_snapshot = run_cycle(driver, ingest_session)
                if current_snapshot:
                    log_snapshot_changes(previous_snapshot, current_snapshot)
                    save_snapshot(current_snapshot)
                    previous_snapshot = current_snapshot
                else:
                    logger.warning("No events this cycle")
            except (TimeoutException, WebDriverException) as error:
                logger.error("Browser error: %s - rebuilding driver", error)
                if driver:
                    try:
                        driver.quit()
                    except Exception:
                        pass
                time.sleep(5)
                driver = build_driver()
            except Exception as error:
                logger.exception("Unexpected error: %s", error)

            if RUN_ONCE:
                logger.info("RUN_ONCE enabled - exiting after single cycle")
                break

            elapsed = time.time() - started_at
            time.sleep(max(0, POLL_INTERVAL_SECONDS - elapsed))
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass


if __name__ == "__main__":
    main()
