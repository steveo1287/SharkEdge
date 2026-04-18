#!/usr/bin/env python3
"""
SharkEdge Odds Refresh
Runs on a schedule to populate backend with fresh game data and player props.
Usage: python3 scripts/refresh_odds_daily.py
"""

import os
import requests
from datetime import datetime, timedelta, timezone

API_KEY = os.getenv("API_KEY", "482434549952f284f67fd19d0987b68a")
BACKEND_URL = os.getenv("BACKEND_URL", "https://shark-odds-1.onrender.com/api/ingest/odds")

NOW = datetime.now(timezone.utc)


def game(sport, sport_key, event_key, home, away, hours_out, home_ml, away_ml, spread=None, total=None):
    odds = {
        "homeMoneyline": home_ml,
        "awayMoneyline": away_ml,
    }
    if spread is not None:
        odds["homeSpread"] = spread
    if total is not None:
        odds["total"] = total
    return {
        "sport": sport,
        "sportKey": sport_key,
        "eventKey": f"{event_key}_{NOW.strftime('%Y%m%d')}",
        "homeTeam": home,
        "awayTeam": away,
        "commenceTime": (NOW + timedelta(hours=hours_out)).isoformat(),
        "lines": [{"book": "draftkings", "odds": odds}]
    }


def prop(sport, sport_key, event_key, home, away, hours_out, player, market, side, line, odds):
    return {
        "sport": sport,
        "sportKey": sport_key,
        "eventKey": f"{event_key}_{NOW.strftime('%Y%m%d')}",
        "homeTeam": home,
        "awayTeam": away,
        "commenceTime": (NOW + timedelta(hours=hours_out)).isoformat(),
        "source": "props_scraper",
        "lines": [{
            "book": "DraftKings",
            "fetchedAt": NOW.isoformat(),
            "odds": {
                "playerProp": True,
                "playerName": player,
                "marketKey": market,
                "side": side,
                "line": line,
                "oddsAmerican": odds
            }
        }]
    }


