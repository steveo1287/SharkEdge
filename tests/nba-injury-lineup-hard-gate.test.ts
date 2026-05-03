import assert from "node:assert/strict";

import { projectNbaPlayerStat } from "@/services/simulation/nba-player-stat-projection";
import type { NbaLineupTruth } from "@/services/simulation/nba-lineup-truth";

const recentStats = Array.from({ length: 10 }, (_, index) => ({
  minutes: 32,
  points: 20 + (index % 4),
  rebounds: 7 + (index % 3),
  assists: 5 + (index % 2),
  threes: 2,
  steals: 1,
  blocks: 1,
  turnovers: 2,
  fieldGoalsAttempted: 15,
  threePointAttempts: 5,
  freeThrowsAttempted: 4,
  starter: true
}));

const greenLineupTruth: NbaLineupTruth = {
  status: "GREEN",
  injuryReportFresh: true,
  lastUpdatedAt: new Date().toISOString(),
  minutesTrusted: true,
  starQuestionable: false,
  highUsageOut: false,
  lateScratchRisk: false,
  projectedStarterConfidence: 0.92,
  blockers: [],
  warnings: [],
  playerFlags: []
};

const staleLineupTruth: NbaLineupTruth = {
  ...greenLineupTruth,
  status: "RED",
  injuryReportFresh: false,
  minutesTrusted: false,
  projectedStarterConfidence: 0.41,
  blockers: ["stale injury report"],
  warnings: ["projected minutes are not fully trusted"]
};

const green = projectNbaPlayerStat({
  playerId: "p-green",
  playerName: "Green Player",
  statKey: "points",
  recentStats,
  lineupTruth: greenLineupTruth,
  marketLine: 21.5,
  marketOddsOver: -110,
  marketOddsUnder: -110,
  playerStatus: "ACTIVE"
});

assert.equal(green.noBet, false);
assert.equal(green.blockers.includes("stale injury report"), false);
assert.ok(green.confidence > 0.49);

const stale = projectNbaPlayerStat({
  playerId: "p-stale",
  playerName: "Stale Player",
  statKey: "points",
  recentStats,
  lineupTruth: staleLineupTruth,
  marketLine: 21.5,
  marketOddsOver: -110,
  marketOddsUnder: -110,
  playerStatus: "ACTIVE"
});

assert.equal(stale.noBet, true);
assert.ok(stale.blockers.includes("lineup truth RED"));
assert.ok(stale.blockers.includes("stale injury report"));
assert.ok(stale.blockers.includes("lineup blocker: stale injury report"));
assert.ok(stale.warnings.includes("projected minutes are not fully trusted"));
assert.ok(stale.confidence <= 0.49);

const missing = projectNbaPlayerStat({
  playerId: "p-missing",
  playerName: "Missing Player",
  statKey: "rebounds",
  recentStats,
  lineupTruth: null,
  marketLine: 7.5,
  marketOddsOver: -110,
  marketOddsUnder: -110,
  playerStatus: "ACTIVE"
});

assert.equal(missing.noBet, true);
assert.ok(missing.blockers.includes("lineup truth missing"));
assert.ok(missing.warnings.includes("lineup truth unavailable"));
assert.ok(missing.confidence <= 0.49);

const questionable = projectNbaPlayerStat({
  playerId: "p-questionable",
  playerName: "Questionable Player",
  statKey: "assists",
  recentStats,
  lineupTruth: greenLineupTruth,
  marketLine: 5.5,
  marketOddsOver: -110,
  marketOddsUnder: -110,
  playerStatus: "QUESTIONABLE"
});

assert.equal(questionable.noBet, true);
assert.ok(questionable.blockers.includes("player status QUESTIONABLE"));
assert.ok(questionable.confidence <= 0.49);

console.log("nba-injury-lineup-hard-gate.test.ts passed");
