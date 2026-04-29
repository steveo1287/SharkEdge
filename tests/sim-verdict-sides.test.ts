import assert from "node:assert/strict";

import type { ContextualGameSimulationSummary } from "@/services/simulation/contextual-game-sim";
import type { PlayerPropSimulationSummary } from "@/services/simulation/player-prop-sim";
import { buildPlayerPropVerdict, buildSpreadVerdict, buildTotalVerdict } from "@/services/simulation/sim-verdict-engine";

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

const awaySpread = buildSpreadVerdict(sim, "NBA", "HOME", "AWAY", 8.5, -110, -110);
assert.equal(awaySpread.side, "AWAY");
assert.notEqual(awaySpread.actionState, "PASS");
assert.ok(typeof awaySpread.kellyPct === "number");

const underTotal = buildTotalVerdict(sim, "NBA", 215.5, -110, -110);
assert.equal(underTotal.side, "UNDER");
assert.notEqual(underTotal.actionState, "PASS");
assert.ok(typeof underTotal.kellyPct === "number");

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
assert.notEqual(underProp.verdict.actionState, "PASS");

console.log("sim-verdict-sides.test.ts passed");
