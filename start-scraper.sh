#!/bin/bash

# SharkEdge Live Odds Scraper - Production Startup Script

set -e

echo "🚀 SharkEdge Live Odds Scraper - STARTING"
echo "=================================================="
echo ""

# Configuration
POLL_INTERVAL=${POLL_INTERVAL_SECONDS:-60}
MIN_DELAY=${MIN_DELAY_SECONDS:-1.0}
MAX_DELAY=${MAX_DELAY_SECONDS:-3.0}
API_KEY=${SHARKEDGE_API_KEY:-$(cat .env 2>/dev/null | grep SHARKEDGE_API_KEY | cut -d'=' -f2 || echo "NOT_SET")}

echo "📋 Configuration:"
echo "  • Poll interval: ${POLL_INTERVAL}s"
echo "  • Delay range: ${MIN_DELAY}s - ${MAX_DELAY}s"
echo "  • API Key: ${API_KEY:0:10}***"
echo "  • Headless mode: true"
echo ""

# Verify dependencies
echo "✓ Checking dependencies..."
python3 -c "import selenium; print('  ✓ Selenium installed')" 2>/dev/null || {
  echo "  ✗ Selenium missing. Installing..."
  pip install selenium requests webdriver-manager -q
}

echo ""
echo "🎯 Starting scraper..."
echo "=================================================="
echo ""

# Start the scraper
cd /home/user/SharkEdge
export SHARKEDGE_API_KEY="$API_KEY"
export POLL_INTERVAL_SECONDS="$POLL_INTERVAL"
export HEADLESS="true"

python3 backend/live_odds_scraper_optimized.py

