import { getMlbV8PromotionReport, type MlbV8PromotionReport } from "@/services/simulation/mlb-v8-promotion-comparator";

export type MlbV8GateMode = "broad_promotion" | "bucket_promotion" | "shadow_only" | "blocked";

export type MlbV8PromotionGate = {
  ok: boolean;
  generatedAt: string;
  windowDays: number;
  modelVersion: string;
  mode: MlbV8GateMode;
  sourceStatus: MlbV8PromotionReport["status"];
  allowOfficialV8Promotion: boolean;
  allowAttackPicks: boolean;
  allowWatchPicks: boolean;
  requireShadowCapture: boolean;
  allowedBuckets: {
    confidence: string[];
    lift: string[];
    playerImpact: string[];
  };
  hardRules: string[];
  blockers: string[];
  warnings: string[];
  recommendations: string[];
  report: MlbV8PromotionReport;
};

function hasPositiveLift(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function bucketNames<T extends { bucket: string; count: number; v8EdgeVsBaseline: number | null; finalEdgeVsBaseline: number | null }>(
  rows: T[],
  minimumRows: number
) {
  return rows
    .filter((row) => row.count >= minimumRows)
    .filter((row) => hasPositiveLift(row.v8EdgeVsBaseline) || hasPositiveLift(row.finalEdgeVsBaseline))
    .map((row) => row.bucket);
}

function gateMode(report: MlbV8PromotionReport, allowedConfidenceBuckets: string[], allowedLiftBuckets: string[]) {
  if (report.status === "PROMOTE") return "broad_promotion" as const;
  if (report.status === "SHADOW" && (allowedConfidenceBuckets.length || allowedLiftBuckets.length)) return "bucket_promotion" as const;
  if (report.status === "INSUFFICIENT_DATA") return "shadow_only" as const;
  return "blocked" as const;
}

function hardRules(mode: MlbV8GateMode) {
  const rules = [
    "Never count pending rows toward V8 promotion.",
    "Never promote V8 broadly unless settled official rows clear the promotion comparator.",
    "Keep V7/V6 historical rows intact; V8 promotion is a gate, not a rewrite.",
    "Use bucket promotion only where settled rows show positive Brier lift."
  ];

  if (mode === "blocked") rules.push("Block V8 official-pick promotion until hard blockers clear.");
  if (mode === "shadow_only") rules.push("Keep V8 in shadow capture only until sample size is sufficient.");
  if (mode === "bucket_promotion") rules.push("Allow V8 only in explicitly listed positive-lift buckets.");
  if (mode === "broad_promotion") rules.push("Broad promotion is allowed, but continue monitoring CLV and market comparison.");

  return rules;
}

export async function getMlbV8PromotionGate(windowDays = 180): Promise<MlbV8PromotionGate> {
  const report = await getMlbV8PromotionReport(windowDays);
  const confidenceBuckets = bucketNames(report.buckets.confidence, 20);
  const liftBuckets = bucketNames(report.buckets.lift, 20);
  const playerImpactBuckets = bucketNames(report.buckets.playerImpact, 20).filter((bucket) => bucket !== "player_impact_missing");
  const mode = gateMode(report, confidenceBuckets, liftBuckets);

  return {
    ok: report.ok,
    generatedAt: new Date().toISOString(),
    windowDays: report.windowDays,
    modelVersion: report.modelVersion,
    mode,
    sourceStatus: report.status,
    allowOfficialV8Promotion: mode === "broad_promotion" || mode === "bucket_promotion",
    allowAttackPicks: mode === "broad_promotion",
    allowWatchPicks: mode === "broad_promotion" || mode === "bucket_promotion",
    requireShadowCapture: mode !== "broad_promotion",
    allowedBuckets: {
      confidence: mode === "broad_promotion" ? ["all"] : confidenceBuckets,
      lift: mode === "broad_promotion" ? ["all"] : liftBuckets,
      playerImpact: mode === "broad_promotion" ? ["all"] : playerImpactBuckets
    },
    hardRules: hardRules(mode),
    blockers: report.blockers,
    warnings: report.warnings,
    recommendations: report.recommendations,
    report
  };
}
