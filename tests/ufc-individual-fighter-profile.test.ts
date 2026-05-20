import assert from "node:assert/strict";

import { applyIndividualUfcProfileToFeature, buildIndividualUfcFighterProfile } from "@/services/ufc/individual-fighter-profile";
import type { UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";

const feature: UfcModelFeatureSnapshot = {
  fightId: "fight-1",
  fightDate: "2026-06-01T02:00:00.000Z",
  fighterId: "fighter-a",
  opponentFighterId: "fighter-b",
  snapshotAt: "2026-05-31T18:00:00.000Z",
  modelVersion: "ufc-fight-iq-v1",
  proFights: 12,
  ufcFights: 4,
  roundsFought: 25,
  sigStrikesLandedPerMin: 3.1,
  sigStrikesAbsorbedPerMin: 3.4,
  takedownsPer15: 0.8,
  takedownDefensePct: 59,
  submissionAttemptsPer15: 0.2,
  controlTimePct: 10,
  opponentAdjustedStrength: 52,
  feature: {
    source: "fighter-profile-gap-fill",
    statSourceMap: {
      slpm: { source: "scoutedEstimate", confidence: 0.28 },
      takedownsPer15: { source: "scoutedEstimate", confidence: 0.28 }
    }
  }
};

const payload = {
  completeProfile: {
    noMissingData: true,
    careerStats: {
      slpm: { value: 4.8, source: "official", confidence: 0.95 },
      sapm: { value: 2.4, source: "official", confidence: 0.94 },
      strikingDifferential: { value: 2.4, source: "derived", confidence: 0.82 },
      sigStrikeDefensePct: { value: 63, source: "official", confidence: 0.9 },
      takedownsPer15: { value: 2.6, source: "derived", confidence: 0.74 },
      takedownDefensePct: { value: 81, source: "official", confidence: 0.9 },
      submissionAttemptsPer15: { value: 0.9, source: "derived", confidence: 0.7 },
      submissionDefensePct: { value: 72, source: "derived", confidence: 0.74 },
      controlTimePct: { value: 32, source: "derived", confidence: 0.72 },
      staminaScore: { value: 74, source: "derived", confidence: 0.72 },
      opponentAdjustedStrength: { value: 66, source: "historyDerived", confidence: 0.78 }
    },
    sample: {
      proFights: { value: 18, source: "official", confidence: 0.95 },
      ufcFights: { value: 8, source: "official", confidence: 0.95 },
      roundsFought: { value: 41, source: "official", confidence: 0.95 }
    },
    physical: {
      age: { value: 29, source: "official", confidence: 0.9 },
      reachInches: { value: 74, source: "official", confidence: 0.9 }
    }
  },
  profileIntelligence: {
    stanceStyle: {
      tendencies: ["high-pressure southpaw"],
      matchupHooks: ["test opponent get-up rate"]
    }
  }
};

const profile = buildIndividualUfcFighterProfile({ fighterId: "fighter-a", fighterName: "Real Fighter", payload, feature });
assert.equal(profile.noGenericEdge, false);
assert.ok(profile.trustedStatCount >= 10);
assert.ok(profile.tendencies.includes("high-volume striker"));
assert.ok(profile.tendencies.includes("high-pressure southpaw"));
assert.equal(profile.stats.find((stat) => stat.key === "sigStrikesLandedPerMin")?.source, "official");

const bridge = applyIndividualUfcProfileToFeature({ feature, payload, fighterName: "Real Fighter" });
assert.equal(bridge.feature.sigStrikesLandedPerMin, 4.8);
assert.equal(bridge.feature.takedownsPer15, 2.6);
assert.equal(bridge.feature.coldStartActive, feature.coldStartActive);

const weak = buildIndividualUfcFighterProfile({ fighterId: "fighter-c", fighterName: "Generic Prospect", payload: {}, feature: { ...feature, feature: { statSourceMap: { slpm: { source: "scoutedEstimate" } } } } });
assert.equal(weak.noGenericEdge, true);
assert.ok(weak.blockers.some((item) => item.includes("NO_GENERIC_EDGE")));

console.log("ufc-individual-fighter-profile tests passed");
