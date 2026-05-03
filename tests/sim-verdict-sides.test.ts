import assert from "node:assert/strict";

import type { ContextualGameSimulationSummary } from "@/services/simulation/contextual-game-sim";
import type { PlayerPropSimulationSummary } from "@/services/simulation/player-prop-sim";
import {
  __simVerdictTestHooks,
  buildMoneylineVerdict,
  buildPlayerPropVerdict,
  buildSpreadVerdict,
  buildTotalVerdict
} from "@/services/simulation/sim-verdict-engine";

const sim: ContextualGameSimulationSummary & { sampleSize: number } = {
  engine: "contextual-monte-carlo-v2",
  projectedHomeScore: 108,
  projectedAwayScore: 102,
  projectedTotal: 210,
  projectedSpreadHome: 6,
  winProbHome: 0.62,
  winProbAway: 0.38,
  distribution: {
    totalStdDev: 11.5,
    homeScoreStdDev: 10.2,
    awayScoreStdDev: 9.8,
    spreadStdDev: 8.1,
    p10Total: 196,
    p50Total: 210,
    p90Total: 224,
    p10SpreadHome: -3,
    p50SpreadHome: 6,
    p90SpreadHome: 15
  },
  drivers: ["pace edge", "rest edge", "efficiency edge"],
  ratingsPrior: {
    source: "MISSING",
    blendWeight: 0.2,
    deltaOverall: 1.5,
    confidence: 0.7
  },
  sampleSize: 2500
};

function near(value: number, expected: number, tolerance = 0.001) {
  assert.ok(Math.abs(value - expected) <= tolerance, `${value} must be within ${tolerance} of ${expected}`);
}

// ---------------------------------------------------------------------------
// No-vig moneyline math must strip sportsbook hold before calibration baseline.
// ---------------------------------------------------------------------------
const noVigEven = __simVerdictTestHooks.noVigProbabilities(-110, -110);
assert.ok(noVigEven, "-110/-110 no-vig probabilities must be available");
near(noVigEven!.left, 0.5);
near(noVigEven!.right, 0.5);
assert.ok(noVigEven!.hold > 0, "market hold must be tracked separately from fair probability");

const noVigSplit = __simVerdictTestHooks.noVigProbabilities(+120, -140);
assert.ok(noVigSplit, "+120/-140 no-vig probabilities must be available");
near(noVigSplit!.left + noVigSplit!.right, 1, 0.00001);
assert.ok(noVigSplit!.hold > 0, "market hold must be positive on +120/-140");

const evenMl = buildMoneylineVerdict(sim, "NBA", "Home", "Away", -110, -110);
const homeEvenMl = evenMl.find((v) => v.side === "HOME" || v.headline.startsWith("Home ML"));
assert.ok(homeEvenMl, "HOME moneyline verdict must exist");
near(homeEvenMl!.marketValue ?? 0, 0.5, 0.001);

// ---------------------------------------------------------------------------
// Spread orientation: projectedSpreadHome is projected home margin.
// Home sportsbook spread uses the opposite cover threshold: home must beat -line.
// ---------------------------------------------------------------------------
const homeFavorite = buildSpreadVerdict(sim, "NBA", "HOME", "AWAY", -4.5, -110, -110);
assert.equal(homeFavorite.side, "HOME", "Home -4.5 with projected margin +6 should lean HOME");
near(homeFavorite.delta ?? 0, 1.5 * 0.55 / (8.1 / 13) / (1.12 - 0.7 * 0.35), 0.08);

const homeDogCovering = buildSpreadVerdict({ ...sim, projectedSpreadHome: 2 }, "NBA", "HOME", "AWAY", +4.5, -110, -110);
assert.equal(homeDogCovering.side, "HOME", "Home +4.5 with projected margin +2 should lean HOME");
assert.ok((homeDogCovering.delta ?? 0) > 3, "Home +4.5 / projected +2 should create a positive home edge");

const homeDogFailing = buildSpreadVerdict({ ...sim, projectedSpreadHome: -7 }, "NBA", "HOME", "AWAY", +4.5, -110, -110);
assert.equal(homeDogFailing.side, "AWAY", "Home +4.5 with projected margin -7 should lean AWAY");
assert.ok((homeDogFailing.delta ?? 0) < 0, "Home +4.5 / projected -7 should create a negative home edge");

// ---------------------------------------------------------------------------
// UNDER total can produce non-PASS while still respecting safety gates.
// ---------------------------------------------------------------------------
const underTotal = buildTotalVerdict(sim, "NBA", 215.5, -110, -110);
assert.equal(underTotal.side, "UNDER");
assert.notEqual(underTotal.actionState, "PASS", "UNDER total must not be forced to PASS");
assert.ok(typeof underTotal.kellyPct === "number");
assert.ok(underTotal.kellyPct <= 0.5, "Kelly must be capped at 0.5% bankroll");

// ---------------------------------------------------------------------------
// UNDER player prop can produce non-PASS, but low sample confidence blocks BET_NOW.
// ---------------------------------------------------------------------------
const underPropSim: PlayerPropSimulationSummary = {
  meanValue: 24.1,
  medianValue: 24,
  stdDev: 4.2,
  p10: 18,
  p50: 24,
  p90: 30,
  hitProbOver: { "26.5": 0.34 },
  hitProbUnder: { "26.5": 0.66 },
  contextualEdgeScore: 8.5,
  priorWeight: 0.1,
  sourceSummary: "minutes stable",
  drivers: ["usage down", "tough matchup"],
  sampleSize: 25
};

const underProp = buildPlayerPropVerdict(underPropSim, "p1", "Player", "player_points", 26.5, -110, -110, "NBA");
assert.equal(underProp.verdict.side, "UNDER");
assert.notEqual(underProp.verdict.actionState, "PASS", "UNDER prop must not be forced to PASS");
assert.notEqual(underProp.verdict.rating, "STRONG_BET", "Low-sample props must not become STRONG_BET");
assert.equal(underProp.verdict.kellyPct, 0, "Low-sample props must not carry Kelly stake");

// ---------------------------------------------------------------------------
// Kelly criterion: quarter Kelly capped at 0.5% bankroll.
// ---------------------------------------------------------------------------
const directKelly = __simVerdictTestHooks.kellyFraction(0.65, -110);
near(directKelly, 0.005, 0.00001);

const simFavAway: ContextualGameSimulationSummary & { sampleSize: number } = { ...sim, winProbHome: 0.35, winProbAway: 0.65, sampleSize: 2500 };
const negOddsML = buildMoneylineVerdict(simFavAway, "NBA", "Home", "Away", 300, -110);
const awayNegOdds = negOddsML.find((v) => v.headline.startsWith("Away ML"));
assert.ok(awayNegOdds, "AWAY verdict at negative odds must exist");
assert.ok(awayNegOdds!.kellyPct <= 0.5, `Kelly must be capped at 0.5%; got ${awayNegOdds!.kellyPct}%`);

console.log("sim-verdict-sides.test.ts passed");
