import assert from "node:assert/strict";

import { buildNbaEliteWinnerFormula, nbaMarginToProbability, probabilityToNbaMargin } from "@/services/simulation/nba-elite-winner-formula";
import type { NbaLineupTruth } from "@/services/simulation/nba-lineup-truth";
import type { NbaNoVigMarket } from "@/services/simulation/nba-market-sanity";

const market: NbaNoVigMarket = {
  available: true,
  source: "test",
  awayTeam: "Away",
  homeTeam: "Home",
  awayOddsAmerican: 110,
  homeOddsAmerican: -120,
  awayNoVigProbability: 0.48,
  homeNoVigProbability: 0.52,
  hold: 0.02,
  spreadLine: -1.5,
  awaySpreadOddsAmerican: -110,
  homeSpreadOddsAmerican: -110,
  totalLine: 226,
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
  projectedStarterConfidence: 0.92,
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

assert.equal(Number(nbaMarginToProbability(probabilityToNbaMargin(0.5)).toFixed(4)), 0.5);
assert.ok(probabilityToNbaMargin(0.65) > probabilityToNbaMargin(0.55));
assert.ok(nbaMarginToProbability(5) > nbaMarginToProbability(1));

const strongHome = buildNbaEliteWinnerFormula({
  rawHomeWinPct: 0.7,
  projectedHomeMargin: 9,
  market,
  lineupTruth: greenLineup,
  sourceHealth
});

assert.equal(strongHome.marketHomeNoVig, 0.52);
assert.ok(strongHome.finalHomeProbability !== null && strongHome.finalHomeProbability > 0.52);
assert.ok(strongHome.boundedProbabilityDelta > 0);
assert.ok(strongHome.boundedProbabilityDelta <= strongHome.cap);
assert.ok(strongHome.shrinkageToMarket < 0.75);
assert.ok(strongHome.drivers.some((driver) => driver.includes("shrinkage")));

const yellowLineup = buildNbaEliteWinnerFormula({
  rawHomeWinPct: 0.7,
  projectedHomeMargin: 9,
  market,
  lineupTruth: { ...greenLineup, status: "YELLOW", injuryReportFresh: false, minutesTrusted: false },
  sourceHealth
});

assert.ok(yellowLineup.cap < strongHome.cap);
assert.ok(yellowLineup.lineupPenaltyDelta < 0);
assert.ok(yellowLineup.warnings.some((warning) => warning.includes("lineup truth")));

const missingMarket = buildNbaEliteWinnerFormula({
  rawHomeWinPct: 0.7,
  projectedHomeMargin: 9,
  market: { ...market, homeNoVigProbability: null, awayNoVigProbability: null },
  lineupTruth: greenLineup,
  sourceHealth
});

assert.equal(missingMarket.marketHomeNoVig, null);
assert.equal(missingMarket.finalHomeProbability, null);
assert.equal(missingMarket.boundedProbabilityDelta, 0);

console.log("nba-elite-winner-formula.test.ts passed");
