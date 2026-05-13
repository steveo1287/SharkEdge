# SharkTrends Implementation Audit

## Existing trend files inspected

- `app/sharktrends/page.tsx` and related SharkTrends subpages already existed for market intelligence, warehouse refresh, verification, provider trigger, generated runners, system pages, and MLB stat trends.
- `app/api/sharktrends/*` already contained multiple operational APIs for verification, factory, generated runner, market intelligence, and historical audit.
- `app/api/trends/*` and `services/trends/*` already provided the legacy trend center, saved trend rows, matching games, AI query helpers, and trend query execution.

## Existing historical odds files inspected

- `services/historical-odds/ingestion-service.ts`
- `services/historical-odds/backfill-service.ts`
- `services/historical-odds/sportsbookreview-import-service.ts`
- `services/historical-odds/arnavsaraogi-mlb-import-service.ts`
- `scripts/import-sportsbookreview-historical.ts`
- `scripts/import-arnavsaraogi-mlb-historical.ts`
- `scripts/backfill-historical-intelligence.ts`
- `docs/HYBRID_HISTORICAL_ODDS_PIPELINE.md`

These are preserved. SharkTrends reuses the existing Event/EventMarket/EventMarketSnapshot warehouse rather than creating a second historical odds store.

## Existing Prisma models reused

- `Event`
- `EventParticipant`
- `EventResult`
- `EventMarket`
- `EventMarketSnapshot`
- `Sportsbook`
- `SavedTrend`
- `TrendRun`
- `RetrosheetGame`
- `RetrosheetTeamGameStat`
- `RetrosheetPitchingGameStat`
- `MlbTeamEloSnapshot`
- `MlbPitcherRollingSnapshot`

## Prisma models extended

Added `MlbGameContext`, mapped to `mlb_game_context`, as a derived MLB trend context layer. It stores one row per event/team side/market where source data exists. It does not replace the odds warehouse.

## APIs/pages preserved

- Existing `/sharktrends/*` subpages remain available.
- Existing `/trends/*` APIs and pages are not removed.
- Existing board, matchup, sim, and provider routes are not modified by this pass.

## Missing pieces found

- There was no single MLB-first trend context table that combined pregame odds, grading, source keys, and Retrosheet/context fields.
- Coverage was scattered across historical audit tooling but not exposed as a small product API.
- Natural-language trend parsing was not deterministic for the MLB examples requested here.
- Saved systems existed, but SharkTrends needed a product-specific wrapper that saves structured filters and last result snapshots.
- Live qualifiers needed to explicitly distinguish matched conditions from missing/unavailable conditions.
- The first context pass did not expose enough historical values for TrendsCenter-style schedule/form angles, so the builder now derives rest, travel spot, recent runs, Retrosheet park, pregame Elo, and starter rolling form when those inputs exist.

## Proposed and implemented file plan

- `src/server/sharktrends/coverage.ts`
- `src/server/sharktrends/types.ts`
- `src/server/sharktrends/filter-schema.ts`
- `src/server/sharktrends/query-parser.ts`
- `src/server/sharktrends/data-quality.ts`
- `src/server/sharktrends/mlb-context-builder.ts`
- `src/server/sharktrends/backtest-engine.ts`
- `src/server/sharktrends/live-qualifiers.ts`
- `src/server/sharktrends/saved-systems.ts`
- `src/server/sharktrends/catalog.ts`
- `scripts/build-sharktrends-mlb-context.ts`
- `app/api/sharktrends/coverage/route.ts`
- `app/api/sharktrends/backtest/route.ts`
- `app/api/sharktrends/qualifiers/route.ts`
- `app/api/sharktrends/catalog/route.ts`
- `app/api/sharktrends/systems/*`
- `components/sharktrends/*`
- `app/sharktrends/page.tsx`

## Migration plan

1. Deploy Prisma migration `20260513010000_sharktrends_mlb_context`.
2. Run existing historical importers/backfills first if data is missing:
   - `npm run historical:import:sbr`
   - `npm run historical:import:arnav-mlb`
   - `npm run historical:backfill`
3. Run Retrosheet ingest/features if Retrosheet CSV files are available:
   - `npm run retrosheet:ingest -- --dir <csv-dir>`
   - `npm run retrosheet:features`
4. Build the derived context:
   - `npm run sharktrends:mlb-context -- --dry-run`
   - `npm run sharktrends:mlb-context -- --rebuild`

## Testing plan

- Coverage tests for empty and grouped warehouse states.
- Parser tests for Wrigley/favorite/wind, road underdog, and unresolved travel/bullpen fields.
- Context builder tests for moneyline, total, spread grading, and quality scoring.
- Backtest tests for American odds ROI, push handling, filtering, and exact match output.
- Live qualifier tests for matched conditions and missing-condition suppression.
- Catalog/API contract tests to ensure presets validate against the SharkTrend filter schema.

## Guardrails

- No fake trends are generated.
- Historical backtests read from pregame/historical derived context only.
- Missing context fields create warnings or suppress qualifiers instead of creating fake matches.
- Positive ROI is displayed as historical context, not a pick guarantee.
- Derived form values only look at prior games by start time, never future games.
