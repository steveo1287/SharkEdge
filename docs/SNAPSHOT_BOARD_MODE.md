# SharkEdge Snapshot Board Mode

Snapshot board mode makes `/api/v1/board` and `/api/odds/board` read a precomputed board payload instead of running live odds, database, or simulation work during a user request.

## Why this exists

Railway usage spikes when the web app does expensive work on page load:

- query current market inventory
- overlay odds snapshots
- build board sections
- run provider fallbacks
- trigger simulation or diagnostics paths

Snapshot mode moves that work into a command:

```bash
npm run shark:snapshot
```

The web request then reads JSON.

## Request-time behavior

By default, the board endpoints try this order:

1. `SHARKEDGE_BOARD_SNAPSHOT_URL`, if set
2. `public/data/latest-board.json`
3. degraded empty board response

The endpoints do **not** call the live board service unless this is explicitly set:

```bash
SHARKEDGE_ALLOW_LIVE_BOARD_FALLBACK=true
```

Leave that unset or false on Railway when controlling spend.

## Generate a local snapshot

```bash
npm run shark:snapshot
```

Useful filters:

```bash
npm run shark:snapshot -- --league=MLB
npm run shark:snapshot -- --league=MLB --date=today
npm run shark:snapshot -- --league=ALL --date=all --out=public/data/latest-board.json
```

The generated file is:

```text
public/data/latest-board.json
```

## Remote snapshot URL

The included GitHub Actions workflow publishes generated data to a separate `snapshot-data` branch so it does not trigger Railway redeploys.

After the workflow runs, set this on the web service:

```bash
SHARKEDGE_BOARD_SNAPSHOT_URL=https://raw.githubusercontent.com/steveo1287/SharkEdge/snapshot-data/data/latest-board.json
```

Optional cache settings:

```bash
SHARKEDGE_BOARD_SNAPSHOT_CACHE_TTL_MS=60000
SHARKEDGE_LOCAL_BOARD_SNAPSHOT_CACHE_TTL_MS=5000
```

## Railway lockdown settings

Use these while the account is burned up:

```bash
SHARKEDGE_ALLOW_LIVE_BOARD_FALLBACK=false
SHARKEDGE_BOARD_SNAPSHOT_URL=https://raw.githubusercontent.com/steveo1287/SharkEdge/snapshot-data/data/latest-board.json
```

Then stop or delete separate Railway worker services:

- `odds-worker`
- `mlb-odds-worker`
- `sim-worker`
- `ufc-worker`
- `maintenance-worker`, unless needed manually

## Snapshot workflow

The workflow is manual on purpose:

```text
.github/workflows/sharkedge-board-snapshot.yml
```

Run it from GitHub Actions when you want a new snapshot. It writes only to the `snapshot-data` branch.

Do not make the workflow commit snapshots to `main`; that would trigger Railway redeploys and defeat the purpose.

## Cost rule

The web app should only display cached board data. Ingestion, scoring, simulations, and provider diagnostics should happen outside the request path.
