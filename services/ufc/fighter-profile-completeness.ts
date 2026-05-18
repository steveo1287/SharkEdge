import type { UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";

export type UfcFighterProfileCompleteness = {
  score: number;
  grade: "A" | "B" | "C" | "D";
  usableForSim: boolean;
  isGenericAvatar: boolean;
  missingCore: string[];
  genericDefaultFields: string[];
  evidenceFlags: string[];
  credentialPriorApplied: boolean;
  historyDerived: boolean;
  source: string | null;
  dataQuality: string | null;
};

const CORE_FIELDS: Array<keyof UfcModelFeatureSnapshot> = [
  "proFights",
  "ufcFights",
  "roundsFought",
  "sigStrikesLandedPerMin",
  "sigStrikesAbsorbedPerMin",
  "takedownsPer15",
  "takedownDefensePct",
  "controlTimePct",
  "opponentAdjustedStrength"
];

const USEFUL_FIELDS: Array<keyof UfcModelFeatureSnapshot> = [
  "sigStrikeAccuracyPct",
  "sigStrikeDefensePct",
  "takedownAccuracyPct",
  "submissionAttemptsPer15",
  "submissionDefensePct",
  "controlEscapePct",
  "getUpRate",
  "recentFormScore",
  "staminaScore",
  "paceScore",
  "chinScore",
  "fightIqScore",
  "gamePlanScore"
];

const DEFAULT_RANGES: Record<string, number[]> = {
  sigStrikesLandedPerMin: [2.4, 2.5, 3, 3.2, 3.3],
  sigStrikesAbsorbedPerMin: [2.5, 3, 3.2, 3.3],
  strikingDifferential: [0],
  sigStrikeAccuracyPct: [43, 44, 45, 50],
  sigStrikeDefensePct: [50, 54, 55],
  takedownsPer15: [0.8, 1, 1.2],
  takedownAccuracyPct: [35, 45, 50],
  takedownDefensePct: [45, 46, 50, 55, 62],
  submissionAttemptsPer15: [0.2, 0.3, 0.4, 0.45],
  submissionDefensePct: [50, 55, 62],
  controlTimePct: [18, 39, 40, 45, 46, 50],
  controlEscapePct: [50],
  getUpRate: [50],
  recentFormScore: [50],
  heartScore: [50],
  staminaScore: [49, 50],
  paceScore: [50],
  chinScore: [50],
  recoveryScore: [50],
  fightIqScore: [50],
  gamePlanScore: [50],
  opponentAdjustedStrength: [45, 50, 52],
  amateurSignal: [50],
  promotionTierSignal: [50]
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/%$/, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function getUfcFeatureNumber(feature: UfcModelFeatureSnapshot, key: keyof UfcModelFeatureSnapshot | string) {
  const direct = numeric((feature as unknown as Record<string, unknown>)[key]);
  if (direct != null) return direct;
  const root = asRecord(feature.feature);
  const rawFeature = asRecord(root.rawFeature);
  const rawPayload = asRecord(root.rawPayload);
  const stats = asRecord(root.stats);
  return numeric(root[key]) ?? numeric(rawFeature[key]) ?? numeric(rawPayload[key]) ?? numeric(stats[key]);
}

function hasField(feature: UfcModelFeatureSnapshot, key: keyof UfcModelFeatureSnapshot) {
  return getUfcFeatureNumber(feature, key) != null || typeof (feature as unknown as Record<string, unknown>)[key] === "string";
}

function isDefaultField(feature: UfcModelFeatureSnapshot, key: string) {
  const value = getUfcFeatureNumber(feature, key);
  if (value == null) return false;
  const defaults = DEFAULT_RANGES[key] ?? [];
  return defaults.some((defaultValue) => Math.abs(value - defaultValue) < 0.001);
}

function grade(score: number): UfcFighterProfileCompleteness["grade"] {
  if (score >= 85) return "A";
  if (score >= 72) return "B";
  if (score >= 55) return "C";
  return "D";
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

export function auditUfcFighterProfileCompleteness(feature: UfcModelFeatureSnapshot): UfcFighterProfileCompleteness {
  const root = asRecord(feature.feature);
  const diagnostics = asRecord(root.profileDiagnostics);
  const completeProfile = asRecord(root.completeProfile);
  const completeAudit = asRecord(completeProfile.audit);
  const credential = asRecord(root.eliteCombatCredentialPrior);
  const repair = asRecord(root.credentialProfileRepair);
  const source = typeof root.source === "string" ? root.source : null;
  const dataQuality = typeof diagnostics.dataQuality === "string" ? diagnostics.dataQuality : typeof root.dataQuality === "string" ? root.dataQuality : typeof completeProfile.dataQuality === "string" ? completeProfile.dataQuality : null;
  const missingCore = CORE_FIELDS.filter((key) => !hasField(feature, key)).map(String);
  const usefulPresent = USEFUL_FIELDS.filter((key) => hasField(feature, key)).length;
  const genericDefaultFields = Object.keys(DEFAULT_RANGES).filter((key) => isDefaultField(feature, key));
  const officialFields = asArray(completeAudit.officialFields).length;
  const derivedFields = asArray(completeAudit.derivedFields).length;
  const estimatedFields = asArray(completeAudit.estimatedFields).length + asArray(root.estimatedFields).length;
  const seconds = numeric(diagnostics.seconds) ?? 0;
  const fightCount = numeric(diagnostics.fightCount) ?? getUfcFeatureNumber(feature, "ufcFights") ?? 0;
  const roundsFought = getUfcFeatureNumber(feature, "roundsFought") ?? 0;
  const credentialPriorApplied = asArray(credential.appliedPriors).length > 0 || asArray(repair.appliedPriors).length > 0 || typeof credential.source === "string" || typeof repair.source === "string";
  const historyDerived = seconds >= 900 || roundsFought >= 3 || fightCount >= 1 || source === "elite-fighter-profile-builder" || source === "elite-fighter-profile-builder-fight-snapshot";
  const evidenceFlags: string[] = [];
  if (credentialPriorApplied) evidenceFlags.push("credential_prior_applied");
  if (historyDerived) evidenceFlags.push("history_derived");
  if (officialFields > 0) evidenceFlags.push("official_fields");
  if (derivedFields > 0) evidenceFlags.push("derived_fields");
  if (source) evidenceFlags.push(`source:${source}`);
  const corePresent = CORE_FIELDS.length - missingCore.length;
  const coreScore = (corePresent / CORE_FIELDS.length) * 58;
  const usefulScore = (usefulPresent / USEFUL_FIELDS.length) * 20;
  const evidenceScore = Math.min(22, officialFields * 2.2 + derivedFields * 1.4 + (historyDerived ? 8 : 0) + (credentialPriorApplied ? 8 : 0));
  const genericPenalty = Math.min(42, genericDefaultFields.length * 4.5);
  const missingPenalty = Math.min(36, missingCore.length * 6);
  const qualityPenalty = dataQuality === "D" ? 16 : dataQuality === "C" ? 7 : 0;
  const estimatedPenalty = Math.min(18, estimatedFields * 2.5);
  const score = Math.round(clamp(coreScore + usefulScore + evidenceScore - genericPenalty - missingPenalty - qualityPenalty - estimatedPenalty));
  const isGenericAvatar = genericDefaultFields.length >= 6 || (!historyDerived && !credentialPriorApplied && score < 58) || missingCore.length >= 5;
  return {
    score,
    grade: grade(score),
    usableForSim: score >= 55 && !isGenericAvatar,
    isGenericAvatar,
    missingCore,
    genericDefaultFields,
    evidenceFlags,
    credentialPriorApplied,
    historyDerived,
    source,
    dataQuality
  };
}

export function reliabilityFromCompleteness(args: { baseReliability: number; completeness: UfcFighterProfileCompleteness }) {
  const evidenceBoost = args.completeness.credentialPriorApplied ? 0.13 : args.completeness.historyDerived ? 0.08 : 0;
  const completenessFactor = args.completeness.score / 100;
  const genericPenalty = args.completeness.isGenericAvatar ? 0.22 : 0;
  const missingPenalty = Math.min(0.24, args.completeness.missingCore.length * 0.035);
  const reliability = args.baseReliability * 0.62 + completenessFactor * 0.38 + evidenceBoost - genericPenalty - missingPenalty;
  return Number(clamp(reliability, args.completeness.isGenericAvatar ? 0.03 : 0.08, 1).toFixed(3));
}
