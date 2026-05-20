import type { UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";

export type UfcIndividualProfileSource = "official" | "historyDerived" | "derived" | "featureColumn" | "estimated" | "missing";

export type UfcIndividualProfileStat = {
  key: string;
  label: string;
  value: number | string | null;
  source: UfcIndividualProfileSource;
  confidence: number;
  appliedToSim: boolean;
  note?: string | null;
};

export type UfcIndividualFighterProfile = {
  fighterId: string;
  fighterName: string | null;
  generatedAt: string;
  profileVersion: "ufc-individual-fighter-profile-v1";
  readinessGrade: "A" | "B" | "C" | "D";
  readinessScore: number;
  sourceCounts: Record<UfcIndividualProfileSource, number>;
  trustedStatCount: number;
  estimatedStatCount: number;
  noGenericEdge: boolean;
  warnings: string[];
  blockers: string[];
  stats: UfcIndividualProfileStat[];
  tendencies: string[];
  matchupHooks: string[];
  identity: {
    stance: string | null;
    weightClass: string | null;
    age: number | null;
    heightInches: number | null;
    reachInches: number | null;
  };
};

export type UfcIndividualProfileBridgeResult = {
  feature: UfcModelFeatureSnapshot;
  profile: UfcIndividualFighterProfile;
  changedKeys: string[];
};

type NumericFeatureKey =
  | "age"
  | "heightInches"
  | "reachInches"
  | "proFights"
  | "ufcFights"
  | "roundsFought"
  | "sigStrikesLandedPerMin"
  | "sigStrikesAbsorbedPerMin"
  | "strikingDifferential"
  | "sigStrikeAccuracyPct"
  | "sigStrikeDefensePct"
  | "knockdownsPer15"
  | "takedownsPer15"
  | "takedownAccuracyPct"
  | "takedownDefensePct"
  | "submissionAttemptsPer15"
  | "submissionDefensePct"
  | "controlTimePct"
  | "controlEscapePct"
  | "recentFormScore"
  | "finishRate"
  | "staminaScore"
  | "paceScore"
  | "chinScore"
  | "fightIqScore"
  | "gamePlanScore"
  | "opponentAdjustedStrength";

type StatSpec = {
  key: NumericFeatureKey;
  label: string;
  aliases: string[];
  critical?: boolean;
};

const PROFILE_VERSION = "ufc-individual-fighter-profile-v1" as const;

const STAT_SPECS: StatSpec[] = [
  { key: "proFights", label: "Pro fights", aliases: ["proFights", "pro_fights"], critical: true },
  { key: "ufcFights", label: "UFC / major fights", aliases: ["ufcFights", "ufc_fights"], critical: true },
  { key: "roundsFought", label: "Rounds fought", aliases: ["roundsFought", "rounds_fought"], critical: true },
  { key: "sigStrikesLandedPerMin", label: "SLpM", aliases: ["slpm", "sigStrikesLandedPerMin", "sig_strikes_landed_per_min"], critical: true },
  { key: "sigStrikesAbsorbedPerMin", label: "SApM", aliases: ["sapm", "sigStrikesAbsorbedPerMin", "sig_strikes_absorbed_per_min"], critical: true },
  { key: "strikingDifferential", label: "Striking differential", aliases: ["strikingDifferential", "striking_differential"] },
  { key: "sigStrikeAccuracyPct", label: "Strike accuracy", aliases: ["sigStrikeAccuracyPct", "strikeAccuracyPct", "sig_strike_accuracy_pct"] },
  { key: "sigStrikeDefensePct", label: "Strike defense", aliases: ["sigStrikeDefensePct", "strikeDefensePct", "sig_strike_defense_pct"], critical: true },
  { key: "knockdownsPer15", label: "Knockdowns / 15", aliases: ["knockdownsPer15", "knockdowns_per_15", "kdAvg"] },
  { key: "takedownsPer15", label: "Takedowns / 15", aliases: ["takedownsPer15", "takedowns_per_15", "tdAvg"], critical: true },
  { key: "takedownAccuracyPct", label: "Takedown accuracy", aliases: ["takedownAccuracyPct", "takedown_accuracy_pct", "tdAccuracy"] },
  { key: "takedownDefensePct", label: "Takedown defense", aliases: ["takedownDefensePct", "takedown_defense_pct", "tdDefense"], critical: true },
  { key: "submissionAttemptsPer15", label: "Submission attempts / 15", aliases: ["submissionAttemptsPer15", "submission_attempts_per_15", "subAvg"] },
  { key: "submissionDefensePct", label: "Submission defense", aliases: ["submissionDefensePct", "submission_defense_pct", "subDefense"], critical: true },
  { key: "controlTimePct", label: "Control time", aliases: ["controlTimePct", "control_time_pct"], critical: true },
  { key: "controlEscapePct", label: "Control escape", aliases: ["controlEscapePct", "control_escape_pct", "escapePct"] },
  { key: "recentFormScore", label: "Recent form", aliases: ["recentFormScore", "recent_form_score", "formScore"] },
  { key: "finishRate", label: "Finish rate", aliases: ["finishRate", "finish_rate"] },
  { key: "staminaScore", label: "Stamina", aliases: ["staminaScore", "stamina_score", "cardioScore"], critical: true },
  { key: "paceScore", label: "Pace", aliases: ["paceScore", "pace_score", "outputScore"] },
  { key: "chinScore", label: "Chin", aliases: ["chinScore", "chin_score", "durability"] },
  { key: "fightIqScore", label: "Fight IQ", aliases: ["fightIqScore", "fight_iq_score", "fightIQ"] },
  { key: "gamePlanScore", label: "Game plan", aliases: ["gamePlanScore", "game_plan_score"] },
  { key: "opponentAdjustedStrength", label: "Opponent-adjusted strength", aliases: ["opponentAdjustedStrength", "opponent_adjusted_strength"], critical: true },
  { key: "age", label: "Age", aliases: ["age"] },
  { key: "heightInches", label: "Height", aliases: ["heightInches", "height_inches"] },
  { key: "reachInches", label: "Reach", aliases: ["reachInches", "reach_inches"] }
];

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

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function sourceFrom(value: unknown): UfcIndividualProfileSource {
  if (value === "official") return "official";
  if (value === "historyDerived" || value === "ufc_fight_stats_rounds" || value === "ufc_fight_stats_rounds_history_aggregate") return "historyDerived";
  if (value === "derived") return "derived";
  if (value === "scoutedEstimate" || value === "estimated" || value === "scoutingEstimate") return "estimated";
  return "featureColumn";
}

function confidenceFor(source: UfcIndividualProfileSource, raw: unknown) {
  const explicit = numeric(raw);
  if (explicit != null) return clamp(explicit, 0.05, 1);
  if (source === "official") return 0.92;
  if (source === "historyDerived") return 0.82;
  if (source === "derived") return 0.68;
  if (source === "featureColumn") return 0.54;
  if (source === "estimated") return 0.28;
  return 0;
}

function completeProfile(payload: unknown) {
  return asRecord(asRecord(payload).completeProfile);
}

function profileIntelligence(payload: unknown, feature: UfcModelFeatureSnapshot) {
  const payloadIntel = asRecord(asRecord(payload).profileIntelligence);
  if (Object.keys(payloadIntel).length) return payloadIntel;
  const featureRoot = asRecord(feature.feature);
  return asRecord(featureRoot.profileIntelligence);
}

function readCompleteStat(payload: unknown, aliases: string[]) {
  const profile = completeProfile(payload);
  const careerStats = asRecord(profile.careerStats);
  const sample = asRecord(profile.sample);
  const physical = asRecord(profile.physical);
  for (const key of aliases) {
    for (const bucket of [careerStats, sample, physical]) {
      const stat = asRecord(bucket[key]);
      const value = numeric(stat.value ?? bucket[key]);
      if (value == null) continue;
      const source = sourceFrom(stat.source);
      return {
        value,
        source,
        confidence: confidenceFor(source, stat.confidence),
        note: stringValue(stat.note) ?? "complete fighter profile"
      };
    }
  }
  return null;
}

function readFeatureJsonStat(feature: UfcModelFeatureSnapshot, aliases: string[]) {
  const root = asRecord(feature.feature);
  const statSourceMap = asRecord(root.statSourceMap);
  const rawFeature = asRecord(root.rawFeature);
  const stats = asRecord(root.stats);
  const careerStats = asRecord(root.careerStats);
  for (const key of aliases) {
    for (const bucket of [root, rawFeature, stats, careerStats]) {
      const value = numeric(bucket[key]);
      if (value == null) continue;
      const sourceMeta = asRecord(statSourceMap[key]);
      const source = sourceFrom(sourceMeta.source ?? root.source);
      return {
        value,
        source,
        confidence: confidenceFor(source, sourceMeta.confidence),
        note: stringValue(sourceMeta.note) ?? "feature payload"
      };
    }
  }
  return null;
}

function readFeatureColumn(feature: UfcModelFeatureSnapshot, key: NumericFeatureKey) {
  const value = numeric((feature as unknown as Record<string, unknown>)[key]);
  if (value == null) return null;
  return { value, source: "featureColumn" as const, confidence: 0.54, note: "warehouse feature column" };
}

function statFor(payload: unknown, feature: UfcModelFeatureSnapshot, spec: StatSpec): UfcIndividualProfileStat {
  const picked = readCompleteStat(payload, spec.aliases) ?? readFeatureJsonStat(feature, spec.aliases) ?? readFeatureColumn(feature, spec.key);
  if (!picked) return { key: spec.key, label: spec.label, value: null, source: "missing", confidence: 0, appliedToSim: false };
  const appliedToSim = picked.source === "official" || picked.source === "historyDerived" || picked.source === "derived" || (picked.source === "featureColumn" && picked.confidence >= 0.5);
  return { key: spec.key, label: spec.label, value: round(picked.value), source: picked.source, confidence: round(picked.confidence), appliedToSim, note: picked.note };
}

function grade(score: number): UfcIndividualFighterProfile["readinessGrade"] {
  if (score >= 85) return "A";
  if (score >= 72) return "B";
  if (score >= 55) return "C";
  return "D";
}

function statNumber(stats: UfcIndividualProfileStat[], key: string) {
  const value = stats.find((item) => item.key === key)?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildTendencies(stats: UfcIndividualProfileStat[], payload: unknown, feature: UfcModelFeatureSnapshot) {
  const intelligence = profileIntelligence(payload, feature);
  const stanceStyle = asRecord(intelligence.stanceStyle);
  const existing = asArray(stanceStyle.tendencies);
  const slpm = statNumber(stats, "sigStrikesLandedPerMin");
  const sapm = statNumber(stats, "sigStrikesAbsorbedPerMin");
  const td15 = statNumber(stats, "takedownsPer15");
  const tdDef = statNumber(stats, "takedownDefensePct");
  const sub15 = statNumber(stats, "submissionAttemptsPer15");
  const finishRate = statNumber(stats, "finishRate");
  const derived = [
    slpm != null && slpm >= 4.4 ? "high-volume striker" : null,
    slpm != null && slpm <= 2.7 ? "low-output striker" : null,
    slpm != null && sapm != null && slpm - sapm >= 0.8 ? "positive striking differential" : null,
    slpm != null && sapm != null && slpm - sapm <= -0.5 ? "absorbs more than lands" : null,
    td15 != null && td15 >= 2.2 ? "wrestling-forward" : null,
    td15 != null && td15 <= 0.5 ? "low takedown output" : null,
    tdDef != null && tdDef >= 72 ? "strong takedown defense" : null,
    tdDef != null && tdDef <= 52 ? "takedown defense concern" : null,
    sub15 != null && sub15 >= 0.8 ? "submission threat" : null,
    finishRate != null && finishRate >= 0.62 ? "finish-heavy profile" : null
  ].filter((item): item is string => Boolean(item));
  return [...new Set([...existing, ...derived])].slice(0, 10);
}

function buildMatchupHooks(payload: unknown, feature: UfcModelFeatureSnapshot, stats: UfcIndividualProfileStat[]) {
  const intelligence = profileIntelligence(payload, feature);
  const stanceStyle = asRecord(intelligence.stanceStyle);
  const hooks = asArray(stanceStyle.matchupHooks);
  const tdDef = statNumber(stats, "takedownDefensePct");
  const sapm = statNumber(stats, "sigStrikesAbsorbedPerMin");
  const control = statNumber(stats, "controlTimePct");
  const extra = [
    tdDef != null && tdDef <= 52 ? "stress test against chain wrestling" : null,
    sapm != null && sapm >= 4.3 ? "damage absorption can swing finish risk" : null,
    control != null && control >= 28 ? "top-control path is live if takedowns land" : null
  ].filter((item): item is string => Boolean(item));
  return [...new Set([...hooks, ...extra])].slice(0, 10);
}

export function buildIndividualUfcFighterProfile(args: {
  fighterId: string;
  fighterName?: string | null;
  payload?: unknown;
  feature: UfcModelFeatureSnapshot;
}): UfcIndividualFighterProfile {
  const stats = STAT_SPECS.map((spec) => statFor(args.payload, args.feature, spec));
  const sourceCounts = stats.reduce((acc, item) => {
    acc[item.source] = (acc[item.source] ?? 0) + 1;
    return acc;
  }, { official: 0, historyDerived: 0, derived: 0, featureColumn: 0, estimated: 0, missing: 0 } as Record<UfcIndividualProfileSource, number>);
  const trustedStatCount = stats.filter((item) => item.appliedToSim).length;
  const estimatedStatCount = sourceCounts.estimated + sourceCounts.missing;
  const critical = STAT_SPECS.filter((spec) => spec.critical).length;
  const trustedCritical = STAT_SPECS
    .filter((spec) => spec.critical)
    .filter((spec) => stats.find((item) => item.key === spec.key)?.appliedToSim)
    .length;
  const confidenceAvg = stats.reduce((sum, item) => sum + item.confidence, 0) / Math.max(1, stats.length);
  const sourceScore = sourceCounts.official * 3.1 + sourceCounts.historyDerived * 2.6 + sourceCounts.derived * 2 + sourceCounts.featureColumn * 1.35 - sourceCounts.estimated * 1.8 - sourceCounts.missing * 2.2;
  const readinessScore = Math.round(clamp(sourceScore + (trustedCritical / Math.max(1, critical)) * 30 + confidenceAvg * 28, 1, 99));
  const noGenericEdge = trustedCritical < Math.ceil(critical * 0.62) || estimatedStatCount > trustedStatCount;
  const warnings = [
    sourceCounts.estimated > 0 ? `${sourceCounts.estimated} estimated profile fields are visible but not trusted as hard sim edges.` : null,
    sourceCounts.featureColumn > 0 ? `${sourceCounts.featureColumn} fields came from warehouse feature columns without field-level source labels.` : null,
    trustedCritical < critical ? `${critical - trustedCritical} critical sim inputs still need official/history-derived sourcing.` : null
  ].filter((item): item is string => Boolean(item));
  const blockers = [
    noGenericEdge ? "NO_GENERIC_EDGE: fighter profile is not source-strong enough to create confident betting edge." : null
  ].filter((item): item is string => Boolean(item));

  return {
    fighterId: args.fighterId,
    fighterName: args.fighterName ?? null,
    generatedAt: new Date().toISOString(),
    profileVersion: PROFILE_VERSION,
    readinessGrade: grade(readinessScore),
    readinessScore,
    sourceCounts,
    trustedStatCount,
    estimatedStatCount,
    noGenericEdge,
    warnings,
    blockers,
    stats,
    tendencies: buildTendencies(stats, args.payload, args.feature),
    matchupHooks: buildMatchupHooks(args.payload, args.feature, stats),
    identity: {
      stance: stringValue(args.feature.stance) ?? stringValue(asRecord(args.feature.feature).stance),
      weightClass: stringValue(args.feature.weightClass) ?? stringValue(asRecord(args.feature.feature).weightClass),
      age: statNumber(stats, "age"),
      heightInches: statNumber(stats, "heightInches"),
      reachInches: statNumber(stats, "reachInches")
    }
  };
}

export function applyIndividualUfcProfileToFeature(args: {
  feature: UfcModelFeatureSnapshot;
  payload?: unknown;
  fighterName?: string | null;
}): UfcIndividualProfileBridgeResult {
  const profile = buildIndividualUfcFighterProfile({
    fighterId: args.feature.fighterId,
    fighterName: args.fighterName,
    payload: args.payload,
    feature: args.feature
  });
  const feature: UfcModelFeatureSnapshot = { ...args.feature, feature: { ...asRecord(args.feature.feature) } };
  const changedKeys: string[] = [];
  for (const stat of profile.stats) {
    if (!stat.appliedToSim || typeof stat.value !== "number") continue;
    const key = stat.key as NumericFeatureKey;
    const before = numeric((feature as unknown as Record<string, unknown>)[key]) ?? numeric(asRecord(feature.feature)[key]);
    if (before == null || Math.abs(before - stat.value) > 0.0001) {
      (feature as unknown as Record<string, unknown>)[key] = stat.value;
      changedKeys.push(key);
    }
  }
  if (profile.identity.stance) feature.stance = profile.identity.stance;
  if (profile.identity.weightClass) feature.weightClass = profile.identity.weightClass;
  if (profile.noGenericEdge) feature.coldStartActive = true;
  feature.feature = {
    ...asRecord(feature.feature),
    individualFighterProfile: profile,
    individualProfileGate: {
      noGenericEdge: profile.noGenericEdge,
      readinessGrade: profile.readinessGrade,
      readinessScore: profile.readinessScore,
      sourceCounts: profile.sourceCounts,
      changedKeys
    }
  };
  return { feature, profile, changedKeys };
}
