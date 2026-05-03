import assert from "node:assert/strict";

import {
  calculateUfcEnsembleCalibrationReport,
  scoreUfcEnsembleWeights,
  type UfcEnsembleCalibrationRow
} from "@/services/ufc/ensemble-calibration";

const rows: UfcEnsembleCalibrationRow[] = [
  { fightId: "f1", actualWinner: "A", skillMarkovFighterAWinProbability: 0.52, exchangeMonteCarloFighterAWinProbability: 0.78, bucket: "finish-volatility" },
  { fightId: "f2", actualWinner: "A", skillMarkovFighterAWinProbability: 0.49, exchangeMonteCarloFighterAWinProbability: 0.70, bucket: "finish-volatility" },
  { fightId: "f3", actualWinner: "B", skillMarkovFighterAWinProbability: 0.51, exchangeMonteCarloFighterAWinProbability: 0.25, bucket: "finish-volatility" },
  { fightId: "f4", actualWinner: "B", skillMarkovFighterAWinProbability: 0.54, exchangeMonteCarloFighterAWinProbability: 0.33, bucket: "finish-volatility" },
  { fightId: "f5", actualWinner: "A", skillMarkovFighterAWinProbability: 0.74, exchangeMonteCarloFighterAWinProbability: 0.58, bucket: "all" },
  { fightId: "f6", actualWinner: "B", skillMarkovFighterAWinProbability: 0.28, exchangeMonteCarloFighterAWinProbability: 0.43, bucket: "all" }
];

const defaultMetrics = scoreUfcEnsembleWeights(rows, { skillMarkov: 0.55, exchangeMonteCarlo: 0.45 });
const exchangeHeavyMetrics = scoreUfcEnsembleWeights(rows, { skillMarkov: 0.1, exchangeMonteCarlo: 0.9 });
assert.ok(exchangeHeavyMetrics.logLoss < defaultMetrics.logLoss);
assert.ok(exchangeHeavyMetrics.brierScore < defaultMetrics.brierScore);

const lowSampleReport = calculateUfcEnsembleCalibrationReport(rows, { minSamples: 30, gridStep: 0.1 });
assert.equal(lowSampleReport.sampleCount, 6);
assert.equal(lowSampleReport.shrinkage, 0.2);
assert.ok(lowSampleReport.bestRawWeights.exchangeMonteCarlo > lowSampleReport.defaultWeights.exchangeMonteCarlo);
assert.ok(lowSampleReport.recommendedWeights.exchangeMonteCarlo < lowSampleReport.bestRawWeights.exchangeMonteCarlo);
assert.ok(lowSampleReport.recommendedWeights.exchangeMonteCarlo > lowSampleReport.defaultWeights.exchangeMonteCarlo);
assert.ok(lowSampleReport.recommendedMetrics.logLoss <= lowSampleReport.defaultMetrics.logLoss);
assert.ok(lowSampleReport.bucketReports["finish-volatility"].sampleCount === 4);
assert.ok(lowSampleReport.bucketReports.all.sampleCount === 2);

const fullSampleReport = calculateUfcEnsembleCalibrationReport(rows, { minSamples: 3, gridStep: 0.1 });
assert.equal(fullSampleReport.shrinkage, 1);
assert.deepEqual(fullSampleReport.recommendedWeights, fullSampleReport.bestRawWeights);

const emptyReport = calculateUfcEnsembleCalibrationReport([], { minSamples: 30 });
assert.equal(emptyReport.sampleCount, 0);
assert.deepEqual(emptyReport.recommendedWeights, { skillMarkov: 0.55, exchangeMonteCarlo: 0.45 });
assert.equal(emptyReport.recommendedMetrics.logLoss, 0);

console.log("ufc-ensemble-calibration tests passed");
