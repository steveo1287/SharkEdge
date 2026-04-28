import { applyLogitTemperature, clampNumber } from "./probability-math";

export type SupportedLeague = "NBA" | "NCAAB" | "NFL" | "NCAAF" | "NHL" | "MLB";

export type CalibrationProfile = {
  neutralShrink: number;
  marketBlend: number;
  moneylineTemperature?: number;
  spreadDeltaShrink: number;
  totalDeltaShrink: number;
  propProbShrink: number;
  stdBaseline: number;
};

type ProbabilityCalibrationArgs = {
  leagueKey: string;
  rawProb: number;
  marketImplied?: number | null;
  ratingsConfidence?: number | null;
  totalStdDev?: number | null;
};

type DeltaCalibrationArgs = {
  leagueKey: string;
  rawDelta: number;
  totalStdDev?: number | null;
  ratingsConfidence?: number | null;
};

type BacktestRecord = {
  predicted: number;
  actual: 0 | 1;
};

const DEFAULT_PROFILE: CalibrationProfile = {
  neutralShrink: 0.16,
  marketBlend: 0.2,
  moneylineTemperature: 1.08,
  spreadDeltaShrink: 0.82,
  totalDeltaShrink: 0.8,
  propProbShrink: 0.18,
  stdBaseline: 12
};

const PROFILES: Record<SupportedLeague, CalibrationProfile> = {
  NBA: { neutralShrink: 0.14, marketBlend: 0.18, moneylineTemperature: 1.06, spreadDeltaShrink: 0.84, totalDeltaShrink: 0.82, propProbShrink: 0.16, stdBaseline: 13 },
  NCAAB: { neutralShrink: 0.18, marketBlend: 0.22, moneylineTemperature: 1.12, spreadDeltaShrink: 0.8, totalDeltaShrink: 0.78, propProbShrink: 0.2, stdBaseline: 11 },
  NFL: { neutralShrink: 0.12, marketBlend: 0.2, moneylineTemperature: 1.05, spreadDeltaShrink: 0.86, totalDeltaShrink: 0.84, propProbShrink: 0.14, stdBaseline: 10 },
  NCAAF: { neutralShrink: 0.16, marketBlend: 0.22, moneylineTemperature: 1.12, spreadDeltaShrink: 0.82, totalDeltaShrink: 0.8, propProbShrink: 0.18, stdBaseline: 12 },
  NHL: { neutralShrink: 0.14, marketBlend: 0.18, moneylineTemperature: 1.08, spreadDeltaShrink: 0.88, totalDeltaShrink: 0.86, propProbShrink: 0.14, stdBaseline: 2 },
  MLB: { neutralShrink: 0.12, marketBlend: 0.16, moneylineTemperature: 1.04, spreadDeltaShrink: 0.9, totalDeltaShrink: 0.88, propProbShrink: 0.14, stdBaseline: 2.5 }
};

let profileOverrides: Partial<Record<string, CalibrationProfile>> = {};

function clamp(value: number, min: number, max: number) {
  return clampNumber(value, min, max);
}

export function getDefaultCalibrationProfile(leagueKey: string): CalibrationProfile {
  return PROFILES[leagueKey as SupportedLeague] ?? DEFAULT_PROFILE;
}

export function setCalibrationProfileOverrides(overrides: Partial<Record<string, CalibrationProfile>>) {
  profileOverrides = { ...profileOverrides, ...overrides };
}

export function resetCalibrationProfileOverrides() {
  profileOverrides = {};
}

export function getCalibrationProfile(leagueKey: string): CalibrationProfile {
  const profile = profileOverrides[leagueKey] ?? getDefaultCalibrationProfile(leagueKey);
  const base = getDefaultCalibrationProfile(leagueKey);

  return {
    ...base,
    ...profile,
    moneylineTemperature: profile.moneylineTemperature ?? base.moneylineTemperature ?? DEFAULT_PROFILE.moneylineTemperature ?? 1
  };
}

function getVariancePenalty(totalStdDev: number | null | undefined, stdBaseline: number) {
  if (typeof totalStdDev !== "number" || totalStdDev <= 0) {
    return 1;
  }

  return clamp(totalStdDev / Math.max(0.0001, stdBaseline), 0.85, 1.25);
}

