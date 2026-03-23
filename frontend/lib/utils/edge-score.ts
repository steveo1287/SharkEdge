import type { EdgeBand } from "@/lib/types/domain";

export type EdgeScoreInput = {
  impliedProbability?: number | null;
  modelProbability?: number | null;
  recentHitRate?: number | null;
  matchupRank?: number | null;
  lineMovementSupport?: number | null;
  volatility?: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function calculateEdgeScore(input: EdgeScoreInput) {
  const probabilityGap =
    input.modelProbability !== null &&
    input.modelProbability !== undefined &&
    input.impliedProbability !== null &&
    input.impliedProbability !== undefined
      ? clamp((input.modelProbability - input.impliedProbability) * 180, -20, 34)
      : 8;

  const hitRateComponent =
    input.recentHitRate !== null && input.recentHitRate !== undefined
      ? clamp((input.recentHitRate - 0.5) * 90, -10, 18)
      : 7;

  const matchupComponent =
    input.matchupRank !== null && input.matchupRank !== undefined
      ? clamp((31 - input.matchupRank) * 1.2, 0, 20)
      : 9;

  const movementComponent = clamp((input.lineMovementSupport ?? 0) * 10, -8, 10);
  const stabilityComponent = clamp(14 - (input.volatility ?? 0) * 8, 4, 14);

  const score = clamp(
    Math.round(
      28 + probabilityGap + hitRateComponent + matchupComponent + movementComponent + stabilityComponent
    ),
    0,
    100
  );

  return {
    score,
    label: getEdgeBand(score)
  };
}

export function getEdgeBand(score: number): EdgeBand {
  if (score >= 82) {
    return "Elite";
  }

  if (score >= 68) {
    return "Strong";
  }

  if (score >= 52) {
    return "Watchlist";
  }

  return "Pass";
}
