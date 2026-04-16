import type { DecisionFusion } from "@/lib/types/decision-fusion";
import { buildTrendIncrementalValue } from "@/services/trends/trend-incremental-value-service";
import { buildTrendRegimeFit } from "@/services/trends/trend-regime-service";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

export function buildDecisionFusion(input: {
  eventId: string;
  marketType: string;
  league: string;
  simScore: number;
  rawTrendScore: number;
  marketScore: number;
  calibrationScore: number;
  uncertaintyPenalty: number;
  weatherDelta?: number | null;
  volatility?: number | null;
}) : DecisionFusion {
  const regimeFit = buildTrendRegimeFit({
    marketType: input.marketType,
    league: input.league,
    weatherDelta: input.weatherDelta,
    volatility: input.volatility
  });

  const incrementalTrendValue = buildTrendIncrementalValue({
    rawTrendScore: input.rawTrendScore,
    simScore: input.simScore,
    regimeFit
  });

  const conflictPenalty = round(clamp(Math.abs(input.simScore - input.rawTrendScore) * 0.12, 0, 0.14));
  const redundancyPenalty = round(clamp(Math.min(Math.abs(input.simScore - input.rawTrendScore), 1) * 0.08, 0, 0.1));

  const fusedScore = round(
    input.simScore * 0.62 +
    incrementalTrendValue * 100 * 0.16 +
    input.marketScore * 0.12 +
    input.calibrationScore * 0.1 -
    input.uncertaintyPenalty * 100 * 0.08 -
    conflictPenalty * 100 -
    redundancyPenalty * 100
  );

  let fusedTier: DecisionFusion["fusedTier"] = "pass";
  const rationale: string[] = [];

  if (fusedScore >= 8) {
    fusedTier = "elite";
    rationale.push("Sim and trend layers survive fusion with strong calibrated score.");
  } else if (fusedScore >= 5) {
    fusedTier = "strong";
    rationale.push("Signal remains promotable after fusion penalties.");
  } else if (fusedScore >= 2.5) {
    fusedTier = "watchlist";
    rationale.push("Visible, but below strong promotion threshold.");
  } else {
    fusedTier = "pass";
    rationale.push("Suppress by default; fused score is too weak.");
  }

  if (regimeFit < 0.55) {
    rationale.push("Trend regime fit is weak under current conditions.");
  }
  if (incrementalTrendValue <= 0.01) {
    rationale.push("Trend adds little value beyond the sim.");
  }
  if (conflictPenalty > 0.08) {
    rationale.push("Sim and trend conflict meaningfully.");
  }

  return {
    eventId: input.eventId,
    marketType: input.marketType,
    simScore: round(input.simScore),
    trendScore: round(input.rawTrendScore),
    marketScore: round(input.marketScore),
    calibrationScore: round(input.calibrationScore),
    uncertaintyPenalty: round(input.uncertaintyPenalty),
    conflictPenalty,
    redundancyPenalty,
    fusedScore,
    fusedTier,
    rationale,
    regimeFit,
    incrementalTrendValue
  };
}
