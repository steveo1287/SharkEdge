import assert from "node:assert/strict";

import { estimateOverUnderProbabilities } from "@/services/modeling/market-distribution";
import { simulateMlbGame } from "@/services/modeling/mlb-game-sim-service";

const summary = simulateMlbGame({
  home: {
    teamName: "Chicago Cubs",
    offenseFactor: 1.04,
    homeFieldEdge: 1.035,
    starter: {
      expectedOuts: 17.2,
      runsAllowedPer9: 3.85,
      strikeoutsPer9: 9.6,
      whip: 1.14
    },
    bullpen: {
      runsAllowedPer9: 3.78,
      strikeoutsPer9: 9.1
    }
  },
  away: {
    teamName: "St. Louis Cardinals",
    offenseFactor: 0.98,
    homeFieldEdge: 0.97,
    starter: {
      expectedOuts: 15.8,
      runsAllowedPer9: 4.22,
      strikeoutsPer9: 8.4,
      whip: 1.26
    },
    bullpen: {
      runsAllowedPer9: 4.18,
      strikeoutsPer9: 8.2
    }
  },
  venue: {
    name: "Wrigley Field",
    parkFactor: 1.02
  },
  weather: {
    available: true,
    runFactor: 1.03,
    note: "mild wind out"
  },
  market: {
    homeImpliedProb: 0.56,
    awayImpliedProb: 0.44
  },
  seed: 42,
  samples: 1200
});

assert.equal(summary.winProbHome > 0, true);
assert.equal(summary.winProbAway > 0, true);
assert.equal(summary.projectedTotalRuns > 0, true);
assert.equal(summary.firstFive.projectedTotalRuns > 0, true);
assert.equal(summary.distribution.totalStdDev > 0, true);
assert.equal(summary.firstFive.totalStdDev > 0, true);
assert.equal(Math.abs(summary.winProbHome + summary.winProbAway - 1) < 0.02, true);

const pricing = estimateOverUnderProbabilities({
  mean: summary.projectedTotalRuns,
  line: 8.5,
  stdDev: summary.distribution.totalStdDev
});

assert.ok(pricing);
assert.equal((pricing?.overProb ?? 0) > 0, true);
assert.equal((pricing?.underProb ?? 0) > 0, true);
assert.equal(Math.abs((pricing?.overProb ?? 0) + (pricing?.underProb ?? 0) + (pricing?.pushProb ?? 0) - 1) < 0.025, true);

console.log("mlb-game-sim-service.test.ts passed");


assert.equal(summary.calibration.calibratedWinProbHome > 0, true);
assert.equal(summary.calibration.modelWeight > 0, true);
assert.equal(summary.calibration.marketWeight > 0, true);
assert.equal(summary.calibration.confidencePenalty >= 0, true);
