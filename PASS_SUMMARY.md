SharkEdge Probability Fusion Pass

Implemented against the uploaded repo snapshot.

Core upgrades:
- Added trend posterior shrinkage layer under `frontend/services/trends/posterior/trend-posterior.ts`
- Updated active trend signals to use posterior probability / uncertainty instead of raw hit-rate edge only
- Added market calibration utility under `frontend/services/modeling/probability-calibration.ts`
- Upgraded MLB simulation output with calibrated win probability metadata and uncertainty scoring
- Added opportunity probability fusion layer under `frontend/services/opportunities/opportunity-probability-fusion.ts`
- Integrated probability fusion into `opportunity-service.ts`
- Updated opportunity scoring to account for posterior edge and uncertainty penalty
- Added probability fusion types to `frontend/lib/types/opportunity.ts`
- Added new tests for trend posterior and probability fusion

Limits of this pass:
- This does not wire a live weather feed into MLB sim; it adds the calibration hook and uncertainty haircut instead
- This does not replace the full non-MLB generic model engine yet
- This does not add a new database persistence layer for posterior snapshots
- This was done without installing repo dependencies in the container, so full runtime verification still needs local/project install

Second upgrade: Generic Projection Hardening Pass

Core upgrades:
- Added `frontend/services/modeling/team-projection-core.ts`
- Replaced the shallow non-MLB team event projection block in `frontend/services/modeling/model-engine.ts` with a recency-weighted generic projection core
- Added sport-aware baseline configs for NBA, NCAAB, NHL, NFL, NCAAF, UFC, and BOXING
- Added confidence-aware projection metadata: `confidenceLabel`, `confidenceScore`, `uncertaintyScore`, `confidencePenalty`, `projectionBand`, and weighted input summaries
- Added probability calibration to generic event projections so non-MLB outputs are less overconfident
- Upgraded generic player-prop projections to use weighted means instead of flat averages
- Added `frontend/tests/team-projection-core.test.ts`

Limits of this second pass:
- This is still a generic cross-sport projection engine, not a sport-specific elite simulator for every league
- No live lineup/injury/weather feed is wired into the generic model path
- Confidence is now more disciplined, but league-specific calibration datasets are still the next major step

Third upgrade: Weather + Combat Modeling Pass

Core upgrades:
- Added `frontend/services/modeling/weather-context.ts` for venue/weather-aware scoring adjustments and uncertainty penalties
- Wired outdoor-weather handling into the generic event projection path, with `WINDY` recognized as a first-class weather source key when event metadata carries a weather snapshot
- Added `frontend/services/modeling/fight-projection-core.ts` so UFC and boxing no longer run through the generic team-sport path
- Updated `frontend/services/modeling/model-engine.ts` to:
  - route UFC/BOXING events through the fight-specific projection engine
  - merge competitor, participant, and participant-context metadata into the fight model
  - apply weather adjustments to outdoor team-sport projections
- Extended generic projection metadata to include weather diagnostics and weather-driven uncertainty
- Added tests:
  - `frontend/tests/weather-context.test.ts`
  - `frontend/tests/fight-projection-core.test.ts`
  - updated `frontend/tests/team-projection-core.test.ts`

Limits of this third pass:
- This does not fetch live Windy data directly in this environment; it adds the contract/hook so stored event metadata can carry Windy-derived snapshots cleanly
- UFC/boxing still need richer fighter-history feeds for truly elite method and round modeling
- Weather adjustments are now explicit and uncertainty-aware, but they are still deterministic heuristics until a live venue-weather warehouse is wired

Fourth upgrade: Weather + Combat Feature Warehouse Pass

Core upgrades:
- Added `frontend/services/modeling/weather-snapshot-warehouse.ts` to normalize event weather metadata into a reusable weather snapshot + derived buckets
- Added `frontend/services/modeling/fight-history-warehouse.ts` to derive combat matchup buckets like finish pressure, fighter quality, durability edge, and style conflict
- Extended trend discovery inputs so weather and combat buckets are first-class fields:
  - `weatherBucket`
  - `altitudeBucket`
  - `fighterQualityBucket`
  - `opponentQualityBucket`
  - `finishPressureBucket`
  - `durabilityEdgeBucket`
  - `styleConflictBucket`
- Updated `frontend/services/trends/historical-row-extractor.ts` to enrich stored trend rows with these features
- Updated `frontend/services/trends/discovery/feature-registry.ts` so discovery can actually use the new weather/combat lanes
- Updated `frontend/services/modeling/model-engine.ts` to expose combat feature buckets alongside fight projections
- Added tests:
  - `frontend/tests/weather-snapshot-warehouse.test.ts`
  - `frontend/tests/fight-history-warehouse.test.ts`

Limits of this fourth pass:
- Weather buckets still depend on event metadata carrying a snapshot; there is no live Windy pull worker yet
- Combat buckets are now reusable and trendable, but still need richer historical fight-stat ingestion for top-end round/method accuracy
- This is the warehouse/scaffolding layer, not the final live ingestion layer
