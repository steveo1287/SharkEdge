import assert from "node:assert/strict";

import { applyMlbPremiumPickPolicy } from "@/services/simulation/mlb-premium-pick-policy";

const baseV7 = {
  modelVersion: "mlb-intel-v7" as const,
  rawHomeWinPct: 0.64,
  shrinkHomeWinPct: 0.59,
  finalHomeWinPct: 0.62,
  finalAwayWinPct: 0.38,
  marketHomeNoVigProbability: 0.55,
  edgeHomePct: 0.07,
  pickSide: "HOME" as const,
  tier: "attack" as const,
  noBet: false,
  confidence: 0.66,
  shrinkFactor: 0.65,
  marketWeight: 0.6,
  minEdgePct: 0.025,
  reasons: []
};

const learnedAttack = applyMlbPremiumPickPolicy({
  v7: baseV7,
  playerImpact: { applied: true, confidence: 0.84, profileStatus: "LEARNED", profileSampleSize: 600 },
  lock: { startersConfirmed: true, lineupsConfirmed: true },
  marketSource: "test"
});

assert.equal(learnedAttack.tier, "attack");
assert.equal(learnedAttack.noBet, false);
assert.equal(learnedAttack.pickSide, "HOME");
assert.equal(learnedAttack.blockers.length, 0);

const missingMarket = applyMlbPremiumPickPolicy({
  v7: { ...baseV7, marketHomeNoVigProbability: null, edgeHomePct: null, pickSide: null, tier: "pass", noBet: true },
  playerImpact: { applied: true, confidence: 0.84, profileStatus: "LEARNED", profileSampleSize: 600 },
  lock: { startersConfirmed: true, lineupsConfirmed: true },
  marketSource: null
});

assert.equal(missingMarket.tier, "pass");
assert.equal(missingMarket.noBet, true);
assert.ok(missingMarket.blockers.some((reason) => reason.includes("market anchor")));

const defaultProfile = applyMlbPremiumPickPolicy({
  v7: baseV7,
  playerImpact: { applied: true, confidence: 0.84, profileStatus: "DEFAULT", profileSampleSize: 0 },
  lock: { startersConfirmed: true, lineupsConfirmed: true },
  marketSource: "test"
});

assert.equal(defaultProfile.tier, "watch");
assert.equal(defaultProfile.noBet, false);
assert.ok(defaultProfile.warnings.some((reason) => reason.includes("Learned player-impact profile")));

const starterMissing = applyMlbPremiumPickPolicy({
  v7: baseV7,
  playerImpact: { applied: true, confidence: 0.84, profileStatus: "LEARNED", profileSampleSize: 600 },
  lock: { startersConfirmed: false, lineupsConfirmed: true },
  marketSource: "test"
});

assert.equal(starterMissing.tier, "watch");
assert.equal(starterMissing.noBet, false);

console.log("mlb-premium-pick-policy.test.ts passed");
