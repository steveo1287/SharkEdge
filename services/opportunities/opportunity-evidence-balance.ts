import type {
  OpportunityMarketMicrostructureView,
  OpportunitySourceQuality,
  OpportunityTruthCalibrationView
} from "@/lib/types/opportunity";

export type OpportunityEvidenceBalanceStatus =
  | "BALANCED"
  | "MINOR_OVERLAP"
  | "STACKED_OVERLAP";

export type OpportunityEvidenceBalanceView = {
  status: OpportunityEvidenceBalanceStatus;
  overlapCount: number;
  overlapPenalty: number;
  convictionCarryScore: number;
  warning: string | null;
  reasons: string[];
};

export type BuildOpportunityEvidenceBalanceArgs = {
  truthCalibration: OpportunityTruthCalibrationView;
  marketMicrostructure: OpportunityMarketMicrostructureView;
  sourceQuality: OpportunitySourceQuality;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

export function buildOpportunityEvidenceBalance(
  args: BuildOpportunityEvidenceBalanceArgs
): OpportunityEvidenceBalanceView {
  const reasons: string[] = [];

  const truthPositive =
    args.truthCalibration.status === "APPLIED" &&
    args.truthCalibration.scoreDelta > 0;

  const pathPositive =
    args.marketMicrostructure.status === "APPLIED" &&
    args.marketMicrostructure.scoreDelta > 0;

  const sourcePositive =
    args.sourceQuality.truthAdjustment > 0 ||
    args.sourceQuality.marketPathAdjustment > 0;

  const weakTruthSample =
    args.truthCalibration.sampleGate.qualifiedSignals <= 2;

  const weakPathSample =
    args.marketMicrostructure.sampleGate.qualifiedSignals <= 2 ||
    !args.marketMicrostructure.historyQualified ||
    !args.marketMicrostructure.pathTrusted;

  const pathFragile =
    args.marketMicrostructure.regime === "FRAGMENTED" ||
    args.marketMicrostructure.regime === "NO_PATH" ||
    args.marketMicrostructure.staleCopyConfidence < 60;

  const overlapCount = [truthPositive, pathPositive, sourcePositive].filter(Boolean)
    .length;

  let overlapPenalty = 0;

  if (truthPositive && pathPositive) {
    overlapPenalty += 2;
    reasons.push(
      "Truth calibration and market-path uplift are both leaning the same direction."
    );
  }

  if (truthPositive && sourcePositive) {
    overlapPenalty += 1.5;
    reasons.push(
      "Truth calibration and source-quality adjustments are reinforcing the same lane."
    );
  }

  if (pathPositive && sourcePositive) {
    overlapPenalty += 1.5;
    reasons.push(
      "Market-path and source-quality adjustments are stacking on the same read."
    );
  }

  if (weakTruthSample && truthPositive) {
    overlapPenalty += 1.5;
    reasons.push(
      "Positive truth calibration is based on a shallow qualified close sample."
    );
  }

  if (weakPathSample && pathPositive) {
    overlapPenalty += 2;
    reasons.push(
      "Positive market-path signal is being carried by weak path or history confidence."
    );
  }

  if (pathFragile && pathPositive) {
    overlapPenalty += 2;
    reasons.push(
      "Positive path regime is fragmented or low-confidence and should not carry full conviction."
    );
  }

  overlapPenalty = clamp(overlapPenalty, 0, 6);

  const rawConviction =
    (truthPositive ? args.truthCalibration.scoreDelta : 0) +
    (pathPositive ? args.marketMicrostructure.scoreDelta : 0) +
    (sourcePositive
      ? (args.sourceQuality.truthAdjustment + args.sourceQuality.marketPathAdjustment) * 20
      : 0);

  const convictionCarryScore = round(clamp(rawConviction - overlapPenalty, -8, 12));

  const status: OpportunityEvidenceBalanceStatus =
    overlapPenalty >= 4
      ? "STACKED_OVERLAP"
      : overlapPenalty >= 2
        ? "MINOR_OVERLAP"
        : "BALANCED";

  const warning =
    status === "STACKED_OVERLAP"
      ? "Conviction is being materially carried by overlapping overlays."
      : status === "MINOR_OVERLAP"
        ? "Some conviction is coming from correlated secondary layers."
        : null;

  return {
    status,
    overlapCount,
    overlapPenalty: round(overlapPenalty),
    convictionCarryScore,
    warning,
    reasons: reasons.slice(0, 4)
  };
}