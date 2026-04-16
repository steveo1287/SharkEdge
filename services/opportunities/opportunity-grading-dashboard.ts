import type {
  OpportunityGradingBreakdownRow,
  OpportunityGradingDashboardView,
  OpportunityGradingGrade,
  OpportunityGradingMetricCard,
  OpportunityGradingReasonRow,
  OpportunityGradingTimingRow,
  OpportunityPostCloseReviewView
} from "@/lib/types/opportunity";
import type { LeagueKey } from "@/lib/types/domain";
import { listOpportunityPostCloseReviews } from "@/services/opportunities/opportunity-post-close-review";
import { summarizeClvPerformance } from "@/services/opportunities/opportunity-clv-service";
import { summarizeOpportunityReasonCalibration } from "@/services/opportunities/opportunity-reason-calibration";
import { summarizeOpportunityTimingReplay } from "@/services/opportunities/opportunity-timing-review";

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function average(values: Array<number | null | undefined>, digits = 2) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!valid.length) {
    return null;
  }

  return Number((valid.reduce((total, value) => total + value, 0) / valid.length).toFixed(digits));
}

function percentage(numerator: number, denominator: number, digits = 1) {
  if (!denominator) {
    return null;
  }

  return Number(((numerator / denominator) * 100).toFixed(digits));
}

function formatSignedPct(value: number | null, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatPct(value: number | null, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }

  return `${value.toFixed(digits)}%`;
}

function gradeFromRates(args: {
  surfaced: number;
  closed: number;
  beatClosePct: number | null;
  averageClvPct?: number | null;
  averageTruthScore?: number | null;
}): OpportunityGradingGrade {
  if (args.surfaced < 10 || args.closed < 6 || args.beatClosePct === null) {
    return "INSUFFICIENT_SAMPLE";
  }

  const beat = args.beatClosePct;
  const clv = args.averageClvPct ?? 0;
  const truth = args.averageTruthScore ?? 0;

  if (beat >= 56 && clv >= 0.8 && truth >= 0) {
    return "STRONG";
  }

  if (beat >= 52 && clv >= 0.2) {
    return "POSITIVE";
  }

  if (beat >= 48 && clv > -0.35) {
    return "MIXED";
  }

  return "NEGATIVE";
}

function toBreakdownRow(row: {
  label: string;
  surfaced: number;
  closed: number;
  beatClosePct: number | null;
  averageClvPct: number | null;
  averageTruthScore: number | null;
}): OpportunityGradingBreakdownRow {
  return {
    key: row.label.toLowerCase().replace(/\s+/g, "_"),
    label: row.label,
    surfaced: row.surfaced,
    closed: row.closed,
    beatClosePct: row.beatClosePct,
    averageClvPct: row.averageClvPct,
    averageTruthScore: row.averageTruthScore,
    grade: gradeFromRates(row)
  };
}

function toTimingRow(row: {
  key: string;
  label: string;
  surfaced: number;
  replayQualified: number;
  hitNowCorrect: number;
  waitWasBetter: number;
  edgeDiedFast: number;
  averageTimingReviewScore: number | null;
  averageClvPct: number | null;
}): OpportunityGradingTimingRow {
  const hitNowCorrectPct = percentage(row.hitNowCorrect, row.replayQualified);
  const waitWasBetterPct = percentage(row.waitWasBetter, row.replayQualified);
  const edgeDiedFastPct = percentage(row.edgeDiedFast, row.replayQualified);
  const grade =
    row.replayQualified < 6
      ? "INSUFFICIENT_SAMPLE"
      : (hitNowCorrectPct ?? 0) >= 55 && (row.averageClvPct ?? 0) >= 0.5
        ? "STRONG"
        : (hitNowCorrectPct ?? 0) >= 50
          ? "POSITIVE"
          : (edgeDiedFastPct ?? 0) <= 30
            ? "MIXED"
            : "NEGATIVE";

  return {
    key: row.key,
    label: row.label,
    surfaced: row.surfaced,
    replayQualified: row.replayQualified,
    hitNowCorrectPct,
    waitWasBetterPct,
    edgeDiedFastPct,
    averageTimingReviewScore: row.averageTimingReviewScore,
    averageClvPct: row.averageClvPct,
    grade
  };
}

