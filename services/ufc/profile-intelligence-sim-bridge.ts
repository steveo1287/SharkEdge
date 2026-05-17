import type { UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";

export type UfcProfileIntelligenceBridgeResult = {
  feature: UfcModelFeatureSnapshot;
  applied: boolean;
  readinessScore: number | null;
  readinessGrade: string | null;
  changedKeys: string[];
  deltas: Record<string, number>;
  evidence: string[];
  warnings: string[];
  blockers: string[];
};

type NumericKey =
  | "sigStrikesLandedPerMin"
  | "sigStrikesAbsorbedPerMin"
  | "strikingDifferential"
  | "sigStrikeDefensePct"
  | "takedownsPer15"
  | "takedownDefensePct"
  | "submissionAttemptsPer15"
  | "controlTimePct"
  | "opponentAdjustedStrength"
  | "recentFormScore"
  | "staminaScore"
  | "paceScore"
  | "chinScore"
  | "fightIqScore"
  | "gamePlanScore"
  | "pressureScore";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/%/g, "").replace(/[^0-9.+-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function readinessWeight(score: number | null) {
  if (score == null) return 0.25;
  if (score >= 85) return 1;
  if (score >= 72) return 0.75;
  if (score >= 55) return 0.5;
  return 0.25;
}

function currentValue(feature: UfcModelFeatureSnapshot, key: NumericKey) {
  const direct = numeric((feature as unknown as Record<string, unknown>)[key]);
  if (direct != null) return direct;
  const featureJson = asRecord(feature.feature);
  const nested = numeric(featureJson[key]);
  if (nested != null) return nested;
  const raw = asRecord(featureJson.rawFeature);
  return numeric(raw[key]);
}

function setValue(feature: UfcModelFeatureSnapshot, key: NumericKey, value: number) {
  const featureRecord = feature as unknown as Record<string, unknown>;
  if (key in featureRecord) featureRecord[key] = value;
  feature.feature = { ...asRecord(feature.feature), [key]: value };
}

function maxMove(key: NumericKey) {
  if (key.includes("Pct") || key.includes("Score") || key.includes("Strength")) return 6;
  if (key.includes("Per15")) return 0.45;
  if (key.includes("PerMin")) return 0.5;
  if (key === "strikingDifferential") return 0.45;
  return 4;
}

function applyDelta(args: { feature: UfcModelFeatureSnapshot; key: NumericKey; delta: number; weight: number; changedKeys: string[]; deltas: Record<string, number> }) {
  const current = currentValue(args.feature, args.key);
  if (current == null) return;
  const move = clamp(args.delta * args.weight, -maxMove(args.key), maxMove(args.key));
  if (Math.abs(move) < 0.0001) return;
  const next = round(current + move);
  setValue(args.feature, args.key, next);
  args.changedKeys.push(args.key);
  args.deltas[args.key] = round((args.deltas[args.key] ?? 0) + move);
}

function gradePenalty(grade: string | null) {
  if (grade === "A") return 0;
  if (grade === "B") return 0.25;
  if (grade === "C") return 0.55;
  return 0.85;
}

export function applyProfileIntelligenceToUfcFeature(feature: UfcModelFeatureSnapshot): UfcProfileIntelligenceBridgeResult {
  const nextFeature: UfcModelFeatureSnapshot = { ...feature, feature: { ...asRecord(feature.feature) } };
  const root = asRecord(nextFeature.feature);
  const intelligence = asRecord(root.profileIntelligence);
  const readiness = asRecord(intelligence.readiness ?? root.profileIntelligenceReadiness);
  const opponentStrength = asRecord(intelligence.opponentStrength ?? root.opponentStrength);
  const recentForm = asRecord(intelligence.recentForm ?? root.recentForm);
  const stanceStyle = asRecord(intelligence.stanceStyle ?? root.stanceStyle);
  const contextFlags = asRecord(intelligence.contextFlags ?? root.contextFlags);
  const fallbackReferences = asRecord(intelligence.fallbackReferences ?? root.fallbackReferences);
  const readinessScore = numeric(readiness.score);
  const readinessGrade = typeof readiness.grade === "string" ? readiness.grade : null;
  const weight = readinessWeight(readinessScore);
  const changedKeys: string[] = [];
  const deltas: Record<string, number> = {};
  const warnings = asArray(readiness.warnings);
  const blockers = asArray(readiness.blockers);
  const evidence: string[] = [];

  if (!Object.keys(intelligence).length && !Object.keys(readiness).length) {
    return { feature: nextFeature, applied: false, readinessScore: null, readinessGrade: null, changedKeys, deltas, evidence: ["No profile intelligence block found on feature snapshot."], warnings, blockers };
  }

  const strengthScore = numeric(opponentStrength.strengthScore);
  if (strengthScore != null) {
    const strengthDelta = (strengthScore - 50) * 0.16;
    applyDelta({ feature: nextFeature, key: "opponentAdjustedStrength", delta: strengthDelta, weight, changedKeys, deltas });
    applyDelta({ feature: nextFeature, key: "fightIqScore", delta: strengthDelta * 0.35, weight, changedKeys, deltas });
    evidence.push(`Opponent strength score ${strengthScore}.`);
  }

  const formScore = numeric(recentForm.formScore);
  if (formScore != null) {
    const formDelta = (formScore - 50) * 0.12;
    applyDelta({ feature: nextFeature, key: "recentFormScore", delta: formDelta, weight, changedKeys, deltas });
    applyDelta({ feature: nextFeature, key: "staminaScore", delta: formDelta * 0.4, weight, changedKeys, deltas });
    applyDelta({ feature: nextFeature, key: "gamePlanScore", delta: formDelta * 0.35, weight, changedKeys, deltas });
    evidence.push(`Recent form score ${formScore}.`);
  }

  const recentSigDiff = numeric(recentForm.recentSigDiffPerMin);
  if (recentSigDiff != null) {
    applyDelta({ feature: nextFeature, key: "strikingDifferential", delta: recentSigDiff * 0.45, weight, changedKeys, deltas });
    applyDelta({ feature: nextFeature, key: "sigStrikesLandedPerMin", delta: recentSigDiff > 0 ? recentSigDiff * 0.18 : 0, weight, changedKeys, deltas });
    applyDelta({ feature: nextFeature, key: "sigStrikesAbsorbedPerMin", delta: recentSigDiff < 0 ? Math.abs(recentSigDiff) * 0.18 : 0, weight, changedKeys, deltas });
  }

  const recentTakedowns = numeric(recentForm.recentTakedownsPer15);
  if (recentTakedowns != null) {
    const currentTd = currentValue(nextFeature, "takedownsPer15") ?? recentTakedowns;
    applyDelta({ feature: nextFeature, key: "takedownsPer15", delta: (recentTakedowns - currentTd) * 0.45, weight, changedKeys, deltas });
  }

  const recentControl = numeric(recentForm.recentControlPct);
  if (recentControl != null) {
    const currentControl = currentValue(nextFeature, "controlTimePct") ?? recentControl;
    applyDelta({ feature: nextFeature, key: "controlTimePct", delta: (recentControl - currentControl) * 0.32, weight, changedKeys, deltas });
  }

  const archetype = typeof stanceStyle.archetype === "string" ? stanceStyle.archetype : "balanced";
  if (archetype === "wrestling-control") {
    applyDelta({ feature: nextFeature, key: "takedownsPer15", delta: 0.18, weight, changedKeys, deltas });
    applyDelta({ feature: nextFeature, key: "controlTimePct", delta: 2.5, weight, changedKeys, deltas });
    applyDelta({ feature: nextFeature, key: "pressureScore", delta: 2.2, weight, changedKeys, deltas });
  } else if (archetype === "volume-striker") {
    applyDelta({ feature: nextFeature, key: "sigStrikesLandedPerMin", delta: 0.22, weight, changedKeys, deltas });
    applyDelta({ feature: nextFeature, key: "paceScore", delta: 2.2, weight, changedKeys, deltas });
  } else if (archetype === "submission-grappler") {
    applyDelta({ feature: nextFeature, key: "submissionAttemptsPer15", delta: 0.18, weight, changedKeys, deltas });
    applyDelta({ feature: nextFeature, key: "controlTimePct", delta: 1.6, weight, changedKeys, deltas });
  } else if (archetype === "power-finisher") {
    applyDelta({ feature: nextFeature, key: "pressureScore", delta: 2.5, weight, changedKeys, deltas });
    applyDelta({ feature: nextFeature, key: "chinScore", delta: -0.6, weight, changedKeys, deltas });
  }

  const layoffFlag = typeof contextFlags.layoffFlag === "string" ? contextFlags.layoffFlag : null;
  if (layoffFlag === "LONG_LAYOFF") {
    applyDelta({ feature: nextFeature, key: "staminaScore", delta: -5.5, weight, changedKeys, deltas });
    applyDelta({ feature: nextFeature, key: "paceScore", delta: -3.5, weight, changedKeys, deltas });
    evidence.push("Long layoff penalty applied.");
  } else if (layoffFlag === "MODERATE_LAYOFF") {
    applyDelta({ feature: nextFeature, key: "staminaScore", delta: -2.2, weight, changedKeys, deltas });
  }

  const ageBand = typeof contextFlags.ageBand === "string" ? contextFlags.ageBand : null;
  if (ageBand === "AGING") {
    applyDelta({ feature: nextFeature, key: "staminaScore", delta: -2.4, weight, changedKeys, deltas });
    applyDelta({ feature: nextFeature, key: "paceScore", delta: -1.4, weight, changedKeys, deltas });
    applyDelta({ feature: nextFeature, key: "chinScore", delta: -1.8, weight, changedKeys, deltas });
  } else if (ageBand === "YOUNG") {
    applyDelta({ feature: nextFeature, key: "fightIqScore", delta: -1.2, weight, changedKeys, deltas });
    applyDelta({ feature: nextFeature, key: "paceScore", delta: 1.2, weight, changedKeys, deltas });
  }

  const shortNoticeKnown = contextFlags.shortNoticeKnown;
  if (shortNoticeKnown === true) {
    applyDelta({ feature: nextFeature, key: "staminaScore", delta: -4.5, weight, changedKeys, deltas });
    applyDelta({ feature: nextFeature, key: "gamePlanScore", delta: -4, weight, changedKeys, deltas });
    evidence.push("Short-notice flag applied.");
  }

  const fallbackNeeded = fallbackReferences.needed === true;
  const penalty = gradePenalty(readinessGrade);
  if (penalty > 0) {
    applyDelta({ feature: nextFeature, key: "fightIqScore", delta: -2.5 * penalty, weight: 1, changedKeys, deltas });
    applyDelta({ feature: nextFeature, key: "gamePlanScore", delta: -2.2 * penalty, weight: 1, changedKeys, deltas });
  }
  if (fallbackNeeded) evidence.push("External fallback references still needed for this profile.");

  nextFeature.feature = {
    ...asRecord(nextFeature.feature),
    profileIntelligenceBridge: {
      applied: changedKeys.length > 0,
      readinessScore,
      readinessGrade,
      appliedWeight: round(weight),
      changedKeys,
      deltas,
      evidence,
      warnings,
      blockers
    }
  };

  return { feature: nextFeature, applied: changedKeys.length > 0, readinessScore, readinessGrade, changedKeys, deltas, evidence, warnings, blockers };
}

export function profileIntelligencePathSummary(args: { fighterAId: string; fighterBId: string; a: UfcProfileIntelligenceBridgeResult; b: UfcProfileIntelligenceBridgeResult }) {
  const lines: string[] = [];
  if (args.a.applied) lines.push(`Profile intelligence applied to ${args.fighterAId}: ${args.a.changedKeys.slice(0, 6).join(", ")}${args.a.changedKeys.length > 6 ? "…" : ""}.`);
  if (args.b.applied) lines.push(`Profile intelligence applied to ${args.fighterBId}: ${args.b.changedKeys.slice(0, 6).join(", ")}${args.b.changedKeys.length > 6 ? "…" : ""}.`);
  if (args.a.readinessGrade) lines.push(`Fighter A profile intelligence readiness ${args.a.readinessGrade} (${args.a.readinessScore ?? "n/a"}/100).`);
  if (args.b.readinessGrade) lines.push(`Fighter B profile intelligence readiness ${args.b.readinessGrade} (${args.b.readinessScore ?? "n/a"}/100).`);
  for (const warning of [...args.a.warnings.map((item) => `A ${item}`), ...args.b.warnings.map((item) => `B ${item}`)].slice(0, 8)) lines.push(`Profile intelligence warning: ${warning}.`);
  for (const blocker of [...args.a.blockers.map((item) => `A ${item}`), ...args.b.blockers.map((item) => `B ${item}`)].slice(0, 8)) lines.push(`Profile intelligence blocker: ${blocker}.`);
  return lines;
}
