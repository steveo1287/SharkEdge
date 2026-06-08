import assert from "node:assert/strict";

import { buildMlbPlayerPropBacktestReport, type MlbPlayerPropBacktestRow } from "@/services/simulation/mlb-player-prop-calibration-backtest";

const rows: MlbPlayerPropBacktestRow[] = [
  { playerId: "p1", playerName: "Power Hitter", matchupClusterKey: "POWER_vs_VULNERABLE", market: "HITS", line: 0.5, side: "OVER", modelProbability: 0.62, won: true, oddsAmerican: -130 },
  { playerId: "p1", playerName: "Power Hitter", matchupClusterKey: "POWER_vs_VULNERABLE", market: "HITS", line: 0.5, side: "OVER", modelProbability: 0.65, won: true, oddsAmerican: -145 },
  { playerId: "p1", playerName: "Power Hitter", matchupClusterKey: "POWER_vs_SUPPRESSOR", market: "TOTAL_BASES", line: 1.5, side: "OVER", modelProbability: 0.48, won: false, oddsAmerican: 130 },
  { playerId: "p2", playerName: "Contact Hitter", matchupClusterKey: "CONTACT_vs_NEUTRAL", market: "HITS", line: 0.5, side: "OVER", modelProbability: 0.58, won: true, oddsAmerican: -115 },
  { playerId: "p2", playerName: "Contact Hitter", matchupClusterKey: "CONTACT_vs_NEUTRAL", market: "STRIKEOUTS", line: 1.5, side: "UNDER", modelProbability: 0.54, won: false, oddsAmerican: 105 },
  { playerId: "p3", playerName: "Slugger", matchupClusterKey: "VOLATILE_POWER_vs_HR_RISK", market: "HOME_RUN", line: 0.5, side: "OVER", modelProbability: 0.12, won: true, oddsAmerican: 900 },
  { playerId: "bad", market: "HITS", line: Number.NaN, side: "OVER", modelProbability: 0.5, won: true }
];

const report = buildMlbPlayerPropBacktestReport(rows);
assert.equal(report.modelVersion, "mlb-player-prop-backtest-v1");
assert.equal(report.sampleSize, 6);
assert.equal(report.wins, 4);
assert.equal(report.losses, 2);
assert.ok(report.hitRate > 0.6);
assert.ok(report.brierScore > 0);
assert.ok(report.logLoss > 0);
assert.ok(report.profitUnits > 0);
assert.ok(report.roi > 0);
assert.ok(Number.isFinite(report.calibrationDrift));
assert.ok(report.byMarket.some((bucket) => bucket.key === "HITS:0.5:OVER"));
assert.ok(report.byPlayer.some((bucket) => bucket.key.includes("Power Hitter")));
assert.ok(report.byMatchupCluster.some((bucket) => bucket.key === "POWER_vs_VULNERABLE"));
assert.ok(report.warnings.some((warning) => warning.includes("rejected")));

const empty = buildMlbPlayerPropBacktestReport([]);
assert.equal(empty.sampleSize, 0);
assert.ok(empty.warnings.some((warning) => warning.includes("No valid")));

console.log("mlb-player-prop-calibration-backtest.test.ts passed");
