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
    evidence: [
      `Active-UFC-only named prior for ${input.label}.`,
      "Profile is intended to replace generic fallback values with fighter-specific skill and tendency priors."
    ],
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

const grappler = { sigStrikeDefensePct: 56, submissionDefensePct: 80, controlEscapePct: 74, getUpRate: 76, heartScore: 86, recoveryScore: 78, gamePlanScore: 86, amateurSignal: 88, promotionTierSignal: 95 };
const striker = { takedownDefensePct: 76, submissionDefensePct: 70, controlEscapePct: 70, getUpRate: 76, heartScore: 84, recoveryScore: 78, gamePlanScore: 86, amateurSignal: 82, promotionTierSignal: 95 };

export const ACTIVE_UFC_NAMED_FIGHTER_PRIOR_BATCH_1B: NamedUfcFighterEraPrior[] = [
  makePrior({
    id: "khamzat-chimaev-active-pressure-wrestler",
    aliases: ["khamzat-chimaev", "borz"],
    label: "Khamzat Chimaev active pressure-wrestler profile",
    base: "elite_wrestling_pressure",
    weightClass: "Middleweight",
    style: "explosive_pressure_wrestler",
    profile: { ...grappler, sigStrikesLandedPerMin: 4.55, sigStrikesAbsorbedPerMin: 2.75, strikingDifferential: 1.8, sigStrikeAccuracyPct: 58, sigStrikeDefensePct: 51, knockdownsPer15: 0.45, takedownsPer15: 4.7, takedownAccuracyPct: 57, takedownDefensePct: 88, submissionAttemptsPer15: 1.35, controlTimePct: 58, pressureScore: 96, distanceManagementScore: 65, recentFormScore: 90, staminaScore: 78, paceScore: 90, chinScore: 85, fightIqScore: 82, opponentAdjustedStrength: 88 },
    tendencies: { archetype: "explosive_pressure_wrestler", pressure: 97, counterStriking: 56, volume: 76, powerHunting: 70, legKickUsage: 18, bodyWork: 42, takedownInitiation: 98, chainWrestling: 94, clinchEngagement: 92, cageControl: 94, topControlPreference: 96, groundAndPound: 88, submissionHunting: 82, backTakeHunting: 88, getUpUrgency: 70, scrambleChaos: 86, earlyRoundUrgency: 98, roundThreeDurability: 68, championshipRoundTrust: 62, comebackRiskTaking: 86, safeLeadManagement: 72, paceCrashRisk: 45, preferredWinConditions: ["DECISION_CONTROL", "SUBMISSION"], dangerZones: ["late-round-pace", "clean-boxing-at-range"], opponentTriggers: ["square-stance", "back-to-fence", "missed-power-swing"] }
  }),
  makePrior({
    id: "merab-dvalishvili-active-cardio-wrestler",
    aliases: ["merab-dvalishvili", "the-machine"],
    label: "Merab Dvalishvili active cardio-wrestler profile",
    base: "pace_wrestling_cardio",
    weightClass: "Bantamweight",
    style: "relentless_cardio_chain_wrestler",
    profile: { ...grappler, sigStrikesLandedPerMin: 4.1, sigStrikesAbsorbedPerMin: 2.8, strikingDifferential: 1.3, sigStrikeAccuracyPct: 43, sigStrikeDefensePct: 58, knockdownsPer15: 0.12, takedownsPer15: 6.2, takedownAccuracyPct: 39, takedownDefensePct: 82, submissionAttemptsPer15: 0.25, controlTimePct: 46, pressureScore: 95, distanceManagementScore: 70, recentFormScore: 94, heartScore: 94, staminaScore: 99, paceScore: 99, chinScore: 86, fightIqScore: 86, opponentAdjustedStrength: 91 },
    tendencies: { archetype: "relentless_cardio_chain_wrestler", pressure: 96, counterStriking: 44, volume: 86, powerHunting: 28, legKickUsage: 34, bodyWork: 50, takedownInitiation: 99, chainWrestling: 99, clinchEngagement: 96, cageControl: 96, topControlPreference: 78, groundAndPound: 58, submissionHunting: 28, backTakeHunting: 42, getUpUrgency: 92, scrambleChaos: 94, earlyRoundUrgency: 88, roundThreeDurability: 99, championshipRoundTrust: 98, comebackRiskTaking: 82, safeLeadManagement: 90, paceCrashRisk: 8, preferredWinConditions: ["DECISION_CONTROL", "pace_wrestling_attrition"], dangerZones: ["one-shot-counter", "front-headlock-entry-risk"], opponentTriggers: ["opponent-slows", "back-to-fence", "wide-stance"] }
  }),
  makePrior({
    id: "dricus-du-plessis-active-chaos-pressure",
    aliases: ["dricus-du-plessis", "dricus-du-plessis-stilknocks", "stilknocks"],
    label: "Dricus Du Plessis active chaos-pressure profile",
    base: "chaos_pressure_mma",
    weightClass: "Middleweight",
    style: "awkward_chaos_pressure_finisher",
    profile: { sigStrikesLandedPerMin: 6.0, sigStrikesAbsorbedPerMin: 4.25, strikingDifferential: 1.75, sigStrikeAccuracyPct: 51, sigStrikeDefensePct: 54, knockdownsPer15: 0.62, takedownsPer15: 2.35, takedownAccuracyPct: 47, takedownDefensePct: 78, submissionAttemptsPer15: 0.85, submissionDefensePct: 76, controlTimePct: 33, controlEscapePct: 68, getUpRate: 70, clinchStrikingScore: 76, pressureScore: 90, distanceManagementScore: 62, recentFormScore: 95, heartScore: 92, staminaScore: 84, paceScore: 82, chinScore: 88, recoveryScore: 84, fightIqScore: 80, gamePlanScore: 79, opponentAdjustedStrength: 92, amateurSignal: 76, promotionTierSignal: 95 },
    tendencies: { archetype: "awkward_chaos_pressure_finisher", pressure: 91, counterStriking: 58, volume: 82, powerHunting: 79, legKickUsage: 38, bodyWork: 64, takedownInitiation: 68, chainWrestling: 62, clinchEngagement: 82, cageControl: 76, topControlPreference: 70, groundAndPound: 78, submissionHunting: 66, backTakeHunting: 56, getUpUrgency: 76, scrambleChaos: 92, earlyRoundUrgency: 82, roundThreeDurability: 88, championshipRoundTrust: 84, comebackRiskTaking: 92, safeLeadManagement: 62, paceCrashRisk: 32, preferredWinConditions: ["KO_TKO", "SUBMISSION"], dangerZones: ["clean-range-counter", "low-output-reset"], opponentTriggers: ["opponent-shells", "bad-reset", "fence-clinch"] }
  }),
  makePrior({
    id: "alexander-volkanovski-active-technical-pressure",
    aliases: ["alexander-volkanovski", "alex-volkanovski", "the-great"],
    label: "Alexander Volkanovski active technical-pressure profile",
    base: "technical_mma_pressure",
    weightClass: "Featherweight",
    style: "technical_pressure_adjustment_master",
    profile: { ...striker, sigStrikesLandedPerMin: 6.25, sigStrikesAbsorbedPerMin: 3.45, strikingDifferential: 2.8, sigStrikeAccuracyPct: 56, sigStrikeDefensePct: 60, knockdownsPer15: 0.38, takedownsPer15: 1.65, takedownAccuracyPct: 36, takedownDefensePct: 82, submissionAttemptsPer15: 0.25, controlTimePct: 22, legKicksLandedPer15: 9.0, kickingAccuracyPct: 52, kickingDefensePct: 64, pressureScore: 86, distanceManagementScore: 90, recentFormScore: 78, heartScore: 90, staminaScore: 94, paceScore: 90, chinScore: 76, recoveryScore: 78, fightIqScore: 96, gamePlanScore: 97, opponentAdjustedStrength: 94 },
    tendencies: { archetype: "technical_pressure_adjustment_master", pressure: 85, counterStriking: 78, volume: 88, powerHunting: 55, legKickUsage: 88, bodyWork: 72, takedownInitiation: 48, chainWrestling: 44, clinchEngagement: 56, cageControl: 58, topControlPreference: 38, groundAndPound: 44, submissionHunting: 22, getUpUrgency: 88, scrambleChaos: 72, earlyRoundUrgency: 76, roundThreeDurability: 92, championshipRoundTrust: 93, comebackRiskTaking: 74, safeLeadManagement: 90, paceCrashRisk: 14, preferredWinConditions: ["DECISION_VOLUME", "technical_pressure"], dangerZones: ["age-durability-tax", "large-power-exchange"], opponentTriggers: ["bites-on-feints", "flat-footed-stance", "slow-calf-kick-check"] }
  })
];
