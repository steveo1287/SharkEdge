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

const grappler = { sigStrikeDefensePct: 56, submissionDefensePct: 82, controlEscapePct: 76, getUpRate: 78, heartScore: 88, recoveryScore: 80, gamePlanScore: 86, amateurSignal: 86, promotionTierSignal: 95 };
const striker = { takedownDefensePct: 78, submissionDefensePct: 70, controlEscapePct: 72, getUpRate: 78, heartScore: 82, recoveryScore: 78, gamePlanScore: 86, amateurSignal: 82, promotionTierSignal: 95 };

export const ACTIVE_UFC_NAMED_FIGHTER_PRIOR_BATCH_1C: NamedUfcFighterEraPrior[] = [
  makePrior({
    id: "alexandre-pantoja-active-scramble-grappler",
    aliases: ["alexandre-pantoja", "alexandre-pantoja-passidomo", "the-cannibal"],
    label: "Alexandre Pantoja active scramble-grappler profile",
    base: "scramble_grappling_pressure",
    weightClass: "Flyweight",
    style: "scramble_grappling_pressure_champion",
    profile: { ...grappler, sigStrikesLandedPerMin: 4.6, sigStrikesAbsorbedPerMin: 4.1, strikingDifferential: 0.5, sigStrikeAccuracyPct: 49, knockdownsPer15: 0.18, takedownsPer15: 1.9, takedownAccuracyPct: 42, takedownDefensePct: 72, submissionAttemptsPer15: 1.35, controlTimePct: 34, pressureScore: 86, distanceManagementScore: 67, recentFormScore: 92, staminaScore: 92, paceScore: 90, chinScore: 87, fightIqScore: 86, opponentAdjustedStrength: 92 },
    tendencies: { archetype: "scramble_grappling_pressure_champion", pressure: 88, counterStriking: 58, volume: 78, powerHunting: 55, legKickUsage: 30, bodyWork: 54, takedownInitiation: 76, chainWrestling: 72, clinchEngagement: 74, cageControl: 70, topControlPreference: 76, groundAndPound: 66, submissionHunting: 88, backTakeHunting: 90, getUpUrgency: 86, scrambleChaos: 94, earlyRoundUrgency: 80, roundThreeDurability: 92, championshipRoundTrust: 93, comebackRiskTaking: 84, safeLeadManagement: 74, paceCrashRisk: 16, preferredWinConditions: ["SUBMISSION", "DECISION_CONTROL"], dangerZones: ["clean-range-volume", "takedown-defense-scramble-tax"], opponentTriggers: ["back-exposed-scramble", "front-headlock", "opponent-forces-grappling-chaos"] }
  }),
  makePrior({
    id: "sean-omalley-active-range-sniper",
    aliases: ["sean-omalley", "sean-o-malley", "suga-sean", "sugar-sean"],
    label: "Sean O'Malley active range-sniper profile",
    base: "long_range_switch_stance_striking",
    weightClass: "Bantamweight",
    style: "long_range_precision_sniper",
    profile: { ...striker, sigStrikesLandedPerMin: 6.15, sigStrikesAbsorbedPerMin: 3.45, strikingDifferential: 2.7, sigStrikeAccuracyPct: 61, sigStrikeDefensePct: 62, knockdownsPer15: 0.72, takedownsPer15: 0.35, takedownAccuracyPct: 38, takedownDefensePct: 65, submissionAttemptsPer15: 0.12, controlTimePct: 9, legKicksLandedPer15: 6.6, bodyKicksLandedPer15: 3.4, headKicksLandedPer15: 1.1, kickingAccuracyPct: 54, kickingDefensePct: 62, pressureScore: 72, distanceManagementScore: 93, recentFormScore: 86, staminaScore: 82, paceScore: 78, chinScore: 76, fightIqScore: 87, opponentAdjustedStrength: 88 },
    tendencies: { archetype: "long_range_precision_sniper", pressure: 68, counterStriking: 88, volume: 78, powerHunting: 82, legKickUsage: 70, bodyWork: 68, headKickThreat: 78, takedownInitiation: 12, chainWrestling: 8, clinchEngagement: 22, cageControl: 24, topControlPreference: 8, groundAndPound: 18, submissionHunting: 8, backTakeHunting: 6, getUpUrgency: 88, scrambleChaos: 56, earlyRoundUrgency: 74, roundThreeDurability: 78, championshipRoundTrust: 76, comebackRiskTaking: 76, safeLeadManagement: 80, paceCrashRisk: 24, preferredWinConditions: ["KO_TKO", "DECISION_VOLUME"], dangerZones: ["wrestling-heavy-fence-control", "leg-injury-attrition", "inside-boxing-pocket"], opponentTriggers: ["overreach-entry", "slow-reset", "low-guard-at-range"] }
  }),
  makePrior({
    id: "shavkat-rakhmonov-active-all-phase-finisher",
    aliases: ["shavkat-rakhmonov", "nomad"],
    label: "Shavkat Rakhmonov active all-phase finisher profile",
    base: "all_phase_pressure_finisher",
    weightClass: "Welterweight",
    style: "all_phase_pressure_finisher",
    profile: { ...grappler, sigStrikesLandedPerMin: 4.35, sigStrikesAbsorbedPerMin: 2.65, strikingDifferential: 1.7, sigStrikeAccuracyPct: 58, sigStrikeDefensePct: 55, knockdownsPer15: 0.55, takedownsPer15: 2.35, takedownAccuracyPct: 48, takedownDefensePct: 84, submissionAttemptsPer15: 1.55, controlTimePct: 38, clinchStrikingScore: 78, pressureScore: 86, distanceManagementScore: 78, recentFormScore: 94, staminaScore: 86, paceScore: 80, chinScore: 84, fightIqScore: 88, opponentAdjustedStrength: 90 },
    tendencies: { archetype: "all_phase_pressure_finisher", pressure: 88, counterStriking: 70, volume: 70, powerHunting: 78, legKickUsage: 46, bodyWork: 62, takedownInitiation: 76, chainWrestling: 76, clinchEngagement: 82, cageControl: 78, topControlPreference: 76, groundAndPound: 78, submissionHunting: 90, backTakeHunting: 86, getUpUrgency: 76, scrambleChaos: 82, earlyRoundUrgency: 82, roundThreeDurability: 82, championshipRoundTrust: 78, comebackRiskTaking: 80, safeLeadManagement: 78, paceCrashRisk: 24, preferredWinConditions: ["SUBMISSION", "KO_TKO"], dangerZones: ["elite-defensive-wrestler-distance-management", "low-output-decision-pace"], opponentTriggers: ["clinch-entry", "back-to-fence", "lazy-underhook"] }
  }),
  makePrior({
    id: "charles-oliveira-active-submission-pressure",
    aliases: ["charles-oliveira", "charles-do-bronxs", "do-bronxs"],
    label: "Charles Oliveira active submission-pressure profile",
    base: "submission_pressure_muay_thai",
    weightClass: "Lightweight",
    style: "high_risk_submission_pressure_finisher",
    profile: { ...grappler, sigStrikesLandedPerMin: 3.85, sigStrikesAbsorbedPerMin: 3.25, strikingDifferential: 0.6, sigStrikeAccuracyPct: 53, sigStrikeDefensePct: 52, knockdownsPer15: 0.52, takedownsPer15: 2.35, takedownAccuracyPct: 44, takedownDefensePct: 58, submissionAttemptsPer15: 2.8, submissionDefensePct: 78, controlTimePct: 36, clinchStrikingScore: 78, pressureScore: 88, distanceManagementScore: 64, recentFormScore: 84, heartScore: 90, staminaScore: 82, paceScore: 84, chinScore: 70, recoveryScore: 78, fightIqScore: 86, opponentAdjustedStrength: 93 },
    tendencies: { archetype: "high_risk_submission_pressure_finisher", pressure: 90, counterStriking: 56, volume: 76, powerHunting: 74, legKickUsage: 42, bodyWork: 66, takedownInitiation: 78, chainWrestling: 72, clinchEngagement: 86, cageControl: 76, topControlPreference: 82, groundAndPound: 72, submissionHunting: 99, backTakeHunting: 94, getUpUrgency: 74, scrambleChaos: 96, earlyRoundUrgency: 88, roundThreeDurability: 78, championshipRoundTrust: 74, comebackRiskTaking: 96, safeLeadManagement: 48, paceCrashRisk: 34, preferredWinConditions: ["SUBMISSION", "KO_TKO"], dangerZones: ["clean-power-counter", "defensive-wrestling-control", "reckless-pocket-entry"], opponentTriggers: ["neck-exposed", "back-exposed-scramble", "hurt-opponent"] }
  })
];
