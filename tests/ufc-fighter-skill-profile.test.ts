import assert from "node:assert/strict";

import { allSkillValues, buildUfcFighterSkillProfile, type UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";

const fightDate = "2026-06-01T02:00:00.000Z";
const snapshotAt = "2026-05-31T18:00:00.000Z";

const strongFeature: UfcModelFeatureSnapshot = {
  fightId: "fight-1",
  fightDate,
  fighterId: "fighter-a",
  opponentFighterId: "fighter-b",
  snapshotAt,
  modelVersion: "v1",
  age: 29,
  proFights: 18,
  ufcFights: 7,
  roundsFought: 30,
  sigStrikesLandedPerMin: 4.2,
  sigStrikesAbsorbedPerMin: 2.5,
  strikingDifferential: 1.7,
  sigStrikeAccuracyPct: 49,
  sigStrikeDefensePct: 60,
  knockdownsPer15: 0.4,
  takedownsPer15: 3.8,
  takedownAccuracyPct: 51,
  takedownDefensePct: 77,
  submissionAttemptsPer15: 0.9,
  controlTimePct: 42,
  recentFormScore: 0.72,
  finishRate: 0.68,
  lateRoundPerformance: 65,
  opponentAdjustedStrength: 66
};

const lowSampleFeature: UfcModelFeatureSnapshot = {
  ...strongFeature,
  fighterId: "low-sample",
  proFights: 4,
  ufcFights: 0,
  roundsFought: 0,
  coldStartActive: true
};

const strong = buildUfcFighterSkillProfile({ feature: strongFeature });
const lowSample = buildUfcFighterSkillProfile({ feature: lowSampleFeature });

for (const value of allSkillValues(strong)) assert.ok(value >= 0 && value <= 100, `skill ${value} should normalize to 0-100`);
assert.equal(strong.leakageSafe, true);
assert.ok(strong.sampleReliability > lowSample.sampleReliability);
assert.equal(lowSample.prospect.coldStartActive, true);
assert.equal(lowSample.prospect.confidenceCap, 58);
assert.ok(Math.abs(lowSample.wrestling.takedownOffense - 50) < Math.abs(strong.wrestling.takedownOffense - 50));

const recencyProfile = buildUfcFighterSkillProfile({
  feature: strongFeature,
  featureHistory: [
    { ...strongFeature, snapshotAt: "2026-02-01T00:00:00.000Z", takedownsPer15: 0.2, controlTimePct: 4 },
    { ...strongFeature, snapshotAt: "2025-10-01T00:00:00.000Z", takedownsPer15: 0.1, controlTimePct: 3 }
  ]
});
assert.ok(recencyProfile.wrestling.takedownOffense < strong.wrestling.takedownOffense);
assert.throws(() => buildUfcFighterSkillProfile({ feature: { ...strongFeature, snapshotAt: "2026-06-02T00:00:00.000Z" } }), /future-data leakage/);

console.log("ufc-fighter-skill-profile tests passed");
