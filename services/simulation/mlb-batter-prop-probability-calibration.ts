import type { MlbPropSurfaceOutcome } from "@/services/simulation/mlb-batter-prop-surface";

export type MlbSettledBatterPropProbabilityRow = {
  market: MlbPropSurfaceOutcome["market"];
  line: number;
  side: MlbPropSurfaceOutcome["side"];
  modelProbability: number;
  won: boolean;
  confidence?: number | null;
  settledAt?: string | null;
};

export type MlbBatterPropProbabilityCalibrationBin = {
  key: string;
  market: MlbPropSurfaceOutcome["market"] | "ALL";
  line: number | null;
  side: MlbPropSurfaceOutcome["side"] | "ALL";
  probabilityMin: number;
  probabilityMax: number;
  sampleSize: number;
  averagePredicted: number;
  observedRate: number;
  probabilityOffset: number;
  brierScore: number;
  logLoss: number;
  reliability: number;
};

export type MlbBatterPropProbabilityCalibration = {
  modelVersion: "mlb-batter-probability-calibration-v1";
  sampleSize: number;
  brierScore: number;
  logLoss: number;
  globalObservedRate: number;
  globalAveragePredicted: number;
  globalProbabilityOffset: number;
  bins: MlbBatterPropProbabilityCalibrationBin[];
  warnings: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function brier(rows: MlbSettledBatterPropProbabilityRow[]) {
  return mean(rows.map((row) => Math.pow(clamp(row.modelProbability, 0.01, 0.99) - (row.won ? 1 : 0), 2)));
}

function logLoss(rows: MlbSettledBatterPropProbabilityRow[]) {
  return mean(rows.map((row) => {
    const p = clamp(row.modelProbability, 0.01, 0.99);
    return row.won ? -Math.log(p) : -Math.log(1 - p);
  }));
}

function probabilityBin(probability: number) {
  const p = clamp(probability, 0.01, 0.99);
  const min = Math.floor(p * 10) / 10;
  const safeMin = clamp(min, 0, 0.9);
  return { min: safeMin, max: safeMin + 0.1 };
}

function keyFor(row: Pick<MlbSettledBatterPropProbabilityRow, "market" | "line" | "side" | "modelProbability">) {
  const bin = probabilityBin(row.modelProbability);
  return `${row.market}:${row.line}:${row.side}:${bin.min.toFixed(1)}-${bin.max.toFixed(1)}`;
}

function fallbackKeyFor(outcome: Pick<MlbPropSurfaceOutcome, "market" | "line" | "side" | "probability">) {
  const bin = probabilityBin(outcome.probability);
  return `${outcome.market}:${outcome.line}:${outcome.side}:${bin.min.toFixed(1)}-${bin.max.toFixed(1)}`;
}

function buildBin(key: string, rows: MlbSettledBatterPropProbabilityRow[], minSample: number): MlbBatterPropProbabilityCalibrationBin {
  const [market, rawLine, side, range] = key.split(":");
  const [rawMin, rawMax] = range.split("-");
  const sampleSize = rows.length;
  const averagePredicted = mean(rows.map((row) => clamp(row.modelProbability, 0.01, 0.99)));
  const observedRate = mean(rows.map((row) => row.won ? 1 : 0));
  const shrink = clamp(sampleSize / Math.max(minSample, sampleSize), 0.18, 1);
  const probabilityOffset = (observedRate - averagePredicted) * shrink;
  const reliability = clamp(sampleSize / Math.max(minSample, sampleSize), 0, 1);
  return {
    key,
    market: market as MlbBatterPropProbabilityCalibrationBin["market"],
    line: Number.isFinite(Number(rawLine)) ? Number(rawLine) : null,
    side: side as MlbBatterPropProbabilityCalibrationBin["side"],
    probabilityMin: round(Number(rawMin), 2),
    probabilityMax: round(Number(rawMax), 2),
    sampleSize,
    averagePredicted: round(averagePredicted, 4),
    observedRate: round(observedRate, 4),
    probabilityOffset: round(probabilityOffset, 4),
    brierScore: round(brier(rows), 4),
    logLoss: round(logLoss(rows), 4),
    reliability: round(reliability, 3)
  };
}

export function buildMlbBatterPropProbabilityCalibration(args: {
  rows: MlbSettledBatterPropProbabilityRow[];
  minBinSample?: number;
}): MlbBatterPropProbabilityCalibration {
  const minBinSample = args.minBinSample ?? 25;
  const validRows = args.rows.filter((row) =>
    ["HITS", "TOTAL_BASES", "HOME_RUN", "WALKS", "STRIKEOUTS"].includes(row.market) &&
    ["OVER", "UNDER"].includes(row.side) &&
    Number.isFinite(row.line) &&
    Number.isFinite(row.modelProbability)
  );
  const warnings: string[] = [];
  if (validRows.length !== args.rows.length) warnings.push(`${args.rows.length - validRows.length} calibration row(s) rejected.`);
  if (!validRows.length) warnings.push("No valid settled batter prop probability rows supplied.");

  const buckets = new Map<string, MlbSettledBatterPropProbabilityRow[]>();
  for (const row of validRows) {
    const key = keyFor(row);
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }

  const bins = [...buckets.entries()]
    .map(([key, rows]) => buildBin(key, rows, minBinSample))
    .sort((a, b) => b.sampleSize - a.sampleSize || a.key.localeCompare(b.key));

  const globalAveragePredicted = mean(validRows.map((row) => clamp(row.modelProbability, 0.01, 0.99)));
  const globalObservedRate = mean(validRows.map((row) => row.won ? 1 : 0));
  const globalShrink = clamp(validRows.length / Math.max(150, validRows.length), 0.1, 1);
  const globalProbabilityOffset = (globalObservedRate - globalAveragePredicted) * globalShrink;

  return {
    modelVersion: "mlb-batter-probability-calibration-v1",
    sampleSize: validRows.length,
    brierScore: round(brier(validRows), 4),
    logLoss: round(logLoss(validRows), 4),
    globalObservedRate: round(globalObservedRate, 4),
    globalAveragePredicted: round(globalAveragePredicted, 4),
    globalProbabilityOffset: round(globalProbabilityOffset, 4),
    bins,
    warnings
  };
}

export function applyMlbBatterPropProbabilityCalibration(args: {
  outcome: MlbPropSurfaceOutcome;
  calibration?: MlbBatterPropProbabilityCalibration | null;
}): MlbPropSurfaceOutcome & {
  rawProbability: number;
  calibrationApplied: boolean;
  calibrationSampleSize: number;
  calibrationReliability: number;
} {
  const rawProbability = clamp(args.outcome.probability, 0.01, 0.99);
  const calibration = args.calibration;
  if (!calibration || calibration.sampleSize <= 0) {
    return {
      ...args.outcome,
      rawProbability: round(rawProbability, 4),
      calibrationApplied: false,
      calibrationSampleSize: 0,
      calibrationReliability: 0
    };
  }
  const key = fallbackKeyFor(args.outcome);
  const exactBin = calibration.bins.find((bin) => bin.key === key);
  const marketBin = exactBin ?? calibration.bins
    .filter((bin) => bin.market === args.outcome.market && bin.side === args.outcome.side && bin.probabilityMin <= rawProbability && rawProbability < bin.probabilityMax)
    .sort((a, b) => b.sampleSize - a.sampleSize)[0];
  const offset = marketBin ? marketBin.probabilityOffset : calibration.globalProbabilityOffset;
  const reliability = marketBin ? marketBin.reliability : clamp(calibration.sampleSize / 300, 0.05, 0.55);
  const adjusted = clamp(rawProbability + offset, 0.01, 0.99);
  const fairAmerican = adjusted >= 0.5 ? Math.round((-100 * adjusted) / (1 - adjusted)) : Math.round((100 * (1 - adjusted)) / adjusted);
  return {
    ...args.outcome,
    probability: round(adjusted, 4),
    fairAmerican,
    confidence: round(clamp(args.outcome.confidence * (0.96 + reliability * 0.08), 0.2, 0.96), 3),
    rawProbability: round(rawProbability, 4),
    calibrationApplied: true,
    calibrationSampleSize: marketBin?.sampleSize ?? calibration.sampleSize,
    calibrationReliability: round(reliability, 3)
  };
}
