import type { UfcFighterSkillProfile } from "@/services/ufc/fighter-skill-profile";

export type UfcMatchupSkillDeltas = {
  fighterAId: string;
  fighterBId: string;
  strikingEdgeA: number;
  kickingEdgeA: number;
  wrestlingEdgeA: number;
  grapplingEdgeA: number;
  cardioEdgeA: number;
  staminaEdgeA: number;
  durabilityEdgeA: number;
  heartEdgeA: number;
  fightIqEdgeA: number;
  finishEdgeA: number;
  decisionEdgeA: number;
  paceEdgeA: number;
  pressureEdgeA: number;
  distanceEdgeA: number;
  groundControlBiasA: number;
  knockdownBiasA: number;
  submissionBiasA: number;
  submissionDefenseEdgeA: number;
  grapplingDefenseEdgeA: number;
  layoffRiskA: number;
  upsetRisk: number;
};

const round = (value: number) => Number(value.toFixed(4));
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const skillDelta = (attack: number, defense: number) => clamp((attack - defense) / 100, -1, 1);
const peerDelta = (left: number, right: number) => clamp((left - right) / 100, -1, 1);

export function buildUfcMatchupSkillDeltas(fighterA: UfcFighterSkillProfile, fighterB: UfcFighterSkillProfile): UfcMatchupSkillDeltas {
  const strikingAttackA =
    fighterA.striking.offense * 0.32 +
    fighterA.striking.power * 0.2 +
    fighterA.striking.accuracy * 0.16 +
    fighterA.striking.volume * 0.12 +
    fighterA.striking.pressure * 0.1 +
    fighterA.striking.distanceManagement * 0.1;
  const strikingDefenseB = fighterB.striking.defense * 0.42 + fighterB.striking.damageAbsorption * 0.28 + fighterB.striking.distanceManagement * 0.18 + fighterB.kicking.defense * 0.12;
  const strikingEdgeA = skillDelta(strikingAttackA, strikingDefenseB);

  const kickingAttackA = fighterA.kicking.offense * 0.34 + fighterA.kicking.kickingVolume * 0.18 + fighterA.kicking.accuracy * 0.18 + fighterA.kicking.legKicks * 0.12 + fighterA.kicking.bodyKicks * 0.08 + fighterA.kicking.headKicks * 0.1;
  const kickingDefenseB = fighterB.kicking.defense * 0.56 + fighterB.striking.distanceManagement * 0.24 + fighterB.cardio.stamina * 0.1 + fighterB.wrestling.takedownOffense * 0.1;
  const kickingEdgeA = skillDelta(kickingAttackA, kickingDefenseB);

  const wrestlingEdgeA = skillDelta(
    fighterA.wrestling.takedownOffense * 0.42 + fighterA.wrestling.control * 0.22 + fighterA.wrestling.scramble * 0.14 + fighterA.wrestling.clinchControl * 0.14 + fighterA.intangibles.gamePlan * 0.08,
    fighterB.wrestling.takedownDefense * 0.42 + fighterB.wrestling.getUps * 0.24 + fighterB.wrestling.scramble * 0.16 + fighterB.grappling.grapplingDefense * 0.12 + fighterB.intangibles.fightIq * 0.06
  );
  const grapplingEdgeA = skillDelta(
    fighterA.grappling.submissionThreat * 0.3 + fighterA.grappling.grapplingOffense * 0.24 + fighterA.grappling.topGame * 0.2 + fighterA.wrestling.control * 0.14 + fighterA.grappling.reversals * 0.12,
    fighterB.grappling.submissionDefense * 0.28 + fighterB.grappling.grapplingDefense * 0.24 + fighterB.grappling.bottomSurvival * 0.22 + fighterB.wrestling.getUps * 0.16 + fighterB.durability.heart * 0.1
  );
  const cardioEdgeA = skillDelta(
    fighterA.cardio.latePace * 0.3 + fighterA.cardio.round3 * 0.24 + fighterA.cardio.earlyPace * 0.14 + fighterA.cardio.stamina * 0.2 + fighterA.cardio.paceSustain * 0.12,
    fighterB.cardio.latePace * 0.3 + fighterB.cardio.round3 * 0.24 + fighterB.cardio.earlyPace * 0.14 + fighterB.cardio.stamina * 0.2 + fighterB.cardio.paceSustain * 0.12
  );
  const staminaEdgeA = peerDelta(fighterA.cardio.stamina * 0.58 + fighterA.cardio.paceSustain * 0.42, fighterB.cardio.stamina * 0.58 + fighterB.cardio.paceSustain * 0.42);
  const durabilityEdgeA = skillDelta(
    fighterA.durability.koResistance * 0.34 + fighterA.durability.submissionResistance * 0.22 + fighterA.durability.damageTrend * 0.14 + fighterA.durability.chin * 0.12 + fighterA.durability.recovery * 0.1 + fighterA.durability.heart * 0.08,
    fighterB.striking.power * 0.28 + fighterB.grappling.submissionThreat * 0.22 + fighterB.striking.offense * 0.2 + fighterB.kicking.headKicks * 0.12 + fighterB.grappling.grapplingOffense * 0.1 + fighterB.striking.pressure * 0.08
  );
  const heartEdgeA = peerDelta(fighterA.durability.heart * 0.45 + fighterA.durability.recovery * 0.28 + fighterA.cardio.stamina * 0.27, fighterB.durability.heart * 0.45 + fighterB.durability.recovery * 0.28 + fighterB.cardio.stamina * 0.27);
  const fightIqEdgeA = peerDelta(fighterA.intangibles.fightIq * 0.48 + fighterA.intangibles.gamePlan * 0.32 + fighterA.intangibles.experience * 0.2, fighterB.intangibles.fightIq * 0.48 + fighterB.intangibles.gamePlan * 0.32 + fighterB.intangibles.experience * 0.2);
  const pressureEdgeA = peerDelta(fighterA.striking.pressure * 0.56 + fighterA.cardio.earlyPace * 0.24 + fighterA.durability.heart * 0.2, fighterB.striking.pressure * 0.56 + fighterB.cardio.earlyPace * 0.24 + fighterB.durability.heart * 0.2);
  const distanceEdgeA = peerDelta(fighterA.striking.distanceManagement * 0.46 + fighterA.kicking.defense * 0.24 + fighterA.physical.reachAdvantagePotential * 0.2 + fighterA.intangibles.fightIq * 0.1, fighterB.striking.distanceManagement * 0.46 + fighterB.kicking.defense * 0.24 + fighterB.physical.reachAdvantagePotential * 0.2 + fighterB.intangibles.fightIq * 0.1);

  const powerVsDurabilityA = skillDelta(fighterA.striking.power * 0.72 + fighterA.kicking.headKicks * 0.28, fighterB.durability.koResistance * 0.58 + fighterB.durability.chin * 0.24 + fighterB.durability.recovery * 0.18);
  const subVsDefenseA = skillDelta(fighterA.grappling.submissionThreat * 0.62 + fighterA.grappling.grapplingOffense * 0.22 + fighterA.grappling.guardGame * 0.16, fighterB.grappling.submissionDefense * 0.46 + fighterB.durability.submissionResistance * 0.28 + fighterB.grappling.bottomSurvival * 0.26);
  const submissionDefenseEdgeA = peerDelta(fighterA.grappling.submissionDefense * 0.48 + fighterA.durability.submissionResistance * 0.32 + fighterA.grappling.bottomSurvival * 0.2, fighterB.grappling.submissionDefense * 0.48 + fighterB.durability.submissionResistance * 0.32 + fighterB.grappling.bottomSurvival * 0.2);
  const grapplingDefenseEdgeA = peerDelta(fighterA.grappling.grapplingDefense * 0.42 + fighterA.wrestling.getUps * 0.26 + fighterA.wrestling.scramble * 0.18 + fighterA.grappling.bottomSurvival * 0.14, fighterB.grappling.grapplingDefense * 0.42 + fighterB.wrestling.getUps * 0.26 + fighterB.wrestling.scramble * 0.18 + fighterB.grappling.bottomSurvival * 0.14);

  const finishEdgeA = round(powerVsDurabilityA * 0.48 + subVsDefenseA * 0.34 + kickingEdgeA * 0.1 + heartEdgeA * 0.08);
  const decisionEdgeA = round(strikingEdgeA * 0.25 + kickingEdgeA * 0.1 + wrestlingEdgeA * 0.19 + grapplingEdgeA * 0.14 + cardioEdgeA * 0.16 + fightIqEdgeA * 0.1 + durabilityEdgeA * 0.06);
  const paceEdgeA = round(skillDelta(fighterA.striking.volume * 0.28 + fighterA.kicking.kickingVolume * 0.14 + fighterA.striking.pressure * 0.2 + fighterA.cardio.earlyPace * 0.22 + fighterA.cardio.paceSustain * 0.16, fighterB.striking.volume * 0.28 + fighterB.kicking.kickingVolume * 0.14 + fighterB.striking.pressure * 0.2 + fighterB.cardio.earlyPace * 0.22 + fighterB.cardio.paceSustain * 0.16));
  const groundControlBiasA = round(wrestlingEdgeA * 0.54 + grapplingEdgeA * 0.26 + fightIqEdgeA * 0.1 + staminaEdgeA * 0.1);
  const knockdownBiasA = round(powerVsDurabilityA * 0.58 + strikingEdgeA * 0.22 + kickingEdgeA * 0.14 + pressureEdgeA * 0.06);
  const submissionBiasA = round(subVsDefenseA * 0.64 + grapplingEdgeA * 0.22 + wrestlingEdgeA * 0.08 + fightIqEdgeA * 0.06);
  const layoffRiskA = round(clamp((fighterB.intangibles.layoffRisk + fighterB.intangibles.shortNoticeRisk - fighterA.intangibles.layoffRisk - fighterA.intangibles.shortNoticeRisk) / 100, -0.45, 0.45));
  const totalCertainty = Math.abs(strikingEdgeA) + Math.abs(kickingEdgeA) + Math.abs(wrestlingEdgeA) + Math.abs(grapplingEdgeA) + Math.abs(cardioEdgeA) + Math.abs(durabilityEdgeA) + Math.abs(fightIqEdgeA);
  const reliability = Math.min(fighterA.sampleReliability, fighterB.sampleReliability);
  const riskPenalty = (fighterA.intangibles.layoffRisk + fighterB.intangibles.layoffRisk + fighterA.intangibles.shortNoticeRisk + fighterB.intangibles.shortNoticeRisk) / 420;
  const upsetRisk = round(clamp(0.34 - totalCertainty * 0.032 + (1 - reliability) * 0.18 + riskPenalty, 0.08, 0.56));
  return {
    fighterAId: fighterA.fighterId,
    fighterBId: fighterB.fighterId,
    strikingEdgeA: round(strikingEdgeA),
    kickingEdgeA: round(kickingEdgeA),
    wrestlingEdgeA: round(wrestlingEdgeA),
    grapplingEdgeA: round(grapplingEdgeA),
    cardioEdgeA: round(cardioEdgeA),
    staminaEdgeA: round(staminaEdgeA),
    durabilityEdgeA: round(durabilityEdgeA),
    heartEdgeA: round(heartEdgeA),
    fightIqEdgeA: round(fightIqEdgeA),
    finishEdgeA,
    decisionEdgeA,
    paceEdgeA,
    pressureEdgeA: round(pressureEdgeA),
    distanceEdgeA: round(distanceEdgeA),
    groundControlBiasA,
    knockdownBiasA,
    submissionBiasA,
    submissionDefenseEdgeA: round(submissionDefenseEdgeA),
    grapplingDefenseEdgeA: round(grapplingDefenseEdgeA),
    layoffRiskA,
    upsetRisk
  };
}