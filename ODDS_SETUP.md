# Live Odds Setup & Integration Guide

## Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     SharkEdge Live Odds                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Frontend                                                     │
│  └─> currentOddsProviders (provider registry)               │
│      ├─> Backend Current Odds Provider                      │
│      │   └─> GET /api/odds/board (your backend)            │
│      │       ├─> Flashscore scraper data (if configured)   │
│      │       └─> OddsHarvester data (historical)           │
│      │                                                       │
│      └─> The Rundown Provider                               │
│          └─> GET https://therundown.io/api/v2/...         │
│                                                               │
│  Backend Data Pipeline                                        │
│  └─> POST /api/ingest-odds ← Flashscore scraper            │
│      └─> Stores in database/cache                           │
│          └─> Served via /api/odds/board                    │
│                                                               │
│  Scraper                                                      │
│  └─> live_odds_scraper_optimized.py                        │
│      ├─> Flashscore (moneyline, spread, total, props)      │
│      ├─> Resilient error handling (FIXED)                  │
│      └─> Posts to backend every 2 minutes                  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start (5 minutes)

### 1. Deploy the Flashscore Scraper

The scraper has been hardened against crashes. Deploy it:

```bash
cd /home/user/SharkEdge/backend

# Set environment
export SHARKEDGE_API_KEY="your-ingest-key"
export SHARKEDGE_INGEST_URL="https://your-backend.app/api/ingest-odds"
export POLL_INTERVAL_SECONDS="120"
export HEADLESS="true"
export CHROME_BIN="/path/to/chrome"

# Run (use process manager for production)
python live_odds_scraper_optimized.py
```

**Environment Variables (All Optional - Sensible Defaults)**:

```
SHARKEDGE_API_KEY              # Required to authenticate ingest
SHARKEDGE_INGEST_URL           # Default: https://sharkedge.vercel.app/api/ingest-odds
POLL_INTERVAL_SECONDS          # Default: 120 (2 min)
MAX_EVENTS_PER_SPORT           # Default: 20
SPORTS_TO_SCRAPE               # Default: basketball,baseball,hockey,american-football,ufc,boxing
HEADLESS                       # Default: true
PROXY_URL                      # Optional proxy for Flashscore
CHROME_BIN                     # Path to Chrome binary
RUN_ONCE                       # Set to true to run once and exit (testing)
MAX_WORKERS                    # Parallel sports (default: 1 on Railway)
CACHE_ENABLED                  # Default: true (skip unchanged events)
PAGE_LOAD_TIMEOUT_SECONDS      # Default: 20
FEED_TIMEOUT_SECONDS           # Default: 6
FEED_RETRY_ATTEMPTS            # Default: 2
```

### 2. Verify Data Flow

Once scraper is running, check that data reaches your backend:

```bash
# Check logs
tail -f live_odds_optimized.log

# Watch for "Posted" entries
# Example: "Posted basketball:NBA:Lakers @ Celtics: True"
```

### 3. Enable in Frontend

The frontend will automatically use the scraper data if `/api/odds/board` returns it:

```typescript
// services/current-odds/backend-provider.ts already handles this
// Data flows through: 
//   1. Scraper → POST /api/ingest-odds
//   2. Backend stores data
//   3. Frontend → GET /api/odds/board (includes scraper data)
```

## Current Provider Status

| League | Status | Providers | Fallback Chain |
|--------|--------|-----------|-----------------|
| **NBA** | ✅ LIVE | Backend + TheRundown | Backend → TheRundown |
| **NCAAB** | ✅ LIVE | Backend + TheRundown | Backend → TheRundown |
| **MLB** | ✅ LIVE | Backend + TheRundown | Backend → TheRundown |
| **NHL** | ✅ LIVE | Backend + TheRundown | Backend → TheRundown |
| **NFL** | ✅ LIVE | Backend + TheRundown | Backend → TheRundown |
| **NCAAF** | ✅ LIVE | Backend + TheRundown | Backend → TheRundown |
| **UFC** | 🔴 GAPS | None | Scraper (moneyline only) |
| **BOXING** | 🔴 GAPS | None | Scraper (moneyline only) |

## Deployment Options

### Option 1: Railway (Recommended for MVP)

```bash
# Add to railway.toml or Procfile
web: python backend/live_odds_scraper_optimized.py
```

**Pros**: Easy, auto-scaling, integrated with your setup
**Cons**: Charges for compute

### Option 2: Heroku/Render

```bash
# Heroku
heroku config:set SHARKEDGE_API_KEY="your-key"
heroku ps:scale worker=1
```

### Option 3: Docker (Self-hosted)

```dockerfile
FROM python:3.11-slim
RUN apt-get update && apt-get install -y chromium
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt
COPY backend/live_odds_scraper_optimized.py .
CMD ["python", "live_odds_scraper_optimized.py"]
```

