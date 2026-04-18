#!/bin/bash
set -e

echo "🚀 SharkEdge Live Odds Scraper - ONE-COMMAND DEPLOYMENT"
echo "=========================================================="
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Install from https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose not found. Install from https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker and Docker Compose installed"
echo ""

# Check for .env
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from template..."
    cp .env.production .env
    echo ""
    echo "📝 EDIT .env and add your SHARKEDGE_API_KEY:"
    echo "   nano .env"
    echo ""
    echo "Then run this script again."
    exit 0
fi

# Verify API key is set
if ! grep -q "SHARKEDGE_API_KEY=" .env || grep "SHARKEDGE_API_KEY=your-" .env > /dev/null; then
    echo "❌ SHARKEDGE_API_KEY not configured in .env"
    echo "   Edit .env and set your API key, then run again."
    exit 1
fi

echo "✅ Configuration found"
echo ""

# Build image
echo "🔨 Building Docker image..."
docker-compose build --no-cache

echo ""
echo "✅ Image built successfully"
echo ""

# Start container
echo "🎯 Starting scraper..."
docker-compose up -d

sleep 2

# Check health
if docker-compose ps | grep -q "sharkedge-scraper"; then
    echo ""
    echo "✅ Scraper started successfully!"
    echo ""
    echo "📊 Monitor logs:"
    echo "   docker-compose logs -f"
    echo ""
    echo "🔍 Check status:"
    echo "   docker-compose ps"
    echo ""
    echo "⏹️  Stop scraper:"
    echo "   docker-compose down"
    echo ""
    echo "Expected output:"
    echo "   INFO | Scraped XX basketball matches"
    echo "   INFO | Scraped XX baseball matches"
    echo "   INFO | Posted X/X events"
else
    echo "❌ Failed to start scraper. Check logs:"
    docker-compose logs
    exit 1
fi
