import type { UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";

export type UfcFighterPayloadPrior = {
  fighter_id: string;
  payload_json: unknown;
};

export type UfcPriorBridgeResult = {
  feature: UfcModelFeatureSnapshot;
  applied: boolean;
  source: string | null;
  confidence: string | null;
  wikidataQid: string | null;
  sourceUrl: string | null;
  evidence: string[];
  changedKeys: string[];
};

const PROFILE_KEYS = [
  "sigStrikesLandedPerMin", "sigStrikesAbsorbedPerMin", "strikingDifferential", "sigStrikeAccuracyPct", "sigStrikeDefensePct",
  "knockdownsPer15", "takedownsPer15", "takedownAccuracyPct", "takedownDefensePct", "submissionAttemptsPer15",
  "submissionDefensePct", "controlTimePct", "controlEscapePct", "getUpRate", "reversalsPer15", "sweepRate",
  "legKicksLandedPer15", "bodyKicksLandedPer15", "headKicksLandedPer15", "kickingAccuracyPct", "kickingDefensePct",
  "clinchStrikingScore", "pressureScore", "distanceManagementScore", "heartScore", "staminaScore", "paceScore",
  "chinScore", "recoveryScore", "fightIqScore", "gamePlanScore", "opponentAdjustedStrength", "amateurSignal", "promotionTierSignal"
] as const;

type ProfileKey = typeof PROFILE_KEYS[number];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function confidenceMultiplier(confidence: unknown) {
  if (confidence === "A") return 1;
  if (confidence === "B") return 0.75;
  if (confidence === "C") return 0.5;
  return 0;
}

function historyWeight(feature: UfcModelFeatureSnapshot) {
  const ufcFights = typeof feature.ufcFights === "number" && Number.isFinite(feature.ufcFights) ? feature.ufcFights : 0;
  const proFights = typeof feature.proFights === "number" && Number.isFinite(feature.proFights) ? feature.proFights : 0;
  if (ufcFights <= 0) return proFights >= 10 ? 0.36 : 0.42;
  if (ufcFights < 3) return 0.28;
  if (ufcFights < 7) return 0.14;
  return 0.05;
}

function maxMoveFor(key: string) {
  if (key.includes("Pct") || key.includes("Score") || key.includes("Strength") || key.includes("Signal")) return 7;
  if (key.includes("Per15")) return 0.48;
  if (key.includes("PerMin")) return 0.55;
  if (key === "strikingDifferential") return 0.38;
  return 5;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function currentFeatureValue(feature: UfcModelFeatureSnapshot, key: ProfileKey) {
  const direct = asNumber((feature as unknown as Record<string, unknown>)[key]);
  if (direct != null) return direct;
  const json = asRecord(feature.feature);
  const fromJson = asNumber(json[key]);
  if (fromJson != null) return fromJson;
  const rawFeature = asRecord(json.rawFeature);
  return asNumber(rawFeature[key]);
}

function blend(current: number | null, prior: number, key: string, weight: number) {
  if (current == null) return prior;
  const maxMove = maxMoveFor(key);
  return Number((current + clamp((prior - current) * weight, -maxMove, maxMove)).toFixed(4));
}

function setFeatureValue(feature: UfcModelFeatureSnapshot, key: ProfileKey, value: number) {
  const next = feature as unknown as Record<string, unknown>;
  if (key in next) next[key] = value;
  feature.feature = { ...asRecord(feature.feature), [key]: value };
}

function extractEvidence(value: unknown) {
  const evidence = asRecord(value).evidence;
  return Array.isArray(evidence) ? evidence.map(String).filter(Boolean).slice(0, 4) : [];
}

export function applyPayloadPriorsToUfcFeature(feature: UfcModelFeatureSnapshot, payload: unknown): UfcPriorBridgeResult {
  const payloadRecord = asRecord(payload);
  const backgroundPriors = asRecord(payloadRecord.backgroundPriors);
  const wikimedia = asRecord(backgroundPriors.wikimedia);
  const priors = asRecord(wikimedia.priors);
  const confidence = wikimedia.confidence;
  const multiplier = confidenceMultiplier(confidence);
  const source = typeof wikimedia.source === "string" ? wikimedia.source : typeof payloadRecord.lastWikimediaEnrichmentAt === "string" ? "wikimedia" : null;
  const weight = historyWeight(feature) * multiplier;
  const changedKeys: string[] = [];
  const nextFeature: UfcModelFeatureSnapshot = { ...feature, feature: { ...asRecord(feature.feature) } };

  if (weight <= 0 || !Object.keys(priors).length) {
    return { feature: nextFeature, applied: false, source, confidence: typeof confidence === "string" ? confidence : null, wikidataQid: typeof wikimedia.wikidataQid === "string" ? wikimedia.wikidataQid : null, sourceUrl: typeof wikimedia.sourceUrl === "string" ? wikimedia.sourceUrl : null, evidence: extractEvidence(wikimedia), changedKeys };
  }

  for (const key of PROFILE_KEYS) {
    const prior = asNumber(priors[key]);
    if (prior == null) continue;
    const current = currentFeatureValue(nextFeature, key);
    const blended = blend(current, prior, key, weight);
    const currentRounded = current == null ? null : Number(current.toFixed(4));
    if (currentRounded == null || Math.abs(blended - currentRounded) > 0.0001) {
      setFeatureValue(nextFeature, key, blended);
      changedKeys.push(key);
    }
  }

  if (changedKeys.length) {
    nextFeature.feature = {
      ...asRecord(nextFeature.feature),
      enrichedPriorBridge: {
        source,
        confidence,
        wikidataQid: typeof wikimedia.wikidataQid === "string" ? wikimedia.wikidataQid : null,
        sourceUrl: typeof wikimedia.sourceUrl === "string" ? wikimedia.sourceUrl : null,
        appliedWeight: Number(weight.toFixed(4)),
        changedKeys,
        evidence: extractEvidence(wikimedia)
      }
    };
  }

  return {
    feature: nextFeature,
    applied: changedKeys.length > 0,
    source,
    confidence: typeof confidence === "string" ? confidence : null,
    wikidataQid: typeof wikimedia.wikidataQid === "string" ? wikimedia.wikidataQid : null,
    sourceUrl: typeof wikimedia.sourceUrl === "string" ? wikimedia.sourceUrl : null,
    evidence: extractEvidence(wikimedia),
    changedKeys
  };
}

export function enrichedPriorPathSummary(args: { fighterAId: string; fighterBId: string; a: UfcPriorBridgeResult; b: UfcPriorBridgeResult }) {
  const lines: string[] = [];
  if (args.a.applied) lines.push(`Enriched background priors applied to ${args.fighterAId}: ${args.a.changedKeys.slice(0, 5).join(", ")}${args.a.changedKeys.length > 5 ? "…" : ""}.`);
  if (args.b.applied) lines.push(`Enriched background priors applied to ${args.fighterBId}: ${args.b.changedKeys.slice(0, 5).join(", ")}${args.b.changedKeys.length > 5 ? "…" : ""}.`);
  const evidence = [...args.a.evidence.slice(0, 1), ...args.b.evidence.slice(0, 1)].filter(Boolean);
  if (evidence.length) lines.push(`Source evidence: ${evidence.join(" | ")}`);
  return lines;
}
