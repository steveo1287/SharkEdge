import assert from "node:assert/strict";

import {
  applyMlbPlayerMarketCalibration,
  DEFAULT_MLB_PLAYER_MARKET_CALIBRATION_PROFILE,
  fitMlbPlayerMarketCalibrationProfileFromRows,
  type MlbPlayerMarketCalibrationTrainingRow
} from "@/services/simulation/mlb-player-prop-inning-calibration";

assert.equal(DEFAULT_MLB_PLAYER_MARKET_CALIBRATION_PROFILE.modelVersion, "mlb-player-market-calibration-v1");
assert.equal(DEFAULT_MLB_PLAYER_MARKET_CALIBRATION_PROFILE.status, "DEFAULT");

function row(index: number, market: string, source: "player_prop" | "inning_market", probability: number, winRate: number): MlbPlayerMarketCalibrationTrainingRow {
  const cycle = index % 100;
  const win = cycle < Math.round(winRate * 100);
  const outcome = win ? 1 : 0;
  return {
    source,
    market,
    probability,
    confidence: 0.7,
    result: win ? "WIN" : "LOSS",
    brier: (probability - outcome) ** 2,
    log_loss: win ? -Math.log(probability) : -Math.log(1 - probability),
    projected_value: probability * 2,
    actual_value: win ? 1 : 0
  };
}

const rows: MlbPlayerMarketCalibrationTrainingRow[] = [
  ...Array.from({ length: 160 }, (_, index) => row(index, "hitter_hits", "player_prop", 0.62, 0.7)),
  ...Array.from({ length: 150 }, (_, index) => row(index, "pitcher_strikeouts", "player_prop", 0.58, 0.5)),
  ...Array.from({ length: 140 }, (_, index) => row(index, "nrfi", "inning_market", 0.54, 0.61)),
  ...Array.from({ length: 30 }, (_, index) => row(index, "hitter_stolen_bases", "player_prop", 0.44, 0.52)),
  { source: "player_prop", market: "ignored_push", probability: 0.6, confidence: 0.5, result: "PUSH" },
  { source: "inning_market", market: "ignored_pending", probability: 0.6, confidence: 0.5, result: "PENDING" }
];

const profile = fitMlbPlayerMarketCalibrationProfileFromRows(rows, "2026-06-07T12:00:00.000Z");
assert.equal(profile.status, "LEARNED");
assert.equal(profile.sampleSize, 480);
assert.equal(profile.trainedAt, "2026-06-07T12:00:00.000Z");
assert.equal(profile.metrics.source, "graded-player-prop-and-inning-ledgers");
assert.equal(profile.metrics.marketCount, 4);
assert.equal(profile.metrics.learnedMarketCount, 3);
assert.equal(profile.metrics.playerPropRows, 340);
assert.equal(profile.metrics.inningMarketRows, 140);

const hitterHits = profile.markets["player_prop:hitter_hits"];
assert.ok(hitterHits);
assert.equal(hitterHits.status, "LEARNED");
assert.equal(hitterHits.sampleSize, 160);
assert.ok(hitterHits.probabilityBias > 0);
assert.ok(hitterHits.probabilityShift > 0);
assert.ok(hitterHits.confidenceCap > 0.45);
assert.equal(hitterHits.buckets.length, 3);

const pitcherKs = profile.markets["player_prop:pitcher_strikeouts"];
assert.ok(pitcherKs);
assert.ok(pitcherKs.probabilityBias < 0);
assert.ok(pitcherKs.probabilityShift < 0);
assert.ok(pitcherKs.minEdgeRequired >= 0.015);

const steals = profile.markets["player_prop:hitter_stolen_bases"];
assert.ok(steals);
assert.equal(steals.status, "SAMPLE_TOO_SMALL");
assert.equal(steals.probabilityShift, 0);
assert.equal(steals.confidenceCap, 0.35);

const calibrated = applyMlbPlayerMarketCalibration({
  source: "player_prop",
  market: "hitter_hits",
  probability: 0.6,
  confidence: 0.8,
  profile
});
assert.equal(calibrated.status, "LEARNED");
assert.ok(calibrated.calibratedProbability > calibrated.rawProbability);
assert.ok(calibrated.confidence <= hitterHits.confidenceCap);
assert.equal(calibrated.minEdgeRequired, hitterHits.minEdgeRequired);

const untrained = applyMlbPlayerMarketCalibration({
  source: "player_prop",
  market: "missing_market",
  probability: 0.61,
  confidence: 0.9,
  profile
});
assert.equal(untrained.status, "UNTRAINED");
assert.equal(untrained.calibratedProbability, 0.61);
assert.ok(untrained.confidence <= 0.45);

const empty = fitMlbPlayerMarketCalibrationProfileFromRows([], "2026-06-07T12:00:00.000Z");
assert.equal(empty.status, "DEFAULT");
assert.equal(empty.sampleSize, 0);
assert.deepEqual(empty.markets, {});

console.log("mlb-player-market-calibration.test.ts passed");
