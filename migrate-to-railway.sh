#!/bin/bash

set -e

echo "🚀 SharkEdge → Railway Migration Script"
echo "========================================"
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "📦 Installing Railway CLI..."
    npm install -g @railway/cli
fi

echo "✅ Railway CLI ready"
echo ""

# Login to Railway
echo "🔐 Logging in to Railway..."
echo "(Your browser will open. If it doesn't, visit: https://railway.app/login)"
railway login

echo ""
echo "📝 Creating new Railway project..."
PROJECT_NAME="sharkedge-$(date +%s)"

# Initialize Railway project
railway init

echo ""
echo "🗄️  Adding PostgreSQL database..."
railway add postgresql

echo ""
echo "🚀 Setting environment variables..."

# Key variables needed for the app
railway variables set \
  NEXT_PUBLIC_SITE_URL="https://${RAILWAY_DOMAIN:-sharkedge.railway.app}" \
  SHARKEDGE_BACKEND_URL="https://${RAILWAY_DOMAIN:-sharkedge.railway.app}" \
  SHARKEDGE_DRAFTKINGS_FEED_URL="https://${RAILWAY_DOMAIN:-sharkedge.railway.app}/api/book-feeds/draftkings" \
  SHARKEDGE_FANDUEL_FEED_URL="https://${RAILWAY_DOMAIN:-sharkedge.railway.app}/api/book-feeds/fanduel" \
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
echo "🔑 Add these secrets manually via Railway dashboard:"
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

# DATABASE_URL is auto-set by Railway's Postgres plugin, no need to set it

echo "🏗️  Building and deploying..."
railway up

echo ""
echo "✨ Deployment initiated!"
echo ""
echo "📊 View your app at:"
railway open

echo ""
echo "📋 To monitor logs:"
echo "   railway logs -f"
echo ""
echo "🎉 Migration complete!"
