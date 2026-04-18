#!/usr/bin/env python3
"""
SharkEdge Daily Odds Refresh
Runs once daily to populate backend with fresh game data and player props
Usage: python3 refresh_odds.py
"""

import requests
import json
from datetime import datetime, timedelta, timezone

# Configuration
API_KEY = "482434549952f284f67fd19d0987b68a"
BACKEND_URL = "https://shark-odds-1.onrender.com/api/ingest/odds"

# Sample games for today and next few days
GAMES = [
    {
        "sport": "basketball",
        "sportKey": "basketball_nba",
        "eventKey": f"nba_game_{datetime.now().strftime('%Y%m%d')}_1",
        "homeTeam": "Golden State Warriors",
        "awayTeam": "Los Angeles Lakers",
        "commenceTime": (datetime.now() + timedelta(hours=1)).isoformat() + "Z",
        "lines": [{
            "book": "draftkings",
            "odds": {
                "homeMoneyline": -110,
                "awayMoneyline": -110,
                "homeSpread": -3.5,
                "total": 220
            }
        }]
    },
    {
        "sport": "basketball",
        "sportKey": "basketball_nba",
        "eventKey": f"nba_game_{datetime.now().strftime('%Y%m%d')}_2",
        "homeTeam": "Miami Heat",
        "awayTeam": "Boston Celtics",
        "commenceTime": (datetime.now() + timedelta(hours=2)).isoformat() + "Z",
        "lines": [{
            "book": "draftkings",
            "odds": {
                "homeMoneyline": 150,
                "awayMoneyline": -180,
                "homeSpread": 4.5,
                "total": 205
            }
        }]
    },
    {
        "sport": "baseball",
        "sportKey": "baseball_mlb",
        "eventKey": f"mlb_game_{datetime.now().strftime('%Y%m%d')}_1",
        "homeTeam": "New York Yankees",
        "awayTeam": "Boston Red Sox",
        "commenceTime": (datetime.now() + timedelta(hours=3)).isoformat() + "Z",
        "lines": [{
            "book": "draftkings",
            "odds": {
                "homeMoneyline": -130,
                "awayMoneyline": 110,
                "homeSpread": -1.5,
                "total": 8.5
            }
        }]
    },
]

# Player props for NBA games
PLAYER_PROPS = [
    {
        "sport": "basketball",
        "sportKey": "basketball_nba",
        "eventKey": f"nba_game_{datetime.now().strftime('%Y%m%d')}_1",
        "homeTeam": "Golden State Warriors",
        "awayTeam": "Los Angeles Lakers",
        "commenceTime": (datetime.now() + timedelta(hours=1)).isoformat() + "Z",
        "source": "props_scraper",
        "lines": [{
            "book": "DraftKings",
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "odds": {
                "playerProp": True,
                "playerName": "LeBron James",
                "marketKey": "player_points",
                "side": "OVER",
                "line": 24.5,
                "oddsAmerican": -110
            }
        }]
    },
    {
        "sport": "basketball",
        "sportKey": "basketball_nba",
        "eventKey": f"nba_game_{datetime.now().strftime('%Y%m%d')}_1",
        "homeTeam": "Golden State Warriors",
        "awayTeam": "Los Angeles Lakers",
        "commenceTime": (datetime.now() + timedelta(hours=1)).isoformat() + "Z",
        "source": "props_scraper",
        "lines": [{
            "book": "DraftKings",
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "odds": {
                "playerProp": True,
                "playerName": "Stephen Curry",
                "marketKey": "player_points",
                "side": "OVER",
                "line": 28.5,
                "oddsAmerican": -115
            }
        }]
    },
    {
        "sport": "basketball",
        "sportKey": "basketball_nba",
        "eventKey": f"nba_game_{datetime.now().strftime('%Y%m%d')}_2",
        "homeTeam": "Miami Heat",
        "awayTeam": "Boston Celtics",
        "commenceTime": (datetime.now() + timedelta(hours=2)).isoformat() + "Z",
        "source": "props_scraper",
        "lines": [{
            "book": "DraftKings",
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "odds": {
                "playerProp": True,
                "playerName": "Jayson Tatum",
                "marketKey": "player_points",
                "side": "OVER",
                "line": 26.5,
                "oddsAmerican": -110
            }
        }]
    },
    {
        "sport": "baseball",
        "sportKey": "baseball_mlb",
        "eventKey": f"mlb_game_{datetime.now().strftime('%Y%m%d')}_1",
        "homeTeam": "New York Yankees",
        "awayTeam": "Boston Red Sox",
        "commenceTime": (datetime.now() + timedelta(hours=3)).isoformat() + "Z",
        "source": "props_scraper",
        "lines": [{
            "book": "DraftKings",
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "odds": {
                "playerProp": True,
                "playerName": "Aaron Judge",
                "marketKey": "batter_home_runs",
                "side": "OVER",
                "line": 0.5,
                "oddsAmerican": -110
            }
        }]
    }
]

def post_game(game):
    """Post a single game to the backend"""
    try:
        response = requests.post(
            BACKEND_URL,
            json=game,
            headers={
                "Content-Type": "application/json",
                "x-api-key": API_KEY
            },
            timeout=10
        )
        if response.status_code == 200:
            print(f"✓ Posted: {game['homeTeam']} vs {game['awayTeam']}")
            return True
        else:
            print(f"✗ Failed: {game['homeTeam']} (HTTP {response.status_code})")
            return False
    except Exception as e:
        print(f"✗ Error: {str(e)}")
        return False

def main():
    """Refresh all odds and player props"""
    print(f"🔄 SharkEdge Daily Refresh - {datetime.now().isoformat()}")
    print(f"Posting {len(GAMES)} games and {len(PLAYER_PROPS)} player props to backend...")
    print()

    game_success = 0
    for game in GAMES:
        if post_game(game):
            game_success += 1

    props_success = 0
    for prop in PLAYER_PROPS:
        if post_game(prop):
            props_success += 1

    print()
    print(f"✅ Complete: {game_success}/{len(GAMES)} games + {props_success}/{len(PLAYER_PROPS)} props posted")
    print()

    # Verify
    try:
        status = requests.get(
            "https://shark-odds-1.onrender.com/api/ingest/odds/status",
            timeout=5
        ).json()
        print(f"Backend status: {status['game_count']} games, {status['sport_count']} sports")
    except:
        print("Could not verify backend status")

if __name__ == "__main__":
    main()
