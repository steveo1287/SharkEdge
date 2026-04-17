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

Fifth upgrade: Production Intelligence Worker Pass

Core upgrades:
- Added `frontend/services/weather/venue-weather-enrichment-service.ts`
  - resolves venue coordinates from metadata or known venue map
  - supports Windy-template and NWS fetch paths for live weather snapshots
  - merges normalized weather snapshots into event metadata
  - refreshes upcoming outdoor-event weather in a worker-friendly loop
- Added `frontend/services/modeling/fighter-history-service.ts`
  - builds reusable combat profiles from prior finished fights
  - derives historical win rate, finish/decision mix, opponent quality, activity, durability, power, and control scores
  - can refresh and persist combat profiles into `event_participant_context.metadataJson`
- Added worker scripts:
  - `frontend/scripts/worker-weather-snapshots.ts`
  - `frontend/scripts/worker-combat-profiles.ts`
- Updated `frontend/services/modeling/model-engine.ts` so UFC/boxing projections now consume live-built combat profiles, not just static metadata/record strings
- Added tests:
  - `frontend/tests/fighter-history-service.test.ts`
  - `frontend/tests/venue-weather-enrichment-service.test.ts`
- Added package scripts:
  - `worker:weather-snapshots`
  - `worker:combat-profiles`

Limits of this fifth pass:
- Windy integration is template/endpoint driven; it still needs the real production endpoint or key configured in env
- Venue geocoding currently prefers metadata and falls back to a starter venue map, not a full venue database yet
- Combat history is now real and reusable, but still limited by the depth/quality of historical fight results stored in the DB

Sixth upgrade: Persistence + Orchestration Layer Pass

Core upgrades:
- Added `frontend/services/intelligence/model-input-bundle-service.ts`
  - builds a stable event-level model input bundle
  - computes a deterministic `bundleHash` from real inputs only, excluding generation timestamp so stale checks do not false-trigger forever
- Added `frontend/services/intelligence/event-intelligence-snapshot-service.ts`
  - persists per-event orchestration state including stale flags, refresh actions, bundle hash, and latest projection summary
- Added `frontend/services/intelligence/intelligence-orchestrator.ts`
  - orders refresh flow as weather -> combat profiles -> bundle rebuild -> projection rerun -> snapshot persistence
  - adds stale-data guards for weather, combat profiles, and projections
  - persists both `modelInputBundle` and `intelligenceSnapshot` into `event.metadataJson`
- Updated `frontend/services/market-data/market-data-service.ts`
  - made event projection ingest idempotent via upsert on `(modelRunId, eventId)`
  - added duplicate suppression on player projection reruns
- Updated `frontend/services/modeling/fighter-history-service.ts`
  - now stamps `combatProfileGeneratedAt` so orchestration can reason about profile freshness
- Added worker entrypoint:
  - `frontend/scripts/worker-intelligence-orchestrator.ts`
- Added Netlify runtime entrypoints:
  - `frontend/netlify/functions/intelligence-orchestrator-scheduled.mts`
  - `frontend/netlify/functions/intelligence-refresh-background.mts`
- Added tests:
  - `frontend/tests/model-input-bundle-service.test.ts`
  - `frontend/tests/intelligence-orchestrator.test.ts`
- Updated package scripts:
  - `worker:intelligence-orchestrator`

What this pass enables:
- scheduled workers on a real cadence
- ordered refreshes instead of ad hoc recomputation
- stale-data guards for weather, combat profiles, and projections
- event-level intelligence snapshots persisted alongside event metadata
- cached model input bundles with deterministic bundle hashing
- projection reruns after upstream weather/profile refreshes without uncontrolled duplicate state

Limits of this sixth pass:
- scheduling is wired for Netlify and worker scripts, but production cadence tuning still needs live deploy observation
- latest projection selection still relies on current projection/model-run ordering, not a purpose-built projection snapshot table
- bundle persistence lives in event metadata for speed; a dedicated intelligence snapshot table is still a future scale upgrade

Seventh upgrade: UFC Fighter Intelligence Pass

Core upgrades:
- Added `frontend/services/modeling/ufc-fighter-intelligence.ts`
  - builds a richer UFC fighter profile from fight history, opponent quality, efficiency stats, pedigree, camp quality, training partners, physicality, and capped public-perception/video-game inputs
  - derives scores for:
    - strength of schedule
    - win quality
    - fraud-check / schedule softness
    - striking efficiency
    - striking defense
    - grappling control
    - anti-wrestling
    - submission threat
    - finishing pressure
    - round winning
    - durability trend
    - pedigree
    - camp quality
    - training partner quality
    - composite UFC fighter quality
  - emits scouting flags and a style archetype
- Updated `frontend/services/modeling/fighter-history-service.ts`
  - added `fetchCombatHistoryRowsForCompetitor(...)`
  - added `buildUfcFighterIntelligenceForCompetitor(...)`
  - upgraded `refreshCombatParticipantProfiles(...)` to persist `ufcIntelligenceProfile` and `ufcIntelligenceGeneratedAt` for UFC participants
  - added optional league filtering so UFC-specific refresh jobs can run cleanly
