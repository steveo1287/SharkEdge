import assert from "node:assert/strict";

import { buildNbaWinnerProbability } from "@/services/simulation/nba-winner-probability-engine";
import type { NbaNoVigMarket } from "@/services/simulation/nba-market-sanity";
import type { NbaLineupTruth } from "@/services/simulation/nba-lineup-truth";

const market: NbaNoVigMarket = {
  available: true,
  source: "test-book",
  awayTeam: "Away",
  homeTeam: "Home",
  awayOddsAmerican: 120,
  homeOddsAmerican: -140,
  awayNoVigProbability: 0.45,
  homeNoVigProbability: 0.55,
  hold: 0.02,
  spreadLine: -2.5,
  awaySpreadOddsAmerican: -110,
  homeSpreadOddsAmerican: -110,
  totalLine: 224.5,
  overOddsAmerican: -110,
  underOddsAmerican: -110,
  overNoVigProbability: 0.5,
  underNoVigProbability: 0.5,
  totalHold: 0.0476
};

const greenLineup: NbaLineupTruth = {
  status: "GREEN",
  injuryReportFresh: true,
  lastUpdatedAt: new Date().toISOString(),
  minutesTrusted: true,
  starQuestionable: false,
  highUsageOut: false,
  lateScratchRisk: false,
  projectedStarterConfidence: 0.91,
  blockers: [],
  warnings: [],
  playerFlags: []
};

const sourceHealth = {
  team: true,
  player: true,
  history: true,
  rating: true,
  realModules: 4,
  requiredModulesReady: true
};

const anchored = buildNbaWinnerProbability({
  rawHomeWinPct: 0.72,
  rawAwayWinPct: 0.28,
  projectedHomeMargin: 12,
  projectedTotal: 224,
  market,
  lineupTruth: greenLineup,
  sourceHealth,
  calibrationHealthy: true
});

assert.equal(anchored.noBet, false);
assert.equal(anchored.marketHomeNoVig, 0.55);
assert.ok(anchored.rawModelDelta !== null && anchored.rawModelDelta > 0.16);
assert.equal(anchored.deltaCap, 0.03);
assert.equal(anchored.boundedModelDelta, 0.03);
assert.equal(anchored.finalHomeWinPct, 0.58);
assert.equal(anchored.finalAwayWinPct, 0.42);
assert.ok(anchored.warnings.some((warning) => warning.includes("disagreed with no-vig market")));

const missingMarket = buildNbaWinnerProbability({
  rawHomeWinPct: 0.66,
  rawAwayWinPct: 0.34,
  projectedHomeMargin: 8,
  projectedTotal: 220,
  market: { ...market, homeNoVigProbability: null, awayNoVigProbability: null, available: false },
  lineupTruth: greenLineup,
  sourceHealth,
  calibrationHealthy: true
});

assert.equal(missingMarket.noBet, true);
assert.equal(missingMarket.confidence, "INSUFFICIENT");
assert.ok(missingMarket.blockers.includes("missing NBA no-vig moneyline baseline"));

const staleLineup = buildNbaWinnerProbability({
  rawHomeWinPct: 0.57,
  rawAwayWinPct: 0.43,
  projectedHomeMargin: 3,
  projectedTotal: 221,
  market,
  lineupTruth: {
    ...greenLineup,
    status: "YELLOW",
    injuryReportFresh: false,
    minutesTrusted: false,
    blockers: ["stale injury report"]
  },
  sourceHealth,
  calibrationHealthy: true
});

assert.equal(staleLineup.noBet, true);
assert.ok(staleLineup.blockers.includes("NBA lineup truth YELLOW"));
assert.ok(staleLineup.blockers.includes("stale NBA injury report"));

const unhealthyCalibration = buildNbaWinnerProbability({
  rawHomeWinPct: 0.57,
  rawAwayWinPct: 0.43,
  projectedHomeMargin: 3,
  projectedTotal: 221,
  market,
  lineupTruth: greenLineup,
  sourceHealth,
  calibrationHealthy: false
});

assert.equal(unhealthyCalibration.noBet, true);
assert.ok(unhealthyCalibration.blockers.includes("NBA winner calibration unhealthy"));

console.log("nba-winner-probability-engine.test.ts passed");
