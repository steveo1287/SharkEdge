import assert from "node:assert/strict";

import { buildUfcDeepFighterProfileV2FromFeature } from "@/services/ufc/deep-fighter-profile-v2";
import { buildUfcDeepProfileMatchupEngine } from "@/services/ufc/deep-profile-matchup-engine";
import type { UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";

function feature(overrides: Partial<UfcModelFeatureSnapshot> & { fighterId: string; opponentFighterId: string }): UfcModelFeatureSnapshot {
  return {
    fightId: "ufc-matchup-test",
    fightDate: "2026-06-20T00:00:00.000Z",
    fighterId: overrides.fighterId,
    opponentFighterId: overrides.opponentFighterId,
    snapshotAt: "2026-06-08T12:00:00.000Z",
    modelVersion: "test-feature-v1",
    age: 29,
    reachInches: 72,
    heightInches: 70,
    stance: "Orthodox",
    weightClass: "Lightweight",
    daysSinceLastFight: 150,
    proFights: 20,
    ufcFights: 8,
    roundsFought: 36,
    sigStrikesLandedPerMin: 4.2,
    sigStrikesAbsorbedPerMin: 3.4,
    strikingDifferential: 0.8,
    sigStrikeAccuracyPct: 48,
    sigStrikeDefensePct: 57,
    knockdownsPer15: 0.4,
    takedownsPer15: 1.4,
    takedownAccuracyPct: 39,
    takedownDefensePct: 64,
    submissionAttemptsPer15: 0.45,
    submissionDefensePct: 64,
    controlTimePct: 20,
    controlEscapePct: 55,
    getUpRate: 58,
    reversalsPer15: 0.2,
    sweepRate: 0.16,
    legKicksLandedPer15: 5.8,
    bodyKicksLandedPer15: 2.7,
    headKicksLandedPer15: 0.5,
    kickingAccuracyPct: 45,
    kickingDefensePct: 58,
    clinchStrikingScore: 56,
    pressureScore: 56,
    distanceManagementScore: 58,
    recentFormScore: 62,
    finishRate: 0.55,
    lateRoundPerformance: 58,
    heartScore: 62,
    staminaScore: 62,
    paceScore: 60,
    chinScore: 61,
    recoveryScore: 60,
    fightIqScore: 62,
    gamePlanScore: 62,
    shortNoticePenalty: 0,
    injuryLayoffRisk: 0,
    opponentAdjustedStrength: 60,
    coldStartActive: false,
    feature: {
      profileIntelligence: {
        readiness: { grade: "A", score: 88 },
        stanceStyle: { tendencies: ["tests phase gaps"], matchupHooks: ["phase gap pressure"] },
        recentForm: { formScore: 66, recentSigDiffPerMin: 0.6, recentTakedownsPer15: 1.3, recentControlPct: 22 }
      },
      completeProfile: {
        careerStats: {
          proFights: { value: 20, source: "official", confidence: 0.92 },
          ufcFights: { value: 8, source: "official", confidence: 0.92 },
          roundsFought: { value: 36, source: "historyDerived", confidence: 0.86 },
          slpm: { value: 4.2, source: "official", confidence: 0.9 },
          sapm: { value: 3.4, source: "official", confidence: 0.9 },
          strikingDifferential: { value: 0.8, source: "derived", confidence: 0.82 },
          sigStrikeAccuracyPct: { value: 48, source: "official", confidence: 0.88 },
          sigStrikeDefensePct: { value: 57, source: "official", confidence: 0.88 },
          knockdownsPer15: { value: 0.4, source: "historyDerived", confidence: 0.8 },
          takedownsPer15: { value: 1.4, source: "official", confidence: 0.88 },
          takedownAccuracyPct: { value: 39, source: "official", confidence: 0.88 },
          takedownDefensePct: { value: 64, source: "official", confidence: 0.88 },
          submissionAttemptsPer15: { value: 0.45, source: "official", confidence: 0.82 },
          submissionDefensePct: { value: 64, source: "historyDerived", confidence: 0.8 },
          controlTimePct: { value: 20, source: "historyDerived", confidence: 0.8 },
          controlEscapePct: { value: 55, source: "historyDerived", confidence: 0.78 },
          recentFormScore: { value: 62, source: "derived", confidence: 0.74 },
          finishRate: { value: 0.55, source: "official", confidence: 0.84 },
          staminaScore: { value: 62, source: "derived", confidence: 0.7 },
          paceScore: { value: 60, source: "derived", confidence: 0.7 },
          chinScore: { value: 61, source: "derived", confidence: 0.68 },
          fightIqScore: { value: 62, source: "derived", confidence: 0.68 },
          gamePlanScore: { value: 62, source: "derived", confidence: 0.68 },
          opponentAdjustedStrength: { value: 60, source: "derived", confidence: 0.76 }
        },
        physical: {
          age: { value: overrides.age ?? 29, source: "official", confidence: 0.95 },
          heightInches: { value: overrides.heightInches ?? 70, source: "official", confidence: 0.95 },
          reachInches: { value: overrides.reachInches ?? 72, source: "official", confidence: 0.95 }
        }
      }
    },
    ...overrides
  };
}

const wrestlerFeature = feature({
  fighterId: "fighter-wrestler",
  opponentFighterId: "fighter-striker",
  takedownsPer15: 4.2,
  takedownAccuracyPct: 58,
  takedownDefensePct: 82,
  submissionAttemptsPer15: 1.1,
  submissionDefensePct: 80,
  controlTimePct: 46,
  controlEscapePct: 72,
  getUpRate: 74,
  reversalsPer15: 0.4,
  sweepRate: 0.28,
  clinchStrikingScore: 70,
  pressureScore: 66,
  staminaScore: 74,
  paceScore: 68,
  fightIqScore: 76,
  gamePlanScore: 78,
  recentFormScore: 77,
  opponentAdjustedStrength: 72
});

const strikerFeature = feature({
  fighterId: "fighter-striker",
  opponentFighterId: "fighter-wrestler",
  sigStrikesLandedPerMin: 5.6,
  sigStrikesAbsorbedPerMin: 4.4,
  strikingDifferential: 1.2,
  sigStrikeAccuracyPct: 53,
  sigStrikeDefensePct: 51,
  knockdownsPer15: 1.05,
  takedownsPer15: 0.35,
  takedownAccuracyPct: 24,
  takedownDefensePct: 46,
  submissionAttemptsPer15: 0.08,
  submissionDefensePct: 52,
  controlTimePct: 5,
  controlEscapePct: 44,
  getUpRate: 42,
  legKicksLandedPer15: 10,
  bodyKicksLandedPer15: 5,
  headKicksLandedPer15: 1.4,
  kickingAccuracyPct: 52,
  pressureScore: 72,
  distanceManagementScore: 55,
  finishRate: 0.72,
  staminaScore: 56,
  chinScore: 54,
  recoveryScore: 52,
  fightIqScore: 61,
  gamePlanScore: 58,
  recentFormScore: 70,
  opponentAdjustedStrength: 65
});

const wrestler = buildUfcDeepFighterProfileV2FromFeature({ fighterName: "Chain Wrestler", feature: wrestlerFeature, payload: wrestlerFeature.feature, generatedAt: "2026-06-08T12:00:00.000Z" });
const striker = buildUfcDeepFighterProfileV2FromFeature({ fighterName: "Power Striker", feature: strikerFeature, payload: strikerFeature.feature, generatedAt: "2026-06-08T12:00:00.000Z" });
const matchup = buildUfcDeepProfileMatchupEngine({ fighterA: wrestler, fighterB: striker, fightId: "ufc-matchup-test", generatedAt: "2026-06-08T12:00:00.000Z" });

assert.equal(matchup.modelVersion, "ufc-deep-profile-matchup-engine-v1");
assert.equal(matchup.fightId, "ufc-matchup-test");
assert.equal(matchup.fighterA.fighterName, "Chain Wrestler");
assert.equal(matchup.fighterB.fighterName, "Power Striker");
assert.ok(["A", "B", "EVEN"].includes(matchup.overallEdge.leader));
assert.ok(matchup.overallEdge.confidence > 0 && matchup.overallEdge.confidence <= 1);
assert.ok(Object.keys(matchup.phaseEdges).length === 8);
assert.ok(matchup.phaseEdges.wrestling.fighterA >= 0 && matchup.phaseEdges.wrestling.fighterA <= 100);
assert.ok(matchup.phaseEdges.standing.fighterB >= 0 && matchup.phaseEdges.standing.fighterB <= 100);
assert.ok(matchup.topPhaseEdges.length > 0);
assert.ok(matchup.winConditionPaths.length > 0);
assert.ok(matchup.roundLeverage.length === 5);
assert.ok(matchup.dangerZones.length > 0);
assert.ok(matchup.simModifiers.matchup.volatility >= 0 && matchup.simModifiers.matchup.volatility <= 1);
assert.ok(matchup.summary.includes("top phase"));
assert.ok(matchup.phaseEdges.wrestling.leader === "A" || matchup.phaseEdges.grappling.leader === "A");
assert.ok(matchup.winConditionPaths.some((path) => path.fighter === "A" && ["DECISION_CONTROL", "SUBMISSION", "SCRAMBLE_CHAOS"].includes(path.condition)));
assert.ok(matchup.dangerZones.some((zone) => ["TAKEDOWN_CHAIN", "CONTROL_TRAP", "EARLY_POWER"].includes(zone.type)));
for (const row of matchup.roundLeverage) {
  assert.ok(row.fighterA >= 0 && row.fighterA <= 100);
  assert.ok(row.fighterB >= 0 && row.fighterB <= 100);
  assert.ok(row.volatility >= 0 && row.volatility <= 100);
}

console.log("ufc-deep-profile-matchup-engine.test.ts passed");
