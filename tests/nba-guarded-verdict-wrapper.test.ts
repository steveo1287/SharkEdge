import assert from "node:assert/strict";

import type { ContextualGameSimulationSummary } from "@/services/simulation/contextual-game-sim";
import type { PlayerPropSimulationSummary } from "@/services/simulation/player-prop-sim";
import { buildGameSimVerdict, buildPlayerPropVerdict } from "@/services/simulation/sim-verdict-engine";

const sim: ContextualGameSimulationSummary & { sampleSize: number } = {
  engine: "contextual-monte-carlo-v2",
  projectedHomeScore: 118,
  projectedAwayScore: 108,
  projectedTotal: 226,
  projectedSpreadHome: 10,
  winProbHome: 0.72,
  winProbAway: 0.28,
  distribution: {
    totalStdDev: 10,
    homeScoreStdDev: 9,
    awayScoreStdDev: 9,
    spreadStdDev: 8,
    p10Total: 210,
    p50Total: 226,
    p90Total: 242,
    p10SpreadHome: 0,
    p50SpreadHome: 10,
    p90SpreadHome: 18
  },
  drivers: ["pace edge", "market edge", "efficiency edge"],
  ratingsPrior: {
    source: "MISSING",
    blendWeight: 0.2,
    deltaOverall: 3,
    confidence: 0.9
  },
  sampleSize: 2500
};

const missingSafety = buildGameSimVerdict({
  sim,
  leagueKey: "NBA",
  homeTeam: "Home",
  awayTeam: "Away",
  marketTotal: 219.5,
  marketSpreadHome: -4.5,
  homeMoneylineOdds: -110,
  awayMoneylineOdds: -110,
  overOdds: -110,
  underOdds: -110,
  homeSpreadOdds: -110,
  awaySpreadOdds: -110
});

assert.equal(missingSafety.overallVerdict.bestBet, null, "NBA verdict must default closed without explicit safety context");
for (const verdict of missingSafety.verdicts) {
  assert.equal(verdict.kellyPct, 0, "missing NBA safety context must force zero Kelly");
  assert.notEqual(verdict.actionState, "BET_NOW", "missing NBA safety context must prevent BET_NOW");
  assert.ok(verdict.explanation.includes("Explicit NBA safety context"), "missing safety blocker must be visible");
}

const healthy = buildGameSimVerdict({
  sim,
  leagueKey: "NBA",
  homeTeam: "Home",
  awayTeam: "Away",
  marketTotal: 219.5,
  marketSpreadHome: -4.5,
  homeMoneylineOdds: -110,
  awayMoneylineOdds: -110,
  overOdds: -110,
  underOdds: -110,
  homeSpreadOdds: -110,
  awaySpreadOdds: -110,
  nbaSafety: {
    modelHealthGreen: true,
    sourceHealthGreen: true,
    injuryReportFresh: true,
    calibrationBucketHealthy: true,
    noVigMarketAvailable: true,
    noBet: false
  }
});

const healthyWithKelly = healthy.verdicts.find((verdict) => verdict.kellyPct > 0);
assert.ok(healthyWithKelly, "healthy NBA verdict should still allow a capped stake when all gates clear");
assert.ok(healthyWithKelly!.kellyPct <= 0.5, "healthy NBA Kelly must stay capped at 0.5% bankroll");

const noVigMissing = buildGameSimVerdict({
  sim,
  leagueKey: "NBA",
  homeTeam: "Home",
  awayTeam: "Away",
  marketTotal: 219.5,
  marketSpreadHome: -4.5,
  homeMoneylineOdds: null,
  awayMoneylineOdds: null,
  overOdds: -110,
  underOdds: -110,
  homeSpreadOdds: -110,
  awaySpreadOdds: -110,
  nbaSafety: {
    modelHealthGreen: true,
    sourceHealthGreen: true,
    injuryReportFresh: true,
    calibrationBucketHealthy: true,
    noVigMarketAvailable: true,
    noBet: false
  }
});

for (const verdict of noVigMissing.verdicts.filter((verdict) => verdict.market === "moneyline")) {
  assert.equal(verdict.kellyPct, 0, "NBA moneyline must not stake without a no-vig moneyline baseline");
  assert.notEqual(verdict.actionState, "BET_NOW", "NBA moneyline must not be BET_NOW without a no-vig baseline");
  assert.ok(verdict.explanation.includes("no-vig"), "blocked verdict should surface no-vig reason");
}
assert.equal(noVigMissing.overallVerdict.bestBet?.market, "spread", "missing ML no-vig should not poison unrelated market verdicts");