- Updated `frontend/services/modeling/model-engine.ts`
  - UFC projection path now merges live-built UFC fighter intelligence into projection metadata before running the fight model
- Rebuilt `frontend/services/modeling/fight-projection-core.ts`
  - fight projections now weigh opponent-adjusted quality, control-vs-anti-wrestling matchup, pedigree, camp quality, round-winning ability, and durability trend in addition to older record/form signals
  - upgraded diagnostics to expose quality and matchup edges
- Added `frontend/scripts/worker-ufc-intelligence.ts`
  - UFC-only intelligence refresh worker entrypoint
- Added tests:
  - `frontend/tests/ufc-fighter-intelligence.test.ts`
  - updated `frontend/tests/fight-projection-core.test.ts`
- Added package script:
  - `worker:ufc-intelligence`

What this pass enables:
- fighter profiles based on who they fought, how they fought, and how legit the opposition was
- camp / training-partner context as additive signal instead of narrative fluff
- amateur/pedigree inputs for lower-sample or prospect fighters
- stronger UFC-specific matchup logic inside the fight projection engine
- a cleaner path toward future UI fighter intelligence cards and UFC-specific betting surfaces

Limits of this seventh pass:
- amateur/camp/training metadata still depends on having source fields available in competitor/event metadata; this does not yet add a live third-party ingest crawler
- opponent quality is still derived from currently available fight history/records, not a dedicated long-horizon normalized opponent graph table
- video-game/public-perception inputs are deliberately capped and should stay secondary

Eighth upgrade: UFC Opponent Graph + Source Normalization Pass

Core upgrades:
- Added `frontend/services/modeling/ufc-source-profile.ts`
  - normalizes fighter-source metadata for camp, training partners, amateur record, wrestling level, BJJ level, kickboxing/boxing record, stance, age, reach, and height
  - computes a `sourceCompletenessScore` and pedigree tags so the model can reason about how complete/credible a fighter profile is
- Added `frontend/services/modeling/ufc-opponent-graph.ts`
  - builds a normalized opponent graph snapshot from tracked fight history
  - computes average opponent quality, best-win quality, weak-win count, bad-loss count, elite-opponent count, opposition tier, graph quality score, and consistency score
  - adds common-opponent comparison support between two fighters
- Updated `frontend/services/modeling/fighter-history-service.ts`
  - UFC participant refresh now persists:
    - `ufcOpponentGraph`
    - `ufcOpponentGraphGeneratedAt`
    - `ufcSourceProfile`
    - `ufcSourceProfileGeneratedAt`
  - this happens alongside existing `combatProfile` and `ufcIntelligenceProfile`
- Updated `frontend/services/modeling/model-engine.ts`
  - live UFC projection metadata now carries:
    - opponent graph score / opposition tier
    - source completeness score
    - common-opponent edge
- Updated `frontend/services/modeling/fight-projection-core.ts`
  - the UFC fight model now also considers:
    - opponent graph edge
    - source completeness edge
    - common-opponent edge
- Added tests:
  - `frontend/tests/ufc-source-profile.test.ts`
  - `frontend/tests/ufc-opponent-graph.test.ts`

What this pass enables:
- fighter profiles that know not just raw history, but how strong the opponent web actually is
- common-opponent comparison as a reusable UFC feature lane
- source quality awareness so low-information fighter profiles can be treated with more caution
- a cleaner foundation for future UI cards showing best wins, weak wins, bad losses, camp pedigree, and source completeness

Limits of this eighth pass:
- this is still built from available stored metadata/history, not a full external fighter-source crawler
- opponent graph is normalized and reusable, but not yet a dedicated DB graph table with long-horizon snapshots and cross-promotion linking

Ninth upgrade: UFC Source Import + Identity Resolution Pass

Core upgrades:
- Added `frontend/services/modeling/ufc-identity-resolution.ts`
  - scores and resolves incoming fighter-source profiles against existing combat competitors using name, alias, nickname, record, age, reach, and height signals
- Added `frontend/services/modeling/ufc-source-ingest-service.ts`
  - normalizes raw external/source fighter payloads into SharkEdge-readable metadata
  - imports source profiles onto competitor metadata so camps, aliases, amateur history, and partner data become live model inputs immediately after ingest
- Added `frontend/scripts/worker-ufc-source-import.ts`
  - imports JSON source-profile files into competitor metadata through the identity resolver
- Updated model-readiness indirectly by storing imported fields into the same metadata keys already consumed by the UFC model path
- Added tests:
  - `frontend/tests/ufc-identity-resolution.test.ts`
  - `frontend/tests/ufc-source-ingest-service.test.ts`
- Added package script:
  - `worker:ufc-source-import`

What this pass enables:
- ingesting external fighter dossiers instead of hand-editing competitor metadata
- resolving alternate names / aliases / nickname cases into the right fighter identity
- hydrating camp, amateur, pedigree, and partner data into the UFC model path automatically
- a real bridge from outside scouting sources into SharkEdge’s internal fighter engine

