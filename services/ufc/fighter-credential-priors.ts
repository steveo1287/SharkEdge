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

export type UfcCredentialPriorApplication = {
  id: string;
  confidence: "A" | "B" | "C";
  sourceUrl: string;
  evidence: string[];
  metadata: Record<string, unknown>;
  appliedWeight: number;
  changedKeys: string[];
  values: Partial<Record<UfcProfilePriorKey, number>>;
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

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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

function confidenceMultiplier(confidence: unknown) {
  if (confidence === "A") return 1;
  if (confidence === "B") return 0.75;
  if (confidence === "C") return 0.5;
  return 0;
}

function credentialWeight(feature: UfcModelFeatureSnapshot, prior: UfcCredentialPrior) {
  const ufcFights = typeof feature.ufcFights === "number" && Number.isFinite(feature.ufcFights) ? feature.ufcFights : 0;
  const proFights = typeof feature.proFights === "number" && Number.isFinite(feature.proFights) ? feature.proFights : 0;
  const confidence = confidenceMultiplier(prior.confidence);
  const namedFighter = Boolean(prior.aliases?.length);
  const base = namedFighter ? 0.72 : 0.56;
  const establishedPenalty = ufcFights >= 7 ? 0.32 : ufcFights >= 3 ? 0.18 : 0;
  const proPenalty = ufcFights <= 0 && proFights >= 10 ? 0.1 : 0;
  return Math.max(0, Number(((base - establishedPenalty - proPenalty) * confidence).toFixed(4)));
}

function maxCredentialMoveFor(key: string, namedFighter: boolean) {
  const multiplier = namedFighter ? 1 : 0.72;
  if (key === "takedownsPer15") return 3.35 * multiplier;
  if (key === "controlTimePct") return 34 * multiplier;
  if (key === "takedownAccuracyPct" || key === "takedownDefensePct") return 31 * multiplier;
  if (key === "submissionAttemptsPer15") return 1.4 * multiplier;
  if (key === "submissionDefensePct") return 22 * multiplier;
  if (key === "amateurSignal") return 52 * multiplier;
  if (key === "promotionTierSignal") return 28 * multiplier;
  if (key === "opponentAdjustedStrength") return 24 * multiplier;
  if (key.includes("Pct") || key.includes("Score") || key.includes("Strength") || key.includes("Signal")) return 18 * multiplier;
  if (key.includes("Per15")) return 1.25 * multiplier;
  if (key.includes("PerMin")) return 0.85 * multiplier;
  if (key === "strikingDifferential") return 0.65 * multiplier;
  return 12 * multiplier;
}

function currentFeatureValue(feature: UfcModelFeatureSnapshot, key: UfcProfilePriorKey) {
  const direct = numeric((feature as unknown as Record<string, unknown>)[key]);
  if (direct != null) return direct;
  const json = asRecord(feature.feature);
  const fromJson = numeric(json[key]);
  if (fromJson != null) return fromJson;
  const rawFeature = asRecord(json.rawFeature);
  return numeric(rawFeature[key]);
}

function blendCredential(current: number | null, prior: number, key: string, weight: number, namedFighter: boolean) {
  if (current == null) return prior;
  const maxMove = maxCredentialMoveFor(key, namedFighter);
  return Number((current + clamp((prior - current) * weight, -maxMove, maxMove)).toFixed(4));
}

export const UFC_CREDENTIAL_PRIORS: UfcCredentialPrior[] = [
  {
    id: "conor-mcgregor-prime-counterstriker",
    aliases: ["conor-mcgregor", "conor-anthony-mcgregor", "the-notorious", "notorious-conor-mcgregor"],
    confidence: "A",
    sourceUrl: "manual:fighter-era-priors/conor-mcgregor-prime-145-155",
    evidence: [
      "Prime McGregor is modeled as a southpaw precision counter-striker with elite left-hand power, range traps, and early-round finishing danger.",
      "Known weaknesses are sustained wrestling pressure, lower offensive grappling, and pace/cardio decay when forced beyond early rounds.",
      "Use era split: prime 145/155 is not the same as current comeback/welterweight profile."
    ],
    priors: {
      sigStrikesLandedPerMin: 5.1,
      sigStrikesAbsorbedPerMin: 3.9,
      strikingDifferential: 1.2,
      sigStrikeAccuracyPct: 50,
      sigStrikeDefensePct: 56,
      knockdownsPer15: 0.95,
      takedownsPer15: 0.35,
      takedownAccuracyPct: 38,
      takedownDefensePct: 68,
      submissionAttemptsPer15: 0.12,
      submissionDefensePct: 54,
      controlTimePct: 12,
      controlEscapePct: 62,
      getUpRate: 69,
      reversalsPer15: 0.16,
      sweepRate: 0.12,
      legKicksLandedPer15: 5.8,
      bodyKicksLandedPer15: 4.1,
      headKicksLandedPer15: 0.8,
      kickingAccuracyPct: 47,
      kickingDefensePct: 57,
      clinchStrikingScore: 57,
      pressureScore: 72,
      distanceManagementScore: 88,
      recentFormScore: 54,
      heartScore: 61,
      staminaScore: 56,
      paceScore: 60,
      chinScore: 61,
      recoveryScore: 58,
      fightIqScore: 84,
      gamePlanScore: 78,
      opponentAdjustedStrength: 82,
      amateurSignal: 74,
      promotionTierSignal: 96
    },
    metadata: {
      combatBase: "southpaw_precision_boxing",
      projectedWeightClass: "Lightweight",
      styleOverride: "southpaw_precision_counterstriker",
      eraProfiles: [
        {
          id: "prime_145_155",
          label: "Prime featherweight/lightweight McGregor",
          status: "WHAT_IF_READY",
          weightClasses: ["Featherweight", "Lightweight"],
          strengths: ["left hand counter", "range control", "early KO power", "southpaw traps", "body-head shot selection"],
          weaknesses: ["sustained wrestling pressure", "cardio beyond round two", "limited offensive grappling"]
        },
        {
          id: "current_170",
          label: "Current comeback/welterweight McGregor",
          status: "RESEARCH_ONLY",
          weightClasses: ["Welterweight"],
          adjustments: ["lower speed trust", "higher layoff risk", "higher injury risk", "reduced cardio confidence"]
        }
      ],
      tendencyPrior: {
        archetype: "southpaw_precision_counterstriker",
        pressure: 72,
        counterStriking: 95,
        volume: 58,
        powerHunting: 88,
        legKickUsage: 55,
        bodyWork: 68,
        headKickThreat: 60,
        takedownInitiation: 28,
        chainWrestling: 20,
        cageControl: 35,
        topControlPreference: 25,
        groundAndPound: 24,
        submissionHunting: 22,
        backTakeHunting: 18,
        getUpUrgency: 72,
        scrambleChaos: 55,
        earlyRoundUrgency: 86,
        roundThreeDurability: 55,
        championshipRoundTrust: 48,
        comebackRiskTaking: 70,
        safeLeadManagement: 62,
        paceCrashRisk: 68,
        preferredWinConditions: ["round_1_or_2_ko", "southpaw_left_counter", "range_trap_boxing_exchange"],
        dangerZones: ["extended_wrestling_clinch", "bottom_position", "high_pace_round_3_plus"],
        opponentTriggers: ["orthodox_pressure_entry", "wide_overhand_entry", "slow_reset_after_kick"]
      }
    }
  },
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

export function calculateUfcCredentialPriorApplications(input: MatchInput): UfcCredentialPriorApplication[] {
  return findUfcCredentialPriors(input).map((prior) => {
    const weight = credentialWeight(input.feature, prior);
    const namedFighter = Boolean(prior.aliases?.length);
    const values: Partial<Record<UfcProfilePriorKey, number>> = {};
    const changedKeys: string[] = [];
    for (const key of UFC_PROFILE_PRIOR_KEYS) {
      const priorValue = prior.priors[key];
      if (priorValue == null) continue;
      const current = currentFeatureValue(input.feature, key);
      const blended = blendCredential(current, priorValue, key, weight, namedFighter);
      const currentRounded = current == null ? null : Number(current.toFixed(4));
      if (currentRounded == null || Math.abs(blended - currentRounded) > 0.0001) {
        values[key] = blended;
        changedKeys.push(key);
      }
    }
    return {
      id: prior.id,
      confidence: prior.confidence,
      sourceUrl: prior.sourceUrl,
      evidence: prior.evidence,
      metadata: prior.metadata ?? {},
      appliedWeight: weight,
      changedKeys,
      values
    };
  }).filter((application) => application.changedKeys.length > 0);
}

export function summarizeUfcCredentialPriorCatalog() {
  return UFC_CREDENTIAL_PRIORS.map((prior) => ({ id: prior.id, confidence: prior.confidence, sourceUrl: prior.sourceUrl, evidence: prior.evidence, keys: Object.keys(prior.priors), metadata: prior.metadata ?? {} }));
}
