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
    evidence: [`Active-UFC-gated named prior for ${input.label}.`, "Apply only with current UFC activity or roster/contract signal."],
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

const grappler = { sigStrikeDefensePct: 58, submissionDefensePct: 80, controlEscapePct: 76, getUpRate: 78, heartScore: 86, recoveryScore: 80, gamePlanScore: 86, amateurSignal: 88, promotionTierSignal: 94 };
const striker = { takedownDefensePct: 76, submissionDefensePct: 70, controlEscapePct: 72, getUpRate: 76, heartScore: 86, recoveryScore: 80, gamePlanScore: 86, amateurSignal: 82, promotionTierSignal: 94 };

export const ACTIVE_UFC_NAMED_FIGHTER_PRIOR_BATCH_1E: NamedUfcFighterEraPrior[] = [
  makePrior({
    id: "umar-nurmagomedov-active-sambo-kicker",
    aliases: ["umar-nurmagomedov"],
    label: "Umar Nurmagomedov active sambo-kicker profile",
    base: "sambo_wrestling_kicking",
    weightClass: "Bantamweight",
    style: "range_kicking_sambo_controller",
    profile: { ...grappler, sigStrikesLandedPerMin: 4.45, sigStrikesAbsorbedPerMin: 1.75, strikingDifferential: 2.7, sigStrikeAccuracyPct: 57, knockdownsPer15: 0.36, takedownsPer15: 3.45, takedownAccuracyPct: 54, takedownDefensePct: 86, submissionAttemptsPer15: 0.75, controlTimePct: 44, legKicksLandedPer15: 8.2, bodyKicksLandedPer15: 4.8, headKicksLandedPer15: 1.1, kickingAccuracyPct: 54, kickingDefensePct: 64, pressureScore: 78, distanceManagementScore: 88, recentFormScore: 90, staminaScore: 88, paceScore: 82, chinScore: 80, fightIqScore: 88, opponentAdjustedStrength: 86 },
    tendencies: { archetype: "range_kicking_sambo_controller", pressure: 78, counterStriking: 74, volume: 74, powerHunting: 52, legKickUsage: 86, bodyWork: 72, headKickThreat: 72, takedownInitiation: 86, chainWrestling: 86, clinchEngagement: 76, cageControl: 82, topControlPreference: 86, groundAndPound: 58, submissionHunting: 58, backTakeHunting: 64, getUpUrgency: 78, scrambleChaos: 74, earlyRoundUrgency: 72, roundThreeDurability: 86, championshipRoundTrust: 82, safeLeadManagement: 86, paceCrashRisk: 18, preferredWinConditions: ["DECISION_CONTROL", "DECISION_VOLUME"], dangerZones: ["pocket-power-exchange", "pace-pressure-boxing"], opponentTriggers: ["overextended-entry", "flat-footed-stance", "back-to-fence"] }
  }),
  makePrior({
    id: "petr-yan-active-pressure-boxer",
    aliases: ["petr-yan", "no-mercy"],
    label: "Petr Yan active pressure-boxer profile",
    base: "technical_pressure_boxing",
    weightClass: "Bantamweight",
    style: "technical_pressure_boxer",
    profile: { ...striker, sigStrikesLandedPerMin: 5.25, sigStrikesAbsorbedPerMin: 3.7, strikingDifferential: 1.55, sigStrikeAccuracyPct: 53, sigStrikeDefensePct: 59, knockdownsPer15: 0.42, takedownsPer15: 1.35, takedownAccuracyPct: 53, takedownDefensePct: 88, submissionAttemptsPer15: 0.12, controlTimePct: 22, legKicksLandedPer15: 5.6, bodyKicksLandedPer15: 3.8, clinchStrikingScore: 78, pressureScore: 88, distanceManagementScore: 84, recentFormScore: 80, staminaScore: 92, paceScore: 88, chinScore: 86, fightIqScore: 90, opponentAdjustedStrength: 92 },
    tendencies: { archetype: "technical_pressure_boxer", pressure: 90, counterStriking: 80, volume: 88, powerHunting: 65, legKickUsage: 62, bodyWork: 80, takedownInitiation: 42, chainWrestling: 38, clinchEngagement: 70, cageControl: 72, topControlPreference: 38, groundAndPound: 46, submissionHunting: 12, getUpUrgency: 86, scrambleChaos: 68, earlyRoundUrgency: 66, roundThreeDurability: 92, championshipRoundTrust: 90, comebackRiskTaking: 76, safeLeadManagement: 86, paceCrashRisk: 12, preferredWinConditions: ["DECISION_VOLUME", "KO_TKO"], dangerZones: ["early-round-data-gathering", "wrestling-back-control"], opponentTriggers: ["opponent-slows", "shell-on-fence", "predictable-entry"] }
  }),
  makePrior({
    id: "brandon-moreno-active-scramble-boxer",
    aliases: ["brandon-moreno", "the-assassin-baby"],
    label: "Brandon Moreno active scramble-boxer profile",
    base: "scramble_boxing_grappling",
    weightClass: "Flyweight",
    style: "durable_scramble_boxer_grappler",
    profile: { ...grappler, sigStrikesLandedPerMin: 3.85, sigStrikesAbsorbedPerMin: 3.35, strikingDifferential: 0.5, sigStrikeAccuracyPct: 42, sigStrikeDefensePct: 57, knockdownsPer15: 0.22, takedownsPer15: 1.75, takedownAccuracyPct: 44, takedownDefensePct: 68, submissionAttemptsPer15: 0.85, controlTimePct: 28, pressureScore: 78, distanceManagementScore: 74, recentFormScore: 82, heartScore: 94, staminaScore: 92, paceScore: 86, chinScore: 90, recoveryScore: 88, fightIqScore: 84, opponentAdjustedStrength: 92 },
    tendencies: { archetype: "durable_scramble_boxer_grappler", pressure: 80, counterStriking: 66, volume: 80, powerHunting: 52, legKickUsage: 42, bodyWork: 64, takedownInitiation: 62, chainWrestling: 58, clinchEngagement: 62, cageControl: 58, topControlPreference: 58, groundAndPound: 48, submissionHunting: 70, backTakeHunting: 64, getUpUrgency: 88, scrambleChaos: 88, earlyRoundUrgency: 74, roundThreeDurability: 94, championshipRoundTrust: 92, comebackRiskTaking: 86, safeLeadManagement: 72, paceCrashRisk: 12, preferredWinConditions: ["DECISION_VOLUME", "SUBMISSION"], dangerZones: ["leg-kick-attrition", "high-accuracy-countering"], opponentTriggers: ["scramble-opening", "opponent-tires", "back-exposure"] }
  }),
  makePrior({
    id: "brandon-royval-active-chaos-grappler",
    aliases: ["brandon-royval", "raw-dawg"],
    label: "Brandon Royval active chaos-grappler profile",
    base: "chaos_scramble_submission",
    weightClass: "Flyweight",
    style: "high_variance_scramble_submission_attacker",
    profile: { ...grappler, sigStrikesLandedPerMin: 4.25, sigStrikesAbsorbedPerMin: 3.85, strikingDifferential: 0.4, sigStrikeAccuracyPct: 43, sigStrikeDefensePct: 55, knockdownsPer15: 0.24, takedownsPer15: 0.75, takedownAccuracyPct: 36, takedownDefensePct: 54, submissionAttemptsPer15: 2.0, controlTimePct: 18, pressureScore: 84, distanceManagementScore: 68, recentFormScore: 84, heartScore: 90, staminaScore: 88, paceScore: 90, chinScore: 82, fightIqScore: 82, opponentAdjustedStrength: 88 },
    tendencies: { archetype: "high_variance_scramble_submission_attacker", pressure: 86, counterStriking: 58, volume: 88, powerHunting: 58, legKickUsage: 34, bodyWork: 54, takedownInitiation: 42, chainWrestling: 46, clinchEngagement: 64, cageControl: 44, topControlPreference: 42, groundAndPound: 46, submissionHunting: 94, backTakeHunting: 88, getUpUrgency: 86, scrambleChaos: 98, earlyRoundUrgency: 88, roundThreeDurability: 86, championshipRoundTrust: 80, comebackRiskTaking: 96, safeLeadManagement: 42, paceCrashRisk: 24, preferredWinConditions: ["SUBMISSION", "chaos_volume"], dangerZones: ["controlled-top-position", "low-variance-decision-wrestler"], opponentTriggers: ["wild-scramble", "neck-exposure", "hurt-opponent"] }
  })
];