function toReasonRow(row: {
  key: string;
  category: OpportunityGradingReasonRow["category"];
  label: string;
  surfaced: number;
  closed: number;
  beatClosePct: number | null;
  averageClvPct: number | null;
  averageTruthScore: number | null;
}): OpportunityGradingReasonRow {
  return {
    key: row.key,
    category: row.category,
    label: row.label,
    surfaced: row.surfaced,
    closed: row.closed,
    beatClosePct: row.beatClosePct,
    averageClvPct: row.averageClvPct,
    averageTruthScore: row.averageTruthScore,
    grade: gradeFromRates(row)
  };
}

function buildRegimeBreakdown(reviews: OpportunityPostCloseReviewView[]) {
  const byRegime = new Map<string, {
    label: string;
    surfaced: number;
    closed: number;
    beatClose: number;
    clvSamples: number;
    clvTotal: number;
    truthSamples: number;
    truthTotal: number;
  }>();

  for (const review of reviews) {
    const label = review.decisionSnapshot?.marketPathRegime ?? "NO_PATH";
    const bucket = byRegime.get(label) ?? {
      label,
      surfaced: 0,
      closed: 0,
      beatClose: 0,
      clvSamples: 0,
      clvTotal: 0,
      truthSamples: 0,
      truthTotal: 0
    };

    bucket.surfaced += 1;
    if (review.clvResult && review.clvResult !== "NO_CLOSE_DATA") {
      bucket.closed += 1;
    }
    if (review.clvResult === "BEAT_CLOSE") {
      bucket.beatClose += 1;
    }
    if (typeof review.clvPct === "number") {
      bucket.clvSamples += 1;
      bucket.clvTotal += review.clvPct;
    }
    if (typeof review.normalizedTruthScore === "number") {
      bucket.truthSamples += 1;
      bucket.truthTotal += review.normalizedTruthScore;
    }

    byRegime.set(label, bucket);
  }

  return Array.from(byRegime.values())
    .map((row) =>
      toBreakdownRow({
        label: row.label.replace(/_/g, " "),
        surfaced: row.surfaced,
        closed: row.closed,
        beatClosePct: percentage(row.beatClose, row.closed),
        averageClvPct: row.clvSamples ? round(row.clvTotal / row.clvSamples, 3) : null,
        averageTruthScore: row.truthSamples ? round(row.truthTotal / row.truthSamples, 3) : null
      })
    )
    .sort((left, right) => right.closed - left.closed || right.surfaced - left.surfaced)
    .slice(0, 8);
}

