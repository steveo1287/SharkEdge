import assert from "node:assert/strict";

import { buildMlbPlayerStatSettlementFeedback, type MlbSettledBatterStatProjectionRow } from "@/services/simulation/mlb-player-stat-settlement-feedback";

const rows: MlbSettledBatterStatProjectionRow[] = [
  { playerId: "p1", playerName: "Power Hitter", market: "HITS", projectedMean: 1.1, actualValue: 1, settledAt: "2026-06-01T23:00:00Z" },
  { playerId: "p1", playerName: "Power Hitter", market: "HITS", projectedMean: 1.2, actualValue: 2, settledAt: "2026-06-02T23:00:00Z" },
  { playerId: "p1", playerName: "Power Hitter", market: "TOTAL_BASES", projectedMean: 1.8, actualValue: 4, settledAt: "2026-06-03T23:00:00Z" },
  { playerId: "p1", playerName: "Power Hitter", market: "TOTAL_BASES", projectedMean: 1.7, actualValue: 0, settledAt: "2026-06-04T23:00:00Z" },
  { playerId: "p1", playerName: "Power Hitter", market: "HOME_RUN", projectedMean: 0.14, actualValue: 1, settledAt: "2026-06-05T23:00:00Z" },
  { playerId: "p1", playerName: "Power Hitter", market: "WALKS", projectedMean: 0.35, actualValue: 0, settledAt: "2026-06-06T23:00:00Z" },
  { playerId: "p1", playerName: "Power Hitter", market: "STRIKEOUTS", projectedMean: 1.2, actualValue: 2, settledAt: "2026-06-07T23:00:00Z" },
  { playerId: "p2", playerName: "Contact Hitter", market: "HITS", projectedMean: 0.9, actualValue: 1, settledAt: "2026-06-07T23:00:00Z" },
  { playerId: "", playerName: "Bad Row", market: "HITS", projectedMean: 1, actualValue: 1 }
];

const report = buildMlbPlayerStatSettlementFeedback(rows);
assert.equal(report.modelVersion, "mlb-player-stat-settlement-feedback-v1");
assert.equal(report.players.length, 2);
assert.equal(report.rejected.length, 1);
assert.ok(report.warnings.some((warning) => warning.includes("rejected")));

const power = report.players.find((player) => player.playerId === "p1");
assert.ok(power);
assert.equal(power!.sampleSize, 7);
assert.equal(power!.marketSamples.HITS, 2);
assert.equal(power!.marketSamples.HOME_RUN, 1);
assert.ok(Number.isFinite(power!.historicalErrorCorrection.hitMeanBias));
assert.ok(Number.isFinite(power!.historicalErrorCorrection.totalBasesMeanBias));
assert.ok(Number.isFinite(power!.historicalErrorCorrection.homeRunMeanBias));
assert.ok(power!.marketVariance.totalBases > 1);
assert.ok(power!.marketVariance.homeRun >= 0.72);
assert.equal(power!.settlementFeedback.sampleSize, 7);
assert.equal(power!.settlementFeedback.lastUpdated, "2026-06-07T23:00:00Z");
assert.ok(power!.settlementFeedback.notes.some((note) => note.includes("projected minus actual")));

const empty = buildMlbPlayerStatSettlementFeedback([]);
assert.equal(empty.players.length, 0);
assert.ok(empty.warnings.some((warning) => warning.includes("No settled batter stat rows")));

console.log("mlb-player-stat-settlement-feedback.test.ts passed");
