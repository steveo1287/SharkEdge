#!/usr/bin/env python3
"""
SharkEdge Daily Odds Refresh
Runs once daily to populate backend with fresh game data
Usage: python3 refresh_odds.py
"""

import requests
import json
from datetime import datetime, timedelta

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
    """Refresh all odds"""
    print(f"🔄 SharkEdge Daily Refresh - {datetime.now().isoformat()}")
    print(f"Posting {len(GAMES)} games to backend...")
    print()

    success = 0
    for game in GAMES:
        if post_game(game):
            success += 1

    print()
    print(f"✅ Complete: {success}/{len(GAMES)} games posted")
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
