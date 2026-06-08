import { prisma } from "@/lib/db/prisma";
import type { UfcCalibrationAdjustmentType, UfcDeepProfileCalibrationReport } from "@/services/ufc/deep-profile-calibration";
import type { UfcDeepDangerType, UfcDeepMatchupPhase } from "@/services/ufc/deep-profile-matchup-engine";
import type { UfcDeepProfileWinCondition } from "@/services/ufc/deep-fighter-profile-v2";

export type UfcDeepProfileLearnedWeights = {
  modelVersion: "ufc-deep-profile-learned-weights-v1";
  generatedAt: string;
  reportCount: number;
  avgCalibrationError: number;
  highMissCount: number;
  confidence: number;
  phaseWeights: Record<UfcDeepMatchupPhase, number>;
  methodPriors: Record<UfcDeepProfileWinCondition | "KO_TKO" | "SUBMISSION" | "DECISION" | "UNKNOWN", number>;
  roundPriors: Record<string, number>;
  dangerZoneWeights: Record<UfcDeepDangerType | "dangerZones", number>;
  profileRatingWeights: Record<string, number>;
  confidenceCaps: Record<string, number>;
  adjustmentCounts: Record<UfcCalibrationAdjustmentType, number>;
  sourceSummary: {
    winnerMisses: number;
    methodMisses: number;
    roundMisses: number;
    phaseMisses: number;
    confidenceMisses: number;
  };
  summary: string;
};

type ReportRow = { report_json: unknown; calibration_error: number | null; generated_at: Date | string | null };

const PHASES: UfcDeepMatchupPhase[] = ["standing", "clinch", "wrestling", "grappling", "cardio", "durability", "finish", "decision"];
const CONDITIONS: Array<UfcDeepProfileWinCondition | "KO_TKO" | "SUBMISSION" | "DECISION" | "UNKNOWN"> = ["KO_TKO", "SUBMISSION", "DECISION", "UNKNOWN", "DECISION_VOLUME", "DECISION_CONTROL", "SCRAMBLE_CHAOS"];
const DANGERS: Array<UfcDeepDangerType | "dangerZones"> = ["EARLY_POWER", "TAKEDOWN_CHAIN", "SUBMISSION_WINDOW", "CARDIO_FADE", "CHIN_EXPOSURE", "LOW_TRUST_PROFILE", "CONTROL_TRAP", "SCRAMBLE_VOLATILITY", "dangerZones"];

function round(value: number, digits = 4) { return Number(value.toFixed(digits)); }
function clamp(value: number, min = 0.55, max = 1.45) { return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 1)); }
function blank<T extends string>(keys: readonly T[], value = 1) { return Object.fromEntries(keys.map((key) => [key, value])) as Record<T, number>; }
function normalizeTarget(value: string) { return value.replace(/^winPath:/, ""); }
function magnitudeToDelta(direction: "UP" | "DOWN" | "HOLD", magnitude: number) {
  if (direction === "HOLD") return 0;
  return (direction === "UP" ? 1 : -1) * Math.max(0, Math.min(1, magnitude));
}
function addWeight(store: Record<string, number>, target: string, direction: "UP" | "DOWN" | "HOLD", magnitude: number, scale = 0.42) {
  const key = normalizeTarget(target);
  const current = store[key] ?? 1;
  store[key] = clamp(current + magnitudeToDelta(direction, magnitude) * scale);
}
function parsedReport(row: ReportRow): UfcDeepProfileCalibrationReport | null {
  const payload = row.report_json;
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Partial<UfcDeepProfileCalibrationReport>;
  if (candidate.modelVersion !== "ufc-deep-profile-calibration-v1" || !candidate.scores || !Array.isArray(candidate.adjustments)) return null;
  return candidate as UfcDeepProfileCalibrationReport;
}

