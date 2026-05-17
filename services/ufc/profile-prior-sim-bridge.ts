import type { UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";
import { calculateUfcCredentialPriorApplications, UFC_PROFILE_PRIOR_KEYS, type UfcProfilePriorKey } from "@/services/ufc/fighter-credential-priors";

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
  learningApplied?: boolean;
  learningChangedKeys?: string[];
  learningSource?: string | null;
};

const PROFILE_KEYS = UFC_PROFILE_PRIOR_KEYS;
type ProfileKey = UfcProfilePriorKey;

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

function strongestConfidence(values: Array<string | null | undefined>) {
  const ranks: Record<string, number> = { A: 3, B: 2, C: 1 };
  return values.filter(Boolean).sort((left, right) => (ranks[String(right)] ?? 0) - (ranks[String(left)] ?? 0))[0] ?? null;
}

function historyWeight(feature: UfcModelFeatureSnapshot) {
  const ufcFights = typeof feature.ufcFights === "number" && Number.isFinite(feature.ufcFights) ? feature.ufcFights : 0;
  const proFights = typeof feature.proFights === "number" && Number.isFinite(feature.proFights) ? feature.proFights : 0;
  if (ufcFights <= 0) return proFights >= 10 ? 0.36 : 0.42;
  if (ufcFights < 3) return 0.28;
  if (ufcFights < 7) return 0.14;
  return 0.05;
}

function outcomeLearningWeight(feature: UfcModelFeatureSnapshot) {
  const ufcFights = typeof feature.ufcFights === "number" && Number.isFinite(feature.ufcFights) ? feature.ufcFights : 0;
  if (ufcFights <= 0) return 0.55;
  if (ufcFights < 3) return 0.45;
  if (ufcFights < 7) return 0.32;
  if (ufcFights < 12) return 0.22;
  return 0.14;
}

function maxMoveFor(key: string) {
  if (key.includes("Pct") || key.includes("Score") || key.includes("Strength") || key.includes("Signal")) return 7;
  if (key.includes("Per15")) return 0.48;
  if (key.includes("PerMin")) return 0.55;
  if (key === "strikingDifferential") return 0.38;
  return 5;
}