const upstreamNoBet = buildGameSimVerdict({
  sim,
  leagueKey: "NBA",
  homeTeam: "Home",
  awayTeam: "Away",
  marketTotal: 219.5,
  marketSpreadHome: -4.5,
  homeMoneylineOdds: -110,
  awayMoneylineOdds: -110,
  overOdds: -110,
  underOdds: -110,
  homeSpreadOdds: -110,
  awaySpreadOdds: -110,
  nbaSafety: {
    modelHealthGreen: true,
    sourceHealthGreen: true,
    injuryReportFresh: true,
    calibrationBucketHealthy: true,
    noVigMarketAvailable: true,
    noBet: true,
    blockerReasons: ["Accuracy bucket unproven."]
  }
});

assert.equal(upstreamNoBet.overallVerdict.bestBet, null, "upstream noBet must remove all actionable NBA verdicts");
for (const verdict of upstreamNoBet.verdicts) {
  assert.equal(verdict.kellyPct, 0, "upstream noBet must force zero Kelly on all NBA verdicts");
  assert.notEqual(verdict.actionState, "BET_NOW", "upstream noBet must prevent BET_NOW");
  assert.ok(verdict.explanation.includes("Accuracy bucket unproven"), "upstream blocker reason must be visible");
}

const propSim: PlayerPropSimulationSummary = {
  meanValue: 29.4,
  medianValue: 29,
  stdDev: 4,
  p10: 23,
  p50: 29,
  p90: 36,
  hitProbOver: { "25.5": 0.72 },
  hitProbUnder: { "25.5": 0.28 },
  contextualEdgeScore: 9,
  priorWeight: 0.2,
  sourceSummary: "role stable",
  drivers: ["usage edge", "minutes stable"],
  sampleSize: 2500,
  minutesSampleSize: 2500,
  roleConfidence: 0.9
};

const missingPropSafety = buildPlayerPropVerdict(propSim, "p1", "Player", "points", 25.5, -110, -110, "NBA");
assert.equal(missingPropSafety.verdict.kellyPct, 0, "missing NBA prop safety context must force zero Kelly");
assert.notEqual(missingPropSafety.verdict.actionState, "BET_NOW", "missing NBA prop safety context must prevent BET_NOW");
assert.ok(missingPropSafety.verdict.explanation.includes("Explicit NBA safety context"), "missing prop safety blocker must be visible");

const staleProp = buildPlayerPropVerdict(propSim, "p1", "Player", "points", 25.5, -110, -110, "NBA", {
  modelHealthGreen: true,
  sourceHealthGreen: true,
  injuryReportFresh: false,
  calibrationBucketHealthy: true,
  noVigMarketAvailable: true
});

assert.equal(staleProp.verdict.kellyPct, 0, "stale NBA prop injury context must force zero Kelly");
assert.notEqual(staleProp.verdict.actionState, "BET_NOW", "stale NBA prop injury context must prevent BET_NOW");
assert.ok(staleProp.verdict.explanation.includes("injury"), "stale prop should explain injury blocker");

const blockedStructuredProp = buildPlayerPropVerdict({
  ...propSim,
  nbaPropSafety: {
    modelHealthGreen: false,
    sourceHealthGreen: false,
    injuryReportFresh: false,
    calibrationBucketHealthy: false,
    noVigMarketAvailable: true,
    noBet: true,
    blockerReasons: ["lineup truth missing", "minutes confidence below 0.65"],
    confidence: 0.44,
    minutesConfidence: 0.52,
    lineupTruthStatus: "MISSING",
    playerStatus: "ACTIVE"
  }
} as PlayerPropSimulationSummary, "p1", "Player", "points", 25.5, -110, -110, "NBA");

assert.equal(blockedStructuredProp.verdict.kellyPct, 0, "structured prop safety noBet must force zero Kelly");
assert.notEqual(blockedStructuredProp.verdict.actionState, "BET_NOW", "structured prop safety noBet must prevent BET_NOW");
assert.ok(blockedStructuredProp.verdict.explanation.includes("lineup truth missing"));
assert.ok(blockedStructuredProp.verdict.explanation.includes("minutes confidence"));
assert.ok(blockedStructuredProp.verdict.explanation.includes("lineup=MISSING"));

const healthyStructuredProp = buildPlayerPropVerdict({
  ...propSim,
  nbaPropSafety: {
    modelHealthGreen: true,
    sourceHealthGreen: true,
    injuryReportFresh: true,
    calibrationBucketHealthy: true,
    noVigMarketAvailable: true,
    noBet: false,
    blockerReasons: [],
    confidence: 0.78,
    minutesConfidence: 0.82,
    lineupTruthStatus: "GREEN",
    playerStatus: "ACTIVE"
  }
} as PlayerPropSimulationSummary, "p1", "Player", "points", 25.5, -110, -110, "NBA");

assert.ok(healthyStructuredProp.verdict.kellyPct <= 0.5, "healthy structured prop Kelly must stay capped");
assert.ok(!healthyStructuredProp.verdict.explanation.includes("Explicit NBA safety context"));

console.log("nba-guarded-verdict-wrapper.test.ts passed");
