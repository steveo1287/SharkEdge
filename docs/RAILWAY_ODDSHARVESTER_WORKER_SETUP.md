# Railway OddsHarvester Worker Setup

Use a dedicated Railway service for OddsHarvester ingestion. Do not post to `https://app.sharkedge.com` from the worker.

## Service layout

1. Web service (Next.js): serves app + `/api/ingest/odds`
2. OddsHarvester worker (Python): scrapes and POSTs to web service over Railway private network

## Dockerfile path

For the Python worker service, set Dockerfile path to:

`deploy/railway/Dockerfile.oddsharvester-worker`

## Required environment variables (worker service)

```text
SHARKEDGE_BACKEND_URL=http://sharkedge-web:3000
SHARKEDGE_API_KEY=<your INTERNAL_API_KEY used by /api/ingest/odds>
POST_TO_BACKEND=true
BEST_EFFORT_CONTINUE=true
ODDSHARVESTER_COMMAND=python -m oddsharvester
ODDSHARVESTER_TIMEOUT_SECONDS=180
ODDSHARVESTER_HEADLESS=true
POLL_INTERVAL_SECONDS=900
ENABLED_SPORT_KEYS=basketball_nba,baseball_mlb
```

Notes:
- Replace `sharkedge-web` with your actual Railway web service hostname if different.
- `POLL_INTERVAL_SECONDS=900` means every 15 minutes.

## Optional reliability variables

```text
WORKER_STARTUP_DELAY_SECONDS=10
WORKER_MAX_BACKOFF_SECONDS=300
ODDSHARVESTER_PROXY_URL=
```

## Verify

1. Worker logs should show `cycle ok` and posted games.
2. Web service should show ingest hits on `/api/ingest/odds`.
3. Check readiness endpoint from web service:
   - `/api/v1/providers/readiness`
4. Check board-live:
   - `/api/v1/board-live`

## Common failure

If you see SSL/SNI errors posting to `app.sharkedge.com`, the worker is pointed at the wrong host.
Use Railway internal URL (`http://<web-service-name>:3000`), not the public frontend domain.
