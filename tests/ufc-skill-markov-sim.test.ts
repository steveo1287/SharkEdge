import assert from "node:assert/strict";

import { buildUfcFighterSkillProfile, type UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";
import { runUfcSkillMarkovSim } from "@/services/ufc/skill-markov-sim";

const fightDate = "2026-06-01T02:00:00.000Z";
const snapshotAt = "2026-05-31T18:00:00.000Z";

function base(id: string, opponentId: string, extra: Partial<UfcModelFeatureSnapshot> = {}): UfcModelFeatureSnapshot {
  return {
    fightId: "m1",
    fightDate,
    fighterId: id,
    opponentFighterId: opponentId,
    snapshotAt,
    modelVersion: "v1",
    age: 29,
    proFights: 16,
    ufcFights: 6,
    roundsFought: 26,
    sigStrikesLandedPerMin: 3.4,
    sigStrikesAbsorbedPerMin: 3.2,
    strikingDifferential: 0.2,
    sigStrikeAccuracyPct: 44,
    sigStrikeDefensePct: 54,
    knockdownsPer15: 0.25,
    takedownsPer15: 1.2,
    takedownAccuracyPct: 35,
    takedownDefensePct: 62,
    submissionAttemptsPer15: 0.45,
    controlTimePct: 18,
    recentFormScore: 0.5,
    finishRate: 0.52,
    lateRoundPerformance: 50,
    opponentAdjustedStrength: 50,
    ...extra
  };
}

const neutralA = buildUfcFighterSkillProfile({ feature: base("neutral-a", "neutral-b") });
const neutralB = buildUfcFighterSkillProfile({ feature: base("neutral-b", "neutral-a") });
const matA = buildUfcFighterSkillProfile({ feature: base("mat-a", "mat-b", { takedownsPer15: 4.8, takedownAccuracyPct: 58, controlTimePct: 52, opponentAdjustedStrength: 66 }) });
const matB = buildUfcFighterSkillProfile({ feature: base("mat-b", "mat-a", { takedownDefensePct: 35, controlTimePct: 4, opponentAdjustedStrength: 45 }) });
const strikeA = buildUfcFighterSkillProfile({ feature: base("strike-a", "strike-b", { sigStrikesLandedPerMin: 5.7, strikingDifferential: 2.1, knockdownsPer15: 1.55, finishRate: 0.9, opponentAdjustedStrength: 63 }) });
const strikeB = buildUfcFighterSkillProfile({ feature: base("strike-b", "strike-a", { sigStrikesAbsorbedPerMin: 5.8, sigStrikeDefensePct: 41, opponentAdjustedStrength: 47 }) });

const neutral = runUfcSkillMarkovSim(neutralA, neutralB, { simulations: 1_000, seed: 11 });
const mat = runUfcSkillMarkovSim(matA, matB, { simulations: 1_000, seed: 11 });
const strike = runUfcSkillMarkovSim(strikeA, strikeB, { simulations: 1_000, seed: 22 });
const strikeAgain = runUfcSkillMarkovSim(strikeA, strikeB, { simulations: 1_000, seed: 22 });

assert.deepEqual(strike, strikeAgain);
assert.equal(Number((strike.fighterAWinProbability + strike.fighterBWinProbability).toFixed(4)), 1);
assert.equal(Number(Object.values(strike.methodProbabilities).reduce((sum, value) => sum + value, 0).toFixed(2)), 1);
assert.ok(mat.transitionProbabilities.standingToTakedownAttemptA > neutral.transitionProbabilities.standingToTakedownAttemptA);
assert.ok(mat.transitionProbabilities.takedownSuccessA > neutral.transitionProbabilities.takedownSuccessA);
assert.ok(strike.transitionProbabilities.strikingExchangeToKnockdownA > neutral.transitionProbabilities.strikingExchangeToKnockdownA);
assert.ok(strike.fighterAWinProbability > 0.5);

console.log("ufc-skill-markov-sim tests passed");
