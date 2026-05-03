import assert from "node:assert/strict";

import { projectNbaPlayerMinutes } from "@/services/simulation/nba-minutes-projection";
import { buildNbaPlayerStatProfile } from "@/services/simulation/nba-player-stat-profile";
import type { NbaLineupTruth } from "@/services/simulation/nba-lineup-truth";

function profile(minutes: number[], starter = true) {
  return buildNbaPlayerStatProfile({
    playerId: `p-${minutes.join("-")}`,
    playerName: "Minutes Test Player",
    team: "NBA",
    position: "G",
    recentStats: minutes.map((min, index) => ({
      minutes: min,
      points: 18 + (index % 4),
      rebounds: 5 + (index % 3),
      assists: 6 + (index % 2),
      threes: 2,
      steals: 1,
      blocks: 0.5,
      turnovers: 2,
      fieldGoalsAttempted: 14,
      threePointAttempts: 5,
      freeThrowsAttempted: 4,
      personalFouls: 2,
      starter
    }))
  });
}

const greenLineupTruth: NbaLineupTruth = {
  status: "GREEN",
  injuryReportFresh: true,
  lastUpdatedAt: new Date().toISOString(),
  minutesTrusted: true,
  starQuestionable: false,
  highUsageOut: false,
  lateScratchRisk: false,
  projectedStarterConfidence: 0.93,
  blockers: [],
  warnings: [],
  playerFlags: []
};

const staleLineupTruth: NbaLineupTruth = {
  ...greenLineupTruth,
  status: "RED",
  injuryReportFresh: false,
  minutesTrusted: false,
  projectedStarterConfidence: 0.35,
  blockers: ["stale injury report"],
  warnings: ["projected minutes are not fully trusted"]
};

const stableStarter = projectNbaPlayerMinutes({
  profile: profile([34, 35, 33, 36, 34, 35, 33, 36, 34, 35, 33, 36], true),
  lineupTruth: greenLineupTruth,
  teamSpread: -4.5,
  playerStatus: "ACTIVE"
});

assert.equal(stableStarter.role, "starter");
assert.equal(stableStarter.starterLikely, true);
assert.equal(stableStarter.closingLineupLikely, true);
assert.ok(stableStarter.projectedMinutes >= 30, `projected ${stableStarter.projectedMinutes}`);
assert.ok(stableStarter.confidence >= 0.65, `confidence ${stableStarter.confidence}`);
assert.ok(stableStarter.roleConfidence >= 0.7, `role confidence ${stableStarter.roleConfidence}`);
assert.ok(stableStarter.rotationStability >= 0.65, `rotation stability ${stableStarter.rotationStability}`);
assert.deepEqual(stableStarter.blockers, []);

const stale = projectNbaPlayerMinutes({
  profile: profile([34, 35, 33, 36, 34, 35, 33, 36, 34, 35], true),
  lineupTruth: staleLineupTruth,
  teamSpread: -4.5,
  playerStatus: "ACTIVE"
});

assert.ok(stale.blockers.includes("lineup truth RED"));
assert.ok(stale.blockers.includes("stale injury report"));
assert.ok(stale.blockers.includes("lineup blocker: stale injury report"));
assert.ok(stale.warnings.includes("projected minutes are not fully trusted"));
assert.ok(stale.confidence <= 0.49, `confidence ${stale.confidence}`);
assert.ok(stale.injuryRisk >= 0.6, `injury risk ${stale.injuryRisk}`);

const questionable = projectNbaPlayerMinutes({
  profile: profile([32, 33, 31, 34, 32, 33, 31, 34], true),
  lineupTruth: greenLineupTruth,
  teamSpread: 2.5,
  playerStatus: "QUESTIONABLE"
});

assert.ok(questionable.blockers.includes("player listed QUESTIONABLE"));
assert.ok(questionable.projectedMinutes < 28, `projected ${questionable.projectedMinutes}`);
assert.ok(questionable.confidence <= 0.49, `confidence ${questionable.confidence}`);
assert.ok(questionable.injuryAdjustment < 1, `injury adjustment ${questionable.injuryAdjustment}`);

const blowout = projectNbaPlayerMinutes({
  profile: profile([34, 35, 33, 36, 34, 35, 33, 36], true),
  lineupTruth: greenLineupTruth,
  teamSpread: -17.5,
  playerStatus: "ACTIVE"
});

assert.ok(blowout.blowoutRisk >= 0.35, `blowout risk ${blowout.blowoutRisk}`);
assert.ok(blowout.blowoutAdjustment < 1, `blowout adjustment ${blowout.blowoutAdjustment}`);
assert.ok(blowout.warnings.includes("elevated blowout minutes risk"));
assert.ok(blowout.projectedMinutes < stableStarter.projectedMinutes, `${blowout.projectedMinutes} vs ${stableStarter.projectedMinutes}`);

const bench = projectNbaPlayerMinutes({
  profile: profile([18, 20, 17, 19, 16, 21, 18, 19], false),
  lineupTruth: greenLineupTruth,
  teamSpread: 1.5,
  playerStatus: "ACTIVE"
});

assert.equal(bench.role, "bench");
assert.equal(bench.starterLikely, false);
assert.ok(bench.projectedMinutes >= 14 && bench.projectedMinutes <= 23, `bench minutes ${bench.projectedMinutes}`);
assert.ok(bench.ceilingMinutes > bench.projectedMinutes);
assert.ok(bench.floorMinutes < bench.projectedMinutes);

const out = projectNbaPlayerMinutes({
  profile: profile([30, 31, 32, 30, 31, 32], true),
  lineupTruth: greenLineupTruth,
  teamSpread: 1.5,
  playerStatus: "OUT"
});

assert.equal(out.projectedMinutes, 0);
assert.ok(out.blockers.includes("player listed OUT"));
assert.ok(out.injuryRisk === 1);
assert.ok(out.confidence <= 0.49);

console.log("nba-minutes-projection-engine.test.ts passed");
