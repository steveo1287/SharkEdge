import assert from "node:assert/strict";

import { buildFightProjection } from "@/services/modeling/fight-projection-core";

const ufcProjection = buildFightProjection({
  sportKey: "UFC",
  rounds: 5,
  fighterA: {
    name: "Islam Makhachev",
    record: "27-1-0",
    recentWinRate: 88,
    recentMargin: 3.2,
    daysRest: 140,
    metadata: {
      sigStrikeDiff: 2.8,
      controlScore: 8.7,
      finishRate: 0.54,
      reachInches: 70,
      age: 33
    }
  },
  fighterB: {
    name: "Arman Tsarukyan",
    record: "23-3-0",
    recentWinRate: 72,
    recentMargin: 1.1,
    daysRest: 112,
    metadata: {
      sigStrikeDiff: 1.4,
      controlScore: 7.2,
      finishRate: 0.37,
      reachInches: 72,
      age: 29
    }
  }
});

assert.equal(ufcProjection.winProbHome > 0.5, true);
assert.equal(ufcProjection.metadata.methodProbabilities.finish > 0, true);
assert.equal(ufcProjection.metadata.finishRoundExpectation <= 5, true);

const boxingProjection = buildFightProjection({
  sportKey: "BOXING",
  rounds: 12,
  fighterA: {
    name: "Canelo Alvarez",
    record: "61-2-2",
    recentWinRate: 84,
    recentMargin: 4.4,
    daysRest: 180,
    metadata: {
      powerScore: 8.6,
      defenseScore: 8.4,
      finishRate: 0.44,
      reachInches: 70,
      age: 35
    }
  },
  fighterB: {
    name: "David Benavidez",
    record: "30-0-0",
    recentWinRate: 82,
    recentMargin: 3.9,
    daysRest: 155,
    metadata: {
      powerScore: 8.1,
      defenseScore: 7.2,
      finishRate: 0.35,
      reachInches: 74,
      age: 28
    }
  }
});

assert.equal(boxingProjection.winProbHome > 0.35, true);
assert.equal(boxingProjection.metadata.methodProbabilities.decision > 0.2, true);
assert.equal(boxingProjection.metadata.confidenceScore > 0, true);

console.log("fight-projection-core.test.ts passed");
