#!/bin/bash
set -e

# ============================================================================
# SharkEdge Live Odds Deployment Script
# ============================================================================
#
# Railway-only helper for testing the optional Python live odds scraper.
# SHARKEDGE_INGEST_URL must point to the Railway web service ingest route.
#
# Usage: ./scripts/deploy-live-odds.sh
#

echo "SharkEdge Live Odds Railway Helper"
echo ""

# Check required environment variables
echo "Checking configuration..."

if [ -z "$SHARKEDGE_API_KEY" ]; then
  echo "SHARKEDGE_API_KEY not set"
  echo "Set it with: export SHARKEDGE_API_KEY='your-key'"
  exit 1
fi

if [ -z "$SHARKEDGE_INGEST_URL" ]; then
  echo "SHARKEDGE_INGEST_URL not set"
  echo "Set it to your Railway web ingest route, for example:"
  echo "export SHARKEDGE_INGEST_URL='https://<railway-web-domain>/api/ingest-odds'"
  echo "or inside Railway: export SHARKEDGE_INGEST_URL='http://sharkedge-web:3000/api/ingest-odds'"
  exit 1
fi

echo "SHARKEDGE_API_KEY configured"
echo "SHARKEDGE_INGEST_URL: $SHARKEDGE_INGEST_URL"
echo ""

# Set sensible defaults
export POLL_INTERVAL_SECONDS=${POLL_INTERVAL_SECONDS:-120}
export MAX_EVENTS_PER_SPORT=${MAX_EVENTS_PER_SPORT:-20}
export SPORTS_TO_SCRAPE=${SPORTS_TO_SCRAPE:-basketball,baseball,hockey,american-football,ufc,boxing}
export HEADLESS=${HEADLESS:-true}
export MAX_WORKERS=${MAX_WORKERS:-1}
export CACHE_ENABLED=${CACHE_ENABLED:-true}

echo "Configuration:"
echo "   Polling: Every $POLL_INTERVAL_SECONDS seconds"
echo "   Sports: $SPORTS_TO_SCRAPE"
echo "   Headless: $HEADLESS"
echo "   Parallel workers: $MAX_WORKERS"
echo "   Caching enabled: $CACHE_ENABLED"
echo ""

# Check for Chrome
echo "Checking for Chrome/Chromium..."
if command -v chromium &> /dev/null; then
  export CHROME_BIN=$(which chromium)
  echo "Found Chromium: $CHROME_BIN"
elif command -v google-chrome &> /dev/null; then
  export CHROME_BIN=$(which google-chrome)
  echo "Found Chrome: $CHROME_BIN"
elif command -v chromium-browser &> /dev/null; then
  export CHROME_BIN=$(which chromium-browser)
  echo "Found Chromium Browser: $CHROME_BIN"
else
  echo "Chrome/Chromium not found"
  echo "Install with: apt-get install chromium-browser"
  exit 1
fi
echo ""

# Check Python
echo "Checking Python..."
if ! command -v python3 &> /dev/null; then
  echo "Python 3 not found"
  exit 1
fi
echo "Python: $(python3 --version)"
echo ""

# Install Python dependencies
echo "Installing Python dependencies..."
cd backend
if [ -f requirements.txt ]; then
  pip3 install -q -r requirements.txt 2>/dev/null || {
    echo "Some dependencies may need manual installation"
  }
  echo "Dependencies installed"
else
  echo "No requirements.txt found"
fi
cd ..
echo ""

# Test one cycle
echo "Running test cycle in RUN_ONCE mode..."
echo "This will scrape one cycle and exit."
echo ""

cd backend
RUN_ONCE=true timeout 300 python3 live_odds_scraper_optimized.py 2>&1 | tee /tmp/sharkedge-odds-test.log || true
cd ..

echo ""
echo "Test cycle results:"
if grep -q "Posted" /tmp/sharkedge-odds-test.log; then
  POSTED=$(grep "Posted" /tmp/sharkedge-odds-test.log | wc -l)
  echo "Scraper posted events ($POSTED entries in log)"
elif grep -q "No events" /tmp/sharkedge-odds-test.log; then
  echo "No events found in test cycle. This may be normal off-season."
else
  echo "No posts detected. Check configuration."
  tail -20 /tmp/sharkedge-odds-test.log
  exit 1
fi
echo ""

echo "Railway production note: prefer the dedicated Railway worker service over PM2/nohup/screen."
echo "Use SHARKEDGE_SERVICE_MODE=oddsharvester-worker if keeping this optional scraper online."
echo ""

echo "Done."
