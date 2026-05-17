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
  learningApplied?: boolean;
  learningChangedKeys?: string[];
  learningSource?: string | null;
};

const PROFILE_KEYS = [
  "sigStrikesLandedPerMin", "sigStrikesAbsorbedPerMin", "strikingDifferential", "sigStrikeAccuracyPct", "sigStrikeDefensePct",
  "knockdownsPer15", "takedownsPer15", "takedownAccuracyPct", "takedownDefensePct", "submissionAttemptsPer15",
  "submissionDefensePct", "controlTimePct", "controlEscapePct", "getUpRate", "reversalsPer15", "sweepRate",
  "legKicksLandedPer15", "bodyKicksLandedPer15", "headKicksLandedPer15", "kickingAccuracyPct", "kickingDefensePct",
  "clinchStrikingScore", "pressureScore", "distanceManagementScore", "recentFormScore", "heartScore", "staminaScore", "paceScore",
  "chinScore", "recoveryScore", "fightIqScore", "gamePlanScore", "opponentAdjustedStrength", "amateurSignal", "promotionTierSignal"
] as const;

type ProfileKey = typeof PROFILE_KEYS[number];

type EliteCombatCredentialPrior = {
  aliases: string[];
  confidence: "A" | "B" | "C";
  sourceUrl: string;
  evidence: string[];
  priors: Partial<Record<ProfileKey, number>>;
  metadata?: Record<string, unknown>;
};

