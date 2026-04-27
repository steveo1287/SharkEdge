import { buildPlayerSimV2, type PlayerSimV2Input, type PlayerSimV2Output } from "./player-sim-v2";
import { applyPlayerAdaptiveAdjustment } from "./sim-adaptive-layer";
import { buildMarketIntelligenceSignal } from "./sim-market-intelligence-layer";
import { buildClvSharpSignal } from "./sim-clv-sharp-layer";
import { buildBetSizingRecommendation } from "./sim-bankroll-sizing-engine";
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
    clv?: {
      entryOdds?: number | null;
      currentOdds?: number | null;
      closingOdds?: number | null;
      entryLine?: number | null;
      currentLine?: number | null;
      closingLine?: number | null;
    };
    bankroll?: number;
  },
  tuning?: SimTuningParams
): PlayerSimV2Output & { betSizing?: any } {
  const base = buildPlayerSimV2(input, tuning);

  let workingInput = { ...input };
  let reasons: string[] = [...base.reasons];
  let riskFlags: string[] = [...base.riskFlags];
  let confidence = base.confidence;

  // Adaptive
  if (input.trend && input.trend.longAvg > 0) {
    const adaptive = applyPlayerAdaptiveAdjustment(base.rawMean, {
      playerId: input.player,
      propType: input.propType,
      recentAvg: input.trend.recentAvg,
      longAvg: input.trend.longAvg
    });

    workingInput = {
      ...workingInput,
      usageRate: Math.max(0.01, workingInput.usageRate * adaptive.adjustmentFactor)
    };

    reasons.unshift(`Adaptive blend (${(adaptive.weights.recentWeight * 100).toFixed(0)}% recent)`);
  }

  // Market
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

  // CLV
  let clvSignal = null;
  if (input.clv || input.market) {
    clvSignal = buildClvSharpSignal({
      entryOdds: input.clv?.entryOdds,
      currentOdds: input.clv?.currentOdds ?? input.odds,
      closingOdds: input.clv?.closingOdds,
      entryLine: input.clv?.entryLine,
      currentLine: input.clv?.currentLine ?? input.line,
      closingLine: input.clv?.closingLine,
      lineMovement: input.market?.lineMovement,
      marketDeltaAmerican: input.market?.marketDeltaAmerican,
      bookCount: input.market?.bookCount,
      side: input.market?.side
    });

    reasons.unshift(...clvSignal.reasons);
    riskFlags.push(...clvSignal.riskFlags);

    confidence = Math.max(0, Math.min(0.95, confidence + clvSignal.confidenceShift));
  }

  const rerun = buildPlayerSimV2(workingInput, tuning);

  let finalProbability = rerun.calibratedProbability;

  if (marketSignal) finalProbability += marketSignal.probabilityShift;
  if (clvSignal) finalProbability += clvSignal.probabilityShift;

  finalProbability = Math.max(0.01, Math.min(0.99, finalProbability));

  const implied = rerun.calibratedProbability - rerun.edgePct / 100;
  const edge = (finalProbability - implied) * 100;

  let betSizing = undefined;

  if (input.bankroll && input.bankroll > 0) {
    betSizing = buildBetSizingRecommendation({
      bankroll: input.bankroll,
      oddsAmerican: input.odds,
      probability: finalProbability,
      confidence,
      edgePct: edge,
      decision: rerun.decision,
      riskFlags
    });
  }

  return {
    ...rerun,
    calibratedProbability: Number(finalProbability.toFixed(5)),
    edgePct: Number(edge.toFixed(4)),
    confidence: Number(confidence.toFixed(4)),
    reasons,
    riskFlags,
    betSizing
  };
}
