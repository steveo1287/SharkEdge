# 🚨 Why Odds Aren't Showing: Complete Setup Guide

## Problem

The scraper is running ✅ but odds/trends/sims aren't displaying on the frontend because **the backend odds service is not configured**.

```
Scraper → Backend (NOT CONFIGURED) → Database ✗
Frontend tries to fetch → No data → Empty board
```

---

## Solution: Configure Backend Service

The backend (shark-odds-1.onrender.com) needs `SHARKEDGE_API_KEY` configured as an environment variable.

### Step 1: Get Your API Key

If you have a key from .env:
```bash
grep SHARKEDGE_API_KEY .env
# Output: SHARKEDGE_API_KEY=your-key-here
```

### Step 2: Configure Render Backend

1. Go to https://dashboard.render.com
2. Find the `shark-odds-1` service (or create one if needed)
3. Click on the service
4. Go to **Settings** → **Environment Variables**
5. Add:
   ```
   Key: SHARKEDGE_API_KEY
   Value: your-key-from-.env
   ```
6. Click **Save** 
7. Service will auto-redeploy (takes ~2 min)

### Step 3: Verify Backend is Ready

```bash
curl https://shark-odds-1.onrender.com/api/ingest/odds/status
```

Should show:
```json
{
  "configured": true,  ← Should be TRUE now
  "provider": "scraper_cache",
  "game_count": 0,
  "sport_count": 0
}
```

---

## Step 4: Restart Scraper on AWS

Once backend is configured, restart the scraper to begin posting:

```bash
# SSH to AWS instance
ssh -i your-key.pem ubuntu@3.136.159.191

# Rebuild with new config
docker-compose pull
docker-compose up -d --build

# Watch logs
docker-compose logs -f
```

Expected output (after ~60 seconds):
```
INFO | Starting parallel poll of 6 sports
INFO | Scraped 15 basketball matches
...
INFO | Posted 45/50 events (change detection applied)
```

---

## Step 5: Verify Data Flow

### Check Backend Received Data

```bash
curl https://shark-odds-1.onrender.com/api/ingest/odds/status
```

Should now show:
```json
{
  "configured": true,
  "game_count": 15,    ← Non-zero count
  "sport_count": 6     ← Sports being tracked
}
```

### Check Frontend Displays Odds

Visit: https://sharkedge.vercel.app/board

Should now show:
- ✅ Live games for today
- ✅ Moneyline/spread/total odds
- ✅ Last update timestamp
- ✅ Market movement indicators

---

## Complete Data Flow

```
AWS EC2 (3.136.159.191)
↓
Docker: live_odds_scraper_optimized.py
↓ (posts every 60 seconds)
shark-odds-1.onrender.com/api/ingest/odds
↓ (stores in cache)
PostgreSQL Database
↓
sharkedge.vercel.app/api/odds/board (frontend queries)
↓
/board, /game/[id], etc. display live odds
```

---

## Configuration Checklist

Before anything shows:

- [ ] **Scraper API Key** → Set in AWS docker-compose? ✅
- [ ] **Backend API Key** → Set on Render? ⏳ REQUIRED
- [ ] **Scraper Running** → `docker-compose ps` shows "Up"? ✅
- [ ] **Backend Accessible** → `/api/ingest/odds/status` returns `configured: true`? ⏳ REQUIRED
- [ ] **Data Posting** → Logs show "Posted X/Y events"? ⏳ DEPENDS ON ABOVE
- [ ] **Frontend Fetching** → `/board` shows games? ⏳ DEPENDS ON ABOVE

---

## Troubleshooting

### "configured: false" on Status Check

**Problem**: Backend can't verify the API key  
**Solution**: 
1. Check the API key you set on Render matches the one in .env
2. Wait 2-3 minutes for Render to redeploy
3. Restart scraper: `docker-compose restart`

### "game_count: 0" But Scraper is Running

**Problem**: Backend received the API key but no data posted  
**Solution**:
1. Check scraper logs: `docker-compose logs | grep "Posted"`
2. Check scraper has correct `SHARKEDGE_INGEST_URL`: `docker-compose config | grep INGEST`
3. Verify scraper API key matches backend: `docker-compose config | grep API_KEY`
4. Restart scraper: `docker-compose restart`

### Frontend Shows "Live board pricing is unavailable"

**Problem**: Frontend can't reach backend or database  
**Solution**:
1. Check backend status: `curl https://shark-odds-1.onrender.com/api/ingest/odds/status`
2. Check frontend's backend URL: Frontend should point to `shark-odds-1.onrender.com`
3. If using different backend, set `SHARKEDGE_BACKEND_URL` on frontend Vercel deployment

### Games Show But No Odds/Trends/Sims

**Problem**: Data is there but specific fields missing  
**Solution**: 
1. Check scraper is posting complete payloads: `docker-compose logs | tail -100`
2. Verify payload structure matches backend expectations
3. Check simulation service is running (if sims expected)

---

## Quick Test: Post Sample Data

```bash
# From AWS instance or local machine:
BACKEND_URL="https://shark-odds-1.onrender.com"
API_KEY="your-actual-key"

curl -X POST $BACKEND_URL/api/ingest/odds \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "sport": "basketball",
    "sportKey": "basketball_nba",
    "eventKey": "nba_2026_04_18_lal_vs_gsw",
    "homeTeam": "Golden State Warriors",
    "awayTeam": "Los Angeles Lakers",
    "commenceTime": "2026-04-18T19:30:00Z",
    "lines": [{
      "book": "flashscore_best",
      "odds": {
        "homeMoneyline": -110,
        "awayMoneyline": -110,
        "homeSpread": -3.5,
        "total": 220
      }
    }]
  }'
```

If successful: `{"status":"success","updated_games":1}`  
If fails: `{"detail":"error message"}`

---

## Next Steps After Configuration

1. **Wait 24 hours** for scraper stability validation
2. **Check error rate**: Should be 0-1%
3. **Monitor circuit breaker**: Should stay 🟢 OK
4. **Verify odds accuracy**: Compare with Flashscore

After clean 24h run, you can:
- Optimize polling speed (faster updates)
- Add proxy for aggressive scraping
- Integrate additional data sources
- Deploy to production infra

---

## Files Reference

- **Docker config**: `docker-compose.yml` (sets SHARKEDGE_INGEST_URL)
- **Scraper code**: `backend/live_odds_scraper_optimized.py` (posts payloads)
- **Frontend proxy**: `app/api/ingest-odds/route.ts` (could proxy if needed)
- **Board service**: `services/odds/board-service.ts` (fetches from backend)
- **Backend URL config**: `services/current-odds/backend-url.ts`

---

## Support

If odds still don't show after these steps:

1. Check scraper logs: `docker-compose logs --tail 100`
2. Check backend status: `curl https://shark-odds-1.onrender.com/api/ingest/odds/status`
3. Verify network connectivity from AWS to backend
4. Check API key is exactly matching (no spaces, case-sensitive)
5. Check Render logs for backend service errors
