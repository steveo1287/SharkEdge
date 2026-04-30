import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { TrendFilters } from "@/lib/types/domain";

export type TrendPerformanceMetrics = {
  gradedCount: number;
  winRate: number | null;
  brier: number | null;
  avgConfidence: number | null;
  calibrationEdge: number | null;
  performanceScore: number | null;
};

const EMPTY: TrendPerformanceMetrics = {
  gradedCount: 0,
  winRate: null,
  brier: null,
  avgConfidence: null,
  calibrationEdge: null,
  performanceScore: null
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function score(args: { gradedCount: number; winRate: number | null; brier: number | null; avgConfidence: number | null }) {
  if (!args.gradedCount) return null;
  const sample = clamp(args.gradedCount / 180, 0.12, 1);
  const win = typeof args.winRate === "number" ? (args.winRate - 0.5) * 360 : 0;
  const brier = typeof args.brier === "number" ? (0.25 - args.brier) * 420 : 0;
  const confidencePenalty = typeof args.avgConfidence === "number" && typeof args.winRate === "number"
    ? clamp((args.avgConfidence - args.winRate) * 120, -18, 36)
    : 0;
  return round(clamp((win + brier - confidencePenalty) * sample, -120, 180), 2);
}

export async function getTrendPerformanceMetrics(filters: TrendFilters): Promise<TrendPerformanceMetrics> {
  if (!hasUsableServerDatabaseUrl()) return EMPTY;
  const league = filters.league !== "ALL" ? filters.league : null;

  try {
    const where = league ? `WHERE graded_at IS NOT NULL AND league = $1` : `WHERE graded_at IS NOT NULL`;
    const params = league ? [league] : [];
    const rows = await prisma.$queryRawUnsafe<Array<{
      graded: bigint;
      wins: bigint;
      losses: bigint;
      brier: number | null;
      avg_confidence: number | null;
    }>>(`
      SELECT COUNT(*)::bigint AS graded,
        SUM(CASE WHEN final_home_score <> final_away_score AND ((model_home_win_pct >= 0.5 AND home_won = TRUE) OR (model_home_win_pct < 0.5 AND home_won = FALSE)) THEN 1 ELSE 0 END)::bigint AS wins,
        SUM(CASE WHEN final_home_score <> final_away_score AND NOT ((model_home_win_pct >= 0.5 AND home_won = TRUE) OR (model_home_win_pct < 0.5 AND home_won = FALSE)) THEN 1 ELSE 0 END)::bigint AS losses,
        AVG(brier) AS brier,
        AVG(confidence) AS avg_confidence
      FROM sim_prediction_snapshots
      ${where};
    `, ...params);

    const row = rows[0];
    if (!row) return EMPTY;
    const wins = Number(row.wins ?? 0);
    const losses = Number(row.losses ?? 0);
    const decisions = wins + losses;
    const winRate = decisions ? wins / decisions : null;
    const avgConfidence = round(row.avg_confidence, 4);
    const metrics: TrendPerformanceMetrics = {
      gradedCount: Number(row.graded ?? 0),
      winRate: round(winRate, 4),
      brier: round(row.brier, 4),
      avgConfidence,
      calibrationEdge: typeof winRate === "number" && typeof avgConfidence === "number" ? round(winRate - avgConfidence, 4) : null,
      performanceScore: null
    };
    metrics.performanceScore = score(metrics);
    return metrics;
  } catch {
    return EMPTY;
  }
}
