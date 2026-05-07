# MLB FanGraphs Raw Feed

SharkEdge can read MLB player analytics from a free GitHub Raw CSV or JSON URL.

## Environment Variable

Set this in Vercel/Railway:

```env
FANGRAPHS_PLAYER_FEED_URL=https://raw.githubusercontent.com/<username>/<repo>/main/players.csv
```

This feed is preferred before generic `MLB_PLAYER_ANALYTICS_URL` / `MLB_PLAYER_STATS_URL`.

## CSV Columns

Use any of these common names. The parser is case/punctuation tolerant.

Required:
- `Name` or `playerName`
- `Team` or `teamName`

Useful hitter fields:
- `PA`
- `Pos`
- `wRC+`
- `xwOBA` or `wOBA`
- `ISO`
- `K%`
- `BB%`
- `HardHit%`
- `Barrel%`
- `BsR`
- `Def`, `DRS`, or `OAA`
- `Bats`
- `Status`

Useful pitcher fields:
- `IP`
- `Pos`
- `ERA`
- `WHIP`
- `ERA-`
- `xFIP`, `FIP`, or `SIERA`
- `K%`
- `BB%`
- `GB%`
- `Throws`
- `Status`

See `data/mlb/fangraphs-player-feed.example.csv` for a small template.

## JSON Shape

JSON can be an array or wrapped in one of these keys:

```json
{
  "players": [
    {
      "playerName": "Aaron Judge",
      "teamName": "NYY",
      "playerType": "hitter",
      "projectedPa": 4.55,
      "wrcPlus": 176,
      "xwoba": 0.430,
      "isoPower": 0.360,
      "kRate": 24.8,
      "bbRate": 16.1
    }
  ]
}
```

## Source Rules

- FanGraphs raw feed rows are treated as `real`.
- MLB official roster-derived rows are treated as `estimated`.
- Synthetic rows are only used when no real/estimated source exists.

That keeps the model honest: no fake data gets labeled as premium signal.
