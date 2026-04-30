# NBA free warehouse wiring

This wires free NBA historical/current data into the existing SharkEdge NBA source-feed/model path.

## Source stack

Use this order:

1. Kaggle `eoinamoore/historical-nba-data-and-player-box-scores` for historical games, team box scores, and player box scores.
2. `hoopR` / SportsDataverse for bulk historical NBA play-by-play, schedule, team box, and player box data.
3. `nba_api` for current official NBA.com/stats pulls.
4. `pbpstats` / PBP Stats for possession, lineup, on-floor, and second-chance enrichment.

The app does not scrape paid pages. Use licensed exports or self-hosted transformed datasets for paid/subscription providers.

## Automated GitHub feeder

The repo includes a manual/nightly GitHub Action:

```text
.github/workflows/nba-warehouse-refresh.yml
```

It does this:

1. downloads the Kaggle NBA dataset,
2. builds `data/nba/raw/game_ids.txt`,
3. optionally runs PBP Stats enrichment,
4. builds model-ready warehouse feeds,
5. uploads the feeds as an artifact,
6. optionally commits `data/nba/warehouse/*.json` back to the branch.

Required repository secrets:

```text
KAGGLE_USERNAME
KAGGLE_KEY
```

Manual run options:

```text
include_pbpstats: false | true
pbp_limit: number of PBP games to process
commit_feeds: true | false
```

Recommended first run:

```text
include_pbpstats=false
commit_feeds=true
```

Then run a smaller PBP enrichment batch:

```text
include_pbpstats=true
pbp_limit=100
commit_feeds=true
```

Once `data/nba/warehouse/*.json` exists on `main`, production reads the warehouse first and only falls back to official NBA Stats if the warehouse is missing or empty.

## Fetch raw free data locally

### Kaggle NBA database

Install and configure the Kaggle CLI outside Vercel:

```bash
python -m pip install kaggle
mkdir -p ~/.kaggle
# Put your Kaggle API token at ~/.kaggle/kaggle.json
chmod 600 ~/.kaggle/kaggle.json
```

Download the dataset:

```bash
npm run nba:warehouse:fetch:kaggle -- data/nba/raw
```

This pulls:

```text
eoinamoore/historical-nba-data-and-player-box-scores
```

The warehouse builder directly recognizes common files from that dataset, including:

```text
Games.csv
TeamStatistics.csv
PlayerStatistics.csv
LeagueSchedule24_25.csv
```

### Build game ids for PBP Stats

```bash
npm run nba:warehouse:game-ids -- --input=data/nba/raw --out=data/nba/raw/game_ids.txt --limit=500
```

Useful filters:

```bash
npm run nba:warehouse:game-ids -- --input=data/nba/raw --out=data/nba/raw/game_ids.txt --season=2024 --limit=250
npm run nba:warehouse:game-ids -- --input=data/nba/raw --out=data/nba/raw/game_ids.txt --since=2024-10-01 --limit=250
```

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

### PBP Stats possession enrichment

Install the Python package:

```bash
python -m pip install pbpstats pandas
```

Run from generated game ids:

```bash
npm run nba:warehouse:fetch:pbpstats -- data/nba/raw --games-file=data/nba/raw/game_ids.txt --limit=100 --skip-existing
```

or for a small batch:

```bash
npm run nba:warehouse:fetch:pbpstats -- data/nba/raw --games=0022300001,0022300002
```

This writes:

```text
data/nba/raw/pbpstats_possessions.json
data/nba/raw/pbpstats_team_enrichment.json
data/nba/raw/pbpstats_errors.json
```

The warehouse builder consumes `pbpstats_team_enrichment.json` and blends it into the team and history feeds.

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

## What the Kaggle path adds

The builder handles Kaggle naming/column variations and converts them into the same model-ready feed shapes the NBA real-data model requires:

- team offensive/defensive rating
- net rating
- true shooting
- effective field goal percentage
- three-point rate and accuracy
- free-throw rate
- turnover rate
- offensive/defensive rebound rate
- pace estimate
- recent form
- player impact proxies
- player spacing/playmaking/rim pressure/rebounding/defense proxies
- derived rating fallback

When `TeamStatistics.csv` has two rows per game, the builder derives opponent points from the opposite team row in the same game. That prevents defensive rating from collapsing to zero when the source only stores each team's own box-score line.

## What the PBP Stats path adds

PBP Stats enrichment gives the warehouse possession-level context that box scores cannot provide cleanly:

- possession count
- points per possession
- points per 100 possessions
- average possession score margin
- second-chance time per possession
- offensive rebounds per possession
- events per possession
- on-floor player lists when available in the possession payload

Those fields are blended into:

- `team-feed.json`
  - offensive rating
  - net rating
  - pace
  - offensive rebound rate
  - half-court edge
  - transition/second-chance edge

- `history-feed.json`
  - recent offense
  - recent defense
  - recent rebounding
  - clutch recent proxy
  - PBP possession sample

## Serve the warehouse feeds

Route:

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

Point the existing model hooks at the warehouse feed route if you want explicit routing:

```bash
NBA_TEAM_ANALYTICS_URL="https://sharkedge.vercel.app/api/simulation/nba/warehouse-feed?kind=team&token=$NBA_WAREHOUSE_FEED_TOKEN"
NBA_PLAYER_ANALYTICS_URL="https://sharkedge.vercel.app/api/simulation/nba/warehouse-feed?kind=player&token=$NBA_WAREHOUSE_FEED_TOKEN"
NBA_RECENT_FORM_URL="https://sharkedge.vercel.app/api/simulation/nba/warehouse-feed?kind=history&token=$NBA_WAREHOUSE_FEED_TOKEN"
NBA_GAME_RATINGS_URL="https://sharkedge.vercel.app/api/simulation/nba/warehouse-feed?kind=rating&token=$NBA_WAREHOUSE_FEED_TOKEN"
```

If these env vars are absent, the NBA model still self-wires to official NBA Stats fallback. Warehouse files remain preferred when present.

## Local warehouse directory

The API route reads from:

```text
data/nba/warehouse
```

Override with:

```bash
NBA_WAREHOUSE_DIR=/absolute/path/to/data/nba/warehouse
```

## Production note

Vercel serverless builds should not perform massive historical downloads. The GitHub Action or a local worker should fetch Kaggle/PBP Stats and commit/host generated warehouse JSON. Production should only read generated JSON, not raw CSVs.

For full historical play-by-play and possession enrichment, object storage is the cleanest production path. For a first production feed, committing generated current/curated feed JSON is acceptable if file size stays manageable.

## Why this matters

The NBA sim can now consume a Retrosheet-style free warehouse instead of relying on synthetic priors. This improves:

- team strength
- pace/tempo
- offensive/defensive rating
- possession-level quality
- lineup/on-floor context when available
- second-chance and rebound context
- player impact
- recent form
- history priors
- derived ratings fallback
- graded-pick tuner rows
