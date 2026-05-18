import type { NamedUfcFighterEraPrior } from "@/services/ufc/named-fighter-era-priors";

type CompactPrior = {
  id: string;
  aliases: string[];
  label: string;
  base: string;
  weightClass: string;
  style: string;
  profile: Record<string, number>;
  tendencies: Record<string, unknown>;
};

function makePrior(input: CompactPrior): NamedUfcFighterEraPrior {
  return {
    id: input.id,
    aliases: input.aliases,
    confidence: "A",
    label: input.label,
    sourceUrl: `manual:active-ufc-fighter-era-priors/${input.id}`,
    evidence: [`Active-UFC-only named prior for ${input.label}.`, `Profile is intended to override generic averages with fighter-specific skill and tendency priors.`],
    profile: input.profile,
    metadata: {
      combatBase: input.base,
      projectedWeightClass: input.weightClass,
      styleOverride: input.style,
      activeUfcOnly: true,
      eraProfiles: [{ id: "active_current", label: input.label, status: "WHAT_IF_READY", activeUfcOnly: true, weightClasses: [input.weightClass] }],
      tendencyPrior: input.tendencies
    }
  };
}

const grappler = { sigStrikeDefensePct: 57, submissionDefensePct: 80, controlEscapePct: 74, getUpRate: 74, gamePlanScore: 88, amateurSignal: 88, promotionTierSignal: 96 };
const striker = { takedownDefensePct: 74, submissionDefensePct: 68, controlEscapePct: 66, getUpRate: 70, gamePlanScore: 85, amateurSignal: 82, promotionTierSignal: 96 };

