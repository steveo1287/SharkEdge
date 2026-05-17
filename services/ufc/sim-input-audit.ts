import type { UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";

export type UfcSimInputAuditField = {
  key: string;
  label: string;
  present: boolean;
  weight: number;
  value?: number | string | boolean | null;
};

export type UfcFighterInputAudit = {
  fighterId: string;
  score: number;
  grade: "A" | "B" | "C" | "D";
  missingCritical: string[];
  missingUseful: string[];
  fields: UfcSimInputAuditField[];
  coldStartActive: boolean;
};

export type UfcSimInputAudit = {
  score: number;
  grade: "A" | "B" | "C" | "D";
  fighterA: UfcFighterInputAudit;
  fighterB: UfcFighterInputAudit;
  market: {
    hasTwoSidedMarket: boolean;
    score: number;
    missing: string[];
  };
  engineReadiness: {
    roundByRoundReady: boolean;
    exchangeReady: boolean;
    skillReady: boolean;
    score: number;
    blockers: string[];
  };
  blockers: string[];
  warnings: string[];
};

type Args = {
  fighterA: UfcModelFeatureSnapshot;
  fighterB: UfcModelFeatureSnapshot;
  marketOddsA?: number | null;
  marketOddsB?: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function grade(score: number): UfcSimInputAudit["grade"] {
  if (score >= 85) return "A";
  if (score >= 72) return "B";
  if (score >= 55) return "C";
  return "D";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/%$/, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function valueFor(feature: UfcModelFeatureSnapshot, key: keyof UfcModelFeatureSnapshot | string): number | string | boolean | null {
  const direct = (feature as Record<string, unknown>)[key];
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  if (typeof direct === "string" && direct.trim()) return direct;
  if (typeof direct === "boolean") return direct;
  const source = record(feature.feature);
  const rawFeature = record(source.rawFeature);
  const rawPayload = record(source.rawPayload);
  const stats = record(source.stats);
  const careerStats = record(source.careerStats);
  const eliteProfile = record(source.eliteProfile);
  const eliteCareerStats = record(eliteProfile.careerStats);
  for (const sourceRecord of [source, rawFeature, rawPayload, stats, careerStats, eliteCareerStats]) {
    const value = sourceRecord[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "boolean") return value;
  }
  return null;
}

function present(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return Boolean(value.trim());
  if (typeof value === "boolean") return true;
  return value != null;
}

const FIELD_SPECS: Array<{ key: keyof UfcModelFeatureSnapshot | string; label: string; weight: number; critical?: boolean }> = [
  { key: "proFights", label: "Pro fights", weight: 6, critical: true },
  { key: "ufcFights", label: "UFC / major-promotion fights", weight: 7, critical: true },
  { key: "roundsFought", label: "Round experience", weight: 6, critical: true },
  { key: "sigStrikesLandedPerMin", label: "Significant strikes landed/min", weight: 6, critical: true },
  { key: "sigStrikesAbsorbedPerMin", label: "Significant strikes absorbed/min", weight: 6, critical: true },
  { key: "strikingDifferential", label: "Striking differential", weight: 5 },
  { key: "sigStrikeAccuracyPct", label: "Strike accuracy", weight: 4 },
  { key: "sigStrikeDefensePct", label: "Strike defense", weight: 5, critical: true },
  { key: "knockdownsPer15", label: "Knockdowns/15", weight: 4 },
  { key: "takedownsPer15", label: "Takedowns/15", weight: 5, critical: true },
  { key: "takedownAccuracyPct", label: "Takedown accuracy", weight: 4 },
  { key: "takedownDefensePct", label: "Takedown defense", weight: 6, critical: true },
  { key: "submissionAttemptsPer15", label: "Submission attempts/15", weight: 4 },
  { key: "submissionDefensePct", label: "Submission defense", weight: 5, critical: true },
  { key: "controlTimePct", label: "Control time", weight: 5, critical: true },
  { key: "controlEscapePct", label: "Control escape", weight: 4 },
  { key: "getUpRate", label: "Get-up rate", weight: 4 },
  { key: "recentFormScore", label: "Recent form", weight: 4 },
  { key: "finishRate", label: "Finish rate", weight: 4 },
  { key: "lateRoundPerformance", label: "Late-round performance", weight: 4 },
  { key: "heartScore", label: "Heart/adversity", weight: 3 },
  { key: "staminaScore", label: "Stamina/cardio", weight: 5, critical: true },
  { key: "paceScore", label: "Pace", weight: 4 },
  { key: "chinScore", label: "Chin durability", weight: 4 },
  { key: "recoveryScore", label: "Recovery", weight: 3 },
  { key: "fightIqScore", label: "Fight IQ", weight: 3 },
  { key: "opponentAdjustedStrength", label: "Opponent-adjusted strength", weight: 5, critical: true },
  { key: "age", label: "Age", weight: 2 },
  { key: "reachInches", label: "Reach", weight: 2 },
  { key: "stance", label: "Stance", weight: 2 },
  { key: "daysSinceLastFight", label: "Days since last fight", weight: 2 }
];

function profileDiagnostics(feature: UfcModelFeatureSnapshot) {
  const source = record(feature.feature);
  const diagnostics = record(source.profileDiagnostics);
  const eliteProfile = record(source.eliteProfile);
  const eliteDiagnostics = record(record(eliteProfile.diagnostics));
  const sample = record(eliteProfile.sample);
  const seconds = numeric(diagnostics.seconds) ?? 0;
  const fightCount = numeric(diagnostics.fightCount) ?? numeric(sample.ufcFights) ?? numeric(feature.ufcFights) ?? 0;
  const proFights = numeric(sample.proFights) ?? numeric(feature.proFights) ?? fightCount;
  const roundsFought = numeric(sample.roundsFought) ?? numeric(feature.roundsFought) ?? 0;
  const dataQuality = typeof diagnostics.dataQuality === "string" ? diagnostics.dataQuality : typeof eliteProfile.dataQuality === "string" ? eliteProfile.dataQuality : null;
  const profileSource = typeof eliteDiagnostics.profileSource === "string" ? eliteDiagnostics.profileSource : typeof source.source === "string" ? source.source : null;
  const historyWeighted = eliteDiagnostics.historyWeighted === true || source.source === "elite-fighter-profile-builder" || source.source === "elite-fighter-profile-builder-fight-snapshot";
  return { seconds, fightCount, proFights, roundsFought, dataQuality, profileSource, historyWeighted };
}

function eliteProfileReliabilityBonus(feature: UfcModelFeatureSnapshot, fields: UfcSimInputAuditField[]) {
  const diagnostics = profileDiagnostics(feature);
  if (!diagnostics.historyWeighted) return 0;
  const usefulHistory = diagnostics.seconds >= 900 || diagnostics.fightCount >= 1 || diagnostics.roundsFought >= 3;
  if (!usefulHistory) return 0;
  const presentCore = fields.filter((field) => field.present && field.weight >= 5).length;
  const qualityBonus = diagnostics.dataQuality === "A" ? 8 : diagnostics.dataQuality === "B" ? 6 : diagnostics.dataQuality === "C" ? 3 : 0;
  return clamp(qualityBonus + Math.min(8, presentCore), 0, 14);
}

function coldStartFromFeature(feature: UfcModelFeatureSnapshot) {
  const diagnostics = profileDiagnostics(feature);
  const featureCold = Boolean(feature.coldStartActive);
  const ufcFights = typeof feature.ufcFights === "number" ? feature.ufcFights : diagnostics.fightCount;
  const proFights = typeof feature.proFights === "number" ? feature.proFights : diagnostics.proFights;
  const hasUsefulHistory = diagnostics.historyWeighted && (diagnostics.seconds >= 900 || diagnostics.roundsFought >= 3 || ufcFights >= 1);
  if (hasUsefulHistory && diagnostics.dataQuality !== "D") return false;
  return featureCold || ufcFights < 3 || proFights < 8;
}

function fighterAudit(feature: UfcModelFeatureSnapshot): UfcFighterInputAudit {
  const fields = FIELD_SPECS.map((spec) => {
    const value = valueFor(feature, spec.key);
    return { key: String(spec.key), label: spec.label, present: present(value), weight: spec.weight, value };
  });
  const totalWeight = fields.reduce((sum, field) => sum + field.weight, 0);
  const presentWeight = fields.reduce((sum, field) => sum + (field.present ? field.weight : 0), 0);
  const coldStartActive = coldStartFromFeature(feature);
  const missingCritical = FIELD_SPECS.filter((spec) => spec.critical).filter((spec) => !fields.find((field) => field.key === String(spec.key))?.present).map((spec) => spec.label);
  const missingUseful = FIELD_SPECS.filter((spec) => !spec.critical).filter((spec) => !fields.find((field) => field.key === String(spec.key))?.present).map((spec) => spec.label);
  const coldStartPenalty = coldStartActive ? 10 : 0;
  const criticalPenalty = Math.min(18, missingCritical.length * 3);
  const score = clamp(round((presentWeight / Math.max(1, totalWeight)) * 100 + eliteProfileReliabilityBonus(feature, fields) - coldStartPenalty - criticalPenalty), 0, 100);
  return { fighterId: feature.fighterId, score, grade: grade(score), missingCritical, missingUseful, fields, coldStartActive };
}

function marketAudit(marketOddsA?: number | null, marketOddsB?: number | null) {
  const hasA = typeof marketOddsA === "number" && Number.isFinite(marketOddsA);
  const hasB = typeof marketOddsB === "number" && Number.isFinite(marketOddsB);
  const missing: string[] = [];
  if (!hasA) missing.push("fighter A odds");
  if (!hasB) missing.push("fighter B odds");
  return { hasTwoSidedMarket: hasA && hasB, score: hasA && hasB ? 100 : hasA || hasB ? 45 : 0, missing };
}

function engineReadiness(a: UfcFighterInputAudit, b: UfcFighterInputAudit) {
  const blockers: string[] = [];
  const hasStriking = !a.missingCritical.includes("Significant strikes landed/min") && !b.missingCritical.includes("Significant strikes landed/min") && !a.missingCritical.includes("Significant strikes absorbed/min") && !b.missingCritical.includes("Significant strikes absorbed/min");
  const hasGrappling = !a.missingCritical.includes("Takedowns/15") && !b.missingCritical.includes("Takedowns/15") && !a.missingCritical.includes("Takedown defense") && !b.missingCritical.includes("Takedown defense");
  const hasCardio = !a.missingCritical.includes("Stamina/cardio") && !b.missingCritical.includes("Stamina/cardio");
  const roundByRoundReady = hasStriking && hasGrappling && hasCardio && a.grade !== "D" && b.grade !== "D";
  const exchangeReady = hasStriking && a.grade !== "D" && b.grade !== "D";
  const skillReady = a.score >= 50 && b.score >= 50;
  if (!roundByRoundReady) blockers.push("Round-by-round engine has incomplete striking/grappling/cardio inputs.");
  if (!exchangeReady) blockers.push("Exchange Monte Carlo has incomplete striking inputs.");
  if (!skillReady) blockers.push("Skill engine has weak fighter profile completeness.");
  const score = round((roundByRoundReady ? 40 : 0) + (exchangeReady ? 30 : 0) + (skillReady ? 30 : 0));
  return { roundByRoundReady, exchangeReady, skillReady, score, blockers };
}

export function auditUfcSimInputs(args: Args): UfcSimInputAudit {
  const fighterA = fighterAudit(args.fighterA);
  const fighterB = fighterAudit(args.fighterB);
  const market = marketAudit(args.marketOddsA, args.marketOddsB);
  const readiness = engineReadiness(fighterA, fighterB);
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (fighterA.grade === "D") blockers.push(`Fighter A profile audit D (${fighterA.score}/100).`);
  if (fighterB.grade === "D") blockers.push(`Fighter B profile audit D (${fighterB.score}/100).`);
  if (!readiness.roundByRoundReady) warnings.push("Round-by-round engine should be treated as lower-confidence for this fight.");
  if (!market.hasTwoSidedMarket) warnings.push(`No complete two-sided market: missing ${market.missing.join(", ") || "market"}.`);
  if (fighterA.coldStartActive) warnings.push("Fighter A cold-start flag active.");
  if (fighterB.coldStartActive) warnings.push("Fighter B cold-start flag active.");
  const profileScore = Math.min(fighterA.score, fighterB.score);
  const score = clamp(round(profileScore * 0.65 + readiness.score * 0.2 + market.score * 0.15), 0, 100);
  return { score, grade: grade(score), fighterA, fighterB, market, engineReadiness: readiness, blockers, warnings };
}