function buildHeadlineMetrics(reviews: OpportunityPostCloseReviewView[]): OpportunityGradingMetricCard[] {
  const surfaced = reviews.length;
  const closed = reviews.filter((review) => review.clvResult && review.clvResult !== "NO_CLOSE_DATA").length;
  const beatClose = reviews.filter((review) => review.clvResult === "BEAT_CLOSE").length;
  const matchedExecutions = reviews.filter((review) => review.executionContext).length;
  const avgClv = average(reviews.map((review) => review.clvPct), 3);
  const avgTruth = average(reviews.map((review) => review.normalizedTruthScore), 3);
  const validatedTiming = reviews.filter((review) => review.timingReview.verdict === "VALIDATED").length;

  const cards: OpportunityGradingMetricCard[] = [
    {
      key: "beat_close_rate",
      label: "Beat close rate",
      value: formatPct(percentage(beatClose, closed)),
      detail: `${beatClose}/${closed || 0} closed recommendations beat the close.`,
      grade: gradeFromRates({
        surfaced,
        closed,
        beatClosePct: percentage(beatClose, closed),
        averageClvPct: avgClv,
        averageTruthScore: avgTruth
      })
    },
    {
      key: "average_clv",
      label: "Average CLV",
      value: formatSignedPct(avgClv, 2),
      detail: "Mean closing-line value across reviewed surfaces.",
      grade:
        closed < 6
          ? "INSUFFICIENT_SAMPLE"
          : (avgClv ?? -999) >= 1
            ? "STRONG"
            : (avgClv ?? -999) >= 0.2
              ? "POSITIVE"
              : (avgClv ?? -999) >= -0.35
                ? "MIXED"
                : "NEGATIVE"
    },
    {
      key: "average_truth",
      label: "Average truth score",
      value: typeof avgTruth === "number" ? avgTruth.toFixed(3) : "n/a",
      detail: "Normalized post-close truth score from surface to close.",
      grade:
        surfaced < 10
          ? "INSUFFICIENT_SAMPLE"
          : (avgTruth ?? -999) >= 0.18
            ? "STRONG"
            : (avgTruth ?? -999) >= 0.03
              ? "POSITIVE"
              : (avgTruth ?? -999) >= -0.08
                ? "MIXED"
                : "NEGATIVE"
    },
    {
      key: "matched_execution_rate",
      label: "Matched execution rate",
      value: formatPct(percentage(matchedExecutions, surfaced)),
      detail: `${matchedExecutions}/${surfaced || 0} reviews matched to an actual placed bet.`,
      grade:
        surfaced < 10
          ? "INSUFFICIENT_SAMPLE"
          : (percentage(matchedExecutions, surfaced) ?? 0) >= 60
            ? "STRONG"
            : (percentage(matchedExecutions, surfaced) ?? 0) >= 35
              ? "POSITIVE"
              : "MIXED"
    },
    {
      key: "timing_validation",
      label: "Timing validation",
      value: formatPct(percentage(validatedTiming, surfaced)),
      detail: "Share of post-close reviews where the original timing held up.",
      grade:
        surfaced < 10
          ? "INSUFFICIENT_SAMPLE"
          : (percentage(validatedTiming, surfaced) ?? 0) >= 55
            ? "STRONG"
            : (percentage(validatedTiming, surfaced) ?? 0) >= 45
              ? "POSITIVE"
              : (percentage(validatedTiming, surfaced) ?? 0) >= 35
                ? "MIXED"
                : "NEGATIVE"
    }
  ];

  return cards;
}

function buildSummary(args: {
  reviews: OpportunityPostCloseReviewView[];
  actionBreakdown: OpportunityGradingBreakdownRow[];
  regimeBreakdown: OpportunityGradingBreakdownRow[];
}) {
  const reviews = args.reviews;
  if (!reviews.length) {
    return "No post-close review data is available yet, so SharkEdge cannot grade its own recommendations.";
  }

  const strongestAction = args.actionBreakdown[0];
  const strongestRegime = args.regimeBreakdown[0];
  const avgClv = average(reviews.map((review) => review.clvPct), 3);
  const beatClose = reviews.filter((review) => review.clvResult === "BEAT_CLOSE").length;
  const closed = reviews.filter((review) => review.clvResult && review.clvResult !== "NO_CLOSE_DATA").length;

  const actionPart = strongestAction
    ? `${strongestAction.label} is the largest reviewed action bucket at ${formatPct(strongestAction.beatClosePct)} beat-close`
    : "Action buckets do not have enough reviewed data yet";
  const regimePart = strongestRegime
    ? `${strongestRegime.label.toLowerCase()} is the heaviest market-path regime in the current review window`
    : "no regime signal stands out yet";

  return `${actionPart}, with overall average CLV ${formatSignedPct(avgClv, 2)} across ${closed} closed reviews. ${regimePart}.`;
}

