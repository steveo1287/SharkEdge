import { getSimModelScorecard, type MarketScorecard, type ScorecardFilters } from "@/services/sim/model-scorecard";

export type ModelEdgeGrade = "ELITE" | "STRONG" | "STABLE" | "WATCH" | "SUPPRESS" | "INSUFFICIENT_SAMPLE";
export type ModelEdgeAction = "PROMOTE" | "KEEP_PRIMARY" | "MONITOR" | "SUPPRESS" | "COLLECT_SAMPLE";
export type ModelEdgeFlag =
  | "sample-too-small"
  | "market-proof-positive"
  | "market-proof-negative"
  | "well-calibrated"
  | "overconfident"
  | "weak-brier"
  | "weak-log-loss"
  | "high-pending-volume";

export type ModelEdgeLabRow = {
  id: string;
  league: string;
  market: string;
  modelVersion: string;
  settledCount: number;
  predictionCount: number;
  pendingCount: number;
  benchmarkScore: number;
  grade: ModelEdgeGrade;
  recommendedAction: ModelEdgeAction;
  brierScoreAvg: number | null;
  logLossAvg: number | null;
  spreadMae: number | null;
  totalMae: number | null;
  clvAvgPct: number | null;
  calibrationErrorAvg: number | null;
  winRate: number | null;
  sampleWarning: string | null;
  flags: ModelEdgeFlag[];
  strengths: string[];
  weaknesses: string[];
  nextActions: string[];
  summary: string;
};

export type SimModelEdgeLab = {
  ok: boolean;
  databaseReady: boolean;
  generatedAt: string;
  filters: {
    league: string;
    market: string;
    modelVersion: string;
    windowDays: number;
  };
  totals: {
    candidateCount: number;
    promotableCount: number;
    suppressCount: number;
    insufficientSampleCount: number;
    averageBenchmarkScore: number | null;
  };
  champion: ModelEdgeLabRow | null;
  challengers: ModelEdgeLabRow[];
  suppressions: ModelEdgeLabRow[];
  rows: ModelEdgeLabRow[];
  error?: string;
};

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function metricScore(value: number | null | undefined, good: number, poor: number, weight: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value <= good) return weight;
  if (value >= poor) return 0;
  return ((poor - value) / (poor - good)) * weight;
}

function positiveMetricScore(value: number | null | undefined, poor: number, good: number, weight: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value >= good) return weight;
  if (value <= poor) return 0;
  return ((value - poor) / (good - poor)) * weight;
}

function average(values: number[]) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (!usable.length) return null;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function flagsFor(card: MarketScorecard): ModelEdgeFlag[] {
  const flags: ModelEdgeFlag[] = [];
  if (card.settledCount < 30) flags.push("sample-too-small");
  if ((card.clvAvgPct ?? 0) > 0.25) flags.push("market-proof-positive");
  if ((card.clvAvgPct ?? 0) < -0.5) flags.push("market-proof-negative");
  if ((card.calibrationErrorAvg ?? 1) <= 0.04 && card.settledCount >= 30) flags.push("well-calibrated");
  if ((card.calibrationErrorAvg ?? 0) >= 0.08 || (card.logLossAvg ?? 0) >= 0.75) flags.push("overconfident");
  if ((card.brierScoreAvg ?? 0) >= 0.28) flags.push("weak-brier");
  if ((card.logLossAvg ?? 0) >= 0.8) flags.push("weak-log-loss");
  if (card.pendingCount > card.settledCount && card.predictionCount > 20) flags.push("high-pending-volume");
  return flags;
}

function benchmarkScore(card: MarketScorecard) {
  if (card.settledCount < 10) return 0;

  const sampleScore = Math.min(15, Math.log10(Math.max(1, card.settledCount)) * 7);
  const brier = metricScore(card.brierScoreAvg, 0.2, 0.3, 25);
  const logLoss = metricScore(card.logLossAvg, 0.58, 0.8, 15);
  const calibration = metricScore(card.calibrationErrorAvg, 0.03, 0.12, 20);
  const clv = positiveMetricScore(card.clvAvgPct, -1, 1.5, 15);
  const winRate = positiveMetricScore(card.winRate, 0.45, 0.57, 10);
  const pendingPenalty = card.pendingCount > card.settledCount ? 5 : 0;

  return Math.round(clamp(sampleScore + brier + logLoss + calibration + clv + winRate - pendingPenalty));
}