Limits of this ninth pass:
- this is a source-profile importer contract, not a live web crawler; it expects JSON payloads or future upstream fetchers to supply the raw source profiles
- identity resolution is heuristic and strong, but not yet a full graph DB with persistent cross-source identity nodes

Tenth upgrade: UFC Source Consensus + Fighter Dossier Pass

Core upgrades:
- Added `frontend/services/modeling/ufc-source-consensus.ts`
  - merges multiple imported source profiles into a weighted consensus view
  - computes source confidence and consensus fields across source payloads
- Updated `frontend/services/modeling/ufc-source-ingest-service.ts`
  - now preserves historical `combatSourceProfiles`
  - builds and stores `combatSourceConsensus`
  - keeps latest import while also maintaining multi-source history
- Added `frontend/services/modeling/ufc-fighter-dossier-service.ts`
  - assembles a product-ready UFC fighter dossier from identity data, source consensus, opponent graph, intelligence profile, best wins, and bad losses
  - supports dossier refresh/persistence for UFC competitors
- Added worker:
  - `frontend/scripts/worker-ufc-dossiers.ts`
- Added Netlify API function:
  - `frontend/netlify/functions/ufc-fighter-dossier.mts`
  - path: `/api/ufc/fighter-dossier`
- Added tests:
  - `frontend/tests/ufc-source-consensus.test.ts`
- Added package scripts:
  - `worker:ufc-dossiers`

What this pass enables:
- a real UFC profile surface instead of raw metadata blobs
- multi-source source-history with weighted consensus
- API access for a fighter dossier card/page in the UI
- persisted dossiers that can be refreshed for many UFC fighters at once

Limits of this tenth pass:
- the dossier API currently keys on `competitorId`; it is not yet a full public search/index route
- source collection is still dependent on imported source payloads rather than live crawlers/parsers

Eleventh upgrade: UFC Rankings + Division + Event Context Pass

Core upgrades:
- Added `frontend/services/modeling/ufc-division-catalog.ts`
  - canonical UFC division catalog with stable keys and alias normalization
- Added `frontend/services/modeling/ufc-rankings-service.ts`
  - normalizes ranking snapshots
  - resolves ranked fighters onto UFC competitors
  - persists division, ranking, and champion status onto fighter metadata
- Added `frontend/services/modeling/ufc-event-context-service.ts`
  - builds UFC event context from event metadata + fighter rank/champion state
  - marks title fights, ranked fights, and dossier readiness per fighter
  - supports persistence of `ufcEventContext` onto UFC events
- Added workers:
  - `frontend/scripts/worker-ufc-rankings.ts`
  - `frontend/scripts/worker-ufc-event-context.ts`
- Added Netlify API function:
  - `frontend/netlify/functions/ufc-event-context.mts`
  - path: `/api/ufc/event-context`
- Added tests:
  - `frontend/tests/ufc-division-catalog.test.ts`
  - `frontend/tests/ufc-rankings-service.test.ts`
  - `frontend/tests/ufc-event-context.test.ts`
- Added package scripts:
  - `worker:ufc-rankings`
  - `worker:ufc-event-context`

What this pass enables:
- reliable division normalization
- stable fighter ranking/champion metadata
- event cards/context that know the division, whether it is a title fight, and which fighters are ranked/champions
- a backend shape the UI can trust for rankings, divisions, champions, and UFC events without brittle string matching

Limits of this eleventh pass:
- ranking ingestion still expects a supplied ranking snapshot rather than a live rankings fetcher
- event context uses current fighter metadata and event metadata, so missing or stale division data still needs refresh discipline

Twelfth upgrade: UFC League Hub UI Pass

Core upgrades:
- Added `frontend/services/modeling/ufc-hub-service.ts`
  - gathers division rankings/champions and upcoming UFC event context into one UI-ready payload
- Added UFC UI components:
  - `frontend/components/ufc/ufc-rank-badge.tsx`
  - `frontend/components/ufc/ufc-league-desk.tsx`
- Added UFC fighter dossier page:
  - `frontend/app/ufc/fighters/[competitorId]/page.tsx`
- Added UFC route convenience page:
  - `frontend/app/ufc/page.tsx` redirecting to `/leagues/ufc`
- Updated `frontend/app/leagues/[league]/page.tsx`
  - UFC now renders a dedicated UFC league desk instead of the generic league layout
- UFC league desk now shows:
  - division sections
  - champion badges
  - ranked contenders
  - upcoming UFC events
  - title-fight / ranked-fight context
  - dossier links for fighters

What this pass enables:
- a visible UFC product surface for rankings, champions, divisions, events, and dossier routing
- one reliable UFC league page built off the normalized ranking/event-context layers from prior passes
- a direct UFC dossier route users can open from rankings and event cards

Limits of this twelfth pass:
- this is still a server-rendered first UI layer, not a polished full compare/search workflow yet
- empty states are still dependent on rankings/event metadata being populated by the ranking/event workers
