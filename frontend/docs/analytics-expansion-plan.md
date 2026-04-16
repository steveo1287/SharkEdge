# SharkEdge analytics expansion plan

## Goal
Upgrade SharkEdge from a market-plus-basic-history app into a deeper simulation and matchup intelligence platform that accounts for environmental, tactical, personnel, and market microstructure factors.

## What this patch adds
- `lib/types/analytics.ts`
  - shared types for environmental context, xfactors, ratings priors, and matchup reports
- `services/analytics/weather-model-service.ts`
  - multi-provider weather normalization and blended weather impact calculation
- `services/analytics/xfactor-engine.ts`
  - additive xfactor engine that scores weather, tempo, style, travel, offense-defense gap, and weak-prior ratings
- `app/api/v1/analytics/xfactors/route.ts`
  - API route to expose the enhancement report for UI or downstream sim hooks

## Strong next build phases
1. Provider layer
   - add server-side provider adapters for NOAA/NWS, Open-Meteo, Meteostat, and any licensed premium feed
   - do not scrape consumer sites without checking terms and licensing
2. Venue layer
   - add stadium coordinates, altitude, roof state, surface, park factor, and timezone
3. Travel layer
   - compute team travel miles, timezone delta, rest differential, circadian penalty, and road-trip density
4. Advanced matchup layer
   - team vs team: efg, xg, epa/play, success rate, havoc, pressure, shot profile, rebound rates
   - style vs style: pace pressure, transition rate, iso vs switch, rush/pass split, forecheck vs breakout, takedown vs takedown defense
   - player vs player: defender assignment, handedness/split, pitch mix, archetype conflict
5. Ratings priors
   - optional weak priors from external ratings or game ratings, capped at very low weight
6. Simulation wiring
   - feed these deltas into `services/modeling/model-engine.ts` and sport-specific sim services as pre-game priors and variance adjustments
7. Calibration
   - log every factor and backtest lift by league/market so weak factors get downgraded automatically

## Design constraints
- Weather and ratings should never dominate price, injuries, or core performance data
- Every factor should be explainable and auditable
- Every factor should have source labeling and confidence
- Unknown data should degrade gracefully, not fabricate precision