export const ACTIVE_UFC_NAMED_FIGHTER_PRIOR_BATCH_1: NamedUfcFighterEraPrior[] = [
  makePrior({
    id: "islam-makhachev-active-sambo-control",
    aliases: ["islam-makhachev", "islam-ramazanovich-makhachev"],
    label: "Islam Makhachev active sambo-control profile",
    base: "combat_sambo_wrestling_control",
    weightClass: "Lightweight",
    style: "sambo_pressure_control_grappler",
    profile: { ...grappler, sigStrikesLandedPerMin: 3.1, sigStrikesAbsorbedPerMin: 1.9, strikingDifferential: 1.2, sigStrikeAccuracyPct: 52, knockdownsPer15: 0.22, takedownsPer15: 3.45, takedownAccuracyPct: 62, takedownDefensePct: 90, submissionAttemptsPer15: 1.15, controlTimePct: 55, pressureScore: 72, distanceManagementScore: 76, recentFormScore: 94, staminaScore: 90, paceScore: 78, chinScore: 82, fightIqScore: 94, opponentAdjustedStrength: 95 },
    tendencies: { archetype: "sambo_pressure_control_grappler", pressure: 73, counterStriking: 61, volume: 54, powerHunting: 45, legKickUsage: 34, bodyWork: 48, takedownInitiation: 92, chainWrestling: 96, cageControl: 92, topControlPreference: 96, submissionHunting: 82, backTakeHunting: 86, getUpUrgency: 70, earlyRoundUrgency: 68, roundThreeDurability: 88, championshipRoundTrust: 90, safeLeadManagement: 91, paceCrashRisk: 18, preferredWinConditions: ["DECISION_CONTROL", "SUBMISSION"], dangerZones: ["forced-long-range-striking"], opponentTriggers: ["back-to-fence", "missed-power-entry"] }
  }),
  makePrior({
    id: "ilia-topuria-active-power-boxer",
    aliases: ["ilia-topuria", "elia-topuria", "el-matador"],
    label: "Ilia Topuria active power-boxer profile",
    base: "boxing_power_grappling_base",
    weightClass: "Featherweight",
    style: "elite_power_boxer_grappler",
    profile: { ...striker, sigStrikesLandedPerMin: 4.65, sigStrikesAbsorbedPerMin: 3.15, strikingDifferential: 1.5, sigStrikeAccuracyPct: 50, sigStrikeDefensePct: 60, knockdownsPer15: 0.88, takedownsPer15: 1.25, takedownAccuracyPct: 48, takedownDefensePct: 78, submissionAttemptsPer15: 0.95, controlTimePct: 28, pressureScore: 85, distanceManagementScore: 77, recentFormScore: 96, heartScore: 84, staminaScore: 82, paceScore: 76, chinScore: 86, recoveryScore: 82, fightIqScore: 88, opponentAdjustedStrength: 92 },
    tendencies: { archetype: "elite_power_boxer_grappler", pressure: 86, counterStriking: 84, volume: 66, powerHunting: 92, bodyWork: 74, takedownInitiation: 54, chainWrestling: 48, cageControl: 58, topControlPreference: 52, submissionHunting: 58, getUpUrgency: 74, earlyRoundUrgency: 82, roundThreeDurability: 78, championshipRoundTrust: 76, comebackRiskTaking: 80, paceCrashRisk: 28, preferredWinConditions: ["KO_TKO", "SUBMISSION"], dangerZones: ["long-range-volume"], opponentTriggers: ["straight-line-exit", "defensive-shell"] }
  }),
  makePrior({
    id: "alex-pereira-active-kickboxing-power",
    aliases: ["alex-pereira", "alexsandro-pereira", "poatan"],
    label: "Alex Pereira active kickboxing-power profile",
    base: "elite_kickboxing_power",
    weightClass: "Light Heavyweight",
    style: "elite_kickboxing_counter_power",
    profile: { ...striker, sigStrikesLandedPerMin: 5.15, sigStrikesAbsorbedPerMin: 3.7, strikingDifferential: 1.45, sigStrikeAccuracyPct: 58, sigStrikeDefensePct: 57, knockdownsPer15: 1.05, takedownsPer15: 0.15, takedownAccuracyPct: 25, takedownDefensePct: 71, submissionAttemptsPer15: 0.02, controlTimePct: 7, legKicksLandedPer15: 10.5, bodyKicksLandedPer15: 4.5, headKicksLandedPer15: 0.85, kickingAccuracyPct: 56, kickingDefensePct: 60, clinchStrikingScore: 72, pressureScore: 72, distanceManagementScore: 90, recentFormScore: 94, staminaScore: 80, paceScore: 66, chinScore: 82, fightIqScore: 86, opponentAdjustedStrength: 95 },
    tendencies: { archetype: "elite_kickboxing_counter_power", pressure: 70, counterStriking: 91, volume: 58, powerHunting: 96, legKickUsage: 92, bodyWork: 78, headKickThreat: 64, takedownInitiation: 8, chainWrestling: 4, topControlPreference: 4, submissionHunting: 2, getUpUrgency: 82, earlyRoundUrgency: 74, roundThreeDurability: 76, championshipRoundTrust: 78, comebackRiskTaking: 84, paceCrashRisk: 31, preferredWinConditions: ["KO_TKO"], dangerZones: ["extended-ground-control"], opponentTriggers: ["naked-entry", "low-guard-exit"] }
  }),
  makePrior({
    id: "tom-aspinall-active-heavyweight-athlete",
    aliases: ["tom-aspinall", "thomas-aspinall"],
    label: "Tom Aspinall active heavyweight speed-finisher profile",
    base: "heavyweight_boxing_bjj_athlete",
    weightClass: "Heavyweight",
    style: "heavyweight_speed_finisher",
    profile: { sigStrikesLandedPerMin: 6.25, sigStrikesAbsorbedPerMin: 2.85, strikingDifferential: 3.4, sigStrikeAccuracyPct: 66, sigStrikeDefensePct: 65, knockdownsPer15: 1.15, takedownsPer15: 2.05, takedownAccuracyPct: 55, takedownDefensePct: 82, submissionAttemptsPer15: 1.1, submissionDefensePct: 78, controlTimePct: 31, controlEscapePct: 74, getUpRate: 76, clinchStrikingScore: 76, pressureScore: 82, distanceManagementScore: 84, recentFormScore: 95, heartScore: 80, staminaScore: 78, paceScore: 81, chinScore: 82, recoveryScore: 78, fightIqScore: 86, gamePlanScore: 86, opponentAdjustedStrength: 90, amateurSignal: 82, promotionTierSignal: 95 },
    tendencies: { archetype: "heavyweight_speed_finisher", pressure: 82, counterStriking: 76, volume: 72, powerHunting: 91, takedownInitiation: 62, chainWrestling: 55, topControlPreference: 64, groundAndPound: 78, submissionHunting: 66, getUpUrgency: 76, earlyRoundUrgency: 90, roundThreeDurability: 70, championshipRoundTrust: 68, comebackRiskTaking: 80, paceCrashRisk: 39, preferredWinConditions: ["KO_TKO", "SUBMISSION"], dangerZones: ["deep-championship-rounds"], opponentTriggers: ["slow-entry", "missed-overhand"] }
  })
];
