import assert from "node:assert/strict";

import { buildUfcFighterSkillProfile, type UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";
import { buildUfcFighterStyleGenome } from "@/services/ufc/fighter-style-genome";
import { buildUfcMatchupStyleClash } from "@/services/ufc/matchup-style-clash";
import { runUfcSkillMarkovSim } from "@/services/ufc/skill-markov-sim";

const fightDate = "2026-06-01T02:00:00.000Z";
const snapshotAt = "2026-05-31T18:00:00.000Z";

function base(id: string, opponentId: string, extra: Partial<UfcModelFeatureSnapshot> = {}): UfcModelFeatureSnapshot {
  return {
    fightId: "style-test-1",
    fightDate,
    fighterId: id,
    opponentFighterId: opponentId,
    snapshotAt,
    modelVersion: "ufc-fight-iq-v1",
    age: 29,
    reachInches: 72,
    heightInches: 70,
    stance: "Orthodox",
    weightClass: "Lightweight",
    daysSinceLastFight: 140,
    proFights: 18,
    ufcFights: 7,
    roundsFought: 34,
    sigStrikesLandedPerMin: 3.4,
    sigStrikesAbsorbedPerMin: 3.1,
    strikingDifferential: 0.3,
    sigStrikeAccuracyPct: 45,
    sigStrikeDefensePct: 55,
    knockdownsPer15: 0.25,
    takedownsPer15: 1.2,
    takedownAccuracyPct: 38,
    takedownDefensePct: 63,
    submissionAttemptsPer15: 0.45,
    controlTimePct: 18,
    recentFormScore: 62,
    finishRate: 0.52,
    lateRoundPerformance: 57,
    opponentAdjustedStrength: 55,
    coldStartActive: false,
    feature: {
      source: "style-genome-test",
      profileIntelligence: {
        readiness: { score: 86, grade: "A", warnings: [], blockers: [] },
        recentForm: { formScore: 70, recentSigDiffPerMin: 0.8, recentTakedownsPer15: 1.4, recentControlPct: 18 },
        stanceStyle: { tendencies: ["deterministic test profile"] }
      },
      completeProfile: { noMissingData: true }
    },
    ...extra
  };
}

const wrestlerFeature = base("chain-wrestler", "counter-striker", {
  sigStrikesLandedPerMin: 2.9,
  sigStrikesAbsorbedPerMin: 2.6,
  strikingDifferential: 0.3,
  takedownsPer15: 5.2,
  takedownAccuracyPct: 61,
  takedownDefensePct: 78,
  submissionAttemptsPer15: 0.7,
  controlTimePct: 55,
  recentFormScore: 72,
  opponentAdjustedStrength: 68,
  feature: {
    source: "style-genome-test",
    profileIntelligence: {
      readiness: { score: 90, grade: "A", warnings: [], blockers: [] },
      recentForm: { formScore: 76, recentSigDiffPerMin: 0.2, recentTakedownsPer15: 4.7, recentControlPct: 48 },
      stanceStyle: { tendencies: ["takedown-heavy", "control-time driven"] }
    },
    completeProfile: { noMissingData: true }
  }
});

const strikerFeature = base("counter-striker", "chain-wrestler", {
  sigStrikesLandedPerMin: 5.5,
  sigStrikesAbsorbedPerMin: 3.4,
  strikingDifferential: 2.1,
  sigStrikeDefensePct: 67,
  knockdownsPer15: 1.25,
  takedownsPer15: 0.25,
  takedownAccuracyPct: 20,
  takedownDefensePct: 71,
  submissionAttemptsPer15: 0.1,
  controlTimePct: 4,
  finishRate: 0.82,
  recentFormScore: 74,
  opponentAdjustedStrength: 64,
  feature: {
    source: "style-genome-test",
    profileIntelligence: {
      readiness: { score: 88, grade: "A", warnings: [], blockers: [] },
      recentForm: { formScore: 75, recentSigDiffPerMin: 1.9, recentTakedownsPer15: 0.1, recentControlPct: 3 },
      stanceStyle: { tendencies: ["counter-striking", "power threat"] }
    },
    completeProfile: { noMissingData: true }
  }
});

const wrestlerProfile = buildUfcFighterSkillProfile({ feature: wrestlerFeature });
const strikerProfile = buildUfcFighterSkillProfile({ feature: strikerFeature });
const wrestlerGenome = buildUfcFighterStyleGenome({ fighterId: wrestlerProfile.fighterId, skillProfile: wrestlerProfile, feature: wrestlerFeature, profileIntelligence: wrestlerFeature.feature?.profileIntelligence as Record<string, unknown>, completeProfile: wrestlerFeature.feature?.completeProfile as Record<string, unknown> });
const strikerGenome = buildUfcFighterStyleGenome({ fighterId: strikerProfile.fighterId, skillProfile: strikerProfile, feature: strikerFeature, profileIntelligence: strikerFeature.feature?.profileIntelligence as Record<string, unknown>, completeProfile: strikerFeature.feature?.completeProfile as Record<string, unknown> });
const clash = buildUfcMatchupStyleClash(wrestlerGenome, strikerGenome, "2026-05-31T19:00:00.000Z");

assert.equal(wrestlerGenome.version, "ufc-style-genome-v1");
assert.equal(strikerGenome.version, "ufc-style-genome-v1");
assert.ok(wrestlerGenome.tendencies.takedownInitiation > strikerGenome.tendencies.takedownInitiation);
assert.ok(wrestlerGenome.tendencies.topControlPreference > strikerGenome.tendencies.topControlPreference);
assert.ok(strikerGenome.tendencies.powerHunting > wrestlerGenome.tendencies.powerHunting);
assert.ok(strikerGenome.tendencies.volume > wrestlerGenome.tendencies.volume);
assert.ok(wrestlerGenome.archetype.confidence > 0.5);
assert.ok(strikerGenome.archetype.confidence > 0.5);

assert.equal(clash.fighterAId, "chain-wrestler");
assert.equal(clash.fighterBId, "counter-striker");
assert.ok(clash.wrestlingInitiativeEdgeA > 0);
assert.ok(Number.isFinite(clash.simModifiers.takedownAttemptRateA));
assert.ok(Number.isFinite(clash.simModifiers.submissionThreatA));
assert.ok(clash.pathToVictoryA.length > 0);
assert.ok(clash.pathToVictoryB.length > 0);

const baseline = runUfcSkillMarkovSim(wrestlerProfile, strikerProfile, { simulations: 1_000, seed: 1287 });
const styled = runUfcSkillMarkovSim(wrestlerProfile, strikerProfile, { simulations: 1_000, seed: 1287, styleGenomeA: wrestlerGenome, styleGenomeB: strikerGenome, styleClash: clash });
const styledAgain = runUfcSkillMarkovSim(wrestlerProfile, strikerProfile, { simulations: 1_000, seed: 1287, styleGenomeA: wrestlerGenome, styleGenomeB: strikerGenome, styleClash: clash });

assert.deepEqual(styled, styledAgain);
assert.ok(styled.styleGenomeA);
assert.ok(styled.styleGenomeB);
assert.ok(styled.styleClash);
assert.ok(styled.transitionProbabilities.standingToTakedownAttemptA > baseline.transitionProbabilities.standingToTakedownAttemptA);
assert.equal(Number((styled.fighterAWinProbability + styled.fighterBWinProbability).toFixed(4)), 1);
assert.equal(Number(Object.values(styled.methodProbabilities).reduce((sum, value) => sum + value, 0).toFixed(2)), 1);

console.log("ufc-style-genome tests passed");
