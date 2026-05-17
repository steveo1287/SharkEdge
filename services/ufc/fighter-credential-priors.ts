import type { UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";

export const UFC_PROFILE_PRIOR_KEYS = [
  "sigStrikesLandedPerMin", "sigStrikesAbsorbedPerMin", "strikingDifferential", "sigStrikeAccuracyPct", "sigStrikeDefensePct",
  "knockdownsPer15", "takedownsPer15", "takedownAccuracyPct", "takedownDefensePct", "submissionAttemptsPer15",
  "submissionDefensePct", "controlTimePct", "controlEscapePct", "getUpRate", "reversalsPer15", "sweepRate",
  "legKicksLandedPer15", "bodyKicksLandedPer15", "headKicksLandedPer15", "kickingAccuracyPct", "kickingDefensePct",
  "clinchStrikingScore", "pressureScore", "distanceManagementScore", "recentFormScore", "heartScore", "staminaScore", "paceScore",
  "chinScore", "recoveryScore", "fightIqScore", "gamePlanScore", "opponentAdjustedStrength", "amateurSignal", "promotionTierSignal"
] as const;

export type UfcProfilePriorKey = typeof UFC_PROFILE_PRIOR_KEYS[number];

export type UfcCredentialPrior = {
  id: string;
  aliases?: string[];
  matchTags?: string[];
  confidence: "A" | "B" | "C";
  sourceUrl: string;
  evidence: string[];
  priors: Partial<Record<UfcProfilePriorKey, number>>;
  metadata?: Record<string, unknown>;
};

type MatchInput = {
  feature: UfcModelFeatureSnapshot;
  payloadRecord: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function flattenText(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenText);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(flattenText);
  return [];
}

export function normalizeUfcCredentialToken(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function searchableText(input: MatchInput) {
  const featureRecord = asRecord(input.feature.feature);
  const fields = [
    input.feature.fighterId,
    featureRecord.fighterName,
    featureRecord.name,
    featureRecord.fullName,
    featureRecord.slug,
    input.payloadRecord.fullName,
    input.payloadRecord.name,
    input.payloadRecord.full_name,
    input.payloadRecord.slug,
    input.payloadRecord.fighterSlug,
    input.payloadRecord.nickname,
    input.payloadRecord.combatBase,
    input.payloadRecord.background,
    input.payloadRecord.backgroundPriors,
    input.payloadRecord.profileIntelligence,
    input.payloadRecord.manualScouting,
    input.payloadRecord.scoutingTags,
    input.payloadRecord.notes,
    featureRecord.combatBase,
    featureRecord.profileIntelligence,
    featureRecord.manualScouting,
    featureRecord.scoutingTags,
    featureRecord.notes,
    featureRecord.eliteCombatCredentialPrior,
    featureRecord.enrichedPriorBridge
  ];
  return flattenText(fields).join(" ").toLowerCase();
}

function candidateTokens(input: MatchInput) {
  const featureRecord = asRecord(input.feature.feature);
  return [
    input.feature.fighterId,
    featureRecord.fighterName,
    featureRecord.name,
    featureRecord.fullName,
    featureRecord.slug,
    input.payloadRecord.fullName,
    input.payloadRecord.name,
    input.payloadRecord.full_name,
    input.payloadRecord.slug,
    input.payloadRecord.fighterSlug
  ].map((value) => normalizeUfcCredentialToken(typeof value === "string" ? value : null)).filter(Boolean);
}

function containsAny(text: string, tags: string[] | undefined) {
  if (!tags?.length) return false;
  return tags.some((tag) => text.includes(tag.toLowerCase()));
}

export const UFC_CREDENTIAL_PRIORS: UfcCredentialPrior[] = [
  {
    id: "gable-steveson",
    aliases: ["gable-steveson", "gable-stevenson", "gable-dan-steveson"],
    confidence: "A",
    sourceUrl: "manual:elite-combat-credential-priors/gable-steveson",
    evidence: [
      "Olympic freestyle wrestling gold medalist; do not flatten to generic takedown/control baselines.",
      "Two-time NCAA Division I heavyweight wrestling champion; heavyweight elite-wrestling archetype."
    ],
    priors: {
      sigStrikesLandedPerMin: 2.35,
      sigStrikesAbsorbedPerMin: 2.8,
      strikingDifferential: -0.15,
      sigStrikeAccuracyPct: 43,
      sigStrikeDefensePct: 50,
      knockdownsPer15: 0.18,
      takedownsPer15: 4.75,
      takedownAccuracyPct: 74,
      takedownDefensePct: 86,
      submissionAttemptsPer15: 0.28,
      submissionDefensePct: 76,
      controlTimePct: 62,
      controlEscapePct: 72,
      getUpRate: 76,
      reversalsPer15: 0.55,
      sweepRate: 0.35,
      clinchStrikingScore: 58,
      pressureScore: 64,
      distanceManagementScore: 48,
      recentFormScore: 62,
      heartScore: 69,
      staminaScore: 68,
      paceScore: 58,
      chinScore: 57,
      recoveryScore: 60,
      fightIqScore: 64,
      gamePlanScore: 74,
      opponentAdjustedStrength: 72,
      amateurSignal: 99,
      promotionTierSignal: 72
    },
    metadata: { combatBase: "elite_freestyle_wrestling", projectedWeightClass: "Heavyweight", styleOverride: "elite_wrestling_top_control" }
  },
  {
    id: "elite-freestyle-wrestler",
    matchTags: ["olympic wrestling", "olympic wrestler", "freestyle wrestling", "freestyle wrestler", "world wrestling championship", "world medalist", "ncaa wrestling champion", "division i wrestling champion", "all-american wrestler"],
    confidence: "B",
    sourceUrl: "manual:credential-archetypes/elite-freestyle-wrestler",
    evidence: ["Credential archetype inferred from fighter background text: elite freestyle/folkstyle wrestling."],
    priors: {
      takedownsPer15: 3.65,
      takedownAccuracyPct: 61,
      takedownDefensePct: 79,
      controlTimePct: 49,
      controlEscapePct: 66,
      getUpRate: 69,
      reversalsPer15: 0.42,
      clinchStrikingScore: 56,
      pressureScore: 61,
      staminaScore: 64,
      gamePlanScore: 69,
      opponentAdjustedStrength: 65,
      amateurSignal: 90,
      promotionTierSignal: 64
    },
    metadata: { combatBase: "elite_wrestling", styleOverride: "wrestling_pressure_control" }
  },
  {
    id: "bjj-black-belt-grappler",
    matchTags: ["bjj black belt", "brazilian jiu jitsu black belt", "jiu-jitsu black belt", "ibjjf", "adcc", "submission grappling", "world jiu jitsu champion"],
    confidence: "B",
    sourceUrl: "manual:credential-archetypes/bjj-black-belt-grappler",
    evidence: ["Credential archetype inferred from fighter background text: high-level BJJ/submission grappling."],
    priors: {
      submissionAttemptsPer15: 1.45,
      submissionDefensePct: 78,
      controlTimePct: 38,
      controlEscapePct: 63,
      getUpRate: 62,
      reversalsPer15: 0.45,
      sweepRate: 0.58,
      takedownDefensePct: 68,
      fightIqScore: 66,
      gamePlanScore: 64,
      amateurSignal: 78,
      promotionTierSignal: 62
    },
    metadata: { combatBase: "submission_grappling", styleOverride: "grappling_submission_threat" }
  },
  {
    id: "elite-kickboxer-muay-thai",
    matchTags: ["glory kickboxing", "k-1", "muay thai champion", "kickboxing champion", "world kickboxing champion", "wbc muay thai", "lion fight", "karate combat"],
    confidence: "B",
    sourceUrl: "manual:credential-archetypes/elite-kickboxer-muay-thai",
    evidence: ["Credential archetype inferred from fighter background text: elite kickboxing/Muay Thai striking."],
    priors: {
      sigStrikesLandedPerMin: 4.65,
      sigStrikesAbsorbedPerMin: 3.65,
      strikingDifferential: 0.75,
      sigStrikeAccuracyPct: 49,
      sigStrikeDefensePct: 58,
      knockdownsPer15: 0.48,
      legKicksLandedPer15: 9.5,
      bodyKicksLandedPer15: 4.8,
      headKicksLandedPer15: 1.05,
      kickingAccuracyPct: 52,
      kickingDefensePct: 61,
      clinchStrikingScore: 68,
      pressureScore: 64,
      distanceManagementScore: 69,
      paceScore: 65,
      fightIqScore: 65,
      amateurSignal: 84,
      promotionTierSignal: 65
    },
    metadata: { combatBase: "elite_striking", styleOverride: "technical_pressure_striker" }
  },
  {
    id: "elite-boxer",
    matchTags: ["golden gloves", "professional boxer", "pro boxing", "boxing champion", "national boxing champion", "olympic boxing"],
    confidence: "B",
    sourceUrl: "manual:credential-archetypes/elite-boxer",
    evidence: ["Credential archetype inferred from fighter background text: high-level boxing."],
    priors: {
      sigStrikesLandedPerMin: 4.25,
      sigStrikesAbsorbedPerMin: 3.25,
      strikingDifferential: 0.65,
      sigStrikeAccuracyPct: 48,
      sigStrikeDefensePct: 61,
      knockdownsPer15: 0.42,
      clinchStrikingScore: 58,
      pressureScore: 59,
      distanceManagementScore: 71,
      paceScore: 61,
      chinScore: 61,
      recoveryScore: 60,
      fightIqScore: 66,
      amateurSignal: 78,
      promotionTierSignal: 61
    },
    metadata: { combatBase: "boxing", styleOverride: "boxing_distance_counter" }
  }
];

export function findUfcCredentialPriors(input: MatchInput) {
  const tokens = candidateTokens(input);
  const text = searchableText(input);
  return UFC_CREDENTIAL_PRIORS.filter((prior) => {
    const aliasMatch = prior.aliases?.some((alias) => tokens.includes(normalizeUfcCredentialToken(alias))) ?? false;
    return aliasMatch || containsAny(text, prior.matchTags);
  });
}

export function summarizeUfcCredentialPriorCatalog() {
  return UFC_CREDENTIAL_PRIORS.map((prior) => ({ id: prior.id, confidence: prior.confidence, sourceUrl: prior.sourceUrl, evidence: prior.evidence, keys: Object.keys(prior.priors) }));
}
