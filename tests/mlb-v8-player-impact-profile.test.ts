import assert from "node:assert/strict";

import {
  buildMlbV8PlayerImpactTrainingRows,
  DEFAULT_MLB_V8_PLAYER_IMPACT_PROFILE,
  DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS,
  fitMlbV8PlayerImpactProfileFromRows,
  type MlbV8PlayerImpactTrainingRow
} from "@/services/simulation/mlb-v8-player-impact-profile";

assert.equal(DEFAULT_MLB_V8_PLAYER_IMPACT_PROFILE.modelVersion, "mlb-intel-v8-player-impact");
assert.equal(DEFAULT_MLB_V8_PLAYER_IMPACT_PROFILE.status, "DEFAULT");
assert.equal(DEFAULT_MLB_V8_PLAYER_IMPACT_PROFILE.sampleSize, 0);

const hitterWeightTotal = Object.values(DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS.hitterWeights)
  .reduce((sum, value) => sum + value, 0);
const pitcherWeightTotal = Object.values(DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS.pitcherWeights)
  .reduce((sum, value) => sum + value, 0);

assert.ok(Math.abs(hitterWeightTotal - 1) < 0.0001);
assert.ok(Math.abs(pitcherWeightTotal - 1) < 0.0001);
assert.ok(DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS.starterRunWeight > DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS.bullpenRunWeight);
assert.ok(DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS.probabilityBlendMax > DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS.probabilityBlendMin);
assert.ok(DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS.runDeltaCap <= 1);

function trainingRow(index: number): MlbV8PlayerImpactTrainingRow {
  const side: "HOME" | "AWAY" = index % 2 === 0 ? "HOME" : "AWAY";
  const won = index % 5 !== 0;
  const homeFavoredByRoster = side === "HOME";
  const rawHome = homeFavoredByRoster ? 0.52 : 0.48;
  const adjustedHome = homeFavoredByRoster ? 0.64 : 0.36;
  return {
    rowSource: index % 3 === 0 ? "official" : "snapshot",
    result: won ? "WIN" : "LOSS",
    side,
    raw_probability: 0.52,
    calibrated_probability: won ? 0.59 : 0.57,
    market_no_vig_probability: 0.5,
    edge: 0.04,
    prediction_json: {
      mlbIntel: {
        playerImpact: {
          confidence: 0.82,
          awayOffenseScore: homeFavoredByRoster ? 66 : 78,
          homeOffenseScore: homeFavoredByRoster ? 80 : 65,
          awayStarterScore: homeFavoredByRoster ? 64 : 80,
          homeStarterScore: homeFavoredByRoster ? 82 : 63,
          awayBullpenScore: homeFavoredByRoster ? 65 : 76,
          homeBullpenScore: homeFavoredByRoster ? 77 : 66,
          awayRunDelta: homeFavoredByRoster ? -0.2 : 0.42,
          homeRunDelta: homeFavoredByRoster ? 0.44 : -0.24,
          rawHomeWinPct: rawHome,
          adjustedHomeWinPct: adjustedHome
        }
      }
    }
  };
}

const rows = Array.from({ length: 240 }, (_, index) => trainingRow(index));
const featureRows = buildMlbV8PlayerImpactTrainingRows(rows);
assert.equal(featureRows.length, 240);
assert.ok(featureRows.every((row) => row.signedRunDeltaEdge > 0));
assert.ok(featureRows.every((row) => row.signedProbabilityLift > 0));
assert.ok(featureRows.some((row) => row.rowSource === "official"));

const learned = fitMlbV8PlayerImpactProfileFromRows(rows, "2026-06-07T12:00:00.000Z");
assert.equal(learned.status, "LEARNED");
assert.equal(learned.sampleSize, 240);
assert.equal(learned.trainedAt, "2026-06-07T12:00:00.000Z");
assert.equal(learned.metrics.source, "historical-ledger-roster-accuracy");
assert.equal(learned.metrics.rosterHelped, true);
assert.ok(Number(learned.metrics.rosterAdjustedBrier) < Number(learned.metrics.rawBrier));
assert.ok(Number(learned.metrics.rosterDirectionHitRate) > 0.7);
assert.ok(learned.weights.probabilityBlendMax >= DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS.probabilityBlendMax);
assert.ok(learned.weights.starterRunWeight >= DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS.starterRunWeight);

const small = fitMlbV8PlayerImpactProfileFromRows(rows.slice(0, 20), "2026-06-07T12:00:00.000Z");
assert.equal(small.status, "SAMPLE_TOO_SMALL");
assert.equal(small.sampleSize, 20);
assert.deepEqual(small.weights, DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS);

const missing = buildMlbV8PlayerImpactTrainingRows([{ result: "WIN", side: "HOME", raw_probability: 0.55, calibrated_probability: 0.57, prediction_json: {} }]);
assert.equal(missing.length, 0);

console.log("mlb-v8-player-impact-profile.test.ts passed");
