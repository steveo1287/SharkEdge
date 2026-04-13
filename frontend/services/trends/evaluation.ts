function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampProb(value: number) {
  return clamp(value, 0.0001, 0.9999);
}

export function computeBrierScore(rows: Array<{ predicted: number; actual: 0 | 1 }>): number | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  let sum = 0;
  let count = 0;
  for (const row of rows) {
    if (typeof row?.predicted !== "number" || !Number.isFinite(row.predicted)) continue;
    const p = clampProb(row.predicted);
    const a = row.actual === 1 ? 1 : 0;
    sum += (p - a) * (p - a);
    count += 1;
  }

  if (count === 0) return null;
  return sum / count;
}

export function computeReliabilityBuckets(
  rows: Array<{ predicted: number; actual: 0 | 1 }>,
  bucketCount: number = 10
): Array<{ predictedMean: number; actualMean: number; count: number }> {
  const buckets = Array.from({ length: Math.max(2, Math.min(20, Math.floor(bucketCount))) }, () => ({
    predictedSum: 0,
    actualSum: 0,
    count: 0
  }));

  for (const row of rows) {
    if (typeof row?.predicted !== "number" || !Number.isFinite(row.predicted)) continue;
    const p = clampProb(row.predicted);
    const idx = Math.min(buckets.length - 1, Math.floor(p * buckets.length));
    buckets[idx].predictedSum += p;
    buckets[idx].actualSum += row.actual === 1 ? 1 : 0;
    buckets[idx].count += 1;
  }

  return buckets
    .filter((bucket) => bucket.count > 0)
    .map((bucket) => ({
      predictedMean: bucket.predictedSum / bucket.count,
      actualMean: bucket.actualSum / bucket.count,
      count: bucket.count
    }));
}

export function computeCalibrationError(
  rows: Array<{ predicted: number; actual: 0 | 1 }>,
  bucketCount: number = 10
): number | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const buckets = computeReliabilityBuckets(rows, bucketCount);
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  if (total <= 0) return null;

  let weightedAbs = 0;
  for (const bucket of buckets) {
    weightedAbs += Math.abs(bucket.predictedMean - bucket.actualMean) * (bucket.count / total);
  }

  return weightedAbs;
}

export function computeRollingStabilityScore(values: number[]): number {
  if (!Array.isArray(values) || values.length < 6) return 35;

  // Compute rolling mean over a small window, then penalize volatility of those means.
  const window = Math.max(5, Math.min(20, Math.floor(values.length / 4)));
  const rolling: number[] = [];

  for (let i = 0; i + window <= values.length; i += 1) {
    let sum = 0;
    let count = 0;
    for (let j = i; j < i + window; j += 1) {
      const v = values[j];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      sum += v;
      count += 1;
    }
    if (count > 0) rolling.push(sum / count);
  }

  if (rolling.length < 2) return 45;
  const mean = rolling.reduce((s, v) => s + v, 0) / rolling.length;
  const variance = rolling.reduce((s, v) => s + (v - mean) * (v - mean), 0) / rolling.length;
  const std = Math.sqrt(Math.max(0, variance));

  // std=0 -> 100, std~0.25 -> ~0. Map conservatively.
  const score = 100 - clamp(std * 320, 0, 85);
  return Math.round(clamp(score, 0, 100));
}

