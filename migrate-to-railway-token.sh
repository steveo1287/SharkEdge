#!/bin/bash

set -e

if [ -z "$RAILWAY_TOKEN" ]; then
  echo "❌ RAILWAY_TOKEN environment variable is required"
  echo ""
  echo "To get your token:"
  echo "1. Go to https://railway.app/settings/tokens"
  echo "2. Create a new API token"
  echo "3. Run: export RAILWAY_TOKEN='your-token-here'"
  echo "4. Then run this script again"
  exit 1
fi

echo "🚀 SharkEdge → Railway Migration Script (Token Auth)"
echo "====================================================="
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "📦 Installing Railway CLI..."
    npm install -g @railway/cli
fi

echo "✅ Railway CLI ready"
echo ""

# Set Railway token for authentication
export RAILWAY_TOKEN="$RAILWAY_TOKEN"

echo "📝 Creating new Railway project..."
PROJECT_NAME="sharkedge-$(date +%s)"

# Initialize Railway project (will use RAILWAY_TOKEN env var)
railway init --name "$PROJECT_NAME"

echo ""
echo "🗄️  Adding PostgreSQL database..."
railway add postgresql

echo ""
echo "🚀 Setting environment variables..."

# Key variables needed for the app
railway variables set \
  NEXT_PUBLIC_SITE_URL="https://sharkedge.railway.app" \
  SHARKEDGE_BACKEND_URL="https://sharkedge.railway.app" \
  SHARKEDGE_DRAFTKINGS_FEED_URL="https://sharkedge.railway.app/api/book-feeds/draftkings" \
  SHARKEDGE_FANDUEL_FEED_URL="https://sharkedge.railway.app/api/book-feeds/fanduel" \
  THERUNDOWN_BASE_URL="https://therundown.io/api/v2" \
  NCAA_API_BASE_URL="https://ncaa-api.henrygd.me" \
  UFC_STATS_API_BASE_URL="https://ufcapi.aristotle.me" \
  POLL_INTERVAL_SECONDS="60" \
  MAX_EVENTS_PER_SPORT="20" \
  SPORTS_TO_SCRAPE="basketball,baseball,hockey,american-football,ufc,boxing" \
  SPORTS_FILTERS="baseball:MLB,american-football:NFL|NCAAF,basketball:NBA|NCAAB,hockey:NHL" \
  HEADLESS="true" \
  NEXT_PUBLIC_SHARKEDGE_PREMIUM_ANALYTICS="0" \
  SHARKEDGE_ALLOW_DEGRADED_BOOT="false"

echo ""
echo "⚠️  Remember to add these secrets manually via Railway dashboard:"
echo "   - THERUNDOWN_API_KEY"
echo "   - THERUNDOWN_AFFILIATE_IDS"
echo "   - INTERNAL_API_KEY"
echo "   - UPSTASH_REDIS_REST_URL"
echo "   - UPSTASH_REDIS_REST_TOKEN"
echo "   - ODDS_API_KEY"
echo "   - ODDS_API_KEYS"
echo "   - DISCORD_BOT_TOKEN"
echo "   - OPENCLAW_DISCORD_ALLOWED_CHANNELS"
echo "   - OPENCLAW_DISCORD_ALLOWED_USERS"
echo ""
echo "📋 Railway will auto-set DATABASE_URL from Postgres plugin"
echo ""

echo "🏗️  Building and deploying..."
railway up

echo ""
echo "✨ Deployment initiated!"
echo ""
echo "📊 View your app:"
railway open

echo ""
echo "📋 To monitor logs:"
echo "   RAILWAY_TOKEN='$RAILWAY_TOKEN' railway logs -f"
echo ""
echo "🎉 Migration complete!"
