export type UfcProfileTruthAudit = {
  score: number;
  grade: "A" | "B" | "C" | "D";
  confidenceCap: "HIGH" | "MEDIUM_HIGH" | "MEDIUM" | "LOW";
  officialCount: number;
  derivedCount: number;
  estimatedCount: number;
  totalCount: number;
  officialShare: number;
  estimatedShare: number;
  historyDerived: boolean;
  noMissingData: boolean;
  dataQuality: string | null;
  estimatedFields: string[];
  reasonCodes: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function countSourceMap(sourceMap: Record<string, unknown>) {
  const counts = { official: 0, derived: 0, scoutedEstimate: 0 };
  for (const value of Object.values(sourceMap)) {
    const source = asRecord(value).source;
    if (source === "official") counts.official += 1;
    else if (source === "derived") counts.derived += 1;
    else if (source === "scoutedEstimate") counts.scoutedEstimate += 1;
  }
  return counts;
}

function grade(score: number): UfcProfileTruthAudit["grade"] {
  if (score >= 85) return "A";
  if (score >= 72) return "B";
  if (score >= 55) return "C";
  return "D";
}

function confidenceCap(score: number, estimatedShare: number): UfcProfileTruthAudit["confidenceCap"] {
  if (score >= 85 && estimatedShare <= 0.2) return "HIGH";
  if (score >= 72 && estimatedShare <= 0.38) return "MEDIUM_HIGH";
  if (score >= 55) return "MEDIUM";
  return "LOW";
}

function bounded(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function diagnosticNumber(diagnostics: Record<string, unknown>, key: string) {
  const value = numeric(diagnostics[key]);
  return value == null ? 0 : value;
}

function diagnosticCounts(feature: Record<string, unknown>) {
  const diagnostics = asRecord(feature.profileDiagnostics);
  const seconds = diagnosticNumber(diagnostics, "seconds");
  const fightCount = diagnosticNumber(diagnostics, "fightCount");
  const amateurCount = diagnosticNumber(diagnostics, "amateurCount");
  const ratingCount = diagnosticNumber(diagnostics, "ratingCount");
  const dataQuality = typeof diagnostics.dataQuality === "string" ? diagnostics.dataQuality : null;
  const hasHistoryStats = seconds > 0 || fightCount > 0;
  const hasRatings = ratingCount > 0;
  const hasAmateur = amateurCount > 0;

  return {
    official: hasHistoryStats ? Math.min(14, 6 + Math.floor(Math.min(seconds, 5400) / 900) + Math.min(fightCount, 4)) : 0,
    derived: (hasHistoryStats ? 8 : 0) + (hasRatings ? 3 : 0) + (hasAmateur ? 2 : 0),
    estimated: dataQuality === "D" ? 8 : dataQuality === "C" ? 5 : dataQuality === "B" ? 2 : 0,
    hasHistoryStats,
    dataQuality
  };
}

function isHistoryDerivedSource(source: unknown, profileAccuracy: Record<string, unknown>, historyDerivedStats: Record<string, unknown>, diagnostics: ReturnType<typeof diagnosticCounts>) {
  return source === "complete-profile-feature-sync"
    || source === "fighter-profile-gap-fill"
    || source === "upcoming-feature-hydration"
    || source === "elite-fighter-profile-builder"
    || source === "elite-fighter-profile-builder-fight-snapshot"
    || Boolean(profileAccuracy.source === "ufc_fight_stats_rounds" || historyDerivedStats.source === "ufc_fight_stats_rounds_history_aggregate")
    || diagnostics.hasHistoryStats;
}

export function auditUfcProfileTruth(featureJson: unknown): UfcProfileTruthAudit {
  const feature = asRecord(featureJson);
  const sourceSummary = asRecord(feature.sourceSummary);
  const statSourceMap = asRecord(feature.statSourceMap);
  const completeProfile = asRecord(feature.completeProfile);
  const completeAudit = asRecord(completeProfile.audit);
  const profileAccuracy = asRecord(feature.profileAccuracy);
  const historyDerivedStats = asRecord(feature.historyDerivedStats);
  const sourceMapCounts = countSourceMap(statSourceMap);
  const diagnostics = diagnosticCounts(feature);

  const officialCount = Math.max(
    numeric(sourceSummary.official) ?? 0,
    sourceMapCounts.official,
    asArray(completeAudit.officialFields).length,
    diagnostics.official
  );
  const derivedCount = Math.max(
    numeric(sourceSummary.derived) ?? 0,
    sourceMapCounts.derived,
    asArray(completeAudit.derivedFields).length,
    diagnostics.derived
  );
  const estimatedFields = Array.from(new Set([
    ...asArray(feature.estimatedFields),
    ...asArray(completeAudit.estimatedFields),
    ...(diagnostics.estimated > 0 ? ["elite_profile_estimated_fallbacks"] : [])
  ]));
  const estimatedCount = Math.max(numeric(sourceSummary.scoutedEstimate) ?? 0, sourceMapCounts.scoutedEstimate, estimatedFields.length, diagnostics.estimated);
  const totalCount = Math.max(1, officialCount + derivedCount + estimatedCount);
  const officialShare = officialCount / totalCount;
  const estimatedShare = estimatedCount / totalCount;
  const historyDerived = isHistoryDerivedSource(feature.source, profileAccuracy, historyDerivedStats, diagnostics);
  const noMissingData = feature.noMissingData === true || completeProfile.noMissingData === true || (diagnostics.hasHistoryStats && estimatedShare <= 0.28);
  const dataQuality = typeof feature.dataQuality === "string" ? feature.dataQuality : typeof completeProfile.dataQuality === "string" ? completeProfile.dataQuality : diagnostics.dataQuality;

  const sourceScore = officialShare * 58 + (derivedCount / totalCount) * 32 + (historyDerived ? 10 : 0) + (noMissingData ? 3 : 0) - estimatedShare * 38;
  const qualityPenalty = dataQuality === "D" ? 16 : dataQuality === "C" ? 7 : 0;
  const score = Math.round(bounded(sourceScore - qualityPenalty, 1, 99));
  const reasonCodes: string[] = [];
  if (!historyDerived) reasonCodes.push("NO_HISTORY_DERIVED_PROFILE_STATS");
  if (estimatedShare > 0.5) reasonCodes.push("PROFILE_MOSTLY_ESTIMATED");
  else if (estimatedShare > 0.3) reasonCodes.push("PROFILE_ESTIMATE_HEAVY");
  if (officialShare < 0.2) reasonCodes.push("LOW_OFFICIAL_STAT_SHARE");
  if (!noMissingData) reasonCodes.push("PROFILE_HAS_MISSING_FIELDS");
  if (dataQuality === "D") reasonCodes.push("PROFILE_DECLARED_D_QUALITY");
  if (feature.source === "elite-fighter-profile-builder" || feature.source === "elite-fighter-profile-builder-fight-snapshot") reasonCodes.push("ELITE_PROFILE_BUILDER_AUDITED");

  return {
    score,
    grade: grade(score),
    confidenceCap: confidenceCap(score, estimatedShare),
    officialCount,
    derivedCount,
    estimatedCount,
    totalCount,
    officialShare: Number(officialShare.toFixed(3)),
    estimatedShare: Number(estimatedShare.toFixed(3)),
    historyDerived,
    noMissingData,
    dataQuality,
    estimatedFields,
    reasonCodes
  };
}

function gradeRank(value: string) {
  if (value === "A") return 4;
  if (value === "B") return 3;
  if (value === "C") return 2;
  return 1;
}

export function weakerTruthGrade(left: string, right: string) {
  return gradeRank(left) <= gradeRank(right) ? left : right;
}

function confidenceRank(value: string) {
  if (value === "HIGH") return 4;
  if (value === "MEDIUM_HIGH") return 3;
  if (value === "MEDIUM") return 2;
  return 1;
}

export function weakerTruthConfidence(left: string, right: string) {
  return confidenceRank(left) <= confidenceRank(right) ? left : right;
}
