# SharkTrends README

SharkTrends is the MLB-first historical trend discovery and live qualifier layer inside SharkEdge.

It is designed for TrendsCenter-style questions such as:

- Home favorites in a specific moneyline bucket.
- Road underdogs after low-scoring games.
- Wrigley overs when wind is blowing out.
- Low total unders.
- Short-rest teams.
- Pitcher rolling-form systems.

SharkTrends does not fabricate records. Every backtest is based on stored MLB odds/context rows and shows sample size, exact matching games, and data-quality warnings.

## Data sources

SharkTrends reuses the existing SharkEdge warehouse:

- `Event`
- `EventParticipant`
- `EventResult`
- `EventMarket`
- `EventMarketSnapshot`
- `Sportsbook`
- Retrosheet-derived MLB context tables when imported

Recognized historical odds source keys:

- `oddsharvester_historical`
- `sportsbookreview_historical`
- `arnavsaraogi_mlb_scraper`

The Odds API historical data should stay supplemental patch data, not the foundation.

## Import SBR data

Use the existing importer:

```powershell
npm run historical:import:sbr -- --dir <path-to-sbr-archives>
```

The intended role is one-time 2010-2021 style backfill from SportsBookReviewOnline archives where available.

## Import Arnav MLB data

Use the existing importer:

```powershell
npm run historical:import:arnav-mlb -- --dir <path-to-arnav-output>
```

The intended role is 2019-present multi-book granularity where available.

## Run historical backfill

```powershell
npm run historical:backfill
```

This should enrich the existing event/market warehouse. It should not create a second odds-history system.

## Build MLB context

Dry-run first:

```powershell
npm run sharktrends:mlb-context -- --dry-run
```

Then build/update rows:

```powershell
npm run sharktrends:mlb-context -- --rebuild
```

Optional filters:

```powershell
npm run sharktrends:mlb-context -- --seasons=2024,2025 --markets=moneyline,total --limit=5000
```

## Coverage audit

API:

```text
GET /api/sharktrends/coverage
```

It returns actual stored coverage: date range, seasons, market counts, snapshot counts, graded event counts, source keys, market types, and warnings.

## Run a backtest

API:

```text
POST /api/sharktrends/backtest
```

Example body:

```json
{
  "input": "home favorites -140 to -180 since 2018",
  "includeMatches": true,
  "limit": 100
}
```

Structured filters can also be sent:

```json
{
  "filters": {
    "league": "MLB",
    "marketType": "moneyline",
    "side": "FAVORITE",
    "homeAway": "HOME",
    "favoriteMinAbsPrice": 140,
    "favoriteMaxAbsPrice": 180,
    "minDataQualityScore": 60
  },
  "includeMatches": true
}
```

## Interpreting results

- Flat stake is 1 unit.
- Positive American odds win profit = `odds / 100`.
- Negative American odds win profit = `100 / abs(odds)`.
- Loss = `-1`.
- Push = `0`.
- ROI = units divided by graded bets.
- Voids/ungraded rows are excluded from graded sample size.

Confidence grades are data-quality labels, not guarantees:

- A: sample >= 75 and quality >= 80 with no major flags.
- B: sample >= 40 and quality >= 70.
- C: sample >= 20 and quality >= 60.
- D: small/thin sample or weak quality.
- F: insufficient sample.

## Live qualifiers

API:

```text
POST /api/sharktrends/qualifiers
```

Qualifiers only appear when required conditions can be evaluated. If a system requires wind data and wind data is missing, SharkTrends will not fake the qualifier.

## Saved systems

APIs:

- `GET /api/sharktrends/systems`
- `POST /api/sharktrends/systems`
- `GET /api/sharktrends/systems/[id]`
- `POST /api/sharktrends/systems/[id]/run`
- `DELETE /api/sharktrends/systems/[id]`

Saved systems reuse the existing `SavedTrend` and `TrendRun` tables with a SharkTrends-specific JSON payload.

## Data-quality warnings

Warnings include:

- Small sample.
- Thin source coverage.
- Missing official results.
- Missing snapshots.
- One-book-only data.
- Missing weather.
- Missing Retrosheet context.
- No closing line.
- Mixed source keys.
- Stale or unavailable current odds.
- Qualifier condition not evaluable.

Warnings are part of the product, not noise. SharkTrends should never bury data problems.

## Known limitations

- Weather, rest, travel, division, bullpen stress, and starter form only work when those fields are present in `mlb_game_context`.
- The deterministic parser handles common baseball trend phrasing, but ambiguous natural language returns unresolved fields instead of guessing.
- Retrosheet is used only when imported. Do not call any output Retrosheet-powered unless source rows exist.
- Positive ROI trends are historical context, not betting guarantees.

## Future roadmap

- Add richer weather import and park wind classification.
- Add travel and night-game-to-day-game schedule derivations.
- Add bullpen stress from Retrosheet pitching appearances.
- Add scheduled context rebuild after historical imports.
- Add alerts for saved systems when live qualifiers appear.