export async function getOpportunityGradingDashboard(args: {
  league?: LeagueKey | "ALL";
  reviewWindowDays?: number;
  reviewLimit?: number;
} = {}): Promise<OpportunityGradingDashboardView> {
  const league = args.league ?? "ALL";
  const reviewWindowDays = Math.min(Math.max(args.reviewWindowDays ?? 60, 7), 365);
  const since = new Date(Date.now() - reviewWindowDays * 24 * 60 * 60 * 1000);
  const reviewLimit = Math.min(Math.max(args.reviewLimit ?? 80, 20), 250);

  const [
    reviews,
    actionClvRows,
    confidenceClvRows,
    marketClvRows,
    sportsbookClvRows,
    timingByActionRows,
    timingByRegimeRows,
    reasonRows
  ] = await Promise.all([
    listOpportunityPostCloseReviews({
      league,
      since,
      limit: reviewLimit
    }),
    summarizeClvPerformance({
      groupBy: "action",
      league,
      since
    }).catch(() => []),
    summarizeClvPerformance({
      groupBy: "confidence",
      league,
      since
    }).catch(() => []),
    summarizeClvPerformance({
      groupBy: "market",
      league,
      since
    }).catch(() => []),
    summarizeClvPerformance({
      groupBy: "sportsbook",
      league,
      since
    }).catch(() => []),
    summarizeOpportunityTimingReplay({
      groupBy: "action",
      league,
      since
    }).catch(() => []),
    summarizeOpportunityTimingReplay({
      groupBy: "market_path_regime",
      league,
      since
    }).catch(() => []),
    summarizeOpportunityReasonCalibration({
      league,
      since
    }).catch(() => [])
  ]);

  const actionBreakdown = actionClvRows
    .map((row) => toBreakdownRow(row))
    .sort((left, right) => right.closed - left.closed || right.surfaced - left.surfaced)
    .slice(0, 6);

  const confidenceBreakdown = confidenceClvRows
    .map((row) => toBreakdownRow(row))
    .sort((left, right) => right.closed - left.closed || right.surfaced - left.surfaced)
    .slice(0, 6);

  const marketBreakdown = marketClvRows
    .map((row) => toBreakdownRow(row))
    .sort((left, right) => right.closed - left.closed || right.surfaced - left.surfaced)
    .slice(0, 8);

  const sportsbookBreakdown = sportsbookClvRows
    .map((row) => toBreakdownRow(row))
    .sort((left, right) => right.closed - left.closed || right.surfaced - left.surfaced)
    .slice(0, 8);

  const regimeBreakdown = buildRegimeBreakdown(reviews);

  const timingByAction = timingByActionRows
    .map((row) => toTimingRow(row))
    .sort((left, right) => right.replayQualified - left.replayQualified || right.surfaced - left.surfaced)
    .slice(0, 6);

  const timingByRegime = timingByRegimeRows
    .map((row) => toTimingRow(row))
    .sort((left, right) => right.replayQualified - left.replayQualified || right.surfaced - left.surfaced)
    .slice(0, 6);

  const reasonLeaders = reasonRows
    .map((row) => toReasonRow(row))
    .filter((row) => row.closed > 0)
    .sort((left, right) => {
      const beatDelta = (right.beatClosePct ?? -999) - (left.beatClosePct ?? -999);
      if (beatDelta !== 0) {
        return beatDelta;
      }

      return right.closed - left.closed || right.surfaced - left.surfaced;
    })
    .slice(0, 8);

  const totals = {
    surfaced: reviews.length,
    closed: reviews.filter((review) => review.clvResult && review.clvResult !== "NO_CLOSE_DATA").length,
    beatClose: reviews.filter((review) => review.clvResult === "BEAT_CLOSE").length,
    lostClose: reviews.filter((review) => review.clvResult === "LOST_CLOSE").length,
    pushClose: reviews.filter((review) => review.clvResult === "PUSH_CLOSE").length,
    matchedExecutions: reviews.filter((review) => review.executionContext).length,
    wins: reviews.filter((review) => review.finalOutcome === "WIN").length,
    losses: reviews.filter((review) => review.finalOutcome === "LOSS").length,
    pushes: reviews.filter((review) => review.finalOutcome === "PUSH").length,
    unresolved: reviews.filter((review) => !review.finalOutcome || review.finalOutcome === "UNKNOWN").length
  };

  return {
    generatedAt: new Date().toISOString(),
    league,
    since: since.toISOString(),
    reviewWindowDays,
    summary: buildSummary({
      reviews,
      actionBreakdown,
      regimeBreakdown
    }),
    totals,
    headlineMetrics: buildHeadlineMetrics(reviews),
    actionBreakdown,
    confidenceBreakdown,
    regimeBreakdown,
    marketBreakdown,
    sportsbookBreakdown,
    timingByAction,
    timingByRegime,
    reasonLeaders,
    recentReviews: reviews.slice(0, 12)
  };
}
