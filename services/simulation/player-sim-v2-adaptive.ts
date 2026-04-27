import { buildPlayerSimV2, type PlayerSimV2Input, type PlayerSimV2Output } from "./player-sim-v2";
import { applyPlayerAdaptiveAdjustment } from "./sim-adaptive-layer";
import { buildMarketIntelligenceSignal } from "./sim-market-intelligence-layer";
import type { SimTuningParams } from "./sim-tuning";

export function buildAdaptivePlayerSimV2(
  input: PlayerSimV2Input & {
    market?: {
      averageOdds?: number | null;
      bestAvailableOdds?: number | null;
      lineMovement?: number | null;
      bookCount?: number | null;
      marketDeltaAmerican?: number | null;
      expectedValuePct?: number | null;
      side?: string | null;
    };
  },
  tuning?: SimTuningParams
): PlayerSimV2Output {
  const base = buildPlayerSimV2(input, tuning);

  let workingInput = { ...input };
  let reasons: string[] = [...base.reasons];
  let riskFlags: string[] = [...base.riskFlags];
  let confidence = base.confidence;

  // ===== ADAPTIVE PLAYER LAYER =====
  if (input.trend && input.trend.longAvg > 0) {
    const adaptive = applyPlayerAdaptiveAdjustment(base.rawMean, {
      playerId: input.player,
      propType: input.propType,
      recentAvg: input.trend.recentAvg,
      longAvg: input.trend.longAvg,
      recentMinutes: input.trend.recentMinutes ?? null,
      longMinutes: input.trend.longMinutes ?? null
    });

    workingInput = {
      ...workingInput,
      usageRate: Math.max(0.01, workingInput.usageRate * adaptive.adjustmentFactor),
      seed: `${input.seed ?? input.player}:adaptive:${adaptive.adjustmentFactor.toFixed(4)}`
    };

    reasons.unshift(`Adaptive blend (${(adaptive.weights.recentWeight * 100).toFixed(0)}% recent)`);

    if (adaptive.weights.volatility > 0.28) {
      riskFlags.push("Elevated player volatility");
    }
  }

  // ===== MARKET INTELLIGENCE LAYER =====
  let marketSignal = null;
  if (input.market) {
    marketSignal = buildMarketIntelligenceSignal({
      odds: input.odds,
      averageOdds: input.market.averageOdds,
      bestAvailableOdds: input.market.bestAvailableOdds,
      lineMovement: input.market.lineMovement,
      bookCount: input.market.bookCount,
      marketDeltaAmerican: input.market.marketDeltaAmerican,
      expectedValuePct: input.market.expectedValuePct,
      side: input.market.side
    });

    reasons.unshift(...marketSignal.reasons);
    riskFlags.push(...marketSignal.riskFlags);

    confidence = Math.max(0, Math.min(0.95, confidence + marketSignal.confidenceShift));
  }

  // Re-run core sim after adaptive + market adjustments
  const rerun = buildPlayerSimV2(workingInput, tuning);

  let finalProbability = rerun.calibratedProbability;

  if (marketSignal) {
    finalProbability = Math.max(0.01, Math.min(0.99, finalProbability + marketSignal.probabilityShift));
  }

  const implied = rerun.calibratedProbability - rerun.edgePct / 100;
  const edge = (finalProbability - implied) * 100;

  return {
    ...rerun,
    calibratedProbability: Number(finalProbability.toFixed(5)),
    edgePct: Number(edge.toFixed(4)),
    confidence: Number(confidence.toFixed(4)),
    reasons,
    riskFlags,
    modelVersion: "player-sim-v2"
  };
}
