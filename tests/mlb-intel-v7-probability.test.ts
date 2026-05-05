import assert from "node:assert/strict";

import {
  americanOddsToImpliedProbability,
  buildMlbIntelV7Probability,
  calculateProbabilityClvPct,
  twoWayNoVigProbability
} from "@/services/simulation/mlb-intel-v7-probability";

assert.equal(Number(americanOddsToImpliedProbability(-150)?.toFixed(4)), 0.6);
assert.equal(Number(americanOddsToImpliedProbability(150)?.toFixed(4)), 0.4);

const noVigHome = twoWayNoVigProbability({ sideOddsAmerican: -120, otherSideOddsAmerican: 110 });
assert.ok(noVigHome !== null);
assert.ok(noVigHome > 0.51 && noVigHome < 0.54);

const shrunk = buildMlbIntelV7Probability({
  rawHomeWinPct: 0.68,
  marketHomeNoVigProbability: null,
  existingConfidence: 0.66
});

assert.equal(shrunk.modelVersion, "mlb-intel-v7");
assert.equal(shrunk.rawHomeWinPct, 0.68);
assert.equal(shrunk.shrinkHomeWinPct, 0.617);
assert.equal(shrunk.finalHomeWinPct, 0.617);
assert.equal(shrunk.pickSide, null);
assert.equal(shrunk.noBet, true);
assert.ok(shrunk.reasons.some((reason) => reason.includes("market anchor missing")));

const anchored = buildMlbIntelV7Probability({
  rawHomeWinPct: 0.68,
  marketHomeNoVigProbability: 0.5,
  existingConfidence: 0.68
});

assert.ok(anchored.finalHomeWinPct > 0.5);
assert.ok(anchored.finalHomeWinPct < shrunk.shrinkHomeWinPct);
assert.equal(anchored.pickSide, "HOME");
assert.equal(anchored.noBet, false);
assert.ok(anchored.edgeHomePct !== null && anchored.edgeHomePct >= anchored.minEdgePct);

const noEdge = buildMlbIntelV7Probability({
  rawHomeWinPct: 0.56,
  marketHomeNoVigProbability: 0.55,
  existingConfidence: 0.64
});

assert.equal(noEdge.pickSide, null);
assert.equal(noEdge.tier, "pass");
assert.equal(noEdge.noBet, true);

const clvHome = calculateProbabilityClvPct({
  side: "HOME",
  openHomeNoVigProbability: 0.52,
  closeHomeNoVigProbability: 0.55
});
assert.equal(clvHome, 3);

const clvAway = calculateProbabilityClvPct({
  side: "AWAY",
  openHomeNoVigProbability: 0.52,
  closeHomeNoVigProbability: 0.49
});
assert.equal(clvAway, 3);

console.log("mlb-intel-v7-probability.test.ts passed");
