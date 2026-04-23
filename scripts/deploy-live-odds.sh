#!/bin/bash
set -e

# ============================================================================
# SharkEdge Live Odds Deployment Script
# ============================================================================
#
# This script deploys live odds scraper and verifies it's working
#
# Usage: ./scripts/deploy-live-odds.sh
#

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         SharkEdge Live Odds Deployment                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check required environment variables
echo "📋 Checking configuration..."

if [ -z "$SHARKEDGE_API_KEY" ]; then
  echo "❌ SHARKEDGE_API_KEY not set"
  echo "   Set it with: export SHARKEDGE_API_KEY='your-key'"
  exit 1
fi

if [ -z "$SHARKEDGE_INGEST_URL" ]; then
  echo "⚠️  SHARKEDGE_INGEST_URL not set, using default"
  export SHARKEDGE_INGEST_URL="https://sharkedge.vercel.app/api/ingest-odds"
fi

echo "✅ SHARKEDGE_API_KEY configured"
echo "✅ SHARKEDGE_INGEST_URL: $SHARKEDGE_INGEST_URL"
echo ""

# Set sensible defaults
export POLL_INTERVAL_SECONDS=${POLL_INTERVAL_SECONDS:-120}
export MAX_EVENTS_PER_SPORT=${MAX_EVENTS_PER_SPORT:-20}
export SPORTS_TO_SCRAPE=${SPORTS_TO_SCRAPE:-basketball,baseball,hockey,american-football,ufc,boxing}
export HEADLESS=${HEADLESS:-true}
export MAX_WORKERS=${MAX_WORKERS:-1}
export CACHE_ENABLED=${CACHE_ENABLED:-true}

echo "⚙️  Configuration:"
echo "   Polling: Every $POLL_INTERVAL_SECONDS seconds"
echo "   Sports: $SPORTS_TO_SCRAPE"
echo "   Headless: $HEADLESS"
echo "   Parallel workers: $MAX_WORKERS"
echo "   Caching enabled: $CACHE_ENABLED"
echo ""

# Check for Chrome
echo "🔍 Checking for Chrome/Chromium..."
if command -v chromium &> /dev/null; then
  export CHROME_BIN=$(which chromium)
  echo "✅ Found Chromium: $CHROME_BIN"
elif command -v google-chrome &> /dev/null; then
  export CHROME_BIN=$(which google-chrome)
  echo "✅ Found Chrome: $CHROME_BIN"
elif command -v chromium-browser &> /dev/null; then
  export CHROME_BIN=$(which chromium-browser)
  echo "✅ Found Chromium Browser: $CHROME_BIN"
else
  echo "❌ Chrome/Chromium not found"
  echo "   Install with: apt-get install chromium-browser"
  exit 1
fi
echo ""

# Check Python
echo "🔍 Checking Python..."
if ! command -v python3 &> /dev/null; then
  echo "❌ Python 3 not found"
  exit 1
fi
echo "✅ Python: $(python3 --version)"
echo ""

# Install Python dependencies
echo "📦 Installing Python dependencies..."
cd backend
if [ -f requirements.txt ]; then
  pip3 install -q -r requirements.txt 2>/dev/null || {
    echo "⚠️  Some dependencies may need manual installation"
  }
  echo "✅ Dependencies installed"
else
  echo "⚠️  No requirements.txt found"
fi
cd ..
echo ""

# Test one cycle
echo "🧪 Running test cycle (RUN_ONCE mode)..."
echo "   This will scrape one cycle and exit. Should see 'Posted X events' in logs"
echo ""

cd backend
RUN_ONCE=true timeout 300 python3 live_odds_scraper_optimized.py 2>&1 | tee /tmp/sharkedge-odds-test.log || true
cd ..

echo ""
echo "📊 Test cycle results:"
if grep -q "Posted" /tmp/sharkedge-odds-test.log; then
  POSTED=$(grep "Posted" /tmp/sharkedge-odds-test.log | wc -l)
  echo "✅ Scraper posted events ($POSTED entries in log)"
elif grep -q "No events" /tmp/sharkedge-odds-test.log; then
  echo "⚠️  No events found in test cycle (may be off-season)"
else
  echo "❌ No posts detected - check configuration"
  echo "   Last 20 lines of log:"
  tail -20 /tmp/sharkedge-odds-test.log
  exit 1
fi
echo ""

# Start continuous scraper
echo "🚀 Starting live odds scraper..."
echo ""

if command -v pm2 &> /dev/null; then
  echo "   Using PM2 (process manager)"
  cd backend
  pm2 start live_odds_scraper_optimized.py --name sharkedge-odds --interpreter python3
  pm2 save
  cd ..
  echo "✅ Scraper started (pm2 managed)"
  echo ""
  echo "📋 Monitor with: pm2 logs sharkedge-odds"
  echo "🛑 Stop with: pm2 stop sharkedge-odds"
elif command -v nohup &> /dev/null; then
  echo "   Using nohup (no hangup)"
  cd backend
  nohup python3 live_odds_scraper_optimized.py > sharkedge-odds.log 2>&1 &
  SCRAPER_PID=$!
  cd ..
  echo "✅ Scraper started (PID: $SCRAPER_PID)"
  echo ""
  echo "📋 Monitor with: tail -f backend/sharkedge-odds.log"
  echo "🛑 Stop with: kill $SCRAPER_PID"
else
  echo "   Using screen (detached)"
  cd backend
  screen -d -m -S sharkedge-odds python3 live_odds_scraper_optimized.py
  cd ..
  echo "✅ Scraper started in screen session"
  echo ""
  echo "📋 Monitor with: screen -r sharkedge-odds"
  echo "🛑 Stop with: screen -X -S sharkedge-odds kill"
fi
echo ""

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                  ✅ DEPLOYMENT COMPLETE                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "1. Monitor logs to see events being posted"
echo "2. Verify frontend shows odds on NBA/NFL/MLB pages"
echo "3. Optional: Get ODDS_API_KEY for better consolidation"
echo ""
echo "Troubleshooting:"
echo "  - No events posted? Check if sports are in-season"
echo "  - Backend not receiving data? Verify SHARKEDGE_API_KEY and URL"
echo "  - Rate limited (429 errors)? Add PROXY_URL to config"
echo ""
