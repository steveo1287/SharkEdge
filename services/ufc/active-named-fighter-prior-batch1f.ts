import type { NamedUfcFighterEraPrior } from "@/services/ufc/named-fighter-era-priors";

type CompactPrior = { id: string; aliases: string[]; label: string; base: string; weightClass: string; style: string; profile: Record<string, number>; tendencies: Record<string, unknown> };

function makePrior(input: CompactPrior): NamedUfcFighterEraPrior {
  return { id: input.id, aliases: input.aliases, confidence: "A", label: input.label, sourceUrl: `manual:active-ufc-fighter-era-priors/${input.id}`, evidence: [`Active-UFC-gated named prior for ${input.label}.`, "Apply only with current UFC activity or roster/contract signal."], profile: input.profile, metadata: { combatBase: input.base, projectedWeightClass: input.weightClass, styleOverride: input.style, activeUfcOnly: true, eraProfiles: [{ id: "active_current", label: input.label, status: "WHAT_IF_READY", activeUfcOnly: true, weightClasses: [input.weightClass] }], tendencyPrior: input.tendencies } };
}

const wrestler = { sigStrikeDefensePct: 58, submissionDefensePct: 80, controlEscapePct: 76, getUpRate: 78, heartScore: 86, recoveryScore: 80, gamePlanScore: 86, amateurSignal: 88, promotionTierSignal: 94 };
const striker = { takedownDefensePct: 74, submissionDefensePct: 68, controlEscapePct: 70, getUpRate: 76, heartScore: 86, recoveryScore: 80, gamePlanScore: 84, amateurSignal: 82, promotionTierSignal: 94 };

