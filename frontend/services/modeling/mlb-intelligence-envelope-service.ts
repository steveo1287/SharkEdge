import type { MlbIntelligenceEnvelope } from "@/lib/types/mlb-intelligence";
import { buildMlbEliteSimSnapshot } from "@/services/modeling/mlb-elite-sim-service";

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export async function buildMlbIntelligenceEnvelope(eventId: string): Promise<MlbIntelligenceEnvelope> {
  const snapshot = await buildMlbEliteSimSnapshot(eventId);

  const volatility = Math.abs(snapshot.parkWeatherDelta) * 0.45 + Math.abs(snapshot.bullpenFatigueDelta) * 0.35;
  const uncertaintyPenalty = round(clamp(volatility, 0.01, 0.16));
  const explanationStability = round(clamp(1 - uncertaintyPenalty * 1.6, 0.42, 0.96));

  const medianTotal = snapshot.normalizedTotal;
  const lowTotal = round(medianTotal * (1 - uncertaintyPenalty));
  const highTotal = round(medianTotal * (1 + uncertaintyPenalty));

  const baseWinProb = clamp(0.5 + (snapshot.homeExpectedRuns - snapshot.awayExpectedRuns) / Math.max(1, medianTotal), 0.06, 0.94);
  const lowWin = round(clamp(baseWinProb - uncertaintyPenalty * 0.6, 0.05, 0.95));
  const highWin = round(clamp(baseWinProb + uncertaintyPenalty * 0.6, 0.05, 0.95));

  let confidenceTier: MlbIntelligenceEnvelope["selectiveQualification"]["confidenceTier"] = "pass";
  let qualifies = false;
  let reason = "Variance remains too high for elite qualification.";

  if (explanationStability >= 0.82 && baseWinProb >= 0.61) {
    confidenceTier = "elite";
    qualifies = true;
    reason = "Stable explanation chain and strong win probability band.";
  } else if (explanationStability >= 0.72 && baseWinProb >= 0.57) {
    confidenceTier = "strong";
    qualifies = true;
    reason = "Good stability with actionable but lower confidence edge.";
  } else if (explanationStability >= 0.62 && baseWinProb >= 0.54) {
    confidenceTier = "watchlist";
    reason = "Track this game, but do not treat it as top-grade conviction.";
  }

  return {
    eventId,
    winProbabilityBand: {
      low: lowWin,
      median: round(baseWinProb),
      high: highWin
    },
    runTotalBand: {
      low: lowTotal,
      median: round(medianTotal),
      high: highTotal
    },
    explanationStability,
    uncertaintyPenalty,
    selectiveQualification: {
      qualifies,
      reason,
      confidenceTier
    }
  };
}