function getConfidenceModifier(ratingsConfidence: number | null | undefined) {
  if (typeof ratingsConfidence !== "number") {
    return 1;
  }

  return clamp(1.12 - ratingsConfidence * 0.35, 0.82, 1.12);
}

export function calibrateWinProbability(args: ProbabilityCalibrationArgs) {
  const profile = getCalibrationProfile(args.leagueKey);
  const variancePenalty = getVariancePenalty(args.totalStdDev, profile.stdBaseline);
  const confidenceModifier = getConfidenceModifier(args.ratingsConfidence);

  const temperedRawProb = applyLogitTemperature(args.rawProb, profile.moneylineTemperature ?? DEFAULT_PROFILE.moneylineTemperature ?? 1);
  let calibrated = 0.5 + (temperedRawProb - 0.5) * (1 - profile.neutralShrink) / variancePenalty;

  if (typeof args.marketImplied === "number") {
    const marketWeight = clamp(profile.marketBlend * confidenceModifier, 0.05, 0.42);
    calibrated = calibrated * (1 - marketWeight) + args.marketImplied * marketWeight;
  }

  return clamp(calibrated, 0.02, 0.98);
}

export function calibrateSpreadDelta(args: DeltaCalibrationArgs) {
  const profile = getCalibrationProfile(args.leagueKey);
  const variancePenalty = getVariancePenalty(args.totalStdDev, profile.stdBaseline);
  const confidenceModifier = getConfidenceModifier(args.ratingsConfidence);

  return args.rawDelta * profile.spreadDeltaShrink / variancePenalty / confidenceModifier;
}

export function calibrateTotalDelta(args: DeltaCalibrationArgs) {
  const profile = getCalibrationProfile(args.leagueKey);
  const variancePenalty = getVariancePenalty(args.totalStdDev, profile.stdBaseline);
  const confidenceModifier = getConfidenceModifier(args.ratingsConfidence);

  return args.rawDelta * profile.totalDeltaShrink / variancePenalty / confidenceModifier;
}

export function calibratePropHitProbability(args: ProbabilityCalibrationArgs) {
  const profile = getCalibrationProfile(args.leagueKey);
  const confidenceModifier = getConfidenceModifier(args.ratingsConfidence);
  const centered = args.rawProb - 0.5;
  const shrunk = 0.5 + centered * (1 - profile.propProbShrink) / confidenceModifier;

  return clamp(shrunk, 0.03, 0.97);
}

export function brierScore(records: BacktestRecord[]) {
  if (records.length === 0) {
    return 0;
  }

  const total = records.reduce((sum, record) => sum + (record.predicted - record.actual) ** 2, 0);
  return total / records.length;
}

export function logLoss(records: BacktestRecord[]) {
  if (records.length === 0) {
    return 0;
  }

  const total = records.reduce((sum, record) => {
    const predicted = clamp(record.predicted, 0.0001, 0.9999);
    return sum - (record.actual * Math.log(predicted) + (1 - record.actual) * Math.log(1 - predicted));
  }, 0);

  return total / records.length;
}

export function summarizeCalibrationBuckets(records: BacktestRecord[], bucketCount = 10) {
  if (records.length === 0) {
    return [] as Array<{ bucket: string; predicted: number; actual: number; count: number }>;
  }

  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    bucket: `${index / bucketCount}-${(index + 1) / bucketCount}`,
    predictedSum: 0,
    actualSum: 0,
    count: 0
  }));

  for (const record of records) {
    const bucketIndex = clamp(Math.floor(record.predicted * bucketCount), 0, bucketCount - 1);
    buckets[bucketIndex].predictedSum += record.predicted;
    buckets[bucketIndex].actualSum += record.actual;
    buckets[bucketIndex].count += 1;
  }

  return buckets
    .filter((bucket) => bucket.count > 0)
    .map((bucket) => ({
      bucket: bucket.bucket,
      predicted: bucket.predictedSum / bucket.count,
      actual: bucket.actualSum / bucket.count,
      count: bucket.count
    }));
}