export function buildUfcDeepProfileLearnedWeights(reports: UfcDeepProfileCalibrationReport[], generatedAt = new Date().toISOString()): UfcDeepProfileLearnedWeights {
  const phaseWeights = blank(PHASES);
  const methodPriors = blank(CONDITIONS);
  const roundPriors: Record<string, number> = { roundLeverage: 1, early: 1, mid: 1, late: 1, championship: 1 };
  const dangerZoneWeights = blank(DANGERS);
  const profileRatingWeights: Record<string, number> = { overallEdge: 1, overall: 1, finishThreat: 1, decisionFloor: 1, control: 1, durability: 1 };
  const confidenceCaps: Record<string, number> = { deepProfileMatchup: 0.96, highConfidenceMiss: 0.96, lowTrustProfile: 0.72 };
  const adjustmentCounts = {} as Record<UfcCalibrationAdjustmentType, number>;
  const sourceSummary = { winnerMisses: 0, methodMisses: 0, roundMisses: 0, phaseMisses: 0, confidenceMisses: 0 };

  for (const report of reports) {
    if (report.correct.winner === false) sourceSummary.winnerMisses += 1;
    if (report.correct.methodFamily === false) sourceSummary.methodMisses += 1;
    if (report.correct.roundBand === false) sourceSummary.roundMisses += 1;
    if (report.scores.phaseError > 0) sourceSummary.phaseMisses += 1;
    if (report.scores.confidencePenalty > 0) sourceSummary.confidenceMisses += 1;
    for (const item of report.adjustments) {
      adjustmentCounts[item.type] = (adjustmentCounts[item.type] ?? 0) + 1;
      if (item.type === "PHASE_WEIGHT") addWeight(phaseWeights, item.target, item.direction, item.magnitude, 0.5);
      if (item.type === "METHOD_PRIOR") addWeight(methodPriors, item.target, item.direction, item.magnitude, 0.46);
      if (item.type === "ROUND_PRIOR") addWeight(roundPriors, item.target, item.direction, item.magnitude, 0.38);
      if (item.type === "RISK_FLAG_WEIGHT") addWeight(dangerZoneWeights, item.target, item.direction, item.magnitude, 0.36);
      if (item.type === "PROFILE_RATING_WEIGHT") addWeight(profileRatingWeights, item.target, item.direction, item.magnitude, 0.42);
      if (item.type === "CONFIDENCE_CAP") {
        const key = item.target || "deepProfileMatchup";
        const current = confidenceCaps[key] ?? confidenceCaps.deepProfileMatchup;
        confidenceCaps[key] = Math.max(0.52, Math.min(0.96, current + magnitudeToDelta(item.direction, item.magnitude) * 0.22));
        confidenceCaps.deepProfileMatchup = Math.min(confidenceCaps.deepProfileMatchup, confidenceCaps[key]);
      }
    }
  }

  const reportCount = reports.length;
  const avgCalibrationError = reportCount ? reports.reduce((sum, report) => sum + report.scores.calibrationError, 0) / reportCount : 0;
  const highMissCount = reports.filter((report) => report.scores.calibrationError >= 35).length;
  const confidence = Math.min(0.95, Math.max(0.1, Math.log10(reportCount + 1) / 2.4));
  return {
    modelVersion: "ufc-deep-profile-learned-weights-v1",
    generatedAt,
    reportCount,
    avgCalibrationError: round(avgCalibrationError, 3),
    highMissCount,
    confidence: round(confidence, 3),
    phaseWeights,
    methodPriors,
    roundPriors,
    dangerZoneWeights,
    profileRatingWeights,
    confidenceCaps: Object.fromEntries(Object.entries(confidenceCaps).map(([key, value]) => [key, round(value, 4)])),
    adjustmentCounts,
    sourceSummary,
    summary: reportCount ? `Learned UFC deep-profile weights from ${reportCount} reports; avg error ${avgCalibrationError.toFixed(1)}; ${highMissCount} high misses.` : "No calibration reports available; using neutral deep-profile weights."
  };
}

export async function loadUfcDeepProfileLearnedWeightsFromDb(limit = 500, generatedAt = new Date().toISOString()) {
  const rows = await prisma.$queryRaw<ReportRow[]>`
    SELECT report_json, calibration_error, generated_at
    FROM ufc_deep_profile_calibration_reports
    ORDER BY generated_at DESC
    LIMIT ${limit}
  `;
  return buildUfcDeepProfileLearnedWeights(rows.map(parsedReport).filter((report): report is UfcDeepProfileCalibrationReport => Boolean(report)), generatedAt);
}
