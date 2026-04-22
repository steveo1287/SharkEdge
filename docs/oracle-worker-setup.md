# Oracle Odds Refresh Worker

SharkEdge's web app should serve board data from the existing DB/cache snapshot only.
Heavy odds refresh, market-state recompute, and edge recompute now belong in a separate worker process.

## Worker entrypoint

The dedicated worker entrypoint is:

`workers/odds-refresh-worker.ts`

It performs this loop:

1. `refreshCurrentBookFeeds({ force: true })`
2. load active events from the database
3. `currentMarketStateJob(event.id, { skipBookFeedRefresh: true })`
4. `recomputeEdgeSignals(event.id)`
5. sleep and repeat

Failures are logged per cycle so the process stays alive for the next interval.

## Run with npm

Install dependencies first, then run:

```bash
npm run worker:odds-refresh
```

Run a single cycle for smoke testing:

```bash
npm run worker:odds-refresh -- --once
```

Use a custom interval:

```bash
npm run worker:odds-refresh -- --intervalMs=300000
```

## Run with node

With Node 20:

```bash
node --import tsx workers/odds-refresh-worker.ts
```

Single-cycle smoke test:

```bash
node --import tsx workers/odds-refresh-worker.ts --once
```

## Recommended environment variables

Minimum runtime:

- `DATABASE_URL`
- provider credentials required by `refreshCurrentBookFeeds`

Useful worker tuning:

- `ODDS_REFRESH_INTERVAL_MS=300000`
- `ODDS_REFRESH_LOOKBACK_HOURS=12`
- `ODDS_REFRESH_LOOKAHEAD_HOURS=48`
- `NODE_ENV=production`

If Oracle is running the worker separately from the web service, keep the same provider secrets and database connection that the app uses for ingest and market recompute.
The worker uses only the existing Node/TypeScript toolchain and does not add x86-only runtime dependencies, which keeps it compatible with Linux ARM64-oriented Oracle deployments.

## PM2 example

Install PM2 on the host:

```bash
npm install -g pm2
```

Start the worker:

```bash
pm2 start "npx tsx workers/odds-refresh-worker.ts" --name sharkedge-odds-refresh
```

Persist it across restarts:

```bash
pm2 save
pm2 startup
```

Tail logs:

```bash
pm2 logs sharkedge-odds-refresh
```

## Deployment note

The web route at `app/api/internal/cron/odds-refresh/route.ts` is now status-only.
Do not rely on the web app to perform feed refreshes or market recompute during requests.