function maxOutcomeMoveFor(key: string) {
  if (key.includes("Pct") || key.includes("Score") || key.includes("Strength") || key.includes("Signal")) return 2.5;
  if (key.includes("Per15")) return 0.28;
  if (key.includes("PerMin")) return 0.32;
  if (key === "strikingDifferential") return 0.22;
  return 1.5;
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

function applyDelta(current: number | null, delta: number, key: string, weight: number) {
  const base = current ?? 0;
  const maxMove = maxOutcomeMoveFor(key);
  return Number((base + clamp(delta * weight, -maxMove, maxMove)).toFixed(4));
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

function applyCredentialPriors(nextFeature: UfcModelFeatureSnapshot, payloadRecord: Record<string, unknown>) {
  const applications = calculateUfcCredentialPriorApplications({ feature: nextFeature, payloadRecord });
  const changedKeys: string[] = [];
  const evidence: string[] = [];
  const sourceUrls: string[] = [];
  const confidences: string[] = [];

  for (const application of applications) {
    for (const key of PROFILE_KEYS) {
      const value = application.values[key];
      if (value == null) continue;
      setFeatureValue(nextFeature, key, value);
      changedKeys.push(`credential:${application.id}:${key}`);
    }
    nextFeature.coldStartActive = false;
    if (!nextFeature.weightClass && typeof application.metadata.projectedWeightClass === "string") nextFeature.weightClass = application.metadata.projectedWeightClass;
    nextFeature.feature = { ...asRecord(nextFeature.feature), combatBase: application.metadata.combatBase ?? asRecord(nextFeature.feature).combatBase ?? null };
    sourceUrls.push(application.sourceUrl);
    confidences.push(application.confidence);
    evidence.push(...application.evidence);
  }

  if (applications.length) {
    nextFeature.feature = {
      ...asRecord(nextFeature.feature),
      eliteCombatCredentialPrior: {
        source: "fighter-credential-priors",
        confidence: strongestConfidence(confidences),
        sourceUrl: sourceUrls[0] ?? null,
        appliedPriors: applications.map((application) => ({ id: application.id, confidence: application.confidence, sourceUrl: application.sourceUrl, appliedWeight: application.appliedWeight, changedKeys: application.changedKeys, evidence: application.evidence, metadata: application.metadata })),
        evidence: [...new Set(evidence)].slice(0, 8)
      }
    };
  }

  return { source: applications.length ? "fighter-credential-priors" : null, confidence: strongestConfidence(confidences), sourceUrl: sourceUrls[0] ?? null, evidence: [...new Set(evidence)].slice(0, 8), changedKeys };
}

function applyWikimediaPriors(nextFeature: UfcModelFeatureSnapshot, payloadRecord: Record<string, unknown>) {
  const backgroundPriors = asRecord(payloadRecord.backgroundPriors);
  const wikimedia = asRecord(backgroundPriors.wikimedia);
  const priors = asRecord(wikimedia.priors);
  const confidence = wikimedia.confidence;
  const multiplier = confidenceMultiplier(confidence);
  const source = typeof wikimedia.source === "string" ? wikimedia.source : typeof payloadRecord.lastWikimediaEnrichmentAt === "string" ? "wikimedia" : null;
  const weight = historyWeight(nextFeature) * multiplier;
  const changedKeys: string[] = [];

  if (weight <= 0 || !Object.keys(priors).length) {
    return { source, confidence, wikimedia, changedKeys };
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

  return { source, confidence, wikimedia, changedKeys };
}

function applyOutcomeLearning(nextFeature: UfcModelFeatureSnapshot, payloadRecord: Record<string, unknown>) {
  const outcomeLearning = asRecord(payloadRecord.outcomeLearning);
  const skillDeltas = asRecord(outcomeLearning.skillDeltas);
  const latestFightDeltas = asRecord(outcomeLearning.latestFightDeltas);
  const source = typeof outcomeLearning.source === "string" ? outcomeLearning.source : Object.keys(skillDeltas).length ? "post-fight-outcome-learning" : null;
  const weight = outcomeLearningWeight(nextFeature);
  const changedKeys: string[] = [];

  if (!Object.keys(skillDeltas).length || weight <= 0) return { source, changedKeys, latestFightDeltas };

  for (const key of PROFILE_KEYS) {
    const learnedDelta = asNumber(skillDeltas[key]);
    if (learnedDelta == null) continue;
    const current = currentFeatureValue(nextFeature, key);
    const adjusted = applyDelta(current, learnedDelta, key, weight);
    const currentRounded = current == null ? null : Number(current.toFixed(4));
    if (currentRounded == null || Math.abs(adjusted - currentRounded) > 0.0001) {
      setFeatureValue(nextFeature, key, adjusted);
      changedKeys.push(key);
    }
  }

  if (changedKeys.length) {
    nextFeature.feature = {
      ...asRecord(nextFeature.feature),
      outcomeLearningBridge: {
        source,
        appliedWeight: Number(weight.toFixed(4)),
        lastFightId: typeof outcomeLearning.lastFightId === "string" ? outcomeLearning.lastFightId : null,
        updatedAt: typeof outcomeLearning.updatedAt === "string" ? outcomeLearning.updatedAt : null,
        changedKeys,
        skillDeltas,
        latestFightDeltas
      }
    };
  }

  return { source, changedKeys, latestFightDeltas };
}

export function applyPayloadPriorsToUfcFeature(feature: UfcModelFeatureSnapshot, payload: unknown): UfcPriorBridgeResult {
  const payloadRecord = asRecord(payload);
  const nextFeature: UfcModelFeatureSnapshot = { ...feature, feature: { ...asRecord(feature.feature) } };
  const credential = applyCredentialPriors(nextFeature, payloadRecord);
  const prior = applyWikimediaPriors(nextFeature, payloadRecord);
  const learning = applyOutcomeLearning(nextFeature, payloadRecord);
  const wikimedia = asRecord(prior.wikimedia);
  const priorEvidence = extractEvidence(wikimedia);
  const changedKeys = [...credential.changedKeys, ...prior.changedKeys, ...learning.changedKeys.map((key) => `learned:${key}`)];
  const source = [credential.source, prior.source, learning.source].filter(Boolean).join("+") || null;

  return {
    feature: nextFeature,
    applied: changedKeys.length > 0,
    source,
    confidence: credential.confidence ?? (typeof prior.confidence === "string" ? prior.confidence : null),
    wikidataQid: typeof wikimedia.wikidataQid === "string" ? wikimedia.wikidataQid : null,
    sourceUrl: credential.sourceUrl ?? (typeof wikimedia.sourceUrl === "string" ? wikimedia.sourceUrl : null),
    evidence: [...credential.evidence, ...priorEvidence].slice(0, 8),
    changedKeys,
    learningApplied: learning.changedKeys.length > 0,
    learningChangedKeys: learning.changedKeys,
    learningSource: learning.source
  };
}

export function enrichedPriorPathSummary(args: { fighterAId: string; fighterBId: string; a: UfcPriorBridgeResult; b: UfcPriorBridgeResult }) {
  const lines: string[] = [];
  const aCredentialKeys = args.a.changedKeys.filter((key) => key.startsWith("credential:")).map((key) => key.split(":").slice(1).join(":")).slice(0, 5);
  const bCredentialKeys = args.b.changedKeys.filter((key) => key.startsWith("credential:")).map((key) => key.split(":").slice(1).join(":")).slice(0, 5);
  const aPriorKeys = args.a.changedKeys.filter((key) => !key.startsWith("learned:") && !key.startsWith("credential:")).slice(0, 5);
  const bPriorKeys = args.b.changedKeys.filter((key) => !key.startsWith("learned:") && !key.startsWith("credential:")).slice(0, 5);
  if (aCredentialKeys.length) lines.push(`Fighter credential priors applied to ${args.fighterAId}: ${aCredentialKeys.join(", ")}${args.a.changedKeys.length > 5 ? "…" : ""}.`);
  if (bCredentialKeys.length) lines.push(`Fighter credential priors applied to ${args.fighterBId}: ${bCredentialKeys.join(", ")}${args.b.changedKeys.length > 5 ? "…" : ""}.`);
  if (aPriorKeys.length) lines.push(`Enriched background priors applied to ${args.fighterAId}: ${aPriorKeys.join(", ")}${args.a.changedKeys.length > 5 ? "…" : ""}.`);
  if (bPriorKeys.length) lines.push(`Enriched background priors applied to ${args.fighterBId}: ${bPriorKeys.join(", ")}${args.b.changedKeys.length > 5 ? "…" : ""}.`);
  if (args.a.learningApplied) lines.push(`Post-fight outcome learning applied to ${args.fighterAId}: ${args.a.learningChangedKeys?.slice(0, 5).join(", ")}${(args.a.learningChangedKeys?.length ?? 0) > 5 ? "…" : ""}.`);
  if (args.b.learningApplied) lines.push(`Post-fight outcome learning applied to ${args.fighterBId}: ${args.b.learningChangedKeys?.slice(0, 5).join(", ")}${(args.b.learningChangedKeys?.length ?? 0) > 5 ? "…" : ""}.`);
  const evidence = [...args.a.evidence.slice(0, 1), ...args.b.evidence.slice(0, 1)].filter(Boolean);
  if (evidence.length) lines.push(`Source evidence: ${evidence.join(" | ")}`);
  return lines;
}
