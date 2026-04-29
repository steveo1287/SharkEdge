import assert from "node:assert/strict";

import type { ContextualGameSimulationSummary } from "@/services/simulation/contextual-game-sim";
import type { PlayerPropSimulationSummary } from "@/services/simulation/player-prop-sim";
import { buildMoneylineVerdict, buildPlayerPropVerdict, buildSpreadVerdict, buildTotalVerdict } from "@/services/simulation/sim-verdict-engine";

const sim: ContextualGameSimulationSummary = {
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
  }
};

// ---------------------------------------------------------------------------
// AWAY spread can produce BET_NOW (not suppressed to PASS)
// ---------------------------------------------------------------------------
const awaySpread = buildSpreadVerdict(sim, "NBA", "HOME", "AWAY", 8.5, -110, -110);
assert.equal(awaySpread.side, "AWAY");
assert.notEqual(awaySpread.actionState, "PASS", "AWAY spread must not be forced to PASS");

// ---------------------------------------------------------------------------
// UNDER total can produce non-PASS
// ---------------------------------------------------------------------------
const underTotal = buildTotalVerdict(sim, "NBA", 215.5, -110, -110);
assert.equal(underTotal.side, "UNDER");
assert.notEqual(underTotal.actionState, "PASS", "UNDER total must not be forced to PASS");
assert.ok(typeof underTotal.kellyPct === "number");

// ---------------------------------------------------------------------------
// UNDER player prop can produce non-PASS
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
  drivers: ["usage down", "tough matchup"]
};

const underProp = buildPlayerPropVerdict(underPropSim, "p1", "Player", "player_points", 26.5, -110, -110, "NBA");
assert.equal(underProp.verdict.side, "UNDER");
assert.notEqual(underProp.verdict.actionState, "PASS", "UNDER prop must not be forced to PASS");

// ---------------------------------------------------------------------------
// Kelly criterion: negative American odds must return positive stake when EV is positive
// ---------------------------------------------------------------------------

// Direct Kelly math test: away at 60% sim vs +100 market (50% implied) → b=1.0, kelly=20%
const simStrongAway: ContextualGameSimulationSummary = { ...sim, winProbHome: 0.40, winProbAway: 0.60 };
const positiveEVML = buildMoneylineVerdict(simStrongAway, "NBA", "Home", "Away", -110, +100);
const awayPositiveEV = positiveEVML.find((v) => v.side === "AWAY");
assert.ok(awayPositiveEV, "AWAY moneyline verdict must exist");
assert.ok(awayPositiveEV!.kellyPct > 0, `Kelly at +100 with 60% sim must be positive; got ${awayPositiveEV!.kellyPct}%`);

// Negative-odds Kelly test: away at 65% sim vs -110 (52.4% implied) → b=0.909, kelly≈11.5%
const simFavAway: ContextualGameSimulationSummary = { ...sim, winProbHome: 0.35, winProbAway: 0.65 };
const negOddsML = buildMoneylineVerdict(simFavAway, "NBA", "Home", "Away", 300, -110);
const awayNegOdds = negOddsML.find((v) => v.side === "AWAY");
assert.ok(awayNegOdds, "AWAY verdict at negative odds must exist");
assert.ok(awayNegOdds!.kellyPct > 0, `Kelly at -110 with 65% sim (12% edge) must be positive; got ${awayNegOdds!.kellyPct}%`);

console.log("sim-verdict-sides.test.ts passed");
