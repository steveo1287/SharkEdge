import assert from "node:assert/strict";

import { buildUfcDeepFighterProfileV2FromFeature } from "@/services/ufc/deep-fighter-profile-v2";
import type { UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";

const feature: UfcModelFeatureSnapshot = {
  fightId: "ufc-test-fight-1",
  fightDate: "2026-06-20T00:00:00.000Z",
  fighterId: "fighter-alpha",
  opponentFighterId: "fighter-beta",
  snapshotAt: "2026-06-08T12:00:00.000Z",
  modelVersion: "test-feature-v1",
  age: 29,
  reachInches: 73,
  heightInches: 71,
  stance: "Orthodox",
  weightClass: "Lightweight",
  daysSinceLastFight: 160,
  proFights: 22,
  ufcFights: 9,
  roundsFought: 42,
  sigStrikesLandedPerMin: 4.9,
  sigStrikesAbsorbedPerMin: 3.1,
  strikingDifferential: 1.8,
  sigStrikeAccuracyPct: 51,
  sigStrikeDefensePct: 60,
  knockdownsPer15: 0.72,
  takedownsPer15: 2.4,
  takedownAccuracyPct: 47,
  takedownDefensePct: 74,
  submissionAttemptsPer15: 0.72,
  submissionDefensePct: 76,
  controlTimePct: 32,
  controlEscapePct: 64,
  getUpRate: 68,
  reversalsPer15: 0.32,
  sweepRate: 0.26,
  legKicksLandedPer15: 8.8,
  bodyKicksLandedPer15: 4.2,
  headKicksLandedPer15: 0.9,
  kickingAccuracyPct: 48,
  kickingDefensePct: 62,
  clinchStrikingScore: 66,
  pressureScore: 68,
  distanceManagementScore: 63,
  recentFormScore: 74,
  finishRate: 0.67,
  lateRoundPerformance: 66,
  heartScore: 72,
  staminaScore: 74,
  paceScore: 70,
  chinScore: 68,
  recoveryScore: 66,
  fightIqScore: 71,
  gamePlanScore: 73,
  shortNoticePenalty: 0,
  injuryLayoffRisk: 0,
  opponentAdjustedStrength: 68,
  coldStartActive: false,
  feature: {
    profileIntelligence: {
      readiness: { grade: "A", score: 91 },
      stanceStyle: {
        tendencies: ["pressure exits", "chain wrestles behind strikes"],
        matchupHooks: ["tests weak cage exits", "can bank control minutes"]
      },
      recentForm: {
        formScore: 76,
        recentSigDiffPerMin: 1.4,
        recentTakedownsPer15: 2.7,
        recentControlPct: 36
      }
    },
    completeProfile: {
      careerStats: {
        proFights: { value: 22, source: "official", confidence: 0.95 },
        ufcFights: { value: 9, source: "official", confidence: 0.94 },
        roundsFought: { value: 42, source: "historyDerived", confidence: 0.88 },
        slpm: { value: 4.9, source: "official", confidence: 0.92 },
        sapm: { value: 3.1, source: "official", confidence: 0.92 },
        strikingDifferential: { value: 1.8, source: "derived", confidence: 0.82 },
        sigStrikeAccuracyPct: { value: 51, source: "official", confidence: 0.9 },
        sigStrikeDefensePct: { value: 60, source: "official", confidence: 0.9 },
        knockdownsPer15: { value: 0.72, source: "historyDerived", confidence: 0.84 },
        takedownsPer15: { value: 2.4, source: "official", confidence: 0.9 },
        takedownAccuracyPct: { value: 47, source: "official", confidence: 0.9 },
        takedownDefensePct: { value: 74, source: "official", confidence: 0.91 },
        submissionAttemptsPer15: { value: 0.72, source: "official", confidence: 0.88 },
        submissionDefensePct: { value: 76, source: "historyDerived", confidence: 0.82 },
        controlTimePct: { value: 32, source: "historyDerived", confidence: 0.84 },
        controlEscapePct: { value: 64, source: "historyDerived", confidence: 0.82 },
        recentFormScore: { value: 74, source: "derived", confidence: 0.76 },
        finishRate: { value: 0.67, source: "official", confidence: 0.88 },
        staminaScore: { value: 74, source: "derived", confidence: 0.72 },
        paceScore: { value: 70, source: "derived", confidence: 0.72 },
        chinScore: { value: 68, source: "derived", confidence: 0.7 },
        fightIqScore: { value: 71, source: "derived", confidence: 0.7 },
        gamePlanScore: { value: 73, source: "derived", confidence: 0.7 },
        opponentAdjustedStrength: { value: 68, source: "derived", confidence: 0.78 }
      },
      physical: {
        age: { value: 29, source: "official", confidence: 0.96 },
        heightInches: { value: 71, source: "official", confidence: 0.96 },
        reachInches: { value: 73, source: "official", confidence: 0.96 }
      }
    }
  }
};

const profile = buildUfcDeepFighterProfileV2FromFeature({
  fighterName: "Alpha Fighter",
  feature,
  payload: feature.feature,
  generatedAt: "2026-06-08T12:00:00.000Z"
});

assert.equal(profile.modelVersion, "ufc-deep-fighter-profile-v2");
assert.equal(profile.fighterId, "fighter-alpha");
assert.equal(profile.fighterName, "Alpha Fighter");
assert.equal(profile.identity.stance, "Orthodox");
assert.equal(profile.identity.weightClass, "Lightweight");
assert.ok(profile.identity.primaryArchetype.length > 0);
assert.ok(profile.sourceTrust.readinessScore >= 70);
assert.ok(profile.sourceTrust.trustedStatCount > profile.sourceTrust.estimatedStatCount);
assert.ok(profile.ratings.overall.value >= 0 && profile.ratings.overall.value <= 100);
assert.ok(profile.ratings.striking.value >= 0 && profile.ratings.striking.value <= 100);
assert.ok(profile.ratings.wrestling.value >= 0 && profile.ratings.wrestling.value <= 100);
assert.ok(profile.ratings.grappling.value >= 0 && profile.ratings.grappling.value <= 100);
assert.ok(profile.ratings.cardio.value >= 0 && profile.ratings.cardio.value <= 100);
assert.ok(profile.ratings.durability.value >= 0 && profile.ratings.durability.value <= 100);
assert.ok(profile.ratings.finishThreat.value >= 0 && profile.ratings.finishThreat.value <= 100);
assert.ok(profile.ratings.decisionFloor.value >= 0 && profile.ratings.decisionFloor.value <= 100);
assert.ok(profile.ratings.overall.confidence > 0 && profile.ratings.overall.confidence <= profile.sourceTrust.maxConfidence);
assert.ok(Object.values(profile.phaseStrengths).every((value) => value >= 0 && value <= 100));
assert.ok(Object.values(profile.winConditionMap).every((value) => value >= 0 && value <= 100));
assert.ok(profile.tendencies.labels.length > 0);
assert.ok(profile.simModifiers.confidenceCap <= 0.96);
assert.ok(profile.explainers.summary.includes("Alpha Fighter"));
assert.ok(profile.explainers.strengths.length > 0);
assert.ok(profile.explainers.matchupHooks.length > 0);
assert.equal(profile.raw.skillProfile.leakageSafe, true);

console.log("ufc-deep-fighter-profile-v2.test.ts passed");
