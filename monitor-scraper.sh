#!/bin/bash
# SharkEdge Scraper Health Monitor
# Provides real-time status of the live scraper deployment

set -e

echo "🔍 SharkEdge Scraper Status Check"
echo "=================================="
echo ""

# Check if container is running
if docker-compose ps | grep -q "sharkedge-scraper.*Up"; then
    echo "✅ Container: RUNNING"
else
    echo "❌ Container: STOPPED"
    echo ""
    echo "Start with: docker-compose up -d"
    exit 1
fi

echo ""
echo "📊 Recent Activity (last 20 lines)"
echo "=================================="
docker-compose logs --tail=20 | tail -20

echo ""
echo "📈 Error Analysis"
echo "================="

# Get logs from the last 5 minutes
RECENT_LOGS=$(docker-compose logs --tail=500)

# Count errors
ERROR_COUNT=$(echo "$RECENT_LOGS" | grep -c "ERROR" || echo 0)
TOTAL_LINES=$(echo "$RECENT_LOGS" | wc -l)

if [ "$TOTAL_LINES" -gt 0 ]; then
    ERROR_RATE=$((ERROR_COUNT * 100 / TOTAL_LINES))
else
    ERROR_RATE=0
fi

echo "Errors detected: $ERROR_COUNT"
echo "Total log lines: $TOTAL_LINES"
echo "Error rate: ${ERROR_RATE}%"
echo ""

if [ "$ERROR_RATE" -le 1 ]; then
    echo "✅ Error rate is healthy (≤1%)"
elif [ "$ERROR_RATE" -le 5 ]; then
    echo "⚠️  Error rate is slightly elevated (1-5%)"
    echo "    Monitor for trends, may need to increase delays"
else
    echo "🔴 Error rate is high (>5%)"
    echo "    Need to increase MIN_DELAY_SECONDS and MAX_DELAY_SECONDS"
    echo ""
    echo "Recent errors:"
    echo "$RECENT_LOGS" | grep "ERROR" | tail -5
fi

echo ""
echo "🎯 Circuit Breaker Status"
echo "========================"

if echo "$RECENT_LOGS" | grep -q "Circuit breaker open"; then
    echo "⚠️  Circuit breaker has opened - increasing delays automatically"
else
    echo "✅ Circuit breaker: OK (no rate limiting detected)"
fi

echo ""
echo "🔧 Configuration Check"
echo "======================"

# Show env variables
echo "Current settings:"
docker-compose config | grep -E "POLL_INTERVAL|MIN_DELAY|MAX_DELAY|HEADLESS" | sed 's/^/  /'

echo ""
echo "📍 Next Steps"
echo "=============="
echo ""
echo "Monitor logs live:"
echo "  docker-compose logs -f"
echo ""
echo "Check full error log:"
echo "  docker-compose logs | grep ERROR"
echo ""
echo "Restart if needed:"
echo "  docker-compose restart"
echo ""
echo "Stop scraper:"
echo "  docker-compose down"
echo ""
echo "Scale up after 24h of clean operation:"
echo "  Edit docker-compose.yml and decrease MIN_DELAY_SECONDS/MAX_DELAY_SECONDS"
echo ""