function gradeFor(score: number, card: MarketScorecard): ModelEdgeGrade {
  if (card.settledCount < 30) return "INSUFFICIENT_SAMPLE";
  if (score >= 85) return "ELITE";
  if (score >= 72) return "STRONG";
  if (score >= 58) return "STABLE";
  if (score >= 42) return "WATCH";
  return "SUPPRESS";
}

function actionFor(grade: ModelEdgeGrade, flags: ModelEdgeFlag[]): ModelEdgeAction {
  if (grade === "INSUFFICIENT_SAMPLE") return "COLLECT_SAMPLE";
  if (grade === "ELITE" || grade === "STRONG") return "PROMOTE";
  if (grade === "STABLE") return "KEEP_PRIMARY";
  if (grade === "SUPPRESS" || flags.includes("market-proof-negative") || flags.includes("weak-brier")) return "SUPPRESS";
  return "MONITOR";
}

function strengthsFor(card: MarketScorecard, flags: ModelEdgeFlag[]) {
  const strengths: string[] = [];
  if (flags.includes("market-proof-positive")) strengths.push("Positive CLV versus the closing market.");
  if (flags.includes("well-calibrated")) strengths.push("Calibration buckets are close to actual hit rate.");
  if ((card.brierScoreAvg ?? 1) <= 0.2) strengths.push("Brier score is in a strong range.");
  if ((card.logLossAvg ?? 1) <= 0.58) strengths.push("Log loss shows limited overconfidence.");
  if ((card.winRate ?? 0) >= 0.55) strengths.push("Straight-up result rate is positive after pushes are excluded.");
  return strengths.length ? strengths : ["No durable strength identified yet; keep collecting settled rows."];
}

function weaknessesFor(card: MarketScorecard, flags: ModelEdgeFlag[]) {
  const weaknesses: string[] = [];
  if (flags.includes("sample-too-small")) weaknesses.push("Settled sample is too small for hard promotion.");
  if (flags.includes("market-proof-negative")) weaknesses.push("Average CLV is negative versus the closing market.");
  if (flags.includes("overconfident")) weaknesses.push("Calibration/log-loss profile suggests overconfidence.");
  if (flags.includes("weak-brier")) weaknesses.push("Brier score is weak for a probability model.");
  if (flags.includes("high-pending-volume")) weaknesses.push("Pending volume is high; current score can move after grading.");
  return weaknesses.length ? weaknesses : ["No major blocker detected in the current window."];
}

function nextActionsFor(action: ModelEdgeAction, card: MarketScorecard, flags: ModelEdgeFlag[]) {
  if (action === "PROMOTE") {
    return [
      "Promote this league/market/model version as a primary sim signal.",
      "Increase monitoring for price drift and keep CLV tracking active.",
      "Use this model as the benchmark challenger for related markets."
    ];
  }

  if (action === "KEEP_PRIMARY") {
    return [
      "Keep this model active, but do not increase exposure without stronger CLV.",
      "Audit buckets with the largest calibration error.",
      "Compare against a no-vig market baseline before further promotion."
    ];
  }

  if (action === "SUPPRESS") {
    return [
      "Suppress this model from top-level recommendations until calibration improves.",
      "Inspect stale inputs, injury/lineup flags, and market freshness.",
      "Recalibrate probability shrinkage toward the no-vig market baseline."
    ];
  }

  if (action === "COLLECT_SAMPLE") {
    return [
      `Collect at least ${Math.max(0, 30 - card.settledCount)} more settled predictions before ranking this model.`,
      "Keep predictions in audit mode only.",
      "Do not promote this model from a small sample."
    ];
  }

  if (flags.includes("overconfident")) {
    return [
      "Reduce model confidence or add probability shrinkage.",
      "Audit the highest-probability buckets first.",
      "Compare pregame model probability to the no-vig close."
    ];
  }

  return [
    "Monitor until sample, CLV, or calibration improves.",
    "Keep this model below promoted markets.",
    "Prioritize data-quality fixes before UI promotion."
  ];
}