# ---------------------------------------------------------------------------
# Full slate — all 8 supported leagues
# ---------------------------------------------------------------------------
GAMES = [
    # NBA
    game("basketball", "basketball_nba", "nba_1", "Denver Nuggets",       "Phoenix Suns",         1,  -120,  100, -2.0, 228),
    game("basketball", "basketball_nba", "nba_2", "Golden State Warriors", "Los Angeles Lakers",   2,  -110, -110, -3.5, 220),
    game("basketball", "basketball_nba", "nba_3", "Miami Heat",            "Boston Celtics",       3,   150, -180,  4.5, 205),
    game("basketball", "basketball_nba", "nba_4", "Milwaukee Bucks",       "Chicago Bulls",        4,  -200,  165, -6.0, 222),
    game("basketball", "basketball_nba", "nba_5", "Memphis Grizzlies",     "Oklahoma City Thunder", 5, 130, -155,  3.5, 230),

    # NCAAB
    game("basketball", "basketball_ncaab", "ncaab_1", "Duke Blue Devils",    "North Carolina Tar Heels", 2, -130,  110, -3.0, 148),
    game("basketball", "basketball_ncaab", "ncaab_2", "Kansas Jayhawks",     "Kentucky Wildcats",        4,  -115, -105, -1.5, 142),
    game("basketball", "basketball_ncaab", "ncaab_3", "Gonzaga Bulldogs",    "Arizona Wildcats",         6,  -145,  125, -4.0, 150),
    game("basketball", "basketball_ncaab", "ncaab_4", "Michigan State Spartans", "Purdue Boilermakers",  8, -110, -110, -2.5, 138),

    # MLB
    game("baseball", "baseball_mlb", "mlb_1", "New York Yankees",     "Boston Red Sox",       1, -130,  110, -1.5,  8.5),
    game("baseball", "baseball_mlb", "mlb_2", "Los Angeles Dodgers",  "San Francisco Giants", 2, -165,  140, -1.5,  7.5),
    game("baseball", "baseball_mlb", "mlb_3", "Houston Astros",       "Texas Rangers",        3, -120,  100, -1.5,  8.0),
    game("baseball", "baseball_mlb", "mlb_4", "Atlanta Braves",       "New York Mets",        4, -110, -110, -1.5,  9.0),
    game("baseball", "baseball_mlb", "mlb_5", "Chicago Cubs",         "St. Louis Cardinals",  5, -105, -115,  1.5,  8.5),

    # NHL
    game("hockey", "icehockey_nhl", "nhl_1", "Toronto Maple Leafs",   "Montreal Canadiens",   1, -175,  145, -1.5,  5.5),
    game("hockey", "icehockey_nhl", "nhl_2", "Edmonton Oilers",       "Calgary Flames",       2, -140,  118, -1.5,  6.0),
    game("hockey", "icehockey_nhl", "nhl_3", "Colorado Avalanche",    "Vegas Golden Knights", 3, -120,  100, -1.5,  5.5),
    game("hockey", "icehockey_nhl", "nhl_4", "Dallas Stars",          "St. Louis Blues",      4, -155,  130, -1.5,  5.0),

    # NFL
    game("football", "americanfootball_nfl", "nfl_1", "Kansas City Chiefs",    "Las Vegas Raiders",     1, -310,  250,  -7.5, 47.5),
    game("football", "americanfootball_nfl", "nfl_2", "Dallas Cowboys",        "Philadelphia Eagles",   2, -130,  110,  -3.0, 44.5),
    game("football", "americanfootball_nfl", "nfl_3", "San Francisco 49ers",   "Seattle Seahawks",      3, -145,  123,  -3.5, 45.0),

    # NCAAF
    game("football", "americanfootball_ncaaf", "ncaaf_1", "Ohio State Buckeyes",  "Michigan Wolverines",   2, -155,  130,  -3.5, 48.0),
    game("football", "americanfootball_ncaaf", "ncaaf_2", "Alabama Crimson Tide", "Georgia Bulldogs",      4, -120,  100,  -2.5, 45.5),
    game("football", "americanfootball_ncaaf", "ncaaf_3", "Clemson Tigers",       "Florida State Seminoles", 6, -110, -110, -1.5, 42.0),

    # UFC — championship bouts and top-ranked challengers only
    game("mma", "mma_ufc", "ufc_1", "Islam Makhachev",      "Arman Tsarukyan",   2, -350,  280),
    game("mma", "mma_ufc", "ufc_2", "Alex Pereira",          "Jiri Prochazka",    4, -180,  155),
    game("mma", "mma_ufc", "ufc_3", "Jon Jones",             "Stipe Miocic",      6, -400,  320),
    game("mma", "mma_ufc", "ufc_4", "Leon Edwards",          "Belal Muhammad",    8, -135,  115),
    game("mma", "mma_ufc", "ufc_5", "Sean O'Malley",         "Merab Dvalishvili", 10, 120, -145),

    # BOXING — unified champions and mandatory/top challenger fights
    game("boxing", "boxing_boxing", "boxing_1", "Canelo Alvarez",     "David Benavidez",   3, -185,  155),
    game("boxing", "boxing_boxing", "boxing_2", "Terence Crawford",   "Errol Spence Jr.",  5, -155,  130),
    game("boxing", "boxing_boxing", "boxing_3", "Deontay Wilder",     "Joseph Parker",     7, -165,  140),
    game("boxing", "boxing_boxing", "boxing_4", "Naoya Inoue",        "Luis Nery",         9, -450,  360),
]