const ELITE_COMBAT_CREDENTIAL_PRIORS: Record<string, EliteCombatCredentialPrior> = {
  "gable-steveson": {
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
    metadata: {
      combatBase: "elite_freestyle_wrestling",
      projectedWeightClass: "Heavyweight",
      styleOverride: "elite_wrestling_top_control"
    }
  }
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeId(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
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

function eliteCombatCredentialWeight(feature: UfcModelFeatureSnapshot) {
  const ufcFights = typeof feature.ufcFights === "number" && Number.isFinite(feature.ufcFights) ? feature.ufcFights : 0;
  const proFights = typeof feature.proFights === "number" && Number.isFinite(feature.proFights) ? feature.proFights : 0;
  if (ufcFights <= 0 && proFights <= 3) return 0.72;
  if (ufcFights <= 0) return 0.6;
  if (ufcFights < 3) return 0.44;
  return 0.24;
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

function maxEliteCombatMoveFor(key: string) {
  if (key === "takedownsPer15") return 3.35;
  if (key === "controlTimePct") return 34;
  if (key === "takedownAccuracyPct" || key === "takedownDefensePct") return 31;
  if (key === "amateurSignal") return 52;
  if (key === "promotionTierSignal") return 28;
  if (key === "opponentAdjustedStrength") return 24;
  if (key.includes("Pct") || key.includes("Score") || key.includes("Strength") || key.includes("Signal")) return 18;
  if (key.includes("Per15")) return 1.25;
  if (key.includes("PerMin")) return 0.85;
  if (key === "strikingDifferential") return 0.65;
  return 12;
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

function blendEliteCombat(current: number | null, prior: number, key: string, weight: number) {
  if (current == null) return prior;
  const maxMove = maxEliteCombatMoveFor(key);
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

function findEliteCombatCredentialPrior(feature: UfcModelFeatureSnapshot, payloadRecord: Record<string, unknown>) {
  const candidates = [
    feature.fighterId,
    asRecord(feature.feature).fighterName,
    asRecord(feature.feature).name,
    payloadRecord.fullName,
    payloadRecord.name,
    payloadRecord.full_name,
    payloadRecord.slug,
    payloadRecord.fighterSlug
  ].map((value) => normalizeId(typeof value === "string" ? value : null)).filter(Boolean);
  return Object.values(ELITE_COMBAT_CREDENTIAL_PRIORS).find((prior) => prior.aliases.some((alias) => candidates.includes(normalizeId(alias)))) ?? null;
}

function applyEliteCombatCredentialPriors(nextFeature: UfcModelFeatureSnapshot, payloadRecord: Record<string, unknown>) {
  const prior = findEliteCombatCredentialPrior(nextFeature, payloadRecord);
  const changedKeys: string[] = [];
  if (!prior) return { source: null, confidence: null, sourceUrl: null, evidence: [] as string[], changedKeys };

  const weight = eliteCombatCredentialWeight(nextFeature) * confidenceMultiplier(prior.confidence);
  if (weight <= 0) return { source: "elite-combat-credentials", confidence: prior.confidence, sourceUrl: prior.sourceUrl, evidence: prior.evidence, changedKeys };

  for (const key of PROFILE_KEYS) {
    const priorValue = prior.priors[key];
    if (priorValue == null) continue;
    const current = currentFeatureValue(nextFeature, key);
    const blended = blendEliteCombat(current, priorValue, key, weight);
    const currentRounded = current == null ? null : Number(current.toFixed(4));
    if (currentRounded == null || Math.abs(blended - currentRounded) > 0.0001) {
      setFeatureValue(nextFeature, key, blended);
      changedKeys.push(key);
    }
  }

  if (changedKeys.length) {
    nextFeature.coldStartActive = false;
    if (!nextFeature.weightClass && typeof prior.metadata?.projectedWeightClass === "string") nextFeature.weightClass = prior.metadata.projectedWeightClass;
    nextFeature.feature = {
      ...asRecord(nextFeature.feature),
      combatBase: prior.metadata?.combatBase ?? asRecord(nextFeature.feature).combatBase ?? null,
      eliteCombatCredentialPrior: {
        source: "elite-combat-credentials",
        confidence: prior.confidence,
        sourceUrl: prior.sourceUrl,
        appliedWeight: Number(weight.toFixed(4)),
        changedKeys,
        evidence: prior.evidence,
        metadata: prior.metadata ?? {}
      }
    };
  }

  return { source: "elite-combat-credentials", confidence: prior.confidence, sourceUrl: prior.sourceUrl, evidence: prior.evidence, changedKeys };
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
  const eliteCombat = applyEliteCombatCredentialPriors(nextFeature, payloadRecord);
  const prior = applyWikimediaPriors(nextFeature, payloadRecord);
  const learning = applyOutcomeLearning(nextFeature, payloadRecord);
  const wikimedia = asRecord(prior.wikimedia);
  const priorEvidence = extractEvidence(wikimedia);
  const changedKeys = [...eliteCombat.changedKeys.map((key) => `elite:${key}`), ...prior.changedKeys, ...learning.changedKeys.map((key) => `learned:${key}`)];
  const source = [eliteCombat.source, prior.source, learning.source].filter(Boolean).join("+") || null;

  return {
    feature: nextFeature,
    applied: changedKeys.length > 0,
    source,
    confidence: eliteCombat.confidence ?? (typeof prior.confidence === "string" ? prior.confidence : null),
    wikidataQid: typeof wikimedia.wikidataQid === "string" ? wikimedia.wikidataQid : null,
    sourceUrl: eliteCombat.sourceUrl ?? (typeof wikimedia.sourceUrl === "string" ? wikimedia.sourceUrl : null),
    evidence: [...eliteCombat.evidence, ...priorEvidence].slice(0, 6),
    changedKeys,
    learningApplied: learning.changedKeys.length > 0,
    learningChangedKeys: learning.changedKeys,
    learningSource: learning.source
  };
}

export function enrichedPriorPathSummary(args: { fighterAId: string; fighterBId: string; a: UfcPriorBridgeResult; b: UfcPriorBridgeResult }) {
  const lines: string[] = [];
  const aEliteKeys = args.a.changedKeys.filter((key) => key.startsWith("elite:")).map((key) => key.replace(/^elite:/, "")).slice(0, 5);
  const bEliteKeys = args.b.changedKeys.filter((key) => key.startsWith("elite:")).map((key) => key.replace(/^elite:/, "")).slice(0, 5);
  const aPriorKeys = args.a.changedKeys.filter((key) => !key.startsWith("learned:") && !key.startsWith("elite:")).slice(0, 5);
  const bPriorKeys = args.b.changedKeys.filter((key) => !key.startsWith("learned:") && !key.startsWith("elite:")).slice(0, 5);
  if (aEliteKeys.length) lines.push(`Elite combat-credential priors applied to ${args.fighterAId}: ${aEliteKeys.join(", ")}${args.a.changedKeys.length > 5 ? "…" : ""}.`);
  if (bEliteKeys.length) lines.push(`Elite combat-credential priors applied to ${args.fighterBId}: ${bEliteKeys.join(", ")}${args.b.changedKeys.length > 5 ? "…" : ""}.`);
  if (aPriorKeys.length) lines.push(`Enriched background priors applied to ${args.fighterAId}: ${aPriorKeys.join(", ")}${args.a.changedKeys.length > 5 ? "…" : ""}.`);
  if (bPriorKeys.length) lines.push(`Enriched background priors applied to ${args.fighterBId}: ${bPriorKeys.join(", ")}${args.b.changedKeys.length > 5 ? "…" : ""}.`);
  if (args.a.learningApplied) lines.push(`Post-fight outcome learning applied to ${args.fighterAId}: ${args.a.learningChangedKeys?.slice(0, 5).join(", ")}${(args.a.learningChangedKeys?.length ?? 0) > 5 ? "…" : ""}.`);
  if (args.b.learningApplied) lines.push(`Post-fight outcome learning applied to ${args.fighterBId}: ${args.b.learningChangedKeys?.slice(0, 5).join(", ")}${(args.b.learningChangedKeys?.length ?? 0) > 5 ? "…" : ""}.`);
  const evidence = [...args.a.evidence.slice(0, 1), ...args.b.evidence.slice(0, 1)].filter(Boolean);
  if (evidence.length) lines.push(`Source evidence: ${evidence.join(" | ")}`);
  return lines;
}
