# MLB Raw Feeds Setup

Use a free GitHub Raw URL for each optional MLB data source. SharkEdge caches these feeds, so they are cheap to run.

## Recommended Env Vars

```env
FANGRAPHS_PLAYER_FEED_URL=https://raw.githubusercontent.com/<username>/<repo>/main/players.csv
MLB_TEAM_ANALYTICS_URL=https://raw.githubusercontent.com/<username>/<repo>/main/team-analytics.csv
MLB_STATCAST_SPLITS_URL=https://raw.githubusercontent.com/<username>/<repo>/main/statcast-splits.csv
MLB_TEAM_RATINGS_URL=https://raw.githubusercontent.com/<username>/<repo>/main/ratings.csv
```

## Templates

- `data/mlb/fangraphs-player-feed.example.csv`
- `data/mlb/team-analytics-feed.example.csv`
- `data/mlb/statcast-splits-feed.example.csv`
- `data/mlb/ratings-feed.example.csv`

## Source Labels

- `FANGRAPHS_PLAYER_FEED_URL`: treated as real player analytics.
- `MLB_TEAM_ANALYTICS_URL`: treated as real team analytics.
- `MLB_STATCAST_SPLITS_URL`: treated as real Statcast split context.
- `MLB_TEAM_RATINGS_URL`: treated as real ratings only if explicitly provided.
- MLB official roster-derived values remain `estimated`.
- Synthetic fallbacks remain low-weight and should not drive attack confidence.

## After Setting Env Vars

Check:

```text
/api/mlb/player-analytics
/api/mlb/team-analytics
/api/mlb/internal-statcast-splits
/api/sim/health
/sim/mlb
```

The goal is for `/api/sim/health` to show real player/team sources, real or estimated ratings, and fewer warnings.