function summaryFor(row: Pick<ModelEdgeLabRow, "grade" | "recommendedAction" | "benchmarkScore" | "league" | "market" | "modelVersion">) {
  return `${row.league} ${row.market} ${row.modelVersion}: ${row.grade} · ${row.recommendedAction} · benchmark ${row.benchmarkScore}/100`;
}

function buildRow(card: MarketScorecard): ModelEdgeLabRow {
  const flags = flagsFor(card);
  const score = benchmarkScore(card);
  const grade = gradeFor(score, card);
  const recommendedAction = actionFor(grade, flags);
  const base = {
    id: `${card.league}:${card.market}:${card.modelVersion}`,
    league: card.league,
    market: card.market,
    modelVersion: card.modelVersion,
    settledCount: card.settledCount,
    predictionCount: card.predictionCount,
    pendingCount: card.pendingCount,
    benchmarkScore: score,
    grade,
    recommendedAction,
    brierScoreAvg: card.brierScoreAvg,
    logLossAvg: card.logLossAvg,
    spreadMae: card.spreadMae,
    totalMae: card.totalMae,
    clvAvgPct: card.clvAvgPct,
    calibrationErrorAvg: card.calibrationErrorAvg,
    winRate: card.winRate,
    sampleWarning: card.sampleWarning,
    flags,
    strengths: strengthsFor(card, flags),
    weaknesses: weaknessesFor(card, flags),
    nextActions: nextActionsFor(recommendedAction, card, flags),
    summary: ""
  } satisfies Omit<ModelEdgeLabRow, "summary"> & { summary: string };

  return {
    ...base,
    summary: summaryFor(base)
  };
}

export async function getSimModelEdgeLab(filters: ScorecardFilters = {}): Promise<SimModelEdgeLab> {
  const scorecard = await getSimModelScorecard(filters);
  if (!scorecard.ok) {
    return {
      ok: false,
      databaseReady: scorecard.databaseReady,
      generatedAt: scorecard.generatedAt,
      filters: scorecard.filters,
      totals: {
        candidateCount: 0,
        promotableCount: 0,
        suppressCount: 0,
        insufficientSampleCount: 0,
        averageBenchmarkScore: null
      },
      champion: null,
      challengers: [],
      suppressions: [],
      rows: [],
      error: scorecard.error
    };
  }

  const rows = scorecard.scorecards.map(buildRow).sort((left, right) => right.benchmarkScore - left.benchmarkScore || right.settledCount - left.settledCount);
  const champion = rows.find((row) => row.recommendedAction === "PROMOTE" || row.recommendedAction === "KEEP_PRIMARY") ?? rows[0] ?? null;
  const challengers = rows.filter((row) => row.recommendedAction === "PROMOTE" || row.recommendedAction === "KEEP_PRIMARY").slice(0, 8);
  const suppressions = rows.filter((row) => row.recommendedAction === "SUPPRESS").slice(0, 8);

  return {
    ok: true,
    databaseReady: true,
    generatedAt: new Date().toISOString(),
    filters: scorecard.filters,
    totals: {
      candidateCount: rows.length,
      promotableCount: rows.filter((row) => row.recommendedAction === "PROMOTE").length,
      suppressCount: rows.filter((row) => row.recommendedAction === "SUPPRESS").length,
      insufficientSampleCount: rows.filter((row) => row.grade === "INSUFFICIENT_SAMPLE").length,
      averageBenchmarkScore: round(average(rows.map((row) => row.benchmarkScore)), 1)
    },
    champion,
    challengers,
    suppressions,
    rows
  };
}
