# NBA free warehouse wiring

This wires free NBA historical/current data into the existing SharkEdge NBA source-feed/model path.

## Source stack

Use this order:

1. `hoopR` / SportsDataverse for bulk historical NBA play-by-play, schedule, team box, and player box data.
2. `nba_api` for current official NBA.com/stats pulls.
3. `pbpstats` for optional possession/lineup enrichment.

The app does not scrape paid pages. Use licensed exports or self-hosted transformed datasets for paid/subscription providers.

## Fetch raw free data

### hoopR historical backfill

```bash
Rscript scripts/fetch-nba-free-warehouse.R 2002 2026 data/nba/raw
```

This writes:

```text
data/nba/raw/nba_pbp.csv
data/nba/raw/nba_schedule.csv
data/nba/raw/nba_team_box.csv
data/nba/raw/nba_player_box.csv
```

### nba_api current refresh

```bash
python scripts/fetch-nba-api-current.py data/nba/raw
```

This writes:

```text
data/nba/raw/nba_api_team_advanced.json
data/nba/raw/nba_api_player_advanced.json
data/nba/raw/nba_api_games.json
```

### pbpstats possession enrichment

```bash
python scripts/fetch-pbpstats-nba.py data/nba/raw
```

This template explains the expected possession output. Put exports at:

```text
data/nba/raw/pbpstats_possessions.json
```

or:

```text
data/nba/raw/pbpstats_possessions.csv
```

## Build SharkEdge model feeds

After raw files exist:

```bash
npm run nba:warehouse:features -- --input=data/nba/raw --out=data/nba/warehouse
```

This writes:

```text
data/nba/warehouse/team-feed.json
data/nba/warehouse/player-feed.json
data/nba/warehouse/history-feed.json
data/nba/warehouse/rating-feed.json
```

## Serve the warehouse feeds

New route:

```text
/api/simulation/nba/warehouse-feed?kind=team
/api/simulation/nba/warehouse-feed?kind=player
/api/simulation/nba/warehouse-feed?kind=history
/api/simulation/nba/warehouse-feed?kind=rating
```

Optional token:

```text
NBA_WAREHOUSE_FEED_TOKEN
```

If missing, the route is open.

## Wire the NBA model env vars

Point the existing model hooks at the warehouse feed route:

```bash
NBA_TEAM_ANALYTICS_URL="https://sharkedge.vercel.app/api/simulation/nba/warehouse-feed?kind=team&token=$NBA_WAREHOUSE_FEED_TOKEN"
NBA_PLAYER_ANALYTICS_URL="https://sharkedge.vercel.app/api/simulation/nba/warehouse-feed?kind=player&token=$NBA_WAREHOUSE_FEED_TOKEN"
NBA_RECENT_FORM_URL="https://sharkedge.vercel.app/api/simulation/nba/warehouse-feed?kind=history&token=$NBA_WAREHOUSE_FEED_TOKEN"
NBA_GAME_RATINGS_URL="https://sharkedge.vercel.app/api/simulation/nba/warehouse-feed?kind=rating&token=$NBA_WAREHOUSE_FEED_TOKEN"
```

## Local warehouse directory

The API route reads from:

```text
data/nba/warehouse
```

Override with:

```bash
NBA_WAREHOUSE_DIR=/absolute/path/to/data/nba/warehouse
```

## Deployment note

Vercel serverless builds should not perform massive historical downloads. Run the fetch/build jobs on a local machine or worker, then either:

1. commit small/curated feed JSON files,
2. host the generated files in object storage and point provider env vars at them, or
3. mount/provide `NBA_WAREHOUSE_DIR` in an environment that supports persistent files.

For full historical play-by-play, object storage is the cleanest production path.

## Why this matters

The NBA sim can now consume a Retrosheet-style free warehouse instead of relying on synthetic priors. This improves:

- team strength
- pace/tempo
- offensive/defensive rating
- player impact
- recent form
- history priors
- derived ratings fallback
- graded-pick tuner rows
