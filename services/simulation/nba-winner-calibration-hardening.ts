import type { NbaWinnerAdvancedBucket } from "@/services/simulation/nba-winner-calibration-metrics";

export type NbaWinnerHardeningStatus = "PROVEN" | "WATCH" | "PASS";

export type NbaWinnerHardeningDecision = {
  status: NbaWinnerHardeningStatus;
  shouldPass: boolean;
  shouldBlockStrongBet: boolean;
  wilsonLowerHitRate: number | null;
  marketEdgeLowerBound: number | null;
  shrinkageFactor: number;
  recommendedMaxModelDeltaPct: number;
  proofScore: number;
  blockers: string[];
  warnings: string[];
  drivers: string[];
};

function round(value: number, digits = 6) {
  return Number(value.toFixed(digits));
}

export function wilsonLowerBound(successes: number, trials: number, z = 1.96) {
  if (!Number.isFinite(successes) || !Number.isFinite(trials) || trials <= 0) return null;
  const n = Math.max(0, Math.floor(trials));
  const k = Math.max(0, Math.min(n, Math.round(successes)));
  if (!n) return null;
  const phat = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n);
  return round(Math.max(0, Math.min(1, (center - margin) / denom)));
}

function approximateSuccesses(bucket: NbaWinnerAdvancedBucket) {
  if (typeof bucket.hitRate !== "number") return 0;
  return Math.round(bucket.hitRate * bucket.sampleSize);
}

function shrinkageFactor(sampleSize: number) {
  // Heavy shrinkage until the bucket has enough graded rows to prove stability.
  return round(Math.max(0, Math.min(1, sampleSize / (sampleSize + 400))));
}

function recommendedMaxModelDeltaPct(bucket: NbaWinnerAdvancedBucket | null, shrink: number) {
  if (!bucket) return 0;
  const edge = Math.max(0, bucket.avgModelMarketEdge ?? 0);
  const clv = Math.max(0, bucket.avgClvPct ?? 0);
  const brier = Math.max(0, bucket.brierEdge ?? 0);
  const logLoss = Math.max(0, bucket.logLossEdge ?? 0);
  const rawCap = edge * 0.6 + clv * 0.8 + brier * 0.35 + logLoss * 0.15;
  return round(Math.min(0.04, Math.max(0.005, rawCap * shrink)), 4);
}

function proofScore(bucket: NbaWinnerAdvancedBucket | null, wilsonEdge: number | null) {
  if (!bucket || !bucket.sampleSize) return 0;
  const sampleScore = Math.min(1, bucket.sampleSize / 350);
  const clvScore = Math.max(0, Math.min(1, ((bucket.avgClvPct ?? -0.01) + 0.005) / 0.02));
  const brierScore = Math.max(0, Math.min(1, ((bucket.brierEdge ?? -0.01) + 0.0025) / 0.015));
  const logLossScore = Math.max(0, Math.min(1, ((bucket.logLossEdge ?? -0.01) + 0.0025) / 0.02));
  const calibrationScore = Math.max(0, Math.min(1, 1 - ((bucket.calibrationError ?? 0.1) / 0.05)));
  const wilsonScore = wilsonEdge == null ? 0 : Math.max(0, Math.min(1, (wilsonEdge + 0.005) / 0.03));
  return round((sampleScore * 0.25) + (clvScore * 0.2) + (brierScore * 0.15) + (logLossScore * 0.15) + (calibrationScore * 0.15) + (wilsonScore * 0.1), 4);
}

export function hardenNbaWinnerBucket(bucket: NbaWinnerAdvancedBucket | null): NbaWinnerHardeningDecision {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const drivers: string[] = [];

  if (!bucket) {
    return {
      status: "PASS",
      shouldPass: true,
      shouldBlockStrongBet: true,
      wilsonLowerHitRate: null,
      marketEdgeLowerBound: null,
      shrinkageFactor: 0,
      recommendedMaxModelDeltaPct: 0,
      proofScore: 0,
      blockers: ["NBA winner bucket missing"],
      warnings,
      drivers: ["No bucket data means no proven winner edge."]
    };
  }

  const successes = approximateSuccesses(bucket);
  const wilsonLowerHitRate = wilsonLowerBound(successes, bucket.sampleSize);
  const marketEdgeLowerBound = wilsonLowerHitRate == null || bucket.marketExpectedHitRate == null
    ? null
    : round(wilsonLowerHitRate - bucket.marketExpectedHitRate);
  const shrink = shrinkageFactor(bucket.sampleSize);
  const maxDelta = recommendedMaxModelDeltaPct(bucket, shrink);
  const score = proofScore(bucket, marketEdgeLowerBound);

  if (bucket.sampleSize < 100) blockers.push("bucket sample under 100");
  if (bucket.sampleSize < 250) warnings.push("bucket sample under 250; strong action blocked");
  if (bucket.status === "RED") blockers.push("advanced bucket status RED");
  if (bucket.status === "INSUFFICIENT") blockers.push("advanced bucket status INSUFFICIENT");
  if ((bucket.avgClvPct ?? -1) <= 0) blockers.push("average CLV is not positive");
  if ((bucket.clvBeatRate ?? 0) < 0.52) blockers.push("CLV beat rate below 52%");
  if ((bucket.brierEdge ?? -1) <= 0) blockers.push("Brier edge does not beat market");
  if ((bucket.logLossEdge ?? -1) <= 0) blockers.push("log-loss edge does not beat market");
  if ((bucket.roi ?? -1) <= 0) warnings.push("ROI is not positive");
  if ((bucket.calibrationError ?? 1) > 0.025) blockers.push("calibration error above 2.5%");
  if (marketEdgeLowerBound == null) warnings.push("Wilson lower-bound edge unavailable");
  if (marketEdgeLowerBound != null && marketEdgeLowerBound <= 0) blockers.push("Wilson lower-bound hit rate does not clear market baseline");
  if (score < 0.62) warnings.push("proof score below 0.62");

  drivers.push(`Wilson lower hit rate: ${wilsonLowerHitRate == null ? "n/a" : `${(wilsonLowerHitRate * 100).toFixed(1)}%`}`);
  drivers.push(`Wilson market edge lower bound: ${marketEdgeLowerBound == null ? "n/a" : `${(marketEdgeLowerBound * 100).toFixed(1)}%`}`);
  drivers.push(`Shrinkage factor: ${(shrink * 100).toFixed(1)}%`);
  drivers.push(`Recommended max model delta: ${(maxDelta * 100).toFixed(1)}%`);
  drivers.push(`Proof score: ${score.toFixed(2)}`);

  const status: NbaWinnerHardeningStatus = blockers.length
    ? "PASS"
    : bucket.sampleSize >= 250 && score >= 0.72 && warnings.length === 0
      ? "PROVEN"
      : "WATCH";

  return {
    status,
    shouldPass: status === "PASS",
    shouldBlockStrongBet: status !== "PROVEN",
    wilsonLowerHitRate,
    marketEdgeLowerBound,
    shrinkageFactor: shrink,
    recommendedMaxModelDeltaPct: maxDelta,
    proofScore: score,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    drivers
  };
}