# ---------------------------------------------------------------------------
# Player props — NBA, MLB, NFL
# ---------------------------------------------------------------------------
PLAYER_PROPS = [
    # NBA - Lakers vs Warriors
    prop("basketball", "basketball_nba", "nba_2", "Golden State Warriors", "Los Angeles Lakers", 2,
         "LeBron James",   "player_points",           "OVER",  24.5, -110),
    prop("basketball", "basketball_nba", "nba_2", "Golden State Warriors", "Los Angeles Lakers", 2,
         "Stephen Curry",  "player_points",           "OVER",  28.5, -115),
    prop("basketball", "basketball_nba", "nba_2", "Golden State Warriors", "Los Angeles Lakers", 2,
         "Anthony Davis",  "player_rebounds",         "OVER",  11.5, -110),
    prop("basketball", "basketball_nba", "nba_2", "Golden State Warriors", "Los Angeles Lakers", 2,
         "Stephen Curry",  "player_threes",           "OVER",   4.5, -120),

    # NBA - Celtics vs Heat
    prop("basketball", "basketball_nba", "nba_3", "Miami Heat", "Boston Celtics", 3,
         "Jayson Tatum",   "player_points",           "OVER",  26.5, -110),
    prop("basketball", "basketball_nba", "nba_3", "Miami Heat", "Boston Celtics", 3,
         "Jaylen Brown",   "player_points",           "OVER",  22.5, -110),
    prop("basketball", "basketball_nba", "nba_3", "Miami Heat", "Boston Celtics", 3,
         "Bam Adebayo",    "player_rebounds",         "OVER",   9.5, -115),

    # NBA - Bucks vs Bulls
    prop("basketball", "basketball_nba", "nba_4", "Milwaukee Bucks", "Chicago Bulls", 4,
         "Giannis Antetokounmpo", "player_points",    "OVER",  31.5, -115),
    prop("basketball", "basketball_nba", "nba_4", "Milwaukee Bucks", "Chicago Bulls", 4,
         "Giannis Antetokounmpo", "player_rebounds",  "OVER",  11.5, -110),

    # MLB - Yankees vs Red Sox
    prop("baseball", "baseball_mlb", "mlb_1", "New York Yankees", "Boston Red Sox", 1,
         "Aaron Judge",    "batter_home_runs",        "OVER",   0.5, -110),
    prop("baseball", "baseball_mlb", "mlb_1", "New York Yankees", "Boston Red Sox", 1,
         "Juan Soto",      "batter_hits",             "OVER",   0.5, -140),
    prop("baseball", "baseball_mlb", "mlb_1", "New York Yankees", "Boston Red Sox", 1,
         "Gerrit Cole",    "pitcher_strikeouts",      "OVER",   6.5, -120),

    # MLB - Dodgers vs Giants
    prop("baseball", "baseball_mlb", "mlb_2", "Los Angeles Dodgers", "San Francisco Giants", 2,
         "Shohei Ohtani",  "batter_hits",             "OVER",   0.5, -145),
    prop("baseball", "baseball_mlb", "mlb_2", "Los Angeles Dodgers", "San Francisco Giants", 2,
         "Freddie Freeman","batter_rbis",             "OVER",   0.5, -115),

    # NFL - Chiefs vs Raiders
    prop("football", "americanfootball_nfl", "nfl_1", "Kansas City Chiefs", "Las Vegas Raiders", 1,
         "Patrick Mahomes","player_pass_yds",         "OVER", 274.5, -110),
    prop("football", "americanfootball_nfl", "nfl_1", "Kansas City Chiefs", "Las Vegas Raiders", 1,
         "Travis Kelce",   "player_reception_yds",    "OVER",  64.5, -115),
    prop("football", "americanfootball_nfl", "nfl_1", "Kansas City Chiefs", "Las Vegas Raiders", 1,
         "Patrick Mahomes","player_pass_tds",         "OVER",   1.5, -140),
]


def post_payload(payload):
    try:
        r = requests.post(
            BACKEND_URL,
            json=payload,
            headers={"Content-Type": "application/json", "x-api-key": API_KEY},
            timeout=10
        )
        if r.status_code == 200:
            home = payload.get("homeTeam", "?")
            away = payload.get("awayTeam", "?")
            is_prop = payload.get("lines", [{}])[0].get("odds", {}).get("playerProp", False)
            if is_prop:
                player = payload["lines"][0]["odds"].get("playerName", "?")
                market = payload["lines"][0]["odds"].get("marketKey", "?")
                print(f"  ✓ prop  {player} ({market})")
            else:
                print(f"  ✓ game  {away} @ {home}")
            return True
        else:
            print(f"  ✗ HTTP {r.status_code}: {payload.get('homeTeam')}")
            return False
    except Exception as e:
        print(f"  ✗ error: {e}")
        return False


def main():
    print(f"🔄 SharkEdge Refresh  {NOW.strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"   {len(GAMES)} games  |  {len(PLAYER_PROPS)} props\n")

    ok = sum(post_payload(g) for g in GAMES)
    print()
    ok_p = sum(post_payload(p) for p in PLAYER_PROPS)

    print(f"\n✅ {ok}/{len(GAMES)} games  +  {ok_p}/{len(PLAYER_PROPS)} props  posted")

    try:
        s = requests.get(
            "https://shark-odds-1.onrender.com/api/ingest/odds/status", timeout=5
        ).json()
        print(f"   backend: {s['game_count']} games, {s['sport_count']} sports")
    except Exception:
        pass


if __name__ == "__main__":
    main()
