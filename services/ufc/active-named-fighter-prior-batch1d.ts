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
      `Active-UFC-gated named prior for ${input.label}.`,
      "Only apply this prior when SharkEdge data proves current UFC activity or active roster/contract signal."
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

const wrestler = { sigStrikeDefensePct: 57, submissionDefensePct: 78, controlEscapePct: 76, getUpRate: 76, heartScore: 86, recoveryScore: 80, gamePlanScore: 87, amateurSignal: 88, promotionTierSignal: 94 };
const striker = { takedownDefensePct: 76, submissionDefensePct: 70, controlEscapePct: 72, getUpRate: 74, heartScore: 88, recoveryScore: 80, gamePlanScore: 84, amateurSignal: 80, promotionTierSignal: 94 };

export const ACTIVE_UFC_NAMED_FIGHTER_PRIOR_BATCH_1D: NamedUfcFighterEraPrior[] = [
  makePrior({
    id: "arman-tsarukyan-active-scramble-wrestler",
    aliases: ["arman-tsarukyan", "ahalkalakets"],
    label: "Arman Tsarukyan active scramble-wrestler profile",
    base: "scramble_wrestling_mma",
    weightClass: "Lightweight",
    style: "high_pace_scramble_wrestler",
    profile: { ...wrestler, sigStrikesLandedPerMin: 3.9, sigStrikesAbsorbedPerMin: 2.25, strikingDifferential: 1.65, sigStrikeAccuracyPct: 48, knockdownsPer15: 0.24, takedownsPer15: 3.2, takedownAccuracyPct: 38, takedownDefensePct: 78, submissionAttemptsPer15: 0.55, controlTimePct: 42, pressureScore: 82, distanceManagementScore: 76, recentFormScore: 90, staminaScore: 90, paceScore: 88, chinScore: 84, fightIqScore: 86, opponentAdjustedStrength: 90 },
    tendencies: { archetype: "high_pace_scramble_wrestler", pressure: 83, counterStriking: 60, volume: 72, powerHunting: 55, legKickUsage: 48, bodyWork: 58, takedownInitiation: 88, chainWrestling: 88, clinchEngagement: 78, cageControl: 80, topControlPreference: 82, groundAndPound: 70, submissionHunting: 48, backTakeHunting: 48, getUpUrgency: 86, scrambleChaos: 90, earlyRoundUrgency: 78, roundThreeDurability: 88, championshipRoundTrust: 82, comebackRiskTaking: 74, safeLeadManagement: 80, paceCrashRisk: 20, preferredWinConditions: ["DECISION_CONTROL", "scramble_wrestling_attrition"], dangerZones: ["elite-front-choke-counter", "long-range-kickboxing-only"], opponentTriggers: ["wide-stance", "lazy-underhook", "back-to-fence"] }
  }),
  makePrior({
    id: "belal-muhammad-active-control-pressure",
    aliases: ["belal-muhammad", "remember-the-name"],
    label: "Belal Muhammad active control-pressure profile",
    base: "cardio_wrestling_pressure_boxing",
    weightClass: "Welterweight",
    style: "control_pressure_decision_machine",
    profile: { ...wrestler, sigStrikesLandedPerMin: 4.55, sigStrikesAbsorbedPerMin: 3.6, strikingDifferential: 0.95, sigStrikeAccuracyPct: 44, knockdownsPer15: 0.08, takedownsPer15: 2.15, takedownAccuracyPct: 35, takedownDefensePct: 92, submissionAttemptsPer15: 0.18, controlTimePct: 38, pressureScore: 86, distanceManagementScore: 78, recentFormScore: 92, staminaScore: 96, paceScore: 92, chinScore: 86, fightIqScore: 88, opponentAdjustedStrength: 92 },
    tendencies: { archetype: "control_pressure_decision_machine", pressure: 88, counterStriking: 52, volume: 82, powerHunting: 22, legKickUsage: 38, bodyWork: 58, takedownInitiation: 82, chainWrestling: 84, clinchEngagement: 86, cageControl: 88, topControlPreference: 78, groundAndPound: 52, submissionHunting: 18, backTakeHunting: 24, getUpUrgency: 90, scrambleChaos: 72, earlyRoundUrgency: 72, roundThreeDurability: 96, championshipRoundTrust: 96, comebackRiskTaking: 64, safeLeadManagement: 94, paceCrashRisk: 10, preferredWinConditions: ["DECISION_CONTROL", "DECISION_VOLUME"], dangerZones: ["low-finish-upside", "one-shot-power-exchange"], opponentTriggers: ["opponent-slows", "back-to-fence", "poor-getup-chain"] }
  }),
  makePrior({
    id: "leon-edwards-active-southpaw-kickboxer",
    aliases: ["leon-edwards", "rocky"],
    label: "Leon Edwards active southpaw-kickboxer profile",
    base: "southpaw_kickboxing_clinch_control",
    weightClass: "Welterweight",
    style: "technical_southpaw_range_kickboxer",
    profile: { ...striker, sigStrikesLandedPerMin: 2.75, sigStrikesAbsorbedPerMin: 2.45, strikingDifferential: 0.3, sigStrikeAccuracyPct: 53, sigStrikeDefensePct: 54, knockdownsPer15: 0.22, takedownsPer15: 1.25, takedownAccuracyPct: 35, takedownDefensePct: 70, submissionAttemptsPer15: 0.28, controlTimePct: 24, legKicksLandedPer15: 5.8, bodyKicksLandedPer15: 3.8, headKicksLandedPer15: 0.9, kickingAccuracyPct: 52, kickingDefensePct: 58, clinchStrikingScore: 76, pressureScore: 58, distanceManagementScore: 88, recentFormScore: 84, staminaScore: 84, paceScore: 62, chinScore: 82, fightIqScore: 88, opponentAdjustedStrength: 92 },
    tendencies: { archetype: "technical_southpaw_range_kickboxer", pressure: 56, counterStriking: 82, volume: 52, powerHunting: 54, legKickUsage: 76, bodyWork: 78, headKickThreat: 72, takedownInitiation: 36, chainWrestling: 32, clinchEngagement: 62, cageControl: 60, topControlPreference: 32, groundAndPound: 28, submissionHunting: 22, backTakeHunting: 18, getUpUrgency: 78, scrambleChaos: 52, earlyRoundUrgency: 58, roundThreeDurability: 84, championshipRoundTrust: 88, comebackRiskTaking: 60, safeLeadManagement: 86, paceCrashRisk: 22, preferredWinConditions: ["DECISION_VOLUME", "KO_TKO"], dangerZones: ["high-volume-wrestling-pressure", "low-output-round-loss"], opponentTriggers: ["open-side-entry", "slow-reset", "clinch-break"] }
  }),
  makePrior({
    id: "justin-gaethje-active-pressure-brawler",
    aliases: ["justin-gaethje", "the-highlight"],
    label: "Justin Gaethje active pressure-brawler profile",
    base: "pressure_boxing_low_kicks_wrestling_base",
    weightClass: "Lightweight",
    style: "violent_low_kick_pressure_brawler",
    profile: { ...striker, sigStrikesLandedPerMin: 7.0, sigStrikesAbsorbedPerMin: 7.25, strikingDifferential: -0.25, sigStrikeAccuracyPct: 60, sigStrikeDefensePct: 53, knockdownsPer15: 0.92, takedownsPer15: 0.18, takedownAccuracyPct: 25, takedownDefensePct: 76, submissionAttemptsPer15: 0.02, submissionDefensePct: 62, controlTimePct: 6, legKicksLandedPer15: 12.5, bodyKicksLandedPer15: 3.0, kickingAccuracyPct: 58, kickingDefensePct: 55, clinchStrikingScore: 72, pressureScore: 92, distanceManagementScore: 66, recentFormScore: 78, heartScore: 96, staminaScore: 84, paceScore: 86, chinScore: 78, recoveryScore: 82, fightIqScore: 78, opponentAdjustedStrength: 93 },
    tendencies: { archetype: "violent_low_kick_pressure_brawler", pressure: 94, counterStriking: 64, volume: 92, powerHunting: 90, legKickUsage: 96, bodyWork: 62, headKickThreat: 30, takedownInitiation: 8, chainWrestling: 6, clinchEngagement: 40, cageControl: 34, topControlPreference: 4, groundAndPound: 28, submissionHunting: 2, backTakeHunting: 2, getUpUrgency: 86, scrambleChaos: 78, earlyRoundUrgency: 88, roundThreeDurability: 82, championshipRoundTrust: 78, comebackRiskTaking: 96, safeLeadManagement: 44, paceCrashRisk: 30, preferredWinConditions: ["KO_TKO", "attritional_low_kick_pressure"], dangerZones: ["submission-grappling", "clean-counter-while-overcommitted"], opponentTriggers: ["stationary-lead-leg", "brawl-exchange", "opponent-shells"] }
  })
];
