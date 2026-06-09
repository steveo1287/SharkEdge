# Live Odds Setup & Integration Guide

## Current Architecture

SharkEdge production is Railway-only. Do not treat Vercel as a production host.

```text
Railway web service
  -> Next.js app and API routes
  -> reads/writes Railway Postgres

Railway workers
  -> sim refresh worker
  -> MLB odds worker
  -> UFC worker
  -> maintenance worker
  -> optional OddsHarvester worker

Railway Postgres
  -> primary production database
```

## Railway-Only Quick Start

### 1. Web service

Use the root `Dockerfile` or the web Dockerfile under `deploy/railway`.

Required service variable:

```env
SHARKEDGE_SERVICE_MODE=web
```

Boot path:

```bash
npx prisma migrate deploy && npm run start -- -p ${PORT:-3000}
```

### 2. MLB odds worker

Required service variable:

```env
SHARKEDGE_SERVICE_MODE=mlb-odds-worker
```

Worker command:

```bash
npm run worker:railway:mlb-odds
```

Core variables:

```env
ODDSAPI_IO_KEY=
ODDS_API_IO_KEY=
ODDS_API_IO_EVENT_LIMIT=20
MLB_ODDS_REFRESH_INTERVAL_SECONDS=600
MLB_ODDS_ACTIVE_UTC_HOURS=0,1,2,3,4,5,6,15,16,17,18,19,20,21,22,23
```

### 3. Sim worker

Required service variable:

```env
SHARKEDGE_SERVICE_MODE=sim-worker
```

Worker command:

```bash
npm run worker:railway:sim
```

Core variables:

```env
SIM_REFRESH_INTERVAL_SECONDS=1800
SIM_MARKET_REFRESH_INTERVAL_SECONDS=600
```

### 4. UFC worker

Required service variable:

```env
SHARKEDGE_SERVICE_MODE=ufc-worker
```

Worker command:

```bash
npm run worker:railway:ufc
```

Core variables:

```env
UFC_ADMIN_RUN_TOKEN=
UFC_AUTOPILOT_INTERVAL_SECONDS=21600
```

### 5. Maintenance worker

Required service variable:

```env
SHARKEDGE_SERVICE_MODE=maintenance-worker
```

Worker command:

```bash
npm run worker:railway:maintenance
```

## Shared Railway Variables

Put these on every Railway service that touches the app or database:

```env
NODE_ENV=production
DATABASE_URL=
DIRECT_URL=
CRON_SECRET=
INTERNAL_API_KEY=
INTERNAL_API_KEY2=
SHARKEDGE_ALLOW_DEGRADED_BOOT=true
RAILWAY_WEB_INTERNAL_URL=http://sharkedge-web:3000
```

Use `deploy/railway/env.primary.example` as the full checklist.

## Optional OddsHarvester Worker

Only use this if we intentionally keep the Python scraper layer alive. It should post to Railway, not Vercel.

```env
SHARKEDGE_BACKEND_URL=http://sharkedge-web:3000
SHARKEDGE_API_KEY=
POST_TO_BACKEND=true
ODDSHARVESTER_HEADLESS=true
POLL_INTERVAL_SECONDS=900
ENABLED_SPORT_KEYS=baseball_mlb,mma_mixed_martial_arts
```

## Verification

After Railway deploy, check:

```text
/api/results
/api/results?market=moneyline
/api/sim/health
/api/debug/sim-cache
/api/debug/odds-quota
/api/ufc/provider-readiness
/baseball/readiness
/results
/results/moneyline
/results/nrfi
/results/props
/results/trends
```

Good signs:

- Web service returns 200.
- `/api/results` returns JSON.
- Sim cache has MLB rows.
- MLB odds worker logs show 200/207, not 401.
- Maintenance worker does not report database space failures.

## Operating Rule

Railway is the production source of truth. If old docs, scripts, or comments mention `sharkedge.vercel.app`, replace them with the Railway web domain or the internal Railway service URL.
