import type { MlbCalibrationBucket, MlbCalibrationMetricSet } from "@/services/simulation/mlb-v8-calibration-lab";

export type MlbCalibrationRecommendationInput = {
  officialPicks: MlbCalibrationMetricSet;
  candidatePicks: MlbCalibrationMetricSet;
  snapshots: MlbCalibrationMetricSet;
  probabilityBuckets: MlbCalibrationBucket[];
  edgeBuckets: MlbCalibrationBucket[];
  playerImpactBuckets: MlbCalibrationBucket[];
  clvBuckets: MlbCalibrationBucket[];
};

function pct(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "unknown";
}

function bucketName(bucket: MlbCalibrationBucket) {
  return bucket.bucket.replace(/_/g, " ");
}

function weakBucket(bucket: MlbCalibrationBucket) {
  if (bucket.count < 30) return false;
  if (bucket.marketBrier != null && bucket.brier != null && bucket.marketBrier - bucket.brier < 0) return true;
  if (bucket.winRate != null && bucket.avgProbability != null && bucket.winRate + 0.04 < bucket.avgProbability) return true;
  return false;
}

function strongBucket(bucket: MlbCalibrationBucket) {
  if (bucket.count < 30) return false;
  if (bucket.marketBrier != null && bucket.brier != null && bucket.marketBrier - bucket.brier > 0.01) return true;
  if (bucket.winRate != null && bucket.avgProbability != null && bucket.winRate >= bucket.avgProbability) return true;
  return false;
}

export function buildMlbCalibrationRecommendations(input: MlbCalibrationRecommendationInput): string[] {
  const recommendations: string[] = [];

  if (input.officialPicks.count === 0) {
    recommendations.push("No official MLB picks are settled yet; use candidate ledger results before tuning model weights or promoting V8 broadly.");
  }

  if (input.candidatePicks.count > 0 && input.candidatePicks.count < 50) {
    recommendations.push(`Candidate ledger has only ${input.candidatePicks.count} settled rows; keep ATTACK/PLAY promotion conservative until 50+ settle.`);
  }

  if (input.snapshots.count >= 100 && input.snapshots.brierEdgeVsMarket != null && input.snapshots.brierEdgeVsMarket > 0) {
    recommendations.push(`Snapshot model is beating market Brier by ${input.snapshots.brierEdgeVsMarket.toFixed(4)}; prioritize settling stale snapshots and harvesting candidate picks over formula rewrites.`);
  }

  for (const bucket of input.probabilityBuckets.filter(weakBucket).slice(0, 3)) {
    recommendations.push(`Downgrade ${bucketName(bucket)} probability bucket: win rate ${pct(bucket.winRate)} trails average probability ${pct(bucket.avgProbability)} or market Brier is better.`);
  }

  for (const bucket of input.probabilityBuckets.filter(strongBucket).slice(0, 3)) {
    recommendations.push(`Promote/watch ${bucketName(bucket)} probability bucket: sample ${bucket.count}, win rate ${pct(bucket.winRate)}, Brier ${bucket.brier ?? "n/a"}.`);
  }

  const impactApplied = input.playerImpactBuckets.find((bucket) => bucket.bucket === "applied");
  const impactMissing = input.playerImpactBuckets.find((bucket) => bucket.bucket === "missing" || bucket.bucket === "skipped");
  if (impactApplied && impactMissing && impactApplied.count >= 30 && impactMissing.count >= 30 && (impactApplied.brier ?? 1) < (impactMissing.brier ?? 0)) {
    recommendations.push("Player-impact applied rows are outperforming missing/skipped rows; require player impact for ATTACK until proven otherwise.");
  }

  const clvNegative = input.clvBuckets.find((bucket) => bucket.bucket === "CLV < -2%" || bucket.bucket === "-2% to 0%");
  if (clvNegative && clvNegative.count >= 30 && (clvNegative.roi ?? 0) < 0) {
    recommendations.push("CLV-negative candidates are losing money; downgrade them to WATCH unless other buckets strongly override.");
  }

  if (!recommendations.length) {
    recommendations.push("No strong calibration recommendation yet; keep collecting settled rows and avoid weight changes until bucket samples reach 30+.");
  }

  return recommendations;
}