### Option 4: Cron Job (Minimal)

Run every 2 minutes via cron (not recommended for continuous updates):

```bash
*/2 * * * * cd /path && python live_odds_scraper_optimized.py --run-once
```

## What's Fixed in the Scraper

**Before**: Random crashes from timeouts, rate limits, WebDriver failures
**After**: Graceful degradation, per-market error isolation, consecutive failure detection

### Key Improvements:

1. **Market Failure Isolation** - If moneyline fails, spread and total still fetch
2. **Rate Limit Handling** - 429s backed off, not retried infinitely
3. **Timeout Protection** - Individual markets time out, not entire sport
4. **Driver Cleanup** - No process leaks on error
5. **Consecutive Failure Detection** - Exits cleanly after 5 failures (doesn't hang)
6. **Better Logging** - Know exactly what failed and why

## Next Steps (This Week)

### Priority 1: Make Scraper Live ⚡
- [ ] Deploy scraper to production
- [ ] Verify data flowing to backend
- [ ] Monitor logs for 24 hours
- [ ] Set up alerts for consecutive failures

### Priority 2: Add The Odds API (Free Tier) 
- [ ] Create `therundown-plus-provider.ts` that layers The Odds API
- [ ] Fallback: Backend → TheRundown → The Odds API
- [ ] Covers: NFL, NBA, MLB, NHL (multiple books free)
- [ ] Est. time: 2 hours

### Priority 3: UFC Coverage
- [ ] Scraper already covers UFC moneyline
- [ ] Layer with BetExplorer API for more books
- [ ] Est. time: 3 hours

### Priority 4: Props Wiring
- [ ] Connect NBA/NCAAB player props to backend
- [ ] Connect MLB/NHL/NFL props (missing entirely)
- [ ] Est. time: 4-6 hours

## Monitoring & Health Checks

### Check Scraper Is Running
```bash
# Look for live_odds_optimized.log entries updated in last 2 min
ls -ltr live_odds_optimized.log
tail -20 live_odds_optimized.log | grep "Posted\|No events"
```

### Check Backend Is Receiving Data
```bash
# Query your backend
curl https://your-backend.app/api/odds/board \
  -H "Content-Type: application/json" \
  -H "x-api-key: $SHARKEDGE_API_KEY"

# Should return sports with games and odds data
```

### Check Frontend Is Displaying
```
Frontend → Open any league page (NBA/NFL/etc)
→ Should show current odds + multiple books
→ Check browser DevTools → Network → /api/odds/board
```

## Troubleshooting

### Scraper Not Posting
```
Check:
1. SHARKEDGE_API_KEY is set and correct
2. Backend URL is accessible: curl -I $SHARKEDGE_INGEST_URL
3. Logs show "Failed to post" - check why (401, 429, timeout, etc)
4. Backend database has space for writes
```

### No Data in Frontend
```
Check:
1. Scraper logs show "Posted X" entries
2. Backend /api/odds/board returns data
3. Frontend fetching the right endpoint
4. Check response - is it "configured": true?
```

### High Latency / Timeouts
```
Adjust:
- PAGE_LOAD_TIMEOUT_SECONDS: 20 → 15 (if fast connection)
- POLL_INTERVAL_SECONDS: 120 → 180 (if rate limited)
- MAX_WORKERS: 1 → depends on hardware
- FEED_TIMEOUT_SECONDS: 6 → 8 (if unstable network)
```

## Free Open-Source Alternatives (Future)

When you want to layer in more coverage:

| API | Cost | Sports | Setup |
|-----|------|--------|-------|
| [The Odds API](https://the-odds-api.com) | Free tier 500/mo | NFL, NBA, MLB, NHL, NCAAB | 2 hours |
| [BetExplorer](https://betexplorer.com/api) | Free | All + UFC | 3 hours |
| [Pinnacle](https://www.pinnacle.com) | Free | All + UFC | 1 hour (already have MLB) |
| [ESPN Public API](https://github.com/pseudo-r/Public-ESPN-API) | Free | 6 sports | Already using for events |

## Architecture Decision Log

**Why Flashscore Scraper?**
- ✅ No API key needed
- ✅ Covers all sports including UFC/Boxing
- ✅ Multiple books per game
- ✅ Prop markets (player props, method of victory)
- ❌ Rate limit sensitive (handled now)

**Why The Rundown as Primary?**
- ✅ Free tier available
- ✅ Reliable API (not scraping)
- ✅ Good book coverage
- ❌ Limited free requests (5 min cache)

**Why Backend Aggregation?**
- ✅ Single source of truth for frontend
- ✅ Can combine scraper + API + harvester
- ✅ Cache layer (skip unchanged events)

---

**Last Updated**: 2026-04-23
**Scraper Reliability**: Fixed (comprehensive error handling added)
**Next Action**: Deploy scraper to production
