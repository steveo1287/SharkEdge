import type {
  ConfidenceBand,
  MarketTruthView,
  ReasonAttributionView
} from "@/lib/types/domain";

type BuildReasonAttributionArgs = {
  marketLabel: string;
  marketTruth: MarketTruthView | null;
  modelEdgePct?: number | null;
  modelNote?: string | null;
  trendHitRatePct?: number | null;
  trendSampleSize?: number | null;
  clvSupportPct?: number | null;
  lineMovement?: number | null;
  supportNote?: string | null;
  valueFlag?: "BEST_PRICE" | "MARKET_PLUS" | "STEAM" | "NONE" | null;
};

export type ReasonedMarketResult = {
  reasons: ReasonAttributionView[];
  confidenceBand: ConfidenceBand;
  confidenceScore: number;
  suppress: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function downgradeBand(band: ConfidenceBand): ConfidenceBand {
  if (band === "high") {
    return "medium";
  }

  if (band === "medium") {
    return "low";
  }

  if (band === "low") {
    return "pass";
  }

  return "pass";
}

function deriveConfidenceBand(score: number): ConfidenceBand {
  if (score >= 80) {
    return "high";
  }

  if (score >= 60) {
    return "medium";
  }

  if (score >= 40) {
    return "low";
  }

  return "pass";
}

function buildPassReason(note: string): ReasonAttributionView {
  return {
    category: "pass",
    label: "Pass",
    detail: note,
    tone: "muted"
  };
}

export function buildReasonAttribution(
  args: BuildReasonAttributionArgs
): ReasonedMarketResult {
  const reasons: ReasonAttributionView[] = [];
  const truth = args.marketTruth;

  if (!truth) {
    return {
      reasons: [
        buildPassReason(`No usable ${args.marketLabel.toLowerCase()} truth layer is available for this price yet.`)
      ],
      confidenceBand: "pass",
      confidenceScore: 0,
      suppress: true
    };
  }

  if (truth.classification === "soft" && typeof truth.impliedEdgePct === "number") {
    reasons.push({
      category: "market_edge",
      label: "Fair edge",
      detail: `${args.marketLabel} is pricing ${truth.impliedEdgePct > 0 ? "+" : ""}${truth.impliedEdgePct.toFixed(1)}% over no-vig fair.`,
      tone: "success"
    });
  }

  if (truth.classification === "sharp" || truth.classification === "trustworthy") {
    reasons.push({
      category: "market_edge",
      label: "Market quality",
      detail: `${truth.classificationLabel} sample with ${truth.bookCount} books and a ${truth.qualityScore}/100 quality score.`,
      tone: truth.classification === "sharp" ? "brand" : "premium"
    });
  }

  if (typeof args.modelEdgePct === "number" && Math.abs(args.modelEdgePct) >= 1) {
    reasons.push({
      category: "model_edge",
      label: "Model lean",
      detail:
        args.modelNote ??
        `${args.marketLabel} carries a ${args.modelEdgePct > 0 ? "+" : ""}${args.modelEdgePct.toFixed(1)}% model gap.`,
      tone: "brand"
    });
  }

  if (
    typeof args.trendHitRatePct === "number" &&
    typeof args.trendSampleSize === "number" &&
    args.trendSampleSize >= 5
  ) {
    reasons.push({
      category: "trend_support",
      label: "Trend support",
      detail: `${args.trendHitRatePct.toFixed(0)}% hit rate across ${args.trendSampleSize} tracked results.`,
      tone: "premium"
    });
  }

  if (typeof args.clvSupportPct === "number" && Math.abs(args.clvSupportPct) >= 1) {
    reasons.push({
      category: "market_edge",
      label: "CLV support",
      detail: `${args.clvSupportPct >= 0 ? "Positive" : "Negative"} close-line support of ${args.clvSupportPct >= 0 ? "+" : ""}${args.clvSupportPct.toFixed(1)}%.`,
      tone: args.clvSupportPct >= 0 ? "success" : "muted"
    });
  }

  if (typeof args.lineMovement === "number" && Math.abs(args.lineMovement) >= 0.5) {
    reasons.push({
      category: "momentum_edge",
      label: "Market movement",
      detail: `${args.marketLabel} has already moved ${args.lineMovement > 0 ? "+" : ""}${args.lineMovement.toFixed(1)} ${Math.abs(args.lineMovement) >= 9 ? "cents" : "points"} across the tracked window.`,
      tone: "brand"
    });
  }

  if (args.valueFlag === "MARKET_PLUS" || args.valueFlag === "BEST_PRICE" || args.valueFlag === "STEAM") {
    reasons.push({
      category: "market_edge",
      label: "Line shop",
      detail:
        args.valueFlag === "STEAM"
          ? "This number is still reacting to real movement."
          : args.valueFlag === "MARKET_PLUS"
            ? "The displayed book is still hanging a better price than the pack."
            : "The displayed book is still one of the best available prices on the board.",
      tone: "success"
    });
  }

  if (!reasons.length && args.supportNote) {
    reasons.push({
      category: "pass",
      label: "Limited support",
      detail: args.supportNote,
      tone: "muted"
    });
  }

  if (!reasons.length) {
    reasons.push(buildPassReason(truth.note));
  }

  let confidenceScore =
    truth.qualityScore * 0.55 +
    clamp((truth.impliedEdgePct ?? 0) * 5, -10, 18) +
    (typeof args.modelEdgePct === "number" ? clamp(Math.abs(args.modelEdgePct) * 4, 0, 14) : 0) +
    (typeof args.trendHitRatePct === "number" && typeof args.trendSampleSize === "number"
      ? clamp((args.trendHitRatePct - 50) * 0.35 + args.trendSampleSize * 0.5, 0, 14)
      : 0) +
    (typeof args.clvSupportPct === "number" ? clamp(args.clvSupportPct * 1.8, -8, 10) : 0);

  let confidenceBand = truth.confidenceBand;

  if (confidenceBand === "pass") {
    confidenceBand = deriveConfidenceBand(Math.round(confidenceScore));
  }

  if (truth.classification === "stale" || truth.classification === "noisy") {
    confidenceBand = downgradeBand(confidenceBand);
    confidenceScore -= 12;
  }

  if (truth.classification === "thin") {
    confidenceBand = "pass";
    confidenceScore = Math.min(confidenceScore, 28);
  }

  if (truth.classification === "unverified") {
    confidenceBand = "pass";
    confidenceScore = 0;
  }

  const suppress =
    confidenceBand === "pass" ||
    truth.classification === "unverified" ||
    (truth.classification === "thin" && truth.bookCount < 2);

  return {
    reasons: reasons.slice(0, 4),
    confidenceBand,
    confidenceScore: Math.round(clamp(confidenceScore, 0, 100)),
    suppress
  };
}
