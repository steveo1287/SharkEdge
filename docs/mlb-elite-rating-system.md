# MLB elite rating system

## Purpose

`mlb-elite-rating-system-v1` is the top rating layer for SharkEdge MLB. It sits above `mlb-real-player-ratings-v1` and turns real player stats into bettor-facing simulation inputs for:

- full-game moneyline and totals
- F5 moneyline and totals
- NRFI/YRFI
- pitcher outs
- pitcher strikeouts
- hitter hits/total bases/home runs
- team offense, bullpen, defense, and lineup quality

## Design rule

The model should never depend on synthetic player data in production.

Allowed production source order:

1. Real MLB/statcast production and player IDs.
2. Rolling form and handedness splits.
3. Team defense, catcher framing, bullpen workload, and reliever availability.
4. Historical outcome and closing-market calibration.
5. MLB The Show/ShowZone/ShowDD only as a low-weight prior for sparse or noisy players.

## What the elite layer adds

The base real-stat builder already produces SharkEdge-compatible player ratings. The elite layer adds the missing betting-grade pieces:

| Layer | What it adds |
| --- | --- |
| Statcast tendency overlay | xBA, xSLG, xwOBA, barrel%, hard-hit%, exit velocity, chase%, whiff%, CSW%, GB%, velocity, pitch model scores |
| Rolling form | 7/14/30-day expected production and rolling OPS/wOBA |
| Platoon handling | separate left/right batter and pitcher split pressure |
| Reliability | sample-size and feature-coverage confidence per player |
| Uncertainty | missing-data and low-sample penalty used for pass/low-confidence decisions |
| Defense context | OAA, DRS, catcher framing, and pitcher defense support |
| Bullpen context | top-reliever score, fatigue index, unavailable reliever leverage penalty |
| Market calibration | optional closing no-vig or historical ledger adjustment without letting market override skills |

## Files

- `services/simulation/mlb-elite-rating-system.ts`
  - `buildMlbEliteRatingSystem()`
  - `buildMlbEliteTeamRating()`
  - `deriveMlbEliteGameSimulationInputs()`

- `tests/mlb-elite-rating-system.test.ts`
  - verifies elite player ratings
  - verifies elite team scores
  - feeds output into player-stat projections
  - feeds output into NRFI/F5 inning projections

## Player-level outputs

Every elite player keeps the existing `MlbProjectionRating` shape so the current simulator does not need to be rewritten.

Additional metadata is stored in `metrics_json`:

```ts
{
  ratingSystem: "mlb-elite-rating-system-v1",
  sourceKind: "REAL_STATS",
  eliteReliability: number,
  eliteUncertainty: number,
  eliteCompleteness: number,
  marketCalibrationAdjustment: number,
  statcastOverlay: {...}
}
```

Production gates should reject or heavily downgrade any MLB sim row where core players do not have:

```ts
metrics_json.sourceKind === "REAL_STATS"
metrics_json.ratingSystem === "mlb-elite-rating-system-v1"
```

## Hitter scoring

| Rating | Inputs |
| --- | --- |
| Contact | xBA, whiff%, zone-contact%, K%, line-drive% |
| Power | xSLG, expected OPS, barrel%, hard-hit%, average/max EV, pull-air% |
| Discipline | xwOBA, chase%, BB%, whiff%, zone-contact% |
| Current form | rolling 7/14/30 xwOBA and rolling OPS |
| Platoon | vs LHP/RHP wOBA and ISO |
| Baserunning | sprint speed and baserunning runs |
| Fielding | OAA and DRS |

## Pitcher scoring

| Rating | Inputs |
| --- | --- |
| xERA quality | xERA, xwOBA allowed, xBA allowed, xSLG allowed, hard-hit allowed |
| FIP/contact quality | barrel allowed, hard-hit allowed, exit velocity allowed, groundball rate |
| K-BB | K%, BB%, K-BB%, first-pitch strike%, zone rate |
| HR risk | barrel allowed, xSLG allowed, hard-hit allowed, groundball profile |
| Arsenal | whiff%, CSW%, chase%, velocity, pitch-model stuff/location/pitching |
| Stamina | IP/start, pitches/start, workload, rest |
| Platoon stability | vs LHB/RHB wOBA gap |

## Team-level outputs

`buildMlbEliteTeamRating()` creates:

- offense score
- contact score
- power score
- discipline score
- platoon score
- speed score
- defense score
- starter score
- bullpen score
- bullpen fatigue penalty
- reliability
- uncertainty

`deriveMlbEliteGameSimulationInputs()` converts both teams into the exact values needed by the NRFI/F5 inning engine.

## Accuracy guardrails

Promote a game to betting-grade only when:

- 9 projected hitters match the rating feed.
- Starting pitcher is matched by MLBAM ID or normalized name.
- Core ratings have `sourceKind = REAL_STATS`.
- Lineup is confirmed or the market is early enough to tolerate probable-lineup uncertainty.
- Team data quality is above the product threshold.
- NRFI/F5 calibration has its own historical ledger bucket, separate from full-game moneyline.

## Suggested next wiring

1. Add a daily worker that builds the elite rating snapshot.
2. Store the snapshot by season/date/player/team.
3. Add a board diagnostic badge: `Elite MLB ratings: fresh/stale/synthetic fallback`.
4. Require the MLB sim service to use `mlb-elite-rating-system-v1` before showing high-confidence NRFI/F5 tags.
5. Backtest by market family: moneyline, total, F5, NRFI/YRFI, pitcher outs, pitcher strikeouts, hitter hits.