export const ACTIVE_UFC_NAMED_FIGHTER_PRIOR_BATCH_1F: NamedUfcFighterEraPrior[] = [
  makePrior({
    id: "movsar-evloev-active-control-wrestler",
    aliases: ["movsar-evloev"],
    label: "Movsar Evloev active control-wrestler profile",
    base: "undefeated_control_wrestling_pressure",
    weightClass: "Featherweight",
    style: "low_risk_control_wrestler",
    profile: { ...wrestler, sigStrikesLandedPerMin: 4.05, sigStrikesAbsorbedPerMin: 2.65, strikingDifferential: 1.4, sigStrikeAccuracyPct: 46, knockdownsPer15: 0.08, takedownsPer15: 4.6, takedownAccuracyPct: 44, takedownDefensePct: 74, submissionAttemptsPer15: 0.45, controlTimePct: 48, pressureScore: 84, distanceManagementScore: 74, recentFormScore: 90, staminaScore: 92, paceScore: 88, chinScore: 84, fightIqScore: 86, opponentAdjustedStrength: 88 },
    tendencies: { archetype: "low_risk_control_wrestler", pressure: 84, counterStriking: 52, volume: 74, powerHunting: 28, legKickUsage: 34, bodyWork: 52, takedownInitiation: 92, chainWrestling: 90, clinchEngagement: 86, cageControl: 90, topControlPreference: 88, groundAndPound: 56, submissionHunting: 38, backTakeHunting: 48, getUpUrgency: 84, scrambleChaos: 78, earlyRoundUrgency: 74, roundThreeDurability: 92, championshipRoundTrust: 86, safeLeadManagement: 92, paceCrashRisk: 12, preferredWinConditions: ["DECISION_CONTROL"], dangerZones: ["low-finish-upside", "elite-submission-scramble"], opponentTriggers: ["back-to-fence", "wide-stance", "failed-kick-reset"] }
  }),
  makePrior({
    id: "diego-lopes-active-chaos-finisher",
    aliases: ["diego-lopes"],
    label: "Diego Lopes active chaos-finisher profile",
    base: "submission_boxing_chaos_finisher",
    weightClass: "Featherweight",
    style: "high_variance_submission_power_finisher",
    profile: { ...striker, sigStrikesLandedPerMin: 4.9, sigStrikesAbsorbedPerMin: 3.95, strikingDifferential: 0.95, sigStrikeAccuracyPct: 52, sigStrikeDefensePct: 54, knockdownsPer15: 0.76, takedownsPer15: 1.15, takedownAccuracyPct: 42, takedownDefensePct: 66, submissionAttemptsPer15: 1.45, submissionDefensePct: 76, controlTimePct: 24, pressureScore: 88, distanceManagementScore: 70, recentFormScore: 92, staminaScore: 82, paceScore: 84, chinScore: 82, fightIqScore: 80, opponentAdjustedStrength: 84 },
    tendencies: { archetype: "high_variance_submission_power_finisher", pressure: 90, counterStriking: 64, volume: 80, powerHunting: 86, legKickUsage: 36, bodyWork: 58, takedownInitiation: 54, chainWrestling: 48, clinchEngagement: 72, cageControl: 58, topControlPreference: 58, groundAndPound: 66, submissionHunting: 88, backTakeHunting: 82, getUpUrgency: 82, scrambleChaos: 94, earlyRoundUrgency: 92, roundThreeDurability: 76, championshipRoundTrust: 70, comebackRiskTaking: 94, safeLeadManagement: 52, paceCrashRisk: 34, preferredWinConditions: ["KO_TKO", "SUBMISSION"], dangerZones: ["controlled-decision-wrestling", "overcommitted-entry"], opponentTriggers: ["scramble", "hurt-opponent", "back-exposure"] }
  }),
  makePrior({
    id: "yair-rodriguez-active-dynamic-kicker",
    aliases: ["yair-rodriguez", "el-pantera"],
    label: "Yair Rodriguez active dynamic-kicker profile",
    base: "dynamic_kicking_scramble_striker",
    weightClass: "Featherweight",
    style: "dynamic_long_range_kicker",
    profile: { ...striker, sigStrikesLandedPerMin: 4.75, sigStrikesAbsorbedPerMin: 4.1, strikingDifferential: 0.65, sigStrikeAccuracyPct: 46, sigStrikeDefensePct: 53, knockdownsPer15: 0.44, takedownsPer15: 0.55, takedownAccuracyPct: 28, takedownDefensePct: 63, submissionAttemptsPer15: 0.75, controlTimePct: 12, legKicksLandedPer15: 9.4, bodyKicksLandedPer15: 5.4, headKicksLandedPer15: 1.8, kickingAccuracyPct: 52, kickingDefensePct: 56, pressureScore: 66, distanceManagementScore: 84, recentFormScore: 76, staminaScore: 78, paceScore: 80, chinScore: 82, fightIqScore: 80, opponentAdjustedStrength: 88 },
    tendencies: { archetype: "dynamic_long_range_kicker", pressure: 62, counterStriking: 78, volume: 78, powerHunting: 76, legKickUsage: 88, bodyWork: 78, headKickThreat: 94, takedownInitiation: 18, chainWrestling: 12, clinchEngagement: 36, cageControl: 28, topControlPreference: 10, groundAndPound: 18, submissionHunting: 42, backTakeHunting: 22, getUpUrgency: 88, scrambleChaos: 80, earlyRoundUrgency: 78, roundThreeDurability: 78, championshipRoundTrust: 72, comebackRiskTaking: 88, safeLeadManagement: 56, paceCrashRisk: 28, preferredWinConditions: ["KO_TKO", "DECISION_VOLUME"], dangerZones: ["top-control-wrestling", "boxing-pressure-pocket"], opponentTriggers: ["range-reset", "hands-low-entry", "linear-pressure"] }
  }),
  makePrior({
    id: "brian-ortega-active-submission-boxer",
    aliases: ["brian-ortega", "t-city", "t-city-ortega"],
    label: "Brian Ortega active submission-boxer profile",
    base: "submission_grappling_boxing_durability",
    weightClass: "Featherweight",
    style: "durable_submission_counter_grappler",
    profile: { ...wrestler, sigStrikesLandedPerMin: 4.05, sigStrikesAbsorbedPerMin: 6.05, strikingDifferential: -2.0, sigStrikeAccuracyPct: 39, sigStrikeDefensePct: 49, knockdownsPer15: 0.32, takedownsPer15: 0.95, takedownAccuracyPct: 24, takedownDefensePct: 56, submissionAttemptsPer15: 1.4, controlTimePct: 22, pressureScore: 72, distanceManagementScore: 60, recentFormScore: 68, staminaScore: 76, paceScore: 68, chinScore: 88, recoveryScore: 84, fightIqScore: 80, opponentAdjustedStrength: 90 },
    tendencies: { archetype: "durable_submission_counter_grappler", pressure: 70, counterStriking: 62, volume: 68, powerHunting: 62, legKickUsage: 24, bodyWork: 48, takedownInitiation: 48, chainWrestling: 42, clinchEngagement: 68, cageControl: 48, topControlPreference: 62, groundAndPound: 48, submissionHunting: 94, backTakeHunting: 88, getUpUrgency: 76, scrambleChaos: 88, earlyRoundUrgency: 70, roundThreeDurability: 80, championshipRoundTrust: 74, comebackRiskTaking: 90, safeLeadManagement: 48, paceCrashRisk: 34, preferredWinConditions: ["SUBMISSION", "KO_TKO"], dangerZones: ["high-volume-boxing-damage", "wrestling-control-with-no-scramble"], opponentTriggers: ["neck-exposure", "reckless-entry", "back-exposure"] }
  })
];
