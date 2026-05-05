import type { NbaWinnerBucketStatus } from "@/services/simulation/nba-winner-ledger";

type Side = "HOME" | "AWAY" | "PASS";

type FactorInputRow = {
  captureType: "PREDICTION" | "GRADED";
  pickedSide: Side;
  actualWinner: Exclude<Side, "PASS"> | null;
  finalHomeWinPct: number;
  finalAwayWinPct: number;
  marketHomeNoVig: number | null;
  marketAwayNoVig: number | null;
  drivers: string[];
};

export type NbaWinnerFactorScore = {
  factor: string;
  sampleSize: number;
  hitRateWhenPositive: number | null;
  hitRateWhenNegative: number | null;
  avgAbsValue: number | null;
  correlationToResult: number | null;
  suggestedWeight: number;
  maxMarginContribution: number;
  status: NbaWinnerBucketStatus;
  warnings: string[];
};

export type NbaWinnerFactorWeightReport = {
  modelVersion: "nba-winner-factor-weights-v1";
  generatedAt: string;
  status: NbaWinnerBucketStatus;
  sampleSize: number;
  factors: NbaWinnerFactorScore[];
  recommendedCaps: {
    singleFactorMarginPoints: number;
    totalLearnedMarginPoints: number;
    probabilityDeltaHardCap: number;
  };
  blockers: string[];
  warnings: string[];
};

const FACTORS = [
  "four-factor style delta",
  "roster rating delta",
  "ranking delta",
  "lineup penalty",
  "roster/team delta",
  "bounded model delta",
  "raw model delta",
  "source confidence",
  "shrinkage to market"
];

function round(value: number, digits = 6) {
  return Number(value.toFixed(digits));
}

function parseNumberFromDriver(driver: string) {
  const percentMatch = driver.match(/(-?\d+(?:\.\d+)?)%/);
  if (percentMatch) return Number(percentMatch[1]) / 100;
  const numberMatch = driver.match(/(-?\d+(?:\.\d+)?)/);
  return numberMatch ? Number(numberMatch[1]) : null;
}

function factorValue(row: FactorInputRow, factor: string) {
  const driver = row.drivers.find((candidate) => candidate.toLowerCase().includes(factor));
  if (!driver) return null;
  const value = parseNumberFromDriver(driver);
  return Number.isFinite(value) ? value : null;
}

function correlation(xs: number[], ys: number[]) {
  if (xs.length < 2 || ys.length !== xs.length) return null;
  const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let numerator = 0;
  let xVariance = 0;
  let yVariance = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const x = xs[index] - xMean;
    const y = ys[index] - yMean;
    numerator += x * y;
    xVariance += x ** 2;
    yVariance += y ** 2;
  }
  if (xVariance <= 0 || yVariance <= 0) return null;
  return numerator / Math.sqrt(xVariance * yVariance);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function signedForPick(row: FactorInputRow, value: number) {
  return row.pickedSide === "AWAY" ? -value : value;
}

function outcome(row: FactorInputRow) {
  return row.actualWinner === row.pickedSide ? 1 : 0;
}

function statusFor(sampleSize: number, correlationValue: number | null, warnings: string[]) {
  if (sampleSize < 100) return "INSUFFICIENT" as NbaWinnerBucketStatus;
  if (correlationValue != null && correlationValue < -0.05) return "RED" as NbaWinnerBucketStatus;
  if (warnings.length) return "YELLOW" as NbaWinnerBucketStatus;
  return "GREEN" as NbaWinnerBucketStatus;
}

function scoreFactor(rows: FactorInputRow[], factor: string): NbaWinnerFactorScore {
  const samples = rows
    .filter((row) => row.captureType === "GRADED" && row.actualWinner && row.pickedSide !== "PASS")
    .map((row) => {
      const value = factorValue(row, factor);
      return value == null ? null : { row, value: signedForPick(row, value), outcome: outcome(row) };
    })
    .filter((sample): sample is { row: FactorInputRow; value: number; outcome: 0 | 1 } => Boolean(sample));
  const positives = samples.filter((sample) => sample.value > 0);
  const negatives = samples.filter((sample) => sample.value < 0);
  const hitRateWhenPositive = positives.length ? positives.filter((sample) => sample.outcome === 1).length / positives.length : null;
  const hitRateWhenNegative = negatives.length ? negatives.filter((sample) => sample.outcome === 1).length / negatives.length : null;
  const correlationToResult = correlation(samples.map((sample) => sample.value), samples.map((sample) => sample.outcome));
  const avgAbsValue = average(samples.map((sample) => Math.abs(sample.value)));
  const warnings: string[] = [];
  if (samples.length < 100) warnings.push("sample under 100; do not learn weight automatically");
  if (correlationToResult != null && correlationToResult < 0) warnings.push("negative correlation to winning picks");
  if (hitRateWhenPositive != null && hitRateWhenNegative != null && hitRateWhenPositive < hitRateWhenNegative) warnings.push("positive side of factor underperforms negative side");
  const suggestedWeight = correlationToResult == null ? 0 : round(Math.max(-1, Math.min(1, correlationToResult * 3)), 4);
  return {
    factor,
    sampleSize: samples.length,
    hitRateWhenPositive: hitRateWhenPositive == null ? null : round(hitRateWhenPositive),
    hitRateWhenNegative: hitRateWhenNegative == null ? null : round(hitRateWhenNegative),
    avgAbsValue: avgAbsValue == null ? null : round(avgAbsValue),
    correlationToResult: correlationToResult == null ? null : round(correlationToResult),
    suggestedWeight,
    maxMarginContribution: round(Math.min(1, Math.max(0.15, Math.abs(suggestedWeight))), 3),
    status: statusFor(samples.length, correlationToResult, warnings),
    warnings
  };
}

export async function buildNbaWinnerFactorWeightReport(args: {
  rows: FactorInputRow[];
  limit?: number;
}): Promise<NbaWinnerFactorWeightReport> {
  const rows = args.rows.slice(0, Math.max(1, Math.min(args.limit ?? args.rows.length, 10000)));
  const factors = FACTORS.map((factor) => scoreFactor(rows, factor));
  const blockers: string[] = [];
  const warnings: string[] = [];
  const gradedCount = rows.filter((row) => row.captureType === "GRADED" && row.actualWinner && row.pickedSide !== "PASS").length;
  const redFactors = factors.filter((factor) => factor.status === "RED");
  const insufficientFactors = factors.filter((factor) => factor.status === "INSUFFICIENT");
  if (gradedCount < 100) warnings.push("overall graded pick sample under 100; report is directional only");
  if (redFactors.length) blockers.push(`${redFactors.length} factors are negatively correlated with results`);
  if (insufficientFactors.length) warnings.push(`${insufficientFactors.length} factors have insufficient sample`);
  const status: NbaWinnerBucketStatus = blockers.length
    ? "RED"
    : warnings.length
      ? "YELLOW"
      : "GREEN";
  return {
    modelVersion: "nba-winner-factor-weights-v1",
    generatedAt: new Date().toISOString(),
    status,
    sampleSize: gradedCount,
    factors,
    recommendedCaps: {
      singleFactorMarginPoints: 1,
      totalLearnedMarginPoints: 3,
      probabilityDeltaHardCap: 0.045
    },
    blockers,
    warnings
  };
}
