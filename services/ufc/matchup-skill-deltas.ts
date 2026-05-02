import type { UfcFighterSkillProfile } from "@/services/ufc/fighter-skill-profile";

export type UfcMatchupSkillDeltas = {
  fighterAId: string;
  fighterBId: string;
  strikingEdgeA: number;
  wrestlingEdgeA: number;
  grapplingEdgeA: number;
  cardioEdgeA: number;
  durabilityEdgeA: number;
  finishEdgeA: number;
  decisionEdgeA: number;
  paceEdgeA: number;
  groundControlBiasA: number;
  knockdownBiasA: number;
  submissionBiasA: number;
  upsetRisk: number;
};

function round(value: number) {
  return Number(value.toFixed(4));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function skillDelta(attack: number, defense: number) {
  return clamp((attack - defense) / 100, -1, 1);
}

export function buildUfcMatchupSkillDeltas(fighterA: UfcFighterSkillProfile, fighterB: UfcFighterSkillProfile): UfcMatchupSkillDeltas {
  const strikingEdgeA = skillDelta(
    fighterA.striking.offense * 0.42 + fighterA.striking.power * 0.24 + fighterA.striking.accuracy * 0.2 + fighterA.striking.volume * 0.14,
    fighterB.striking.defense * 0.55 + fighterB.striking.damageAbsorption * 0.45
  );
  const wrestlingEdgeA = skillDelta(
    fighterA.wrestling.takedownOffense * 0.5 + fighterA.wrestling.control * 0.3 + fighterA.wrestling.scramble * 0.2,
    fighterB.wrestling.takedownDefense * 0.55 + fighterB.wrestling.getUps * 0.3 + fighterB.wrestling.scramble * 0.15
  );
  const grapplingEdgeA = skillDelta(
    fighterA.grappling.submissionThreat * 0.45 + fighterA.grappling.topGame * 0.35 + fighterA.wrestling.control * 0.2,
    fighterB.grappling.submissionDefense * 0.45 + fighterB.grappling.bottomSurvival * 0.35 + fighterB.wrestling.getUps * 0.2
  );
  const cardioEdgeA = skillDelta(
    fighterA.cardio.latePace * 0.45 + fighterA.cardio.round3 * 0.35 + fighterA.cardio.earlyPace * 0.2,
    fighterB.cardio.latePace * 0.45 + fighterB.cardio.round3 * 0.35 + fighterB.cardio.earlyPace * 0.2
  );
  const durabilityEdgeA = skillDelta(
    fighterA.durability.koResistance * 0.5 + fighterA.durability.submissionResistance * 0.3 + fighterA.durability.damageTrend * 0.2,
    fighterB.striking.power * 0.42 + fighterB.grappling.submissionThreat * 0.32 + fighterB.striking.offense * 0.26
  );

  const powerVsDurabilityA = skillDelta(fighterA.striking.power, fighterB.durability.koResistance);
  const subVsDefenseA = skillDelta(fighterA.grappling.submissionThreat, fighterB.durability.submissionResistance);
  const finishEdgeA = round(powerVsDurabilityA * 0.58 + subVsDefenseA * 0.42);
  const decisionEdgeA = round((strikingEdgeA * 0.35 + wrestlingEdgeA * 0.28 + cardioEdgeA * 0.27 + durabilityEdgeA * 0.1));
  const paceEdgeA = round(skillDelta(fighterA.striking.volume * 0.55 + fighterA.cardio.earlyPace * 0.45, fighterB.striking.volume * 0.55 + fighterB.cardio.earlyPace * 0.45));
  const groundControlBiasA = round(wrestlingEdgeA * 0.68 + grapplingEdgeA * 0.32);
  const knockdownBiasA = round(powerVsDurabilityA * 0.72 + strikingEdgeA * 0.28);
  const submissionBiasA = round(subVsDefenseA * 0.72 + grapplingEdgeA * 0.28);
  const totalCertainty = Math.abs(strikingEdgeA) + Math.abs(wrestlingEdgeA) + Math.abs(grapplingEdgeA) + Math.abs(cardioEdgeA) + Math.abs(durabilityEdgeA);
  const reliability = Math.min(fighterA.sampleReliability, fighterB.sampleReliability);
  const upsetRisk = round(clamp(0.34 - totalCertainty * 0.035 + (1 - reliability) * 0.18, 0.08, 0.52));

  return {
    fighterAId: fighterA.fighterId,
    fighterBId: fighterB.fighterId,
    strikingEdgeA: round(strikingEdgeA),
    wrestlingEdgeA: round(wrestlingEdgeA),
    grapplingEdgeA: round(grapplingEdgeA),
    cardioEdgeA: round(cardioEdgeA),
    durabilityEdgeA: round(durabilityEdgeA),
    finishEdgeA,
    decisionEdgeA,
    paceEdgeA,
    groundControlBiasA,
    knockdownBiasA,
    submissionBiasA,
    upsetRisk
  };
}

export function invertUfcMatchupSkillDeltas(deltas: UfcMatchupSkillDeltas): UfcMatchupSkillDeltas {
  return {
    fighterAId: deltas.fighterBId,
    fighterBId: deltas.fighterAId,
    strikingEdgeA: round(-deltas.strikingEdgeA),
    wrestlingEdgeA: round(-deltas.wrestlingEdgeA),
    grapplingEdgeA: round(-deltas.grapplingEdgeA),
    cardioEdgeA: round(-deltas.cardioEdgeA),
    durabilityEdgeA: round(-deltas.durabilityEdgeA),
    finishEdgeA: round(-deltas.finishEdgeA),
    decisionEdgeA: round(-deltas.decisionEdgeA),
    paceEdgeA: round(-deltas.paceEdgeA),
    groundControlBiasA: round(-deltas.groundControlBiasA),
    knockdownBiasA: round(-deltas.knockdownBiasA),
    submissionBiasA: round(-deltas.submissionBiasA),
    upsetRisk: deltas.upsetRisk
  };
}
