import assert from "node:assert/strict";

import { applyMlbIntelV7Guard, buildMlbIntelV7Guard } from "@/services/simulation/mlb-intel-v7-guard";

const projection = {
  distribution: {
    homeWinPct: 0.68,
    awayWinPct: 0.32,
    avgHome: 5.1,
    avgAway: 4.2
  },
  mlbIntel: {
    market: {
      homeNoVigProbability: 0.5
    },
    governor: {
      confidence: 0.68,
      tier: "attack",
      noBet: false,
      reasons: ["legacy reason"]
    }
  }
};

const guard = buildMlbIntelV7Guard(projection);
assert.ok(guard);
assert.equal(guard?.v7.modelVersion, "mlb-intel-v7");
assert.ok((guard?.homeWinPct ?? 0) > 0.5);
assert.ok((guard?.homeWinPct ?? 1) < 0.617);
assert.ok(guard?.reasons.some((reason) => reason.includes("guarded projection applied")));
assert.ok(guard?.reasons.includes("legacy reason"));

const guarded = applyMlbIntelV7Guard(projection);
assert.equal(guarded.distribution.homeWinPct, guard?.homeWinPct);
assert.equal(guarded.distribution.awayWinPct, guard?.awayWinPct);
assert.equal(guarded.mlbIntel.governor.source, "mlb-intel-v7-guarded-projection");
assert.equal(guarded.mlbIntel.governor.confidence, guard?.v7.confidence);
assert.equal(guarded.mlbIntel.governor.noBet, guard?.v7.noBet);
assert.equal(guarded.mlbIntel.v7.modelVersion, "mlb-intel-v7");

const noMlbIntel = applyMlbIntelV7Guard({ distribution: { homeWinPct: 0.6, awayWinPct: 0.4 } });
assert.equal(noMlbIntel.distribution.homeWinPct, 0.6);

console.log("mlb-intel-v7-guard.test.ts passed");
