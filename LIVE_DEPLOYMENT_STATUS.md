# SharkEdge Live Deployment Status

## Production Host

Railway is the production host for SharkEdge.

Old AWS, Render, and Vercel notes in previous versions of this file are historical and should not be used for production operations.

## Active Production Shape

```text
Railway web service
  -> Next.js app/API
  -> Railway Postgres

Railway sim worker
  -> refreshes SimHub and MLB snapshots

Railway MLB odds worker
  -> refreshes MLB odds-api.io lines

Railway UFC worker
  -> refreshes UFC cards/profiles when active

Railway maintenance worker
  -> database repair and settlement jobs
```

## Web Service

Required variable:

```env
SHARKEDGE_SERVICE_MODE=web
```

Healthcheck:

```text
/api/health/railway
```

Results Center:

```text
/results
/api/results
```

## Worker Services

| Worker | Service mode | Command |
| --- | --- | --- |
| Sim | `sim-worker` | `npm run worker:railway:sim` |
| MLB odds | `mlb-odds-worker` | `npm run worker:railway:mlb-odds` |
| UFC | `ufc-worker` | `npm run worker:railway:ufc` |
| Maintenance | `maintenance-worker` | `npm run worker:railway:maintenance` |

## Verification

Check these on the Railway web domain:

```text
/api/health/railway
/api/results
/api/results?market=moneyline
/api/results?market=nrfi
/api/results?market=props
/api/results?market=trends
/api/sim/health
/api/debug/sim-cache
/api/debug/odds-quota
/baseball/readiness
/results
/results/moneyline
/results/nrfi
/results/props
/results/trends
```

## Healthy Signals

- Railway web healthcheck returns `{ "ok": true }`.
- Results Center API returns JSON.
- Sim cache has MLB rows.
- MLB odds worker logs show 200/207, not 401.
- Maintenance worker runs settlement without database space failures.
- Results pages render without blocking on heavy refreshes.

## Alert Triggers

| Signal | Action |
| --- | --- |
| Web healthcheck fails | Check Railway web build/start logs |
| Worker logs show 401 | Verify `CRON_SECRET`, `INTERNAL_API_KEY`, and `INTERNAL_API_KEY2` match across services |
| Odds board empty | Check MLB odds worker logs and `/api/debug/odds-quota` |
| Results Center empty | Check sim refresh, settlement, and projection ledger workers |
| Database errors | Check Railway Postgres volume and `DATABASE_URL` / `DIRECT_URL` attachments |

## Operating Rule

Railway web plus Railway Postgres is the production source of truth.
