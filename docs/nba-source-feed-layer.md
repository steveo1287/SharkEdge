# NBA source feed layer

This layer lets SharkEdge consume useful NBA data from licensed/exported sources without hard-coding scrapers into the sim model.

## Why this exists

The NBA side model already reads four generic feeds:

- `NBA_TEAM_ANALYTICS_URL`
- `NBA_PLAYER_ANALYTICS_URL`
- `NBA_RECENT_FORM_URL`
- `NBA_GAME_RATINGS_URL`

This PR adds a normalized bridge endpoint that can combine provider-specific feeds into those four generic model feeds:

```text
/api/simulation/nba/source-feed?kind=team
/api/simulation/nba/source-feed?kind=player
/api/simulation/nba/source-feed?kind=history
/api/simulation/nba/source-feed?kind=rating
```

The bridge reads provider-specific env URLs, tags every row with source metadata, sorts by source priority, and returns rows in the same array/body shapes the current NBA model already understands.

## Security

Set `NBA_SOURCE_FEED_TOKEN` to require either:

```text
Authorization: Bearer <token>
```

or:

```text
?token=<token>
```

If `NBA_SOURCE_FEED_TOKEN` is missing, the route is open. Use a token in production.

## Generic model env wiring

Point the existing model env vars at SharkEdge's source bridge:

```bash
NBA_TEAM_ANALYTICS_URL="https://sharkedge.vercel.app/api/simulation/nba/source-feed?kind=team&token=$NBA_SOURCE_FEED_TOKEN"
NBA_PLAYER_ANALYTICS_URL="https://sharkedge.vercel.app/api/simulation/nba/source-feed?kind=player&token=$NBA_SOURCE_FEED_TOKEN"
NBA_RECENT_FORM_URL="https://sharkedge.vercel.app/api/simulation/nba/source-feed?kind=history&token=$NBA_SOURCE_FEED_TOKEN"
NBA_GAME_RATINGS_URL="https://sharkedge.vercel.app/api/simulation/nba/source-feed?kind=rating&token=$NBA_SOURCE_FEED_TOKEN"
```

Do not point provider-specific URLs back to the SharkEdge bridge route. The bridge ignores recursive URLs, but it should still be avoided.

## Provider-specific env vars

### Team feed sources

```bash
NBA_STATS_TEAM_ADVANCED_URL=
NBA_OFFICIAL_TEAM_ADVANCED_URL=
NBA_CTG_TEAM_URL=
CLEANING_THE_GLASS_TEAM_URL=
NBA_PBPSTATS_TEAM_URL=
NBA_PBPSTATS_LINEUPS_URL=
NBA_BIGDATABALL_TEAM_URL=
BIGDATABALL_NBA_TEAM_URL=
NBA_KAGGLE_TEAM_URL=
KAGGLE_NBA_TEAM_URL=
```

### Player feed sources

```bash
NBA_DUNKS_THREES_EPM_URL=
DUNKS_THREES_EPM_URL=
NBA_EPM_PLAYER_URL=
NBA_STATS_PLAYER_ADVANCED_URL=
NBA_OFFICIAL_PLAYER_ADVANCED_URL=
NBA_BREF_PLAYER_ADVANCED_URL=
BASKETBALL_REFERENCE_PLAYER_URL=
NBA_BIGDATABALL_PLAYER_URL=
BIGDATABALL_NBA_PLAYER_URL=
```

### History feed sources

```bash
NBA_BREF_HISTORY_URL=
BASKETBALL_REFERENCE_HISTORY_URL=
NBA_STATHEAD_HISTORY_URL=
STATHEAD_NBA_EXPORT_URL=
NBA_PBPSTATS_HISTORY_URL=
NBA_PBPSTATS_LINEUP_HISTORY_URL=
NBA_BIGDATABALL_HISTORY_URL=
BIGDATABALL_NBA_HISTORY_URL=
```

### Rating fallback sources

```bash
NBA_ROSTER_RATINGS_URL=
NBA_2K_RATINGS_URL=
NBA_EXTERNAL_RATINGS_URL=
```

## Preferred source priority

### Team

1. NBA Stats official advanced/tracking
2. Cleaning the Glass garbage-time-filtered team context
3. PBP Stats possession and lineup context
4. BigDataBall validated data
5. Kaggle historical fallback

### Player

1. Dunks & Threes EPM
2. NBA Stats official advanced/tracking
3. Basketball-Reference player advanced/historical
4. BigDataBall validated player data

### History

1. Basketball-Reference historical team/player
2. Stathead query exports
3. PBP Stats possession and lineup history
4. BigDataBall historical games/odds

### Rating

1. Roster/video-game/external rating feed as a soft fallback only

## Accepted response shapes

Each provider URL may return any of these shapes:

```json
[{ "teamName": "Boston Celtics", "offensiveRating": 120.1 }]
```

```json
{ "rows": [] }
```

```json
{ "data": [] }
```

```json
{ "teams": [] }
```

```json
{ "players": [] }
```

```json
{ "history": [] }
```

```json
{ "ratings": [] }
```

## Row metadata added by SharkEdge

The bridge adds these fields to every row:

```ts
__source: string;
__sourceLabel: string;
__sourceTier: "core" | "advanced" | "premium" | "historical" | "fallback";
__sourcePriority: number;
__sourceWeight: number;
__license: "public-or-self-hosted" | "requires-license" | "subscription";
```

The existing NBA model ignores unknown fields, but these are stored in the feed and can be used later for source weighting, audit displays, and tuner buckets.

## Model field examples

### Team rows

Useful fields include:

```json
{
  "teamName": "Boston Celtics",
  "offensiveRating": 120.1,
  "defensiveRating": 111.4,
  "netRating": 8.7,
  "trueShooting": 61.2,
  "effectiveFg": 57.8,
  "threePointRate": 47.0,
  "threePointAccuracy": 38.5,
  "rimPressure": 3.1,
  "freeThrowRate": 21.4,
  "turnoverRate": 12.6,
  "offensiveReboundRate": 27.4,
  "defensiveReboundRate": 73.2,
  "pace": 98.6,
  "transition": 2.7,
  "halfCourt": 4.1,
  "clutch": 1.2,
  "rest": 0.5,
  "travel": -0.2,
  "recentForm": 3.6,
  "homeAdvantage": 2.4,
  "injuryDrag": 0.7
}
```

### Player rows

Useful fields include:

```json
{
  "teamName": "Boston Celtics",
  "playerName": "Player Name",
  "minutes": 34,
  "impactRating": 5.1,
  "epm": 4.8,
  "bpm": 3.9,
  "usageCreation": 4.2,
  "onOffImpact": 6.5,
  "spacing": 3.1,
  "playmaking": 2.4,
  "rimPressure": 1.8,
  "rebounding": 1.2,
  "perimeterDefense": 2.1,
  "rimProtection": 0.6,
  "depthPower": 1.0,
  "injuryPenalty": 0,
  "fatigue": 0.2,
  "volatility": 1.1
}
```

### History rows

Useful fields include:

```json
{
  "teamName": "Boston Celtics",
  "headToHeadEdge": 0.8,
  "recentOffense": 3.2,
  "recentDefense": 2.1,
  "recentShooting": 1.7,
  "recentTurnovers": -0.5,
  "recentRebounding": 0.9,
  "starMatchup": 1.4,
  "benchTrend": 0.7,
  "restHistory": 0.3,
  "clutchRecent": 0.2,
  "sample": 24
}
```

## Compliance rule

Use official APIs, licensed exports, or self-hosted transformed datasets. Do not add direct scraping of paid or restricted pages inside the SharkEdge runtime.
