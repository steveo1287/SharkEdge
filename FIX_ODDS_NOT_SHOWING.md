# Fix Odds Not Showing - Railway Production

This guide is Railway-only. Ignore older Render, AWS, and Vercel instructions.

## Fast Diagnosis

Check the Railway web domain:

```bash
curl https://<railway-web-domain>/api/health/railway
curl https://<railway-web-domain>/api/results
curl https://<railway-web-domain>/api/debug/sim-cache
curl https://<railway-web-domain>/api/debug/odds-quota
```

Then check worker logs in Railway.

## Required Services

| Service | Required variable |
| --- | --- |
| Web | `SHARKEDGE_SERVICE_MODE=web` |
| Sim worker | `SHARKEDGE_SERVICE_MODE=sim-worker` |
| MLB odds worker | `SHARKEDGE_SERVICE_MODE=mlb-odds-worker` |
| Maintenance worker | `SHARKEDGE_SERVICE_MODE=maintenance-worker` |

UFC worker is optional for MLB-only work but should be active if the UFC product is live.

## Required Shared Variables

Set these on every Railway service that touches the database or internal APIs:

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

## MLB Odds Worker Variables

```env
ODDSAPI_IO_KEY=
ODDS_API_IO_KEY=
ODDS_API_IO_EVENT_LIMIT=20
MLB_ODDS_REFRESH_INTERVAL_SECONDS=600
MLB_ODDS_ACTIVE_UTC_HOURS=0,1,2,3,4,5,6,15,16,17,18,19,20,21,22,23
```

## Common Failure Modes

### Web service loads but no odds

Check:

```text
/api/debug/odds-quota
/api/debug/sim-cache
/api/results?market=moneyline
```

Likely causes:

- MLB odds worker is not running.
- Odds API key is missing or invalid.
- Worker cannot reach the web service through `RAILWAY_WEB_INTERNAL_URL`.
- Railway Postgres variables are not attached to the worker service.

### Results Center has no rows

Check:

```text
/api/results
/results
```

Likely causes:

- Sim snapshots have not been refreshed.
- Moneyline ledger has not settled yet.
- Projection ledgers do not exist or have no recent rows.
- Maintenance worker is not settling prediction rows.

### Worker logs show 401

Check these values match between web and workers:

```env
CRON_SECRET
INTERNAL_API_KEY
INTERNAL_API_KEY2
```

### Worker logs show database errors

Check Railway Postgres is attached and both variables exist:

```env
DATABASE_URL
DIRECT_URL
```

## Correct Production Data Flow

```text
Railway MLB odds worker
  -> Railway web cron/API route
  -> Railway Postgres
  -> Results Center / board pages
```

## Operating Rule

Do not configure production odds flow against old non-Railway hosts. Railway web plus Railway Postgres is the production source of truth.
