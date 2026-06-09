# Railway Primary Migration

Railway is the only production deploy target for SharkEdge. Do not use Vercel as a production host.

## Target Services

Create these Railway services from the same GitHub repo:

| Service | Dockerfile | Purpose |
| --- | --- | --- |
| `sharkedge-web` | `deploy/railway/Dockerfile.web` or root `Dockerfile` with `SHARKEDGE_SERVICE_MODE=web` | Public Next.js app. Owns Prisma migrate deploy at boot. |
| `sharkedge-sim-worker` | `deploy/railway/Dockerfile.sim-worker` or root `Dockerfile` with `SHARKEDGE_SERVICE_MODE=sim-worker` | Refreshes cached SimHub/MLB snapshots and market overlays. |
| `sharkedge-mlb-odds-worker` | `deploy/railway/Dockerfile.mlb-odds-worker` or root `Dockerfile` with `SHARKEDGE_SERVICE_MODE=mlb-odds-worker` | Pulls paced odds-api.io MLB lines. |
| `sharkedge-ufc-worker` | `deploy/railway/Dockerfile.ufc-worker` or root `Dockerfile` with `SHARKEDGE_SERVICE_MODE=ufc-worker` | Loads/hydrates/simulates UFC/MVP cards. |
| `sharkedge-maintenance-worker` | `deploy/railway/Dockerfile.maintenance-worker` or root `Dockerfile` with `SHARKEDGE_SERVICE_MODE=maintenance-worker` | DB space repair and settled prediction jobs. |
| `sharkedge-postgres` | Railway Postgres plugin | Primary production database. |

Optional:

| Service | Dockerfile | Purpose |
| --- | --- | --- |
| `sharkedge-oddsharvester-worker` | `deploy/railway/Dockerfile.oddsharvester-worker` | Python OddsHarvester scraper/pusher. |
| `sharkedge-odds-recompute-worker` | `deploy/railway/Dockerfile.odds-worker` | Legacy internal odds recompute path. Use only if needed. |

## Railway Settings

For every service:

- Root directory: repo root
- Builder: Dockerfile
- Dockerfile path: the file listed above, or root `Dockerfile` with the correct `SHARKEDGE_SERVICE_MODE`
- Attach the same Railway Postgres variables

If Railway uses the root `Dockerfile`, set:

| Service | Variable |
| --- | --- |
| Web | `SHARKEDGE_SERVICE_MODE=web` |
| Sim worker | `SHARKEDGE_SERVICE_MODE=sim-worker` |
| MLB odds worker | `SHARKEDGE_SERVICE_MODE=mlb-odds-worker` |
| UFC worker | `SHARKEDGE_SERVICE_MODE=ufc-worker` |
| Maintenance worker | `SHARKEDGE_SERVICE_MODE=maintenance-worker` |

## Required Variables

Use `deploy/railway/env.primary.example` as the checklist.

Minimum shared variables:

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

Replace `sharkedge-web` with the exact Railway web service name if different.

The worker loop sends both:

- `Authorization: Bearer $CRON_SECRET`
- `x-cron-secret: $CRON_SECRET`

So existing protected cron routes keep working on Railway.

## Service Responsibilities

### Web

The web service should render the app and read cached/database state. It should not perform heavy refreshes on user page requests.

Boot command:

```bash
npx prisma migrate deploy && npm run start -- -p ${PORT:-3000}
```

### Sim Worker

Runs:

```bash
npm run worker:railway:sim
```

Default jobs:

- `/api/cron/sim-refresh?statsPreflight=1&runMlb=1&runUfc=0` every 30 minutes
- `/api/cron/sim-market-refresh` every 10 minutes

Useful variables:

```env
SIM_REFRESH_INTERVAL_SECONDS=1800
SIM_MARKET_REFRESH_INTERVAL_SECONDS=600
```

### MLB Odds Worker

Runs:

```bash
npm run worker:railway:mlb-odds
```

Default job:

- `/api/cron/odds-api-io/mlb?eventLimit=20` every 10 minutes during active UTC hours

Useful variables:

```env
ODDSAPI_IO_KEY=
ODDS_API_IO_KEY=
ODDS_API_IO_EVENT_LIMIT=20
MLB_ODDS_REFRESH_INTERVAL_SECONDS=600
MLB_ODDS_ACTIVE_UTC_HOURS=0,1,2,3,4,5,6,15,16,17,18,19,20,21,22,23
```

### UFC Worker

Runs:

```bash
npm run worker:railway:ufc
```

Default job:

- `/api/internal/cron/ufc-autopilot?...` every 6 hours

Useful variables:

```env
UFC_AUTOPILOT_INTERVAL_SECONDS=21600
UFC_ADMIN_RUN_TOKEN=
```

### Maintenance Worker

Runs:

```bash
npm run worker:railway:maintenance
```

Default jobs:

- `/api/internal/cron/db-space-repair` daily
- `/api/internal/cron/settle-sim-predictions` hourly

## Domain Cutover

1. Confirm Railway web URL loads:

```text
https://<railway-web-domain>/sim
https://<railway-web-domain>/baseball
https://<railway-web-domain>/sim/ufc
https://<railway-web-domain>/results
```

2. In Railway web service, add custom domain:

```text
sharkedge.com
www.sharkedge.com
```

3. In your DNS provider, point records exactly as Railway instructs.

4. After the domain works, stop treating any former non-Railway host as production.

## Verification

After deploy, check:

```text
/api/results
/api/results?market=moneyline
/api/results?market=nrfi
/api/results?market=props
/api/results?market=trends
/api/sim/health
/api/debug/sim-cache
/api/debug/odds-quota
/api/ufc/provider-readiness
/api/ufc/canonical-fighters?status=WHAT_IF_READY&limit=20
/baseball/readiness
/results
/results/moneyline
/results/nrfi
/results/props
/results/trends
```

Good signs:

- Web service returns 200.
- Results Center returns JSON and renders pages.
- Sim cache has MLB rows.
- MLB odds worker logs show 200/207, not 401.
- UFC worker logs show card/fight counts.
- Maintenance worker does not report database space failures.

## Cost Control

- Keep Trends parked unless intentionally activated.
- Do not run NBA workers unless you intentionally reactivate NBA.
- Keep historical backfills manual.
- Let workers refresh caches; keep pages read-only.
