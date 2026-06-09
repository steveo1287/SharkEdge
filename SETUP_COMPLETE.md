# SharkEdge Railway Setup Status

This file replaces the old prototype completion note. Production is Railway-only.

## Current Production Target

| Layer | Production target |
| --- | --- |
| Web app | Railway web service |
| Database | Railway Postgres |
| Sim refresh | Railway worker |
| MLB odds refresh | Railway worker |
| UFC refresh | Railway worker |
| Maintenance / settlement | Railway worker |

Do not use old non-Railway deployment notes as production instructions.

## Active Railway Services

Use one GitHub repo and one of these service modes per Railway service:

```env
SHARKEDGE_SERVICE_MODE=web
SHARKEDGE_SERVICE_MODE=sim-worker
SHARKEDGE_SERVICE_MODE=mlb-odds-worker
SHARKEDGE_SERVICE_MODE=ufc-worker
SHARKEDGE_SERVICE_MODE=maintenance-worker
```

The root `Dockerfile` and `railway.json` support this mode switch.

## Required Shared Variables

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

## Current Verification URLs

Check these on the Railway web domain:

```text
/api/health/railway
/api/results
/api/results?market=moneyline
/api/results?market=nrfi
/api/results?market=props
/api/results?market=trends
/results
/results/moneyline
/results/nrfi
/results/props
/results/trends
/api/sim/health
/api/debug/sim-cache
/api/debug/odds-quota
/baseball/readiness
```

## Results Center Added

The Results Center now has:

- Overview page
- Moneyline page
- NRFI page
- Player props page
- Trends proof page
- JSON API endpoint
- Railway health endpoint

## Operating Rule

Railway is the source of truth for production. Old references to Render/Vercel are legacy notes only and should not be used for active deployment.
